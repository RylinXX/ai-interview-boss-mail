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
        self._thread = threading.Thread(
            target=self._run,
            name="resume-mail-import-scheduler",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            interval = 600
            db = SessionLocal()
            try:
                config = db.query(SystemConfig).first()
                if config:
                    interval = max(config.resume_mail_poll_interval_seconds or 600, 180)
                    if config.resume_mail_import_enabled:
                        ResumeMailImportService().sync_once(db)
            except Exception as exc:
                print(f"[ResumeMailImportScheduler] sync failed: {exc}")
            finally:
                db.close()
            self._stop_event.wait(interval)


resume_mail_import_scheduler = ResumeMailImportScheduler()
