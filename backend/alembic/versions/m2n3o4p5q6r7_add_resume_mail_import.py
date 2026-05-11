"""add resume mail import schema

Revision ID: m2n3o4p5q6r7
Revises: l1m2n3o4p5q6
Create Date: 2026-05-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m2n3o4p5q6r7"
down_revision: Union[str, None] = "l1m2n3o4p5q6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("resumes") as batch_op:
        batch_op.add_column(sa.Column("source", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("source_message_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("source_attachment_hash", sa.String(length=64), nullable=True))

    op.create_index("ix_resumes_source", "resumes", ["source"])
    op.create_index("ix_resumes_source_message_id", "resumes", ["source_message_id"])
    op.create_index("ix_resumes_source_attachment_hash", "resumes", ["source_attachment_hash"])

    with op.batch_alter_table("system_configs") as batch_op:
        batch_op.add_column(sa.Column("resume_mail_import_enabled", sa.Boolean(), server_default=sa.false(), nullable=True))
        batch_op.add_column(sa.Column("resume_mail_imap_host", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("resume_mail_imap_port", sa.Integer(), server_default="993", nullable=True))
        batch_op.add_column(sa.Column("resume_mail_username", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("resume_mail_password", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("resume_mail_use_ssl", sa.Boolean(), server_default=sa.true(), nullable=True))
        batch_op.add_column(sa.Column("resume_mail_default_position_id", sa.UUID(), nullable=True))
        batch_op.add_column(sa.Column("resume_mail_poll_interval_seconds", sa.Integer(), server_default="120", nullable=True))
        batch_op.add_column(sa.Column("resume_mail_mark_success_read", sa.Boolean(), server_default=sa.true(), nullable=True))
        batch_op.add_column(sa.Column("resume_mail_last_sync_at", sa.DateTime(), nullable=True))
        batch_op.create_foreign_key(
            "fk_system_configs_resume_mail_default_position_id_positions",
            "positions",
            ["resume_mail_default_position_id"],
            ["id"],
        )

    op.create_table(
        "resume_mail_imports",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("message_uid", sa.String(), nullable=False),
        sa.Column("message_id", sa.String(), nullable=True),
        sa.Column("mailbox", sa.String(), nullable=False),
        sa.Column("sender", sa.String(), nullable=True),
        sa.Column("subject", sa.String(), nullable=True),
        sa.Column("received_at", sa.DateTime(), nullable=True),
        sa.Column("attachment_filename", sa.String(), nullable=True),
        sa.Column("attachment_sha256", sa.String(length=64), nullable=False),
        sa.Column("position_id", sa.UUID(), nullable=True),
        sa.Column("resume_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["position_id"], ["positions.id"]),
        sa.ForeignKeyConstraint(["resume_id"], ["resumes.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("mailbox", "message_uid", "attachment_sha256", name="uq_resume_mail_import_message_attachment"),
        sa.UniqueConstraint("attachment_sha256", name="uq_resume_mail_import_attachment_hash"),
    )
    op.create_index("ix_resume_mail_imports_message_uid", "resume_mail_imports", ["message_uid"])
    op.create_index("ix_resume_mail_imports_message_id", "resume_mail_imports", ["message_id"])
    op.create_index("ix_resume_mail_imports_mailbox", "resume_mail_imports", ["mailbox"])


def downgrade() -> None:
    op.drop_index("ix_resume_mail_imports_mailbox", table_name="resume_mail_imports")
    op.drop_index("ix_resume_mail_imports_message_id", table_name="resume_mail_imports")
    op.drop_index("ix_resume_mail_imports_message_uid", table_name="resume_mail_imports")
    op.drop_table("resume_mail_imports")

    with op.batch_alter_table("system_configs") as batch_op:
        batch_op.drop_constraint("fk_system_configs_resume_mail_default_position_id_positions", type_="foreignkey")
        batch_op.drop_column("resume_mail_last_sync_at")
        batch_op.drop_column("resume_mail_mark_success_read")
        batch_op.drop_column("resume_mail_poll_interval_seconds")
        batch_op.drop_column("resume_mail_default_position_id")
        batch_op.drop_column("resume_mail_use_ssl")
        batch_op.drop_column("resume_mail_password")
        batch_op.drop_column("resume_mail_username")
        batch_op.drop_column("resume_mail_imap_port")
        batch_op.drop_column("resume_mail_imap_host")
        batch_op.drop_column("resume_mail_import_enabled")

    op.drop_index("ix_resumes_source_attachment_hash", table_name="resumes")
    op.drop_index("ix_resumes_source_message_id", table_name="resumes")
    op.drop_index("ix_resumes_source", table_name="resumes")
    with op.batch_alter_table("resumes") as batch_op:
        batch_op.drop_column("source_attachment_hash")
        batch_op.drop_column("source_message_id")
        batch_op.drop_column("source")
