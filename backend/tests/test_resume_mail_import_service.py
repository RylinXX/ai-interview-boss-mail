import pytest

from app.models.models import (
    Position,
    PositionStatus,
    Resume,
    ResumeMailImport,
    ResumeMailImportStatus,
    SystemConfig,
)
from app.services.resume_mail_import_parser import ParsedAttachment, ParsedMailMessage
from app.services.resume_mail_import_service import (
    DEFAULT_POSITION_TITLE,
    ImapResumeMailClient,
    ResumeMailImportService,
)


@pytest.fixture(autouse=True)
def mock_resume_queue(monkeypatch):
    monkeypatch.setattr(
        "app.services.resume_mail_import_service.process_resume_background",
        lambda resume_id, position_id, use_user_info=False: None,
    )


def make_parsed_message(
    uid="777",
    attachment_hash="c" * 64,
    filename="candidate.pdf",
    *,
    position_title="ai产品经理",
    attachment_supported=True,
    attachment_suffix=".pdf",
    attachments=None,
):
    if attachments is None:
        attachments = [
            ParsedAttachment(
                filename=filename,
                content_type="application/pdf",
                content=b"%PDF-1.4 resume bytes",
                sha256=attachment_hash,
                suffix=attachment_suffix,
                supported=attachment_supported,
            )
        ]
    return ParsedMailMessage(
        uid=uid,
        message_id=f"<boss-{uid}>",
        sender="BOSS直聘 <notice@example.com>",
        subject="王先生 | 10年以上，应聘 ai产品经理 | 北京12-22K【BOSS直聘】",
        received_at=None,
        is_boss_resume=True,
        position_title=position_title,
        attachments=attachments,
    )


def test_import_parsed_message_creates_resume_and_log(db, tmp_path, monkeypatch):
    position = Position(
        title="AI 产品经理",
        description="负责 AI 产品规划",
        requirements="熟悉 AI 产品设计",
        status=PositionStatus.OPEN,
    )
    db.add(position)
    db.add(
        SystemConfig(
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=position.id,
        )
    )
    db.commit()

    queued = []
    monkeypatch.setattr(
        "app.services.resume_mail_import_service.process_resume_background",
        lambda resume_id, position_id, use_user_info=False: queued.append(
            (resume_id, position_id, use_user_info)
        ),
    )

    service = ResumeMailImportService(upload_root=str(tmp_path))
    summary = service.import_parsed_message(db, make_parsed_message())

    resume = db.query(Resume).one()
    log = db.query(ResumeMailImport).one()

    assert summary.imported == 1
    assert summary.scanned_messages == 1
    assert resume.position_id == position.id
    assert resume.source == "boss_mail"
    assert resume.source_attachment_hash == "c" * 64
    assert log.mailbox == "recruiting@example.com"
    assert log.status == ResumeMailImportStatus.IMPORTED.value
    assert queued == [(resume.id, position.id, False)]


def test_import_parsed_message_skips_duplicate_attachment(db, tmp_path, test_position):
    db.add(
        SystemConfig(
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
        )
    )
    db.add(
        ResumeMailImport(
            mailbox="recruiting@example.com",
            message_uid="1",
            message_id="<old>",
            attachment_filename="old.pdf",
            attachment_sha256="d" * 64,
            status=ResumeMailImportStatus.IMPORTED.value,
            position_id=test_position.id,
        )
    )
    db.commit()

    service = ResumeMailImportService(upload_root=str(tmp_path))
    summary = service.import_parsed_message(
        db, make_parsed_message(uid="2", attachment_hash="d" * 64)
    )

    logs = db.query(ResumeMailImport).order_by(ResumeMailImport.message_uid).all()
    assert summary.skipped == 1
    assert len(logs) == 2
    assert logs[1].status == ResumeMailImportStatus.SKIPPED_DUPLICATE_ATTACHMENT.value
    assert logs[1].attachment_sha256 != "d" * 64
    assert "d" * 64 in logs[1].reason
    assert db.query(Resume).count() == 0


