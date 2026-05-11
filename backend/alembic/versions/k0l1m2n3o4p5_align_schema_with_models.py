"""align schema with current models

Revision ID: k0l1m2n3o4p5
Revises: j9k0l1m2n3o4
Create Date: 2026-05-11

"""
from alembic import op


revision = 'k0l1m2n3o4p5'
down_revision = 'j9k0l1m2n3o4'
branch_labels = None
depends_on = None


def upgrade():
    enum_values = {
        'positionstatus': ['PUBLISHED'],
        'resumestatus': [
            'PENDING_DEPT_REVIEW',
            'PENDING_HR_DECISION',
            'AUTO_REJECTED_PENDING_REVIEW',
            'INTERVIEW_PASSED',
            'INTERVIEW_FAILED',
            'OFFER_PENDING',
            'OFFER_ACCEPTED',
            'OFFER_REJECTED',
            'ONBOARDING',
            'REJECTED',
            'WAITLIST',
        ],
        'interviewstatus': ['scheduled', 'completed', 'cancelled'],
        'interviewresult': ['pending', 'passed', 'rejected', 'waitlist', 'hired', 'next_round'],
    }
    for enum_name, values in enum_values.items():
        for value in values:
            op.execute(f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS '{value}'")

    op.execute("ALTER TABLE resumes ADD COLUMN IF NOT EXISTS stage VARCHAR DEFAULT 'new'")
    op.execute("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS round INTEGER DEFAULT 1")
    op.execute("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS interviewer_id UUID REFERENCES users(id)")
    op.execute("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS panel_members JSON")
    op.execute("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS audio_records JSON")
    op.execute("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS transcripts JSON")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_panels (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            interview_id UUID REFERENCES interviews(id),
            interviewer_id UUID REFERENCES users(id),
            scores JSON,
            comments JSON,
            audio_records JSON,
            transcripts JSON,
            total_score INTEGER,
            is_submitted BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def downgrade():
    op.execute("DROP TABLE IF EXISTS interview_panels")
    op.execute("ALTER TABLE interviews DROP COLUMN IF EXISTS transcripts")
    op.execute("ALTER TABLE interviews DROP COLUMN IF EXISTS audio_records")
    op.execute("ALTER TABLE interviews DROP COLUMN IF EXISTS panel_members")
    op.execute("ALTER TABLE interviews DROP COLUMN IF EXISTS started_at")
    op.execute("ALTER TABLE interviews DROP COLUMN IF EXISTS interviewer_id")
    op.execute("ALTER TABLE interviews DROP COLUMN IF EXISTS round")
    op.execute("ALTER TABLE resumes DROP COLUMN IF EXISTS stage")
