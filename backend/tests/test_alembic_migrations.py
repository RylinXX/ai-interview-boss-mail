import subprocess
import sys
import os
from pathlib import Path


def test_alembic_upgrade_head_sql_generates_successfully():
    backend_dir = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env.pop("APP_ENV", None)
    env["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5433/ai_interview"

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head", "--sql"],
        cwd=backend_dir,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )

    assert result.returncode == 0, result.stderr
    assert "p5q6r7s8t9u0" in result.stdout