def test_import_parsed_message_skips_non_boss_message(db, tmp_path, test_position):
    db.add(
        SystemConfig(
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
        )
    )
    db.commit()
    parsed = make_parsed_message(uid="3")
    parsed = ParsedMailMessage(
        uid=parsed.uid,
        message_id=parsed.message_id,
        sender="someone@example.com",
        subject="普通邮件",
        received_at=None,
        is_boss_resume=False,
        position_title=None,
        attachments=parsed.attachments,
    )

    service = ResumeMailImportService(upload_root=str(tmp_path))
    summary = service.import_parsed_message(db, parsed)

    assert summary.skipped == 0
    assert summary.scanned_messages == 1
    assert summary.failed == 0
    assert db.query(ResumeMailImport).count() == 0


def test_import_parsed_message_logs_no_attachment_skip(db, tmp_path, test_position):
    db.add(
        SystemConfig(
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
        )
    )
    db.commit()

    service = ResumeMailImportService(upload_root=str(tmp_path))
    summary = service.import_parsed_message(
        db, make_parsed_message(uid="4", attachments=[])
    )

    log = db.query(ResumeMailImport).one()
    assert summary.skipped == 1
    assert summary.scanned_messages == 1
    assert log.mailbox == "recruiting@example.com"
    assert log.status == ResumeMailImportStatus.SKIPPED_NO_ATTACHMENT.value
    assert db.query(Resume).count() == 0


def test_import_parsed_message_logs_unsupported_attachment_skip(db, tmp_path, test_position):
    db.add(
        SystemConfig(
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
        )
    )
    db.commit()

    service = ResumeMailImportService(upload_root=str(tmp_path))
    summary = service.import_parsed_message(
        db,
        make_parsed_message(
            uid="5",
            attachment_hash="e" * 64,
            filename="candidate.png",
            attachment_supported=False,
            attachment_suffix=".png",
        ),
    )

    log = db.query(ResumeMailImport).one()
    assert summary.skipped == 1
    assert summary.scanned_messages == 1
    assert log.mailbox == "recruiting@example.com"
    assert log.status == ResumeMailImportStatus.SKIPPED_UNSUPPORTED_ATTACHMENT.value
    assert db.query(Resume).count() == 0


def test_ensure_default_position_fetches_existing_default_regardless_of_status(db, tmp_path):
    closed_default = Position(
        title=DEFAULT_POSITION_TITLE,
        description="Closed default",
        requirements="Closed",
        status=PositionStatus.CLOSED,
    )
    db.add(closed_default)
    db.commit()

    service = ResumeMailImportService(upload_root=str(tmp_path))
    position = service.ensure_default_position(db)

    assert position.id == closed_default.id
    assert db.query(Position).filter(Position.title == DEFAULT_POSITION_TITLE).count() == 1


def test_ensure_default_position_creates_default_when_missing(db, tmp_path):
    service = ResumeMailImportService(upload_root=str(tmp_path))
    position = service.ensure_default_position(db)
    db.commit()

    assert position.title == DEFAULT_POSITION_TITLE
    assert position.status == PositionStatus.OPEN
    assert db.query(Position).filter(Position.title == DEFAULT_POSITION_TITLE).count() == 1


def test_import_routes_to_exact_normalized_open_title_before_configured_default(
    db, tmp_path
):
    configured_default = Position(
        title="Other Role",
        description="Configured default",
        requirements="Default",
        status=PositionStatus.OPEN,
    )
    matched = Position(
        title="AI 产品经理",
        description="Matched role",
        requirements="Matched",
        status=PositionStatus.PUBLISHED,
    )
    db.add_all([configured_default, matched])
    db.flush()
    db.add(
        SystemConfig(
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=configured_default.id,
        )
    )
    db.commit()

    service = ResumeMailImportService(upload_root=str(tmp_path))
    summary = service.import_parsed_message(
        db, make_parsed_message(uid="6", attachment_hash="f" * 64)
    )

    resume = db.query(Resume).one()
    log = db.query(ResumeMailImport).one()
    assert summary.imported == 1
    assert resume.position_id == matched.id
    assert log.position_id == matched.id


