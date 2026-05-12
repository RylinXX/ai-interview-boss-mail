from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import imaplib
import os
from typing import Optional
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.models import (
    Position,
    PositionStatus,
    Resume,
    ResumeMailImport,
    ResumeMailImportStatus,
    ResumeStatus,
    ScreeningResult,
    SystemConfig,
)
from app.services.resume_mail_import_parser import (
    ParsedAttachment,
    ParsedMailMessage,
    parse_mail_message,
)
from app.services.resume_service import process_resume_background


DEFAULT_POSITION_TITLE = "AI 产品经理"
SOURCE_BOSS_MAIL = "boss_mail"


@dataclass
class ImportSummary:
    imported: int = 0
    skipped: int = 0
    failed: int = 0
    scanned_messages: int = 0


class ImapResumeMailClient:
    def __init__(
        self,
        host: str,
        port: int = 993,
        username: str = "",
        password: str = "",
        use_ssl: bool = True,
    ):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.use_ssl = use_ssl
        self._imap: Optional[imaplib.IMAP4] = None

    def __enter__(self) -> "ImapResumeMailClient":
        try:
            self._imap = (
                imaplib.IMAP4_SSL(self.host, self.port)
                if self.use_ssl
                else imaplib.IMAP4(self.host, self.port)
            )
            self._imap.login(self.username, self.password)
            self._send_client_id()
            status, data = self._imap.select("INBOX")
            if status != "OK":
                raise imaplib.IMAP4.error(
                    f"Unable to select INBOX: {self._format_imap_response(data)}"
                )
            return self
        except Exception:
            self._cleanup_connection()
            raise

    def __exit__(self, exc_type, exc, traceback) -> None:
        self._cleanup_connection()

    def _cleanup_connection(self) -> None:
        if not self._imap:
            return
        try:
            self._imap.close()
        except Exception:
            pass
        try:
            self._imap.logout()
        except Exception:
            pass
        finally:
            self._imap = None

    def _send_client_id(self) -> None:
        if not self._imap or not hasattr(self._imap, "_simple_command"):
            return
        imaplib.Commands["ID"] = ("AUTH", "SELECTED")
        payload = '("name" "AI Interview" "version" "1.0.0" "vendor" "ai-interview")'
        try:
            self._imap._simple_command("ID", payload)
        except Exception:
            pass

    def _format_imap_response(self, data) -> str:
        if not data:
            return "empty response"
        parts = []
        for item in data:
            if isinstance(item, bytes):
                parts.append(item.decode("utf-8", errors="replace"))
            else:
                parts.append(str(item))
        return "; ".join(parts)

    def fetch_recent_messages(self, limit: int) -> list[ParsedMailMessage]:
        if not self._imap:
            raise RuntimeError("IMAP client is not connected")

        status, data = self._imap.uid("search", None, "ALL")
        if status != "OK" or not data:
            return []

        uids = data[0].split()[-limit:]
        messages: list[ParsedMailMessage] = []
        for raw_uid in uids:
            uid = raw_uid.decode("utf-8", errors="ignore")
            status, fetched = self._imap.uid("fetch", raw_uid, "(RFC822)")
            if status != "OK" or not fetched:
                continue
            for item in fetched:
                if isinstance(item, tuple) and len(item) > 1 and item[1]:
                    messages.append(parse_mail_message(item[1], uid=uid))
                    break
        return messages

    def mark_seen(self, uid: str) -> None:
        if not self._imap:
            raise RuntimeError("IMAP client is not connected")
        self._imap.uid("store", uid, "+FLAGS", r"(\Seen)")


