# BOSS Mail Resume Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an embedded IMAP importer that pulls BOSS Zhipin resume emails from a configured 163 mailbox, skips duplicates, creates `Resume` records, and starts the existing AI evaluation queue.

**Architecture:** Add a focused backend importer made of parser, service, scheduler, routes, and import audit models. Reuse the current `Resume` evaluation queue instead of duplicating AI parsing. Add one admin settings tab for connection, default position, manual sync, and import logs.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, stdlib `imaplib`/`email`/`hashlib`, existing task queue, React, Ant Design, Axios request helper.

---

## File Structure

- Modify `backend/app/models/models.py`: add inbound mailbox config fields, resume source fields, and `ResumeMailImport` audit model.
- Create `backend/alembic/versions/m2n3o4p5q6r7_add_resume_mail_import.py`: migrate settings, resume metadata, and import audit table.
- Modify `backend/tests/conftest.py`: create the new import table during SQLite tests and include new router.
- Create `backend/tests/test_resume_mail_import_models.py`: verify new model fields and uniqueness rules.
- Create `backend/app/services/resume_mail_import_parser.py`: pure MIME parsing, BOSS detection, position title parsing, attachment hashing.
- Create `backend/tests/test_resume_mail_import_parser.py`: unit tests for parser behavior.
- Create `backend/app/services/resume_mail_import_service.py`: position routing, deduplication, file save, resume creation, queue submission, IMAP sync.
- Create `backend/tests/test_resume_mail_import_service.py`: service tests using parsed-message objects and a fake IMAP client.
- Modify `backend/app/schemas/settings.py`: add inbound import settings schemas.
- Modify `backend/app/routes/settings.py`: add admin get/update/test endpoints for import settings.
- Create `backend/app/routes/resume_mail_imports.py`: add manual sync and import log APIs.
- Create `backend/app/services/resume_mail_import_scheduler.py`: background polling loop with start/stop lifecycle.
- Modify `backend/app/main.py`: include routes and start/stop scheduler.
- Modify `frontend/src/pages/Settings/System.tsx`: add “简历邮箱导入” tab.

## Task 1: Backend Schema And Migration

**Files:**
- Modify: `backend/app/models/models.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_resume_mail_import_models.py`
- Create: `backend/alembic/versions/m2n3o4p5q6r7_add_resume_mail_import.py`

- [ ] **Step 1: Write failing model tests**

Create `backend/tests/test_resume_mail_import_models.py`:

```python
from sqlalchemy.exc import IntegrityError

from app.models.models import Resume, ResumeMailImport, ResumeMailImportStatus, SystemConfig


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
    assert config.resume_mail_default_position_id == test_position.id
    assert config.resume_mail_poll_interval_seconds == 120


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
```

- [ ] **Step 2: Run model tests and verify they fail**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_resume_mail_import_models.py -q
```

Expected: FAIL because `ResumeMailImport`, `ResumeMailImportStatus`, and the new config fields do not exist.

- [ ] **Step 3: Add model fields and import audit model**

Modify `backend/app/models/models.py`:

```python
class ResumeMailImportStatus(str, enum.Enum):
    IMPORTED = "imported"
    SKIPPED_DUPLICATE_MESSAGE = "skipped_duplicate_message"
    SKIPPED_DUPLICATE_ATTACHMENT = "skipped_duplicate_attachment"
    SKIPPED_DUPLICATE_CANDIDATE = "skipped_duplicate_candidate"
    SKIPPED_NO_ATTACHMENT = "skipped_no_attachment"
    SKIPPED_UNSUPPORTED_ATTACHMENT = "skipped_unsupported_attachment"
    FAILED_CONNECTION = "failed_connection"
    FAILED_PARSE_MESSAGE = "failed_parse_message"
    FAILED_SAVE_FILE = "failed_save_file"
    FAILED_MISSING_DEFAULT_POSITION = "failed_missing_default_position"
    FAILED_ENQUEUE = "failed_enqueue"
```

Add optional source fields to `Resume`:

```python
    source = Column(String, index=True, nullable=True)
    source_message_id = Column(String, index=True, nullable=True)
    source_attachment_hash = Column(String(64), index=True, nullable=True)
```

Add inbound settings fields to `SystemConfig`:

```python
    resume_mail_import_enabled = Column(Boolean, default=False)
    resume_mail_imap_host = Column(String)
    resume_mail_imap_port = Column(Integer, default=993)
    resume_mail_username = Column(String)
    resume_mail_password = Column(String)
    resume_mail_use_ssl = Column(Boolean, default=True)
    resume_mail_default_position_id = Column(UUID(as_uuid=True), ForeignKey("positions.id"), nullable=True)
    resume_mail_poll_interval_seconds = Column(Integer, default=120)
    resume_mail_mark_success_read = Column(Boolean, default=True)
    resume_mail_last_sync_at = Column(DateTime, nullable=True)