def test_import_saves_attachment_under_upload_root_preserving_suffix(
    db, tmp_path, test_position
):
    db.add(
        SystemConfig(
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
        )
    )
    db.commit()

    service = ResumeMailImportService(upload_root=str(tmp_path))
    service.import_parsed_message(
        db,
        make_parsed_message(
            uid="7",
            attachment_hash="1" * 64,
            filename="candidate.docx",
            attachment_suffix=".docx",
        ),
    )

    resume = db.query(Resume).one()
    assert resume.file_path.startswith(str(tmp_path))
    assert resume.file_path.endswith(".docx")


def test_import_logs_failed_save_file_when_attachment_save_fails(
    db, tmp_path, test_position, monkeypatch
):
    db.add(
        SystemConfig(
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
        )
    )
    db.commit()

    service = ResumeMailImportService(upload_root=str(tmp_path))
    monkeypatch.setattr(
        service,
        "_save_attachment",
        lambda attachment: (_ for _ in ()).throw(OSError("disk full")),
    )

    summary = service.import_parsed_message(
        db, make_parsed_message(uid="8", attachment_hash="2" * 64)
    )

    log = db.query(ResumeMailImport).one()
    assert summary.failed == 1
    assert log.status == ResumeMailImportStatus.FAILED_SAVE_FILE.value
    assert db.query(Resume).count() == 0


def test_failed_save_does_not_block_retry_with_same_attachment_hash(
    db, tmp_path, test_position, monkeypatch
):
    db.add(
        SystemConfig(
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
        )
    )
    db.commit()

    attachment_hash = "4" * 64
    failing_service = ResumeMailImportService(upload_root=str(tmp_path))
    monkeypatch.setattr(
        failing_service,
        "_save_attachment",
        lambda attachment: (_ for _ in ()).throw(OSError("temporary disk issue")),
    )

    failed_summary = failing_service.import_parsed_message(
        db, make_parsed_message(uid="10", attachment_hash=attachment_hash)
    )

    failed_log = db.query(ResumeMailImport).one()
    assert failed_summary.failed == 1
    assert failed_log.status == ResumeMailImportStatus.FAILED_SAVE_FILE.value
    assert failed_log.attachment_sha256 != attachment_hash
    assert attachment_hash in failed_log.reason

    retry_service = ResumeMailImportService(upload_root=str(tmp_path))
    retry_summary = retry_service.import_parsed_message(
        db, make_parsed_message(uid="11", attachment_hash=attachment_hash)
    )

    imported_log = (
        db.query(ResumeMailImport)
        .filter(ResumeMailImport.status == ResumeMailImportStatus.IMPORTED.value)
        .one()
    )
    assert retry_summary.imported == 1
    assert imported_log.attachment_sha256 == attachment_hash
    assert db.query(Resume).count() == 1


def test_duplicate_race_logs_skip_without_failed_save(
    db, tmp_path, test_position, monkeypatch
):
    attachment_hash = "5" * 64
    db.add(
        SystemConfig(
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
        )
    )
    db.add(
        ResumeMailImport(
            mailbox="recruiting@example.com",
            message_uid="existing",
            message_id="<existing>",
            attachment_filename="existing.pdf",
            attachment_sha256=attachment_hash,
            status=ResumeMailImportStatus.IMPORTED.value,
            position_id=test_position.id,
        )
    )
    db.commit()

    service = ResumeMailImportService(upload_root=str(tmp_path))
    monkeypatch.setattr(service, "_is_duplicate_attachment", lambda db, sha256: False)

    summary = service.import_parsed_message(
        db, make_parsed_message(uid="12", attachment_hash=attachment_hash)
    )

    logs = db.query(ResumeMailImport).all()
    statuses = [log.status for log in logs]
    duplicate_log = (
        db.query(ResumeMailImport)
        .filter(
            ResumeMailImport.status
            == ResumeMailImportStatus.SKIPPED_DUPLICATE_ATTACHMENT.value
        )
        .one()
    )
    assert summary.skipped == 1
    assert summary.failed == 0
    assert ResumeMailImportStatus.FAILED_SAVE_FILE.value not in statuses
    assert duplicate_log.attachment_sha256 != attachment_hash
    assert attachment_hash in duplicate_log.reason
    assert db.query(Resume).count() == 0


