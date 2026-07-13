from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.core.security import check_roles
from app.models.models import ResumeMailImport, UserRole
from app.services.resume_mail_import_service import ResumeMailImportService


router = APIRouter(prefix="/resume-mail-import", tags=["resume-mail-import"])


@router.post("/sync")
def sync_resume_mail_import(
    limit: int = 100,
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN, UserRole.HR])),
):
    # A mailbox sync is intentionally bounded so a manual action cannot hold a
    # web worker for an unbounded amount of time. Larger backfills should be
    # processed by the scheduled importer in multiple batches.
    safe_limit = min(max(int(limit or 100), 1), 200)
    try:
        summary = ResumeMailImportService().sync_once(db, limit=safe_limit, require_enabled=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "imported": summary.imported,
        "skipped": summary.skipped,
        "failed": summary.failed,
        "scanned_messages": summary.scanned_messages,
        "limit": safe_limit,
    }


@router.get("/logs")
def list_resume_mail_import_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN, UserRole.HR])),
):
    logs = (
        db.query(ResumeMailImport)
        .order_by(ResumeMailImport.created_at.desc())
        .limit(min(max(limit, 1), 200))
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
            "received_at": log.received_at.isoformat() if log.received_at else None,
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