class ResumeMailImportService:
    def __init__(
        self, upload_root: str = "uploads/resumes", imap_client: Optional[object] = None
    ):
        self.upload_root = upload_root
        self.imap_client = imap_client

    def sync_once(
        self,
        db: Session,
        limit: int = 100,
        *,
        require_enabled: bool = True,
    ) -> ImportSummary:
        summary = ImportSummary()
        config = self._get_config(db)
        if not config or (require_enabled and not config.resume_mail_import_enabled):
            return summary

        client = self.imap_client
        owns_client = client is None
        if owns_client:
            client = self._create_imap_client(config)
            client.__enter__()

        try:
            for parsed in client.fetch_recent_messages(limit):
                message_summary = self.import_parsed_message(db, parsed)
                summary.imported += message_summary.imported
                summary.skipped += message_summary.skipped
                summary.failed += message_summary.failed
                summary.scanned_messages += message_summary.scanned_messages

                if (
                    message_summary.imported
                    and message_summary.failed == 0
                    and config.resume_mail_mark_success_read
                ):
                    client.mark_seen(parsed.uid)

            config.resume_mail_last_sync_at = datetime.utcnow()
            db.commit()
            return summary
        finally:
            if owns_client:
                client.__exit__(None, None, None)

    def import_parsed_message(
        self, db: Session, parsed: ParsedMailMessage
    ) -> ImportSummary:
        summary = ImportSummary(scanned_messages=1)
        if not parsed.is_boss_resume:
            return summary

        config = self._get_config(db)
        mailbox = self._mailbox(config)

        if not parsed.attachments:
            self._log_import(
                db,
                parsed,
                mailbox,
                attachment=None,
                attachment_sha256=self._synthetic_attachment_hash(
                    mailbox, parsed.uid, f"no_attachment:{uuid4()}"
                ),
                status=ResumeMailImportStatus.SKIPPED_NO_ATTACHMENT,
                reason="no_attachment",
            )
            db.commit()
            summary.skipped += 1
            return summary

        position = self._resolve_position(db, parsed.position_title, config)

        for attachment in parsed.attachments:
            if self._is_duplicate_attachment(db, attachment.sha256):
                self._log_duplicate_attachment(db, parsed, mailbox, attachment, position)
                db.commit()
                summary.skipped += 1
                continue

            if not attachment.supported:
                self._log_import(
                    db,
                    parsed,
                    mailbox,
                    attachment=attachment,
                    attachment_sha256=self._synthetic_attachment_hash(
                        mailbox,
                        parsed.uid,
                        f"unsupported_attachment:{attachment.sha256}:{uuid4()}",
                    ),
                    status=ResumeMailImportStatus.SKIPPED_UNSUPPORTED_ATTACHMENT,
                    reason=f"unsupported_attachment:{attachment.sha256}",
                    position=position,
                )
                db.commit()
                summary.skipped += 1
                continue

            file_path = None
            try:
                file_path = self._save_attachment(attachment)
                resume = Resume(
                    candidate_name="解析中...",
                    position_id=position.id,
                    file_path=file_path,
                    parse_status="processing",
                    status=ResumeStatus.PENDING_SCREENING,
                    screening_result=ScreeningResult.PENDING,
                    source=SOURCE_BOSS_MAIL,
                    source_message_id=parsed.message_id,
                    source_attachment_hash=attachment.sha256,
                )
                db.add(resume)
                db.flush()
                self._log_import(
                    db,
                    parsed,
                    mailbox,
                    attachment=attachment,
                    attachment_sha256=attachment.sha256,
                    status=ResumeMailImportStatus.IMPORTED,
                    reason="imported",
                    position=position,
                    resume=resume,
                )
                db.commit()
                db.refresh(resume)
                summary.imported += 1
            except IntegrityError as exc:
                db.rollback()
                self._remove_saved_file(file_path)
                if self._has_imported_attachment(db, attachment.sha256):
                    self._log_duplicate_attachment(
                        db, parsed, mailbox, attachment, position
                    )
                    db.commit()
                    summary.skipped += 1
                else:
                    self._log_failed_save(
                        db, parsed, mailbox, attachment, position, exc
                    )
                    db.commit()
                    summary.failed += 1
                continue
            except Exception as exc:
                db.rollback()
                self._remove_saved_file(file_path)
                self._log_failed_save(db, parsed, mailbox, attachment, position, exc)
                db.commit()
                summary.failed += 1
                continue

            try:
                process_resume_background(resume.id, position.id, False)
            except Exception as exc:
                db.rollback()
                self._log_import(
                    db,
                    parsed,
                    mailbox,
                    attachment=attachment,
                    attachment_sha256=self._synthetic_attachment_hash(
                        mailbox,
                        parsed.uid,
                        f"failed_enqueue:{attachment.sha256}:{uuid4()}",
                    ),
                    status=ResumeMailImportStatus.FAILED_ENQUEUE,
                    reason=f"failed_enqueue:{attachment.sha256}:{exc}",
                    position=position,
                    resume=resume,
                )
                db.commit()
                summary.failed += 1

        return summary

    def ensure_default_position(self, db: Session) -> Position:
        normalized_default = self._normalize_title(DEFAULT_POSITION_TITLE)
        existing = db.query(Position).all()
        for position in existing:
            if self._normalize_title(position.title) == normalized_default:
                return position

        position = Position(
            title=DEFAULT_POSITION_TITLE,
            description="Default position for BOSS resume mail imports",
            requirements="Review imported BOSS resumes and assign to the best fit.",
            status=PositionStatus.OPEN,
        )
        db.add(position)
        db.flush()
        return position

    def _resolve_position(
        self,
        db: Session,
        position_title: Optional[str],
        config: Optional[SystemConfig],
    ) -> Position:
        normalized_title = self._normalize_title(position_title)
        if normalized_title:
            open_positions = (
                db.query(Position)
                .filter(Position.status.in_([PositionStatus.OPEN, PositionStatus.PUBLISHED]))
                .all()
            )
            for position in open_positions:
                if self._normalize_title(position.title) == normalized_title:
                    return position

        if config and config.resume_mail_default_position_id:
            default_position = (
                db.query(Position)
                .filter(Position.id == config.resume_mail_default_position_id)
                .first()
            )
            if default_position:
                return default_position

        return self.ensure_default_position(db)

    def _save_attachment(self, attachment: ParsedAttachment) -> str:
        os.makedirs(self.upload_root, exist_ok=True)
        suffix = attachment.suffix or os.path.splitext(attachment.filename or "")[1]
        file_path = os.path.join(self.upload_root, f"{uuid4()}{suffix}")
        with open(file_path, "wb") as file:
            file.write(attachment.content)
        return file_path

    def _log_import(
        self,
        db: Session,
        parsed: ParsedMailMessage,
        mailbox: str,
        *,
        attachment: Optional[ParsedAttachment],
        attachment_sha256: str,
        status: ResumeMailImportStatus,
        reason: str,
        position: Optional[Position] = None,
        resume: Optional[Resume] = None,
    ) -> ResumeMailImport:
        log = ResumeMailImport(
            mailbox=mailbox,
            message_uid=parsed.uid,
            message_id=parsed.message_id,
            sender=parsed.sender,
            subject=parsed.subject,
            received_at=parsed.received_at,
            attachment_filename=attachment.filename if attachment else None,
            attachment_sha256=attachment_sha256,
            position_id=position.id if position else None,
            resume_id=resume.id if resume else None,
            status=status.value,
            reason=reason,
        )
        db.add(log)
        return log

    def _log_duplicate_attachment(
        self,
        db: Session,
        parsed: ParsedMailMessage,
        mailbox: str,
        attachment: ParsedAttachment,
        position: Position,
    ) -> ResumeMailImport:
        return self._log_import(
            db,
            parsed,
            mailbox,
            attachment=attachment,
            attachment_sha256=self._synthetic_attachment_hash(
                mailbox,
                parsed.uid,
                f"duplicate_attachment:{attachment.sha256}:{uuid4()}",
            ),
            status=ResumeMailImportStatus.SKIPPED_DUPLICATE_ATTACHMENT,
            reason=f"duplicate_attachment:{attachment.sha256}",
            position=position,
        )

    def _log_failed_save(
        self,
        db: Session,
        parsed: ParsedMailMessage,
        mailbox: str,
        attachment: ParsedAttachment,
        position: Position,
        error: Exception,
    ) -> ResumeMailImport:
        return self._log_import(
            db,
            parsed,
            mailbox,
            attachment=attachment,
            attachment_sha256=self._synthetic_attachment_hash(
                mailbox,
                parsed.uid,
                f"failed_save_file:{attachment.sha256}:{uuid4()}",
            ),
            status=ResumeMailImportStatus.FAILED_SAVE_FILE,
            reason=f"failed_save_file:{attachment.sha256}:{error}",
            position=position,
        )

    def _is_duplicate_attachment(self, db: Session, attachment_sha256: str) -> bool:
        return self._has_imported_attachment(db, attachment_sha256)

    def _has_imported_attachment(self, db: Session, attachment_sha256: str) -> bool:
        return (
            db.query(ResumeMailImport)
            .filter(
                ResumeMailImport.attachment_sha256 == attachment_sha256,
                ResumeMailImport.status == ResumeMailImportStatus.IMPORTED.value,
            )
            .first()
            is not None
        )

    def _remove_saved_file(self, file_path: Optional[str]) -> None:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)

    def _get_config(self, db: Session) -> Optional[SystemConfig]:
        return db.query(SystemConfig).first()

    def _create_imap_client(self, config: SystemConfig) -> ImapResumeMailClient:
        missing = []
        if not config.resume_mail_imap_host:
            missing.append("resume_mail_imap_host")
        if not config.resume_mail_username:
            missing.append("resume_mail_username")
        if not config.resume_mail_password:
            missing.append("resume_mail_password")
        if missing:
            raise ValueError(
                f"Missing resume mail IMAP configuration: {', '.join(missing)}"
            )

        return ImapResumeMailClient(
            host=config.resume_mail_imap_host,
            port=config.resume_mail_imap_port or 993,
            username=config.resume_mail_username,
            password=config.resume_mail_password,
            use_ssl=config.resume_mail_use_ssl is not False,
        )

    def _mailbox(self, config: Optional[SystemConfig]) -> str:
        if config and config.resume_mail_username:
            return config.resume_mail_username
        return "unknown"

    def _synthetic_attachment_hash(self, mailbox: str, uid: str, reason: str) -> str:
        value = f"{mailbox}:{uid}:{reason}".encode("utf-8")
        return hashlib.sha256(value).hexdigest()

    def _normalize_title(self, title: Optional[str]) -> str:
        return "".join(str(title or "").lower().split())
