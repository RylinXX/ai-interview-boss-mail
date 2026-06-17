"""add solution agent runs

Revision ID: p5q6r7s8t9u0
Revises: o4p5q6r7s8t9
Create Date: 2026-06-17

"""
from alembic import context, op
import sqlalchemy as sa


revision = "p5q6r7s8t9u0"
down_revision = "o4p5q6r7s8t9"
branch_labels = None
depends_on = None


def _create_solution_agent_conversations():
    op.create_table(
        "solution_agent_conversations",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("last_requirement", sa.Text(), nullable=True),
        sa.Column("message_count", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("last_active_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_solution_agent_conversations_created_by", "solution_agent_conversations", ["created_by"])


def _create_solution_agent_runs():
    op.create_table(
        "solution_agent_runs",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("conversation_id", sa.UUID(), sa.ForeignKey("solution_agent_conversations.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("requirement", sa.Text(), nullable=True),
        sa.Column("request_payload", sa.JSON(), nullable=True),
        sa.Column("response_payload", sa.JSON(), nullable=True),
        sa.Column("retrieval_log", sa.JSON(), nullable=True),
        sa.Column("evidence_coverage", sa.JSON(), nullable=True),
        sa.Column("model_used", sa.Boolean(), nullable=True),
        sa.Column("fallback_used", sa.Boolean(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_solution_agent_runs_conversation_id", "solution_agent_runs", ["conversation_id"])
    op.create_index("ix_solution_agent_runs_status", "solution_agent_runs", ["status"])
    op.create_index("ix_solution_agent_runs_created_by", "solution_agent_runs", ["created_by"])


def _create_solution_agent_messages():
    op.create_table(
        "solution_agent_messages",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("conversation_id", sa.UUID(), sa.ForeignKey("solution_agent_conversations.id"), nullable=False),
        sa.Column("run_id", sa.UUID(), sa.ForeignKey("solution_agent_runs.id"), nullable=True),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("sources", sa.JSON(), nullable=True),
        sa.Column("agent_trace", sa.JSON(), nullable=True),
        sa.Column("retrieval_log", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_solution_agent_messages_conversation_id", "solution_agent_messages", ["conversation_id"])
    op.create_index("ix_solution_agent_messages_run_id", "solution_agent_messages", ["run_id"])


def _create_solution_agent_steps():
    op.create_table(
        "solution_agent_steps",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("run_id", sa.UUID(), sa.ForeignKey("solution_agent_runs.id"), nullable=False),
        sa.Column("step_index", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("input", sa.JSON(), nullable=True),
        sa.Column("output", sa.JSON(), nullable=True),
        sa.Column("elapsed_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_solution_agent_steps_run_id", "solution_agent_steps", ["run_id"])


def upgrade():
    if context.is_offline_mode():
        _create_solution_agent_conversations()
        _create_solution_agent_runs()
        _create_solution_agent_messages()
        _create_solution_agent_steps()
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("solution_agent_conversations"):
        _create_solution_agent_conversations()

    if not inspector.has_table("solution_agent_runs"):
        _create_solution_agent_runs()

    if not inspector.has_table("solution_agent_messages"):
        _create_solution_agent_messages()

    if not inspector.has_table("solution_agent_steps"):
        _create_solution_agent_steps()


def downgrade():
    for table_name, index_name in [
        ("solution_agent_steps", "ix_solution_agent_steps_run_id"),
        ("solution_agent_messages", "ix_solution_agent_messages_run_id"),
        ("solution_agent_messages", "ix_solution_agent_messages_conversation_id"),
        ("solution_agent_runs", "ix_solution_agent_runs_created_by"),
        ("solution_agent_runs", "ix_solution_agent_runs_status"),
        ("solution_agent_runs", "ix_solution_agent_runs_conversation_id"),
        ("solution_agent_conversations", "ix_solution_agent_conversations_created_by"),
    ]:
        try:
            op.drop_index(index_name, table_name=table_name)
        except Exception:
            pass

    op.drop_table("solution_agent_steps")
    op.drop_table("solution_agent_messages")
    op.drop_table("solution_agent_runs")
    op.drop_table("solution_agent_conversations")