def test_import_logs_failed_enqueue_without_failed_save_after_committed_import(
    db, tmp_path, test_position, monkeypatch
):
    db.add(
        SystemConfig(
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
        )
    )
    db.commit()

    def fail_enqueue(resume_id, position_id, use_user_info=False):
        raise RuntimeError("queue unavailable")

    monkeypatch.setattr(
        "app.services.resume_mail_import_service.process_resume_background",
        fail_enqueue,
    )

    service = ResumeMailImportService(upload_root=str(tmp_path))
    summary = service.import_parsed_message(
        db, make_parsed_message(uid="9", attachment_hash="3" * 64)
    )

    statuses = [log.status for log in db.query(ResumeMailImport).all()]
    assert summary.imported == 1
    assert summary.failed == 1
    assert db.query(Resume).count() == 1
    assert ResumeMailImportStatus.IMPORTED.value in statuses
    assert ResumeMailImportStatus.FAILED_ENQUEUE.value in statuses
    assert ResumeMailImportStatus.FAILED_SAVE_FILE.value not in statuses


class FakeImapClient:
    def __init__(self, messages):
        self.messages = messages
        self.seen_uids = []

    def fetch_recent_messages(self, limit):
        return self.messages[:limit]

    def mark_seen(self, uid):
        self.seen_uids.append(uid)


def test_sync_once_imports_recent_messages_and_marks_seen(
    db, tmp_path, test_position, monkeypatch
):
    db.add(
        SystemConfig(
            resume_mail_import_enabled=True,
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
            resume_mail_mark_success_read=True,
        )
    )
    db.commit()
    monkeypatch.setattr(
        "app.services.resume_mail_import_service.process_resume_background",
        lambda *args, **kwargs: None,
    )

    parsed = make_parsed_message(uid="909", attachment_hash="e" * 64)
    fake_client = FakeImapClient([parsed])
    service = ResumeMailImportService(upload_root=str(tmp_path), imap_client=fake_client)

    summary = service.sync_once(db, limit=10)

    assert summary.imported == 1
    assert fake_client.seen_uids == ["909"]


def test_sync_once_skips_when_auto_import_disabled_by_default(
    db, tmp_path, test_position
):
    db.add(
        SystemConfig(
            resume_mail_import_enabled=False,
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
            resume_mail_mark_success_read=True,
        )
    )
    db.commit()

    parsed = make_parsed_message(uid="914", attachment_hash="a" * 64)
    fake_client = FakeImapClient([parsed])
    service = ResumeMailImportService(upload_root=str(tmp_path), imap_client=fake_client)

    summary = service.sync_once(db, limit=10)

    assert summary.imported == 0
    assert summary.scanned_messages == 0
    assert fake_client.seen_uids == []


def test_sync_once_can_run_manual_sync_when_auto_import_disabled(
    db, tmp_path, test_position, monkeypatch
):
    db.add(
        SystemConfig(
            resume_mail_import_enabled=False,
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
            resume_mail_mark_success_read=True,
        )
    )
    db.commit()
    monkeypatch.setattr(
        "app.services.resume_mail_import_service.process_resume_background",
        lambda *args, **kwargs: None,
    )

    parsed = make_parsed_message(uid="915", attachment_hash="b" * 64)
    fake_client = FakeImapClient([parsed])
    service = ResumeMailImportService(upload_root=str(tmp_path), imap_client=fake_client)

    summary = service.sync_once(db, limit=10, require_enabled=False)

    assert summary.imported == 1
    assert summary.scanned_messages == 1
    assert fake_client.seen_uids == ["915"]


def test_sync_once_marks_each_successful_message_seen(
    db, tmp_path, test_position, monkeypatch
):
    db.add(
        SystemConfig(
            resume_mail_import_enabled=True,
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
            resume_mail_mark_success_read=True,
        )
    )
    db.commit()
    monkeypatch.setattr(
        "app.services.resume_mail_import_service.process_resume_background",
        lambda *args, **kwargs: None,
    )

    first = make_parsed_message(uid="912", attachment_hash="8" * 64)
    second = make_parsed_message(uid="913", attachment_hash="9" * 64)
    fake_client = FakeImapClient([first, second])
    service = ResumeMailImportService(upload_root=str(tmp_path), imap_client=fake_client)

    summary = service.sync_once(db, limit=10)

    assert summary.imported == 2
    assert fake_client.seen_uids == ["912", "913"]


