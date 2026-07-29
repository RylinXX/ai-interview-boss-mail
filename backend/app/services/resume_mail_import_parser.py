from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime
import hashlib
import os
import re
from typing import List, Optional


SUPPORTED_RESUME_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".md", ".markdown", ".png", ".jpg", ".jpeg", ".webp"}
IGNORED_ATTACHMENT_FILENAMES = {"avatar.png", "avatar.jpg", "logo.png", "logo.jpg", "image001.png", "image002.png", "icon.png"}




@dataclass(frozen=True)
class ParsedAttachment:
    filename: str
    content_type: str
    content: bytes
    sha256: str
    suffix: str
    supported: bool


@dataclass(frozen=True)
class ParsedMailMessage:
    uid: str
    message_id: Optional[str]
    sender: str
    subject: str
    received_at: Optional[datetime]
    is_boss_resume: bool
    position_title: Optional[str]
    attachments: List[ParsedAttachment]


def is_supported_resume_filename(filename: str) -> bool:
    if not filename:
        return False
    fn_lower = filename.lower().strip()
    if fn_lower in IGNORED_ATTACHMENT_FILENAMES:
        return False
    suffix = os.path.splitext(fn_lower)[1]
    return suffix in SUPPORTED_RESUME_EXTENSIONS


def extract_boss_position_title(subject: str) -> Optional[str]:
    if not subject:
        return None
    match = re.search(r"应聘\s*([^|【\]]+)", subject, re.IGNORECASE)
    if not match:
        return None
    title = match.group(1).strip()
    title = re.sub(r"\s+", " ", title)
    return title or None


def _decode_subject(value: Optional[str]) -> str:
    return str(value or "").strip()


def _safe_received_at(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None


def _is_boss_resume(sender: str, subject: str, body_text: str) -> bool:
    haystack = f"{sender}\n{subject}\n{body_text}"
    return "BOSS直聘" in haystack


def parse_mail_message(raw_message: bytes, uid: str) -> ParsedMailMessage:
    message = BytesParser(policy=policy.default).parsebytes(raw_message)
    sender = str(message.get("From", "")).strip()
    subject = _decode_subject(message.get("Subject"))
    body_parts: List[str] = []
    attachments: List[ParsedAttachment] = []

    for part in message.walk():
        disposition = part.get_content_disposition()
        filename = part.get_filename()
        if filename:
            content = part.get_payload(decode=True) or b""
            suffix = os.path.splitext(filename)[1].lower()
            attachments.append(
                ParsedAttachment(
                    filename=filename,
                    content_type=part.get_content_type(),
                    content=content,
                    sha256=hashlib.sha256(content).hexdigest(),
                    suffix=suffix,
                    supported=is_supported_resume_filename(filename),
                )
            )
            continue

        if part.get_content_maintype() == "text" and disposition != "attachment":
            try:
                body_parts.append(part.get_content())
            except LookupError:
                payload = part.get_payload(decode=True) or b""
                body_parts.append(payload.decode("utf-8", errors="ignore"))

    body_text = "\n".join(body_parts)
    return ParsedMailMessage(
        uid=uid,
        message_id=str(message.get("Message-ID", "")).strip() or None,
        sender=sender,
        subject=subject,
        received_at=_safe_received_at(message.get("Date")),
        is_boss_resume=_is_boss_resume(sender, subject, body_text),
        position_title=extract_boss_position_title(subject),
        attachments=attachments,
    )
