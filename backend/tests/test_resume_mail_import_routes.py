from datetime import datetime

from app.models.models import ResumeMailImport, ResumeMailImportStatus, SystemConfig
from app.routes import settings as settings_route
from app.services.resume_mail_import_service import ImportSummary, ResumeMailImportService


def test_resume_mail_import_settings_can_be_saved_without_exposing_password(
    client, admin_auth_headers, db, test_position
):
    response = client.put(
        "/api/settings/resume-mail-import",
        headers=admin_auth_headers,
        json={
            "enabled": True,
            "imap_host": "imap.163.com",
            "imap_port": 993,
            "username": "recruiting@example.com",
            "password": "secret-code",
            "use_ssl": True,
            "default_position_id": str(test_position.id),
            "poll_interval_seconds": 120,
            "mark_success_read": True,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is True
    assert data["imap_host"] == "imap.163.com"
    assert data["username"] == "recruiting@example.com"
    assert data["password_set"] is True
    assert "password" not in data

    config = db.query(SystemConfig).first()
    assert config.resume_mail_password == "secret-code"
    assert config.resume_mail_default_position_id == test_position.id


def test_resume_mail_import_connection_test_uses_saved_config(
    client, admin_auth_headers, db, monkeypatch
):
    db.add(
        SystemConfig(
            resume_mail_imap_host="imap.163.com",
            resume_mail_imap_port=993,
            resume_mail_username="recruiting@example.com",
            resume_mail_password="secret-code",
            resume_mail_use_ssl=True,
        )
    )
    db.commit()
    calls = []

    class FakeImapClient:
        def __init__(self, host, port, username, password, use_ssl):
            calls.append((host, port, username, password, use_ssl))

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return None

    monkeypatch.setattr(
        settings_route, "ImapResumeMailClient", FakeImapClient, raising=False
    )

    response = client.post(
        "/api/settings/resume-mail-import/test", headers=admin_auth_headers
    )

    assert response.status_code == 200
    assert calls == [("imap.163.com", 993, "recruiting@example.com", "secret-code", True)]


def test_manual_sync_returns_summary(client, admin_auth_headers, db, monkeypatch):
    def fake_sync_once(self, db_session, limit=20, *, require_enabled=True):
        assert db_session is db
        assert limit == 100
        assert require_enabled is False
        return ImportSummary(imported=2, skipped=1, failed=0, scanned_messages=3)

    monkeypatch.setattr(ResumeMailImportService, "sync_once", fake_sync_once)

    response = client.post("/api/resume-mail-import/sync", headers=admin_auth_headers)

    assert response.status_code == 200
    assert response.json() == {
        "imported": 2,
        "skipped": 1,
        "failed": 0,
        "scanned_messages": 3,
        "limit": 100,
    }


def test_manual_sync_accepts_safe_limit(client, admin_auth_headers, db, monkeypatch):
    calls = []

    def fake_sync_once(self, db_session, limit=20, *, require_enabled=True):
        calls.append(limit)
        return ImportSummary()

    monkeypatch.setattr(ResumeMailImportService, "sync_once", fake_sync_once)

    response = client.post(
        "/api/resume-mail-import/sync?limit=500",
        headers=admin_auth_headers,
    )

    assert response.status_code == 200
    assert calls == [200]


def test_resume_mail_import_logs_return_recent_items(
    client, admin_auth_headers, db, test_position
):
    older = ResumeMailImport(
        mailbox="recruiting@example.com",
        message_uid="101",
        message_id="<older>",
        sender="BOSS",
        subject="older",
        attachment_filename="older.pdf",
        attachment_sha256="a" * 64,
        position_id=test_position.id,
        status=ResumeMailImportStatus.IMPORTED.value,
        reason="imported",
        created_at=datetime(2026, 5, 11, 10, 0, 0),
    )
    newer = ResumeMailImport(
        mailbox="recruiting@example.com",
        message_uid="102",
        message_id="<newer>",
        sender="BOSS",
        subject="newer",
        attachment_filename="newer.pdf",
        attachment_sha256="b" * 64,
        position_id=test_position.id,
        status=ResumeMailImportStatus.SKIPPED_DUPLICATE_ATTACHMENT.value,
        reason="duplicate_attachment",
        created_at=datetime(2026, 5, 11, 11, 0, 0),
    )
    db.add_all([older, newer])
    db.commit()

    response = client.get("/api/resume-mail-import/logs", headers=admin_auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert [item["subject"] for item in data] == ["newer", "older"]
    assert data[0]["status"] == ResumeMailImportStatus.SKIPPED_DUPLICATE_ATTACHMENT.value
