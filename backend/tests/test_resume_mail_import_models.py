from sqlalchemy import UniqueConstraint
from sqlalchemy.exc import IntegrityError

from app.models.models import Resume, ResumeMailImport, ResumeMailImportStatus, SystemConfig


def _resume_mail_import(
    position_id,
    *,
    mailbox="recruiting@example.com",
    message_uid="101",
    attachment_sha256="b" * 64,
    attachment_filename="zhangsan.pdf",
):
    return ResumeMailImport(
        mailbox=mailbox,
        message_uid=message_uid,
        message_id=f"<boss-message-{message_uid}>",
        sender="BOSS <notice@example.com>",
        subject="Resume import",
        attachment_filename=attachment_filename,
        attachment_sha256=attachment_sha256,
        position_id=position_id,
        status=ResumeMailImportStatus.IMPORTED.value,
        reason="imported",
    )


def test_system_config_stores_resume_mail_import_settings(db, test_position):
    config = SystemConfig(
        resume_mail_import_enabled=True,
        resume_mail_imap_host="imap.163.com",
        resume_mail_imap_port=993,
        resume_mail_username="recruiting@example.com",
        resume_mail_password="secret",
        resume_mail_use_ssl=True,
        resume_mail_default_position_id=test_position.id,
        resume_mail_poll_interval_seconds=120,
        resume_mail_mark_success_read=True,
    )

    db.add(config)
    db.commit()
    db.refresh(config)

    assert config.resume_mail_import_enabled is True
    assert config.resume_mail_imap_host == "imap.163.com"
    assert config.resume_mail_imap_port == 993
    assert config.resume_mail_username == "recruiting@example.com"
    assert config.resume_mail_password == "secret"
    assert config.resume_mail_use_ssl is True
    assert config.resume_mail_default_position_id == test_position.id
    assert config.resume_mail_poll_interval_seconds == 120
    assert config.resume_mail_mark_success_read is True


def test_resume_records_source_metadata(db, test_position):
    resume = Resume(
        candidate_name="解析中...",
        position_id=test_position.id,
        file_path="uploads/resumes/example.pdf",
        source="boss_mail",
        source_message_id="<boss-message-1>",
        source_attachment_hash="a" * 64,
    )

    db.add(resume)
    db.commit()
    db.refresh(resume)

    assert resume.source == "boss_mail"
    assert resume.source_message_id == "<boss-message-1>"
    assert resume.source_attachment_hash == "a" * 64


def test_resume_mail_import_declares_expected_dedupe_constraints():
    unique_constraints = {
        constraint.name: tuple(column.name for column in constraint.columns)
        for constraint in ResumeMailImport.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
    }
    ordinary_indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in ResumeMailImport.__table__.indexes
    }

    assert unique_constraints["uq_resume_mail_import_message_attachment"] == (
        "mailbox",
        "message_uid",
        "attachment_sha256",
    )
    assert unique_constraints["uq_resume_mail_import_attachment_hash"] == ("attachment_sha256",)
    assert "ix_resume_mail_imports_attachment_sha256" not in ordinary_indexes
    assert ("attachment_sha256",) not in ordinary_indexes.values()


def test_resume_mail_import_allows_same_mailbox_uid_with_different_attachment_hashes(db, test_position):
    first = _resume_mail_import(
        test_position.id,
        message_uid="102",
        attachment_sha256="c" * 64,
        attachment_filename="zhangsan.pdf",
    )
    second = _resume_mail_import(
        test_position.id,
        message_uid="102",
        attachment_sha256="d" * 64,
        attachment_filename="zhangsan-extra.pdf",
    )

    db.add_all([first, second])
    db.commit()

    imported_count = (
        db.query(ResumeMailImport)
        .filter(
            ResumeMailImport.mailbox == "recruiting@example.com",
            ResumeMailImport.message_uid == "102",
        )
        .count()
    )
    assert imported_count == 2


def test_resume_mail_import_rejects_exact_mailbox_uid_attachment_duplicate(db, test_position):
    first = _resume_mail_import(test_position.id, message_uid="103", attachment_sha256="e" * 64)
    duplicate = _resume_mail_import(
        test_position.id,
        message_uid="103",
        attachment_sha256="e" * 64,
        attachment_filename="zhangsan-again.pdf",
    )

    db.add(first)
    db.commit()
    db.add(duplicate)

    try:
        db.commit()
        raised = False
    except IntegrityError:
        db.rollback()
        raised = True

    assert raised is True


def test_resume_mail_import_deduplicates_by_mailbox_uid_and_attachment_hash(db, test_position):
    first = ResumeMailImport(
        mailbox="recruiting@example.com",
        message_uid="101",
        message_id="<boss-message-101>",
        sender="BOSS直聘 <notice@example.com>",
        subject="张三 | 4年，应聘 ai产品经理 | 北京12-22K【BOSS直聘】",
        attachment_filename="zhangsan.pdf",
        attachment_sha256="b" * 64,
        position_id=test_position.id,
        status=ResumeMailImportStatus.IMPORTED.value,
        reason="imported",
    )
    db.add(first)
    db.commit()

    duplicate = ResumeMailImport(
        mailbox="recruiting@example.com",
        message_uid="101",
        message_id="<boss-message-101>",
        sender="BOSS直聘 <notice@example.com>",
        subject="张三 | 4年，应聘 ai产品经理 | 北京12-22K【BOSS直聘】",
        attachment_filename="zhangsan-again.pdf",
        attachment_sha256="b" * 64,
        position_id=test_position.id,
        status=ResumeMailImportStatus.SKIPPED_DUPLICATE_ATTACHMENT.value,
        reason="duplicate_attachment",
    )
    db.add(duplicate)

    try:
        db.commit()
        raised = False
    except IntegrityError:
        db.rollback()
        raised = True

    assert raised is True