def test_sync_once_respects_mark_success_read_false(db, tmp_path, test_position):
    db.add(
        SystemConfig(
            resume_mail_import_enabled=True,
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
            resume_mail_mark_success_read=False,
        )
    )
    db.commit()

    parsed = make_parsed_message(uid="910", attachment_hash="6" * 64)
    fake_client = FakeImapClient([parsed])
    service = ResumeMailImportService(upload_root=str(tmp_path), imap_client=fake_client)

    summary = service.sync_once(db, limit=10)

    assert summary.imported == 1
    assert fake_client.seen_uids == []


def test_sync_once_does_not_mark_partially_failed_message_seen(
    db, tmp_path, test_position, monkeypatch
):
    db.add(
        SystemConfig(
            resume_mail_import_enabled=True,
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
            resume_mail_mark_success_read=True,
        )
    )
    db.commit()

    def fail_enqueue(resume_id, position_id, use_user_info=False):
        raise RuntimeError("queue unavailable")

    monkeypatch.setattr(
        "app.services.resume_mail_import_service.process_resume_background",
        fail_enqueue,
    )

    parsed = make_parsed_message(uid="911", attachment_hash="7" * 64)
    fake_client = FakeImapClient([parsed])
    service = ResumeMailImportService(upload_root=str(tmp_path), imap_client=fake_client)

    summary = service.sync_once(db, limit=10)

    assert summary.imported == 1
    assert summary.failed == 1
    assert fake_client.seen_uids == []


def test_imap_client_cleans_up_when_select_fails(monkeypatch):
    instances = []

    class SelectFailsConnection:
        def __init__(self, host, port):
            self.host = host
            self.port = port
            self.logged_out = False
            instances.append(self)

        def login(self, username, password):
            return "OK", []

        def select(self, mailbox):
            raise RuntimeError("select failed")

        def close(self):
            return "OK", []

        def logout(self):
            self.logged_out = True
            return "BYE", []

    monkeypatch.setattr(
        "app.services.resume_mail_import_service.imaplib.IMAP4_SSL",
        SelectFailsConnection,
    )

    client = ImapResumeMailClient("imap.example.com", 993, "user", "secret")

    with pytest.raises(RuntimeError, match="select failed"):
        client.__enter__()

    assert instances[0].logged_out is True


def test_imap_client_sends_client_id_before_select(monkeypatch):
    instances = []

    class RequiresIdConnection:
        def __init__(self, host, port):
            self.id_sent = False
            self.logged_out = False
            instances.append(self)

        def login(self, username, password):
            return "OK", []

        def _simple_command(self, command, payload):
            if command == "ID" and "AI Interview" in payload:
                self.id_sent = True
            return "OK", []

        def select(self, mailbox):
            if not self.id_sent:
                raise RuntimeError("unsafe login")
            return "OK", [b"0"]

        def close(self):
            return "OK", []

        def logout(self):
            self.logged_out = True
            return "BYE", []

    monkeypatch.setattr(
        "app.services.resume_mail_import_service.imaplib.IMAP4_SSL",
        RequiresIdConnection,
    )

    client = ImapResumeMailClient("imap.example.com", 993, "user", "secret")

    with client:
        assert instances[0].id_sent is True

    assert instances[0].logged_out is True


def test_imap_client_exit_does_not_mask_body_exception():
    class LogoutFailsConnection:
        def close(self):
            return "OK", []

        def logout(self):
            raise RuntimeError("logout failed")

    client = ImapResumeMailClient("imap.example.com", 993, "user", "secret")
    client._imap = LogoutFailsConnection()

    with pytest.raises(ValueError, match="body failed"):
        try:
            raise ValueError("body failed")
        except ValueError as exc:
            client.__exit__(type(exc), exc, exc.__traceback__)
            raise