```

Add the audit table model near `Resume`:

```python
class ResumeMailImport(Base):
    __tablename__ = "resume_mail_imports"
    __table_args__ = (
        UniqueConstraint("mailbox", "message_uid", "attachment_sha256", name="uq_resume_mail_import_message_attachment"),
        UniqueConstraint("attachment_sha256", name="uq_resume_mail_import_attachment_hash"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_uid = Column(String, nullable=False, index=True)
    message_id = Column(String, nullable=True, index=True)
    mailbox = Column(String, nullable=False, index=True)
    sender = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    received_at = Column(DateTime, nullable=True)
    attachment_filename = Column(String, nullable=True)
    attachment_sha256 = Column(String(64), nullable=False, index=True)
    position_id = Column(UUID(as_uuid=True), ForeignKey("positions.id"), nullable=True)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id"), nullable=True)
    status = Column(String(64), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    position = relationship("Position")
    resume = relationship("Resume")
```

Ensure `UniqueConstraint` is imported from SQLAlchemy if the file does not already import it.

- [ ] **Step 4: Update test table setup**

Modify `backend/tests/conftest.py` imports and `tables_to_create`:

```python
from app.models.models import (
    Base, User, UserRole, Position, PositionStatus, PositionUrgency, PositionType,
    Resume, ResumeStatus, ScreeningResult, Interview, InterviewStatus, InterviewResult,
    InterviewPanel, DepartmentReview, SystemConfig, CodingTest, CodingSubmission,
    ResumeMailImport
)
```

Add to `tables_to_create` after `Resume.__table__`:

```python
        ResumeMailImport.__table__,
```

- [ ] **Step 5: Add Alembic migration**

Create `backend/alembic/versions/m2n3o4p5q6r7_add_resume_mail_import.py`:

```python
"""add resume mail import

Revision ID: m2n3o4p5q6r7
Revises: l1m2n3o4p5q6
Create Date: 2026-05-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "m2n3o4p5q6r7"
down_revision: Union[str, None] = "l1m2n3o4p5q6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("resumes", sa.Column("source", sa.String(), nullable=True))
    op.add_column("resumes", sa.Column("source_message_id", sa.String(), nullable=True))
    op.add_column("resumes", sa.Column("source_attachment_hash", sa.String(length=64), nullable=True))
    op.create_index("ix_resumes_source", "resumes", ["source"])
    op.create_index("ix_resumes_source_message_id", "resumes", ["source_message_id"])
    op.create_index("ix_resumes_source_attachment_hash", "resumes", ["source_attachment_hash"])

    op.add_column("system_configs", sa.Column("resume_mail_import_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("system_configs", sa.Column("resume_mail_imap_host", sa.String(), nullable=True))
    op.add_column("system_configs", sa.Column("resume_mail_imap_port", sa.Integer(), nullable=True, server_default="993"))
    op.add_column("system_configs", sa.Column("resume_mail_username", sa.String(), nullable=True))
    op.add_column("system_configs", sa.Column("resume_mail_password", sa.String(), nullable=True))
    op.add_column("system_configs", sa.Column("resume_mail_use_ssl", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("system_configs", sa.Column("resume_mail_default_position_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("system_configs", sa.Column("resume_mail_poll_interval_seconds", sa.Integer(), nullable=False, server_default="120"))
    op.add_column("system_configs", sa.Column("resume_mail_mark_success_read", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("system_configs", sa.Column("resume_mail_last_sync_at", sa.DateTime(), nullable=True))
    op.create_foreign_key("fk_system_configs_resume_mail_default_position_id", "system_configs", "positions", ["resume_mail_default_position_id"], ["id"])

    op.create_table(
        "resume_mail_imports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("message_uid", sa.String(), nullable=False),
        sa.Column("message_id", sa.String(), nullable=True),
        sa.Column("mailbox", sa.String(), nullable=False),
        sa.Column("sender", sa.String(), nullable=True),
        sa.Column("subject", sa.String(), nullable=True),
        sa.Column("received_at", sa.DateTime(), nullable=True),
        sa.Column("attachment_filename", sa.String(), nullable=True),
        sa.Column("attachment_sha256", sa.String(length=64), nullable=False),
        sa.Column("position_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resume_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["position_id"], ["positions.id"]),
        sa.ForeignKeyConstraint(["resume_id"], ["resumes.id"]),
        sa.UniqueConstraint("mailbox", "message_uid", "attachment_sha256", name="uq_resume_mail_import_message_attachment"),
        sa.UniqueConstraint("attachment_sha256", name="uq_resume_mail_import_attachment_hash"),
    )
    op.create_index("ix_resume_mail_imports_message_uid", "resume_mail_imports", ["message_uid"])
    op.create_index("ix_resume_mail_imports_message_id", "resume_mail_imports", ["message_id"])
    op.create_index("ix_resume_mail_imports_mailbox", "resume_mail_imports", ["mailbox"])
    op.create_index("ix_resume_mail_imports_attachment_sha256", "resume_mail_imports", ["attachment_sha256"])


def downgrade() -> None:
    op.drop_index("ix_resume_mail_imports_attachment_sha256", table_name="resume_mail_imports")
    op.drop_index("ix_resume_mail_imports_mailbox", table_name="resume_mail_imports")
    op.drop_index("ix_resume_mail_imports_message_id", table_name="resume_mail_imports")
    op.drop_index("ix_resume_mail_imports_message_uid", table_name="resume_mail_imports")
    op.drop_table("resume_mail_imports")

    op.drop_constraint("fk_system_configs_resume_mail_default_position_id", "system_configs", type_="foreignkey")
    op.drop_column("system_configs", "resume_mail_last_sync_at")
    op.drop_column("system_configs", "resume_mail_mark_success_read")
    op.drop_column("system_configs", "resume_mail_poll_interval_seconds")
    op.drop_column("system_configs", "resume_mail_default_position_id")
    op.drop_column("system_configs", "resume_mail_use_ssl")
    op.drop_column("system_configs", "resume_mail_password")
    op.drop_column("system_configs", "resume_mail_username")
    op.drop_column("system_configs", "resume_mail_imap_port")
    op.drop_column("system_configs", "resume_mail_imap_host")
    op.drop_column("system_configs", "resume_mail_import_enabled")

    op.drop_index("ix_resumes_source_attachment_hash", table_name="resumes")
    op.drop_index("ix_resumes_source_message_id", table_name="resumes")
    op.drop_index("ix_resumes_source", table_name="resumes")
    op.drop_column("resumes", "source_attachment_hash")
    op.drop_column("resumes", "source_message_id")
    op.drop_column("resumes", "source")
```

- [ ] **Step 6: Run model tests and migration check**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_resume_mail_import_models.py -q
.\.venv\Scripts\python.exe -m alembic heads
```

Expected: model tests PASS and Alembic shows `m2n3o4p5q6r7` as the single head.

- [ ] **Step 7: Commit schema work**

Run:

```powershell
git add backend/app/models/models.py backend/tests/conftest.py backend/tests/test_resume_mail_import_models.py backend/alembic/versions/m2n3o4p5q6r7_add_resume_mail_import.py
git commit -m "feat: add resume mail import schema"
```

## Task 2: MIME Parser And BOSS Filtering

**Files:**
- Create: `backend/app/services/resume_mail_import_parser.py`
- Create: `backend/tests/test_resume_mail_import_parser.py`

- [ ] **Step 1: Write failing parser tests**

Create `backend/tests/test_resume_mail_import_parser.py`:

```python
from email.message import EmailMessage

from app.services.resume_mail_import_parser import (
    extract_boss_position_title,
    is_supported_resume_filename,
    parse_mail_message,
)


def build_message(subject: str, attachment_name: str = "resume.pdf", content: bytes = b"%PDF-1.4") -> bytes:
    message = EmailMessage()
    message["From"] = "BOSS直聘 <notice@example.com>"
    message["To"] = "recruiting@example.com"
    message["Subject"] = subject
    message["Message-ID"] = "<boss-message-parser-test>"
    message.set_content("候选人通过 BOSS直聘 投递了简历")
    message.add_attachment(content, maintype="application", subtype="pdf", filename=attachment_name)
    return message.as_bytes()


def test_extract_boss_position_title_from_subject():
    subject = "袁承祥 | 4年，应聘 ai产品经理 | 北京12-22K【BOSS直聘】"

    assert extract_boss_position_title(subject) == "ai产品经理"


def test_supported_resume_filenames():
    assert is_supported_resume_filename("candidate.pdf") is True
    assert is_supported_resume_filename("candidate.docx") is True
    assert is_supported_resume_filename("candidate.txt") is True
    assert is_supported_resume_filename("candidate.png") is False


def test_parse_mail_message_extracts_boss_attachment_and_hash():
    parsed = parse_mail_message(build_message("王先生 | 10年以上，应聘 ai产品经理 | 北京12-22K【BOSS直聘】"), uid="555")

    assert parsed.uid == "555"
    assert parsed.message_id == "<boss-message-parser-test>"
    assert parsed.is_boss_resume is True
    assert parsed.position_title == "ai产品经理"
    assert len(parsed.attachments) == 1
    assert parsed.attachments[0].filename == "resume.pdf"
    assert len(parsed.attachments[0].sha256) == 64


def test_parse_mail_message_keeps_unsupported_attachment_for_status_logging():
    parsed = parse_mail_message(build_message("李毅 | 7年，应聘 ai产品经理【BOSS直聘】", "avatar.png", b"png"), uid="556")

    assert parsed.is_boss_resume is True
    assert len(parsed.attachments) == 1
    assert parsed.attachments[0].supported is False
    assert parsed.attachments[0].suffix == ".png"
```

- [ ] **Step 2: Run parser tests and verify they fail**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_resume_mail_import_parser.py -q
```

Expected: FAIL because `resume_mail_import_parser.py` does not exist.

- [ ] **Step 3: Implement parser module**

Create `backend/app/services/resume_mail_import_parser.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime
import hashlib
import os
import re
from typing import List, Optional


SUPPORTED_RESUME_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".markdown"}


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
    received_at: Optional[object]
    is_boss_resume: bool
    position_title: Optional[str]
    attachments: List[ParsedAttachment]


def is_supported_resume_filename(filename: str) -> bool:
    suffix = os.path.splitext(filename or "")[1].lower()
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


def _safe_received_at(value: Optional[str]):
    if not value:
        return None
    try:
        return parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None


def _is_boss_resume(sender: str, subject: str, body_text: str) -> bool:
    haystack = f"{sender}\n{subject}\n{body_text}"
    return "BOSS直聘" in haystack or "BOSS" in sender.upper()


def parse_mail_message(raw_message: bytes, uid: str) -> ParsedMailMessage:
    message = BytesParser(policy=policy.default).parsebytes(raw_message)
    sender = str(message.get("From", "")).strip()
    subject = _decode_subject(message.get("Subject"))
    body_parts: List[str] = []
    attachments: List[ParsedAttachment] = []

    for part in message.walk():
        disposition = part.get_content_disposition()
        filename = part.get_filename()
        if disposition == "attachment" and filename:
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
```

- [ ] **Step 4: Run parser tests**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_resume_mail_import_parser.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit parser work**

Run:

```powershell
git add backend/app/services/resume_mail_import_parser.py backend/tests/test_resume_mail_import_parser.py
git commit -m "feat: parse BOSS resume emails"
```

## Task 3: Import Service, Deduplication, And Resume Queue Submission

**Files:**
- Create: `backend/app/services/resume_mail_import_service.py`
- Create: `backend/tests/test_resume_mail_import_service.py`

- [ ] **Step 1: Write failing service tests**

Create `backend/tests/test_resume_mail_import_service.py`:

```python
from app.models.models import Position, PositionStatus, Resume, ResumeMailImport, ResumeMailImportStatus, SystemConfig
from app.services.resume_mail_import_parser import ParsedAttachment, ParsedMailMessage
from app.services.resume_mail_import_service import ResumeMailImportService


def make_parsed_message(uid="777", attachment_hash="c" * 64, filename="candidate.pdf"):
    return ParsedMailMessage(
        uid=uid,
        message_id=f"<boss-{uid}>",
        sender="BOSS直聘 <notice@example.com>",
        subject="王先生 | 10年以上，应聘 ai产品经理 | 北京12-22K【BOSS直聘】",
        received_at=None,
        is_boss_resume=True,
        position_title="ai产品经理",
        attachments=[
            ParsedAttachment(
                filename=filename,
                content_type="application/pdf",
                content=b"%PDF-1.4 resume bytes",
                sha256=attachment_hash,
                suffix=".pdf",
                supported=True,
            )
        ],
    )


def test_import_parsed_message_creates_resume_and_log(db, tmp_path, monkeypatch):
    position = Position(
        title="AI 产品经理",
        description="负责 AI 产品规划",
        requirements="熟悉 AI 产品设计",
        status=PositionStatus.OPEN,
    )
    db.add(position)
    db.add(SystemConfig(resume_mail_username="recruiting@example.com", resume_mail_default_position_id=position.id))
    db.commit()

    queued = []
    monkeypatch.setattr("app.services.resume_mail_import_service.process_resume_background", lambda resume_id, position_id, use_user_info=False: queued.append((resume_id, position_id, use_user_info)))

    service = ResumeMailImportService(upload_root=str(tmp_path))
    summary = service.import_parsed_message(db, make_parsed_message())

    resume = db.query(Resume).one()
    log = db.query(ResumeMailImport).one()

    assert summary.imported == 1
    assert resume.position_id == position.id
    assert resume.source == "boss_mail"
    assert resume.source_attachment_hash == "c" * 64
    assert log.status == ResumeMailImportStatus.IMPORTED.value
    assert queued == [(resume.id, position.id, False)]


def test_import_parsed_message_skips_duplicate_attachment(db, tmp_path, test_position):
    db.add(SystemConfig(resume_mail_username="recruiting@example.com", resume_mail_default_position_id=test_position.id))
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
    summary = service.import_parsed_message(db, make_parsed_message(uid="2", attachment_hash="d" * 64))

    assert summary.skipped == 1
    assert db.query(Resume).count() == 0


def test_import_parsed_message_skips_non_boss_message(db, tmp_path, test_position):
    db.add(SystemConfig(resume_mail_username="recruiting@example.com", resume_mail_default_position_id=test_position.id))
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
    assert summary.failed == 0
    assert db.query(ResumeMailImport).count() == 0
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_resume_mail_import_service.py -q
```

Expected: FAIL because the import service does not exist.

- [ ] **Step 3: Implement import summary and service skeleton**

Create `backend/app/services/resume_mail_import_service.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import imaplib
import os
import uuid
from typing import Iterable, List, Optional

from sqlalchemy.orm import Session

from app.models.models import (
    Position,
    PositionStatus,
    Resume,
    ResumeMailImport,
    ResumeMailImportStatus,
    ResumeStatus,
    SystemConfig,
)
from app.services.resume_mail_import_parser import ParsedAttachment, ParsedMailMessage, parse_mail_message
from app.services.resume_service import process_resume_background


@dataclass
class ImportSummary:
    imported: int = 0
    skipped: int = 0
    failed: int = 0
    scanned_messages: int = 0


class ResumeMailImportService:
    def __init__(self, upload_root: str = "uploads/resumes"):
        self.upload_root = upload_root

    def import_parsed_message(self, db: Session, parsed: ParsedMailMessage) -> ImportSummary:
        summary = ImportSummary(scanned_messages=1)
        if not parsed.is_boss_resume:
            return summary

        config = db.query(SystemConfig).first()
        mailbox = (config.resume_mail_username if config else None) or ""

        if not parsed.attachments:
            self._record_log(db, parsed, None, mailbox, ResumeMailImportStatus.SKIPPED_NO_ATTACHMENT.value, "no_attachment")
            summary.skipped += 1
            return summary

        for attachment in parsed.attachments:
            if not attachment.supported:
                self._record_log(db, parsed, attachment, mailbox, ResumeMailImportStatus.SKIPPED_UNSUPPORTED_ATTACHMENT.value, "unsupported_attachment")
                summary.skipped += 1
                continue

            if self._is_duplicate_attachment(db, attachment.sha256):
                self._record_log(db, parsed, attachment, mailbox, ResumeMailImportStatus.SKIPPED_DUPLICATE_ATTACHMENT.value, "duplicate_attachment")
                summary.skipped += 1
                continue

            position = self._resolve_position(db, config, parsed.position_title)
            if not position:
                self._record_log(db, parsed, attachment, mailbox, ResumeMailImportStatus.FAILED_MISSING_DEFAULT_POSITION.value, "missing_default_position")
                summary.failed += 1
                continue

            try:
                file_path = self._save_attachment(attachment)
                resume = Resume(
                    candidate_name="解析中...",
                    position_id=position.id,
                    file_path=file_path,
                    status=ResumeStatus.PENDING_SCREENING,
                    parse_status="processing",
                    source="boss_mail",
                    source_message_id=parsed.message_id,
                    source_attachment_hash=attachment.sha256,
                )
                db.add(resume)
                db.flush()
                self._record_log(db, parsed, attachment, mailbox, ResumeMailImportStatus.IMPORTED.value, "imported", position.id, resume.id)
                db.commit()
                process_resume_background(resume.id, position.id, False)
                summary.imported += 1
            except Exception as exc:
                db.rollback()
                self._record_log(db, parsed, attachment, mailbox, ResumeMailImportStatus.FAILED_SAVE_FILE.value, str(exc)[:400])
                db.commit()
                summary.failed += 1

        return summary

    def _resolve_position(self, db: Session, config: Optional[SystemConfig], position_title: Optional[str]) -> Optional[Position]:
        if position_title:
            normalized = self._normalize_title(position_title)
            positions = db.query(Position).filter(Position.status.in_([PositionStatus.OPEN, PositionStatus.PUBLISHED])).all()
            for position in positions:
                if self._normalize_title(position.title) == normalized:
                    return position
        if config and config.resume_mail_default_position_id:
            return db.query(Position).filter(Position.id == config.resume_mail_default_position_id).first()
        return self.ensure_default_position(db)

    def ensure_default_position(self, db: Session) -> Position:
        position = db.query(Position).filter(Position.title == "AI 产品经理").first()
        if position:
            return position
        position = Position(
            title="AI 产品经理",
            description="负责 AI 产品需求分析、产品规划、方案设计和跨团队推进。",
            requirements="熟悉 AI 产品设计，有招聘、SaaS 或企业服务经验优先。",
            salary_range="12-22K",
            location="北京",
            department="产品部",
            status=PositionStatus.OPEN,
        )
        db.add(position)
        db.flush()
        return position

    def _is_duplicate_attachment(self, db: Session, sha256: str) -> bool:
        return db.query(ResumeMailImport).filter(ResumeMailImport.attachment_sha256 == sha256).first() is not None

    def _record_log(self, db: Session, parsed: ParsedMailMessage, attachment: Optional[ParsedAttachment], mailbox: str, status: str, reason: str, position_id=None, resume_id=None) -> None:
        db.add(
            ResumeMailImport(
                mailbox=mailbox,
                message_uid=parsed.uid,
                message_id=parsed.message_id,
                sender=parsed.sender,
                subject=parsed.subject,
                received_at=parsed.received_at,
                attachment_filename=attachment.filename if attachment else None,
                attachment_sha256=attachment.sha256 if attachment else "0" * 64,
                position_id=position_id,
                resume_id=resume_id,
                status=status,
                reason=reason,
            )
        )

    def _save_attachment(self, attachment: ParsedAttachment) -> str:
        os.makedirs(self.upload_root, exist_ok=True)
        filename = f"{uuid.uuid4()}{attachment.suffix}"
        file_path = os.path.join(self.upload_root, filename)
        with open(file_path, "wb") as handle:
            handle.write(attachment.content)
        return file_path

    def _normalize_title(self, value: str) -> str:
        return "".join((value or "").lower().split()).replace("ai", "AI".lower())
```

- [ ] **Step 4: Run service tests**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_resume_mail_import_service.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit import service core**

Run:

```powershell
git add backend/app/services/resume_mail_import_service.py backend/tests/test_resume_mail_import_service.py
git commit -m "feat: import BOSS resumes into queue"
```

## Task 4: IMAP Sync And Scheduler

**Files:**
- Modify: `backend/app/services/resume_mail_import_service.py`
- Create: `backend/app/services/resume_mail_import_scheduler.py`
- Modify: `backend/tests/test_resume_mail_import_service.py`

- [ ] **Step 1: Add failing IMAP sync test**

Append to `backend/tests/test_resume_mail_import_service.py`:

```python
class FakeImapClient:
    def __init__(self, messages):
        self.messages = messages
        self.seen_uids = []

    def fetch_recent_messages(self, limit):
        return self.messages[:limit]

    def mark_seen(self, uid):
        self.seen_uids.append(uid)


def test_sync_once_imports_recent_messages_and_marks_seen(db, tmp_path, test_position, monkeypatch):
    db.add(
        SystemConfig(
            resume_mail_import_enabled=True,
            resume_mail_username="recruiting@example.com",
            resume_mail_default_position_id=test_position.id,
            resume_mail_mark_success_read=True,
        )
    )
    db.commit()
    monkeypatch.setattr("app.services.resume_mail_import_service.process_resume_background", lambda *args, **kwargs: None)

    parsed = make_parsed_message(uid="909", attachment_hash="e" * 64)
    fake_client = FakeImapClient([parsed])
    service = ResumeMailImportService(upload_root=str(tmp_path), imap_client=fake_client)

    summary = service.sync_once(db, limit=10)

    assert summary.imported == 1
    assert fake_client.seen_uids == ["909"]
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_resume_mail_import_service.py::test_sync_once_imports_recent_messages_and_marks_seen -q
```

Expected: FAIL because `ResumeMailImportService.__init__` has no `imap_client` argument and `sync_once` does not exist.

- [ ] **Step 3: Add IMAP client and sync method**

Extend `backend/app/services/resume_mail_import_service.py`:

```python
class ImapResumeMailClient:
    def __init__(self, host: str, port: int, username: str, password: str, use_ssl: bool = True):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.use_ssl = use_ssl
        self._conn = None

    def __enter__(self):
        cls = imaplib.IMAP4_SSL if self.use_ssl else imaplib.IMAP4
        self._conn = cls(self.host, self.port)
        self._conn.login(self.username, self.password)
        self._conn.select("INBOX")
        return self

    def __exit__(self, exc_type, exc, tb):
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn.logout()

    def fetch_recent_messages(self, limit: int) -> List[ParsedMailMessage]:
        status, data = self._conn.uid("search", None, "ALL")
        if status != "OK" or not data or not data[0]:
            return []
        uids = data[0].decode("ascii", errors="ignore").split()
        recent_uids = list(reversed(uids[-limit:]))
        messages: List[ParsedMailMessage] = []
        for uid in recent_uids:
            status, fetched = self._conn.uid("fetch", uid, "(RFC822)")
            if status != "OK":
                continue
            for item in fetched:
                if isinstance(item, tuple) and item[1]:
                    messages.append(parse_mail_message(item[1], uid=uid))
                    break
        return messages

    def mark_seen(self, uid: str) -> None:
        self._conn.uid("store", uid, "+FLAGS", "(\\Seen)")
```

Change the service constructor and add `sync_once`:

```python
    def __init__(self, upload_root: str = "uploads/resumes", imap_client=None):
        self.upload_root = upload_root
        self.imap_client = imap_client

    def sync_once(self, db: Session, limit: int = 20) -> ImportSummary:
        config = db.query(SystemConfig).first()
        if not config or not config.resume_mail_import_enabled:
            return ImportSummary()
        client = self.imap_client
        close_client = False
        if client is None:
            client = ImapResumeMailClient(
                host=config.resume_mail_imap_host,
                port=config.resume_mail_imap_port or 993,
                username=config.resume_mail_username,
                password=config.resume_mail_password,
                use_ssl=config.resume_mail_use_ssl,
            )
            client = client.__enter__()
            close_client = True
        try:
            total = ImportSummary()
            for parsed in client.fetch_recent_messages(limit):
                result = self.import_parsed_message(db, parsed)
                total.scanned_messages += result.scanned_messages
                total.imported += result.imported
                total.skipped += result.skipped
                total.failed += result.failed
                if result.imported and config.resume_mail_mark_success_read:
                    client.mark_seen(parsed.uid)
            config.resume_mail_last_sync_at = datetime.utcnow()
            db.commit()
            return total
        finally:
            if close_client:
                client.__exit__(None, None, None)
```

- [ ] **Step 4: Add scheduler service**

Create `backend/app/services/resume_mail_import_scheduler.py`:

```python
from __future__ import annotations

import threading
from typing import Optional

from app.config.database import SessionLocal
from app.models.models import SystemConfig
from app.services.resume_mail_import_service import ResumeMailImportService


class ResumeMailImportScheduler:
    def __init__(self):
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name="resume-mail-import-scheduler", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            interval = 120
            db = SessionLocal()
            try:
                config = db.query(SystemConfig).first()
                if config:
                    interval = max(config.resume_mail_poll_interval_seconds or 120, 30)
                    if config.resume_mail_import_enabled:
                        ResumeMailImportService().sync_once(db)
            except Exception as exc:
                print(f"[ResumeMailImportScheduler] sync failed: {exc}")
            finally:
                db.close()
            self._stop_event.wait(interval)


resume_mail_import_scheduler = ResumeMailImportScheduler()
```

- [ ] **Step 5: Run sync tests**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_resume_mail_import_service.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit IMAP sync and scheduler**

Run:

```powershell
git add backend/app/services/resume_mail_import_service.py backend/app/services/resume_mail_import_scheduler.py backend/tests/test_resume_mail_import_service.py
git commit -m "feat: sync resumes from IMAP"
```

## Task 5: Admin APIs For Settings, Manual Sync, And Logs

**Files:**
- Modify: `backend/app/schemas/settings.py`
- Modify: `backend/app/routes/settings.py`
- Create: `backend/app/routes/resume_mail_imports.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_resume_mail_import_routes.py`

- [ ] **Step 1: Write failing route tests**

Create `backend/tests/test_resume_mail_import_routes.py`:

```python
from app.core.security import create_access_token
from app.models.models import Position, PositionStatus, ResumeMailImport, ResumeMailImportStatus, SystemConfig


def admin_headers(test_admin):
    token = create_access_token({"sub": test_admin.email})
    return {"Authorization": f"Bearer {token}"}


def test_get_resume_mail_import_settings_masks_password(client, db, test_admin, test_position):
    db.add(
        SystemConfig(
            resume_mail_import_enabled=True,
            resume_mail_imap_host="imap.163.com",
            resume_mail_imap_port=993,
            resume_mail_username="recruiting@example.com",
            resume_mail_password="secret-code",
            resume_mail_default_position_id=test_position.id,
        )
    )
    db.commit()

    response = client.get("/api/settings/resume-mail-import", headers=admin_headers(test_admin))

    assert response.status_code == 200
    data = response.json()
    assert data["imap_host"] == "imap.163.com"
    assert data["password_set"] is True
    assert "secret-code" not in str(data)


def test_update_resume_mail_import_settings_preserves_existing_password(client, db, test_admin, test_position):
    db.add(SystemConfig(resume_mail_password="old-secret"))
    db.commit()

    response = client.put(
        "/api/settings/resume-mail-import",
        json={
            "enabled": True,
            "imap_host": "imap.163.com",
            "imap_port": 993,
            "username": "recruiting@example.com",
            "use_ssl": True,
            "default_position_id": str(test_position.id),
            "poll_interval_seconds": 120,
            "mark_success_read": True,
        },
        headers=admin_headers(test_admin),
    )

    assert response.status_code == 200
    config = db.query(SystemConfig).first()
    assert config.resume_mail_password == "old-secret"
    assert config.resume_mail_import_enabled is True


def test_import_logs_endpoint_returns_recent_logs(client, db, test_admin, test_position):
    db.add(
        ResumeMailImport(
            mailbox="recruiting@example.com",
            message_uid="900",
            message_id="<boss-900>",
            attachment_filename="resume.pdf",
            attachment_sha256="f" * 64,
            position_id=test_position.id,
            status=ResumeMailImportStatus.IMPORTED.value,
            reason="imported",
        )
    )
    db.commit()

    response = client.get("/api/resume-mail-import/logs", headers=admin_headers(test_admin))

    assert response.status_code == 200
    assert response.json()[0]["status"] == "imported"
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_resume_mail_import_routes.py -q
```

Expected: FAIL because endpoints do not exist.

- [ ] **Step 3: Add schemas**

Append to `backend/app/schemas/settings.py`:

```python
from uuid import UUID
from datetime import datetime


class ResumeMailImportConfigResponse(BaseModel):
    enabled: bool = False
    imap_host: Optional[str] = None
    imap_port: int = 993
    username: Optional[str] = None
    password_set: bool = False
    use_ssl: bool = True
    default_position_id: Optional[UUID] = None
    poll_interval_seconds: int = 120
    mark_success_read: bool = True
    last_sync_at: Optional[datetime] = None


class ResumeMailImportConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    use_ssl: Optional[bool] = None
    default_position_id: Optional[UUID] = None
    poll_interval_seconds: Optional[int] = None
    mark_success_read: Optional[bool] = None
```

- [ ] **Step 4: Add settings endpoints**

Modify `backend/app/routes/settings.py` imports:

```python
from app.schemas.settings import (
    SystemModelConfigResponse, SystemModelConfigUpdate,
    MailConfigResponse, MailConfigUpdate,
    SystemConfigResponse, SystemConfigUpdate,
    PromptConfigsResponse, PromptConfigItem, PromptConfigUpdate,
    ResumeMailImportConfigResponse, ResumeMailImportConfigUpdate
)
from app.services.resume_mail_import_service import ImapResumeMailClient, ResumeMailImportService
```

Append endpoints before prompt routes:

```python
def _resume_mail_response(config: SystemConfig) -> ResumeMailImportConfigResponse:
    return ResumeMailImportConfigResponse(
        enabled=config.resume_mail_import_enabled or False,
        imap_host=config.resume_mail_imap_host,
        imap_port=config.resume_mail_imap_port or 993,
        username=config.resume_mail_username,
        password_set=bool(config.resume_mail_password),
        use_ssl=True if config.resume_mail_use_ssl is None else config.resume_mail_use_ssl,
        default_position_id=config.resume_mail_default_position_id,
        poll_interval_seconds=config.resume_mail_poll_interval_seconds or 120,
        mark_success_read=True if config.resume_mail_mark_success_read is None else config.resume_mail_mark_success_read,
        last_sync_at=config.resume_mail_last_sync_at,
    )


@router.get("/resume-mail-import", response_model=ResumeMailImportConfigResponse)
def get_resume_mail_import_settings(
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    config = _get_or_create_config(db)
    if not config.resume_mail_default_position_id:
        position = ResumeMailImportService().ensure_default_position(db)
        config.resume_mail_default_position_id = position.id
        db.commit()
        db.refresh(config)
    return _resume_mail_response(config)


@router.put("/resume-mail-import", response_model=ResumeMailImportConfigResponse)
def update_resume_mail_import_settings(
    payload: ResumeMailImportConfigUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    config = _get_or_create_config(db)
    data = payload.dict(exclude_unset=True)
    if "enabled" in data:
        config.resume_mail_import_enabled = data["enabled"]
    if "imap_host" in data:
        config.resume_mail_imap_host = (data["imap_host"] or "").strip() or None
    if "imap_port" in data and data["imap_port"]:
        config.resume_mail_imap_port = data["imap_port"]
    if "username" in data:
        config.resume_mail_username = (data["username"] or "").strip() or None
    if "password" in data:
        password = (data["password"] or "").strip()
        if password:
            config.resume_mail_password = password
    if "use_ssl" in data:
        config.resume_mail_use_ssl = data["use_ssl"]
    if "default_position_id" in data:
        config.resume_mail_default_position_id = data["default_position_id"]
    if "poll_interval_seconds" in data and data["poll_interval_seconds"]:
        config.resume_mail_poll_interval_seconds = max(data["poll_interval_seconds"], 30)
    if "mark_success_read" in data:
        config.resume_mail_mark_success_read = data["mark_success_read"]

    if not config.resume_mail_default_position_id:
        position = ResumeMailImportService().ensure_default_position(db)
        config.resume_mail_default_position_id = position.id

    db.commit()
    db.refresh(config)
    return _resume_mail_response(config)


@router.post("/resume-mail-import/test")
def test_resume_mail_import_settings(
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    config = _get_or_create_config(db)
    if not config.resume_mail_imap_host or not config.resume_mail_username or not config.resume_mail_password:
        raise HTTPException(status_code=400, detail="请先填写 IMAP 地址、账号和授权码")
    try:
        with ImapResumeMailClient(
            config.resume_mail_imap_host,
            config.resume_mail_imap_port or 993,
            config.resume_mail_username,
            config.resume_mail_password,
            config.resume_mail_use_ssl,
        ):
            return {"message": "邮箱连接成功"}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"邮箱连接失败: {str(exc)[:200]}")
```

- [ ] **Step 5: Add manual sync and logs route**

Create `backend/app/routes/resume_mail_imports.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.core.security import check_roles
from app.models.models import ResumeMailImport, UserRole
from app.services.resume_mail_import_service import ResumeMailImportService


router = APIRouter(prefix="/resume-mail-import", tags=["resume-mail-import"])


@router.post("/sync")
def sync_resume_mail_import(
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    summary = ResumeMailImportService().sync_once(db)
    return {
        "imported": summary.imported,
        "skipped": summary.skipped,
        "failed": summary.failed,
        "scanned_messages": summary.scanned_messages,
    }


@router.get("/logs")
def list_resume_mail_import_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    logs = (
        db.query(ResumeMailImport)
        .order_by(ResumeMailImport.created_at.desc())
        .limit(min(limit, 200))
        .all()
    )
    return [
        {
            "id": str(log.id),
            "message_uid": log.message_uid,
            "message_id": log.message_id,
            "mailbox": log.mailbox,
            "sender": log.sender,
            "subject": log.subject,
            "attachment_filename": log.attachment_filename,
            "attachment_sha256": log.attachment_sha256,
            "position_id": str(log.position_id) if log.position_id else None,
            "resume_id": str(log.resume_id) if log.resume_id else None,
            "status": log.status,
            "reason": log.reason,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]
```

- [ ] **Step 6: Register route and scheduler lifecycle**

Modify `backend/app/main.py` imports:

```python
from app.routes import auth, positions, question_banks, resumes, interviews, dashboard, coding_tests, settings, offers, offer_templates, public_review, workflows, resume_mail_imports
from app.services.resume_mail_import_scheduler import resume_mail_import_scheduler
```

Add route include:

```python
app.include_router(resume_mail_imports.router, prefix="/api")
```

Add lifecycle hooks:

```python
@app.on_event("startup")
def start_resume_mail_import_scheduler():
    resume_mail_import_scheduler.start()


@app.on_event("shutdown")
def stop_resume_mail_import_scheduler():
    resume_mail_import_scheduler.stop()
```

Modify `backend/tests/conftest.py` route imports and includes:

```python
from app.routes import auth, positions, resumes, interviews, coding_tests, settings, resume_mail_imports
```

```python
test_app.include_router(resume_mail_imports.router, prefix="/api")
```

- [ ] **Step 7: Run route tests**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_resume_mail_import_routes.py -q
```

Expected: PASS.

- [ ] **Step 8: Commit API work**

Run:

```powershell
git add backend/app/schemas/settings.py backend/app/routes/settings.py backend/app/routes/resume_mail_imports.py backend/app/main.py backend/tests/conftest.py backend/tests/test_resume_mail_import_routes.py
git commit -m "feat: add resume mail import APIs"
```

## Task 6: Frontend Settings Tab

**Files:**
- Modify: `frontend/src/pages/Settings/System.tsx`

- [ ] **Step 1: Add frontend types and state**

Modify imports in `frontend/src/pages/Settings/System.tsx`:

```tsx
import { Button, Card, Form, Input, Space, Typography, message, Result, Switch, InputNumber, Divider, Tabs, Alert, Tag, Tooltip, Select, Table } from 'antd';
```

Add types near existing settings types:

```tsx
type ResumeMailImportSettings = {
  enabled: boolean;
  imap_host?: string | null;
  imap_port: number;
  username?: string | null;
  password_set: boolean;
  use_ssl: boolean;
  default_position_id?: string | null;
  poll_interval_seconds: number;
  mark_success_read: boolean;
  last_sync_at?: string | null;
};

type ResumeMailImportLog = {
  id: string;
  subject?: string | null;
  attachment_filename?: string | null;
  status: string;
  reason?: string | null;
  created_at?: string | null;
};

type PositionOption = {
  id: string;
  title: string;
};
```

Add state and form objects inside the component:

```tsx
const [resumeMailForm] = Form.useForm();
const [resumeMailMeta, setResumeMailMeta] = useState<ResumeMailImportSettings | null>(null);
const [resumeMailLoading, setResumeMailLoading] = useState(false);
const [resumeMailSaving, setResumeMailSaving] = useState(false);
const [resumeMailTesting, setResumeMailTesting] = useState(false);
const [resumeMailSyncing, setResumeMailSyncing] = useState(false);
const [resumeMailLogs, setResumeMailLogs] = useState<ResumeMailImportLog[]>([]);
const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
```

- [ ] **Step 2: Add API functions**

Add these functions near `fetchMailSettings`:

```tsx
const fetchResumeMailSettings = async () => {
  setResumeMailLoading(true);
  try {
    const res = (await request.get('/settings/resume-mail-import')) as ResumeMailImportSettings;
    setResumeMailMeta(res);
    resumeMailForm.setFieldsValue({
      enabled: res.enabled,
      imap_host: res.imap_host || 'imap.163.com',
      imap_port: res.imap_port || 993,
      username: res.username || undefined,
      password: '',
      use_ssl: res.use_ssl,
      default_position_id: res.default_position_id || undefined,
      poll_interval_seconds: res.poll_interval_seconds || 120,
      mark_success_read: res.mark_success_read,
    });
  } catch (e) {
    message.error('获取简历邮箱导入配置失败');
  } finally {
    setResumeMailLoading(false);
  }
};

const fetchResumeMailLogs = async () => {
  try {
    const logs = (await request.get('/resume-mail-import/logs?limit=20')) as ResumeMailImportLog[];
    setResumeMailLogs(logs);
  } catch (e) {
    setResumeMailLogs([]);
  }
};

const fetchPositionOptions = async () => {
  try {
    const positions = (await request.get('/positions')) as PositionOption[];
    setPositionOptions(positions);
  } catch (e) {
    setPositionOptions([]);
  }
};

const saveResumeMailSettings = async () => {
  try {
    const values = await resumeMailForm.validateFields();
    const payload: any = {
      enabled: values.enabled || false,
      imap_host: values.imap_host || null,
      imap_port: values.imap_port || 993,
      username: values.username || null,
      use_ssl: values.use_ssl !== false,
      default_position_id: values.default_position_id || null,
      poll_interval_seconds: values.poll_interval_seconds || 120,
      mark_success_read: values.mark_success_read !== false,
    };
    if (values.password && values.password.trim()) {
      payload.password = values.password.trim();
    }
    setResumeMailSaving(true);
    await request.put('/settings/resume-mail-import', payload);
    resumeMailForm.setFieldsValue({ password: '' });
    await fetchResumeMailSettings();
    message.success('简历邮箱导入配置已保存');
  } catch (e) {
    message.error((e as any)?.response?.data?.detail || '保存简历邮箱导入配置失败');
  } finally {
    setResumeMailSaving(false);
  }
};

const testResumeMailConnection = async () => {
  setResumeMailTesting(true);
  try {
    await request.post('/settings/resume-mail-import/test');
    message.success('邮箱连接成功');
  } catch (e) {
    message.error((e as any)?.response?.data?.detail || '邮箱连接失败');
  } finally {
    setResumeMailTesting(false);
  }
};

const syncResumeMailNow = async () => {
  setResumeMailSyncing(true);
  try {
    const res = (await request.post('/resume-mail-import/sync')) as any;
    message.success(`同步完成：导入 ${res.imported}，跳过 ${res.skipped}，失败 ${res.failed}`);
    await fetchResumeMailLogs();
  } catch (e) {
    message.error((e as any)?.response?.data?.detail || '手动同步失败');
  } finally {
    setResumeMailSyncing(false);
  }
};
```

Add these calls to the admin `useEffect`:

```tsx
fetchResumeMailSettings();
fetchResumeMailLogs();
fetchPositionOptions();
```

- [ ] **Step 3: Add the tab content**

Add a `Tabs` item for the new tab in the existing settings tabs array:

```tsx
{
  key: 'resume-mail-import',
  label: '简历邮箱导入',
  children: (
    <Card loading={resumeMailLoading}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Alert
          type="info"
          showIcon
          message="自动从 BOSS 直聘转发邮件中提取简历，重复附件会自动跳过。"
        />
        <Form form={resumeMailForm} layout="vertical">
          <Form.Item name="enabled" label="启用自动导入" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="imap_host" label="IMAP 服务器" rules={[{ required: true, message: '请输入 IMAP 服务器' }]}>
            <Input placeholder="imap.163.com" />
          </Form.Item>
          <Form.Item name="imap_port" label="IMAP 端口" rules={[{ required: true, message: '请输入端口' }]}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="use_ssl" label="SSL 连接" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="username" label="邮箱账号" rules={[{ required: true, message: '请输入邮箱账号' }]}>
            <Input placeholder="recruiting@example.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label={resumeMailMeta?.password_set ? '授权码（已保存，留空不修改）' : '授权码'}
            rules={resumeMailMeta?.password_set ? [] : [{ required: true, message: '请输入邮箱授权码' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="default_position_id" label="默认导入岗位" rules={[{ required: true, message: '请选择默认岗位' }]}>
            <Select
              options={positionOptions.map((item) => ({ value: item.id, label: item.title }))}
              placeholder="AI 产品经理"
            />
          </Form.Item>
          <Form.Item name="poll_interval_seconds" label="同步间隔（秒）">
            <InputNumber min={30} max={3600} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="mark_success_read" label="成功导入后标记已读" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Space>
            <Button type="primary" loading={resumeMailSaving} onClick={saveResumeMailSettings}>保存配置</Button>
            <Button loading={resumeMailTesting} onClick={testResumeMailConnection}>测试连接</Button>
            <Button loading={resumeMailSyncing} onClick={syncResumeMailNow}>立即同步</Button>
          </Space>
        </Form>
        <Table
          rowKey="id"
          size="small"
          dataSource={resumeMailLogs}
          pagination={false}
          columns={[
            { title: '邮件主题', dataIndex: 'subject', ellipsis: true },
            { title: '附件', dataIndex: 'attachment_filename', width: 180, ellipsis: true },
            { title: '状态', dataIndex: 'status', width: 180, render: (value) => <Tag>{value}</Tag> },
            { title: '原因', dataIndex: 'reason', ellipsis: true },
            { title: '时间', dataIndex: 'created_at', width: 180 },
          ]}
        />
      </Space>
    </Card>
  ),
}
```

- [ ] **Step 4: Build frontend**

Run:

```powershell
cd frontend
npm run build
```

Expected: TypeScript and Vite build PASS.

- [ ] **Step 5: Commit frontend work**

Run:

```powershell
git add frontend/src/pages/Settings/System.tsx
git commit -m "feat: configure resume mail imports"
```

## Task 7: Full Verification And Local Enablement

**Files:**
- No planned source edits unless verification reveals a defect.

- [ ] **Step 1: Run backend tests**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_resume_mail_import_models.py tests/test_resume_mail_import_parser.py tests/test_resume_mail_import_service.py tests/test_resume_mail_import_routes.py -q
```

Expected: all new backend tests PASS.

- [ ] **Step 2: Run Alembic upgrade**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Expected: migration completes with no error and the database has `resume_mail_imports`.

- [ ] **Step 3: Run frontend build**

Run:

```powershell
cd frontend
npm run build
```

Expected: build PASS.

- [ ] **Step 4: Restart local backend and frontend if needed**

Run backend:

```powershell
cd backend
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5433/ai_interview'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Run frontend:

```powershell
cd frontend
npm run dev -- --host 0.0.0.0 --port 5174
```

Expected: backend listens on `0.0.0.0:8000`; frontend listens on `0.0.0.0:5174`.

- [ ] **Step 5: Configure mailbox through UI**

Open the settings page, use the “简历邮箱导入” tab, and save:

```text
IMAP server: imap.163.com
IMAP port: 993
SSL: enabled
Mailbox: recruiting@example.com
Default position: AI 产品经理
Sync interval: 120
Mark success read: enabled
```

Enter the current 163 authorization code in the password field. Do not write the authorization code into a source file, shell history command, or committed document.

- [ ] **Step 6: Test connection and manual sync**

Use the UI buttons:

```text
测试连接
立即同步
```

Expected: connection succeeds; manual sync returns a summary; recent logs show imported or skipped BOSS messages.

- [ ] **Step 7: Confirm resume evaluation queue**

Check the resume list and queue endpoints:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/api/resumes/queue/status
```

Expected: newly imported resumes appear in the resume list and queue status reflects active, queued, completed, or failed parse tasks.

- [ ] **Step 8: Final status check**

Run:

```powershell
git status --short
```

Expected: only intentional feature files and the pre-existing deployment changes are present. If verification required source fixes, stage exactly those fixed files and commit them with `git commit -m "fix: verify resume mail import flow"`.
