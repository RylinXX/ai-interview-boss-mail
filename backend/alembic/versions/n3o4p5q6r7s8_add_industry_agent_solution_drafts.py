"""add industry agent solution drafts

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2026-05-15

"""
from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'n3o4p5q6r7s8'
down_revision = 'm2n3o4p5q6r7'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    status_enum = postgresql.ENUM(
        'PROCESSING',
        'COMPLETED',
        'FAILED',
        name='industryagentsolutiondraftstatus',
        create_type=False,
    )
    status_enum.create(bind, checkfirst=True)

    if context.is_offline_mode():
        op.create_table(
            'industry_agent_solution_drafts',
            sa.Column('id', sa.UUID(), primary_key=True),
            sa.Column('status', status_enum, nullable=False, server_default='PROCESSING'),
            sa.Column('stage', sa.String(), nullable=False, server_default='queued'),
            sa.Column('current_step', sa.String(), nullable=False, server_default='已创建生成任务'),
            sa.Column('progress', sa.Integer(), nullable=False, server_default='5'),
            sa.Column('request_payload', sa.JSON(), nullable=True),
            sa.Column('result', sa.JSON(), nullable=True),
            sa.Column('error', sa.Text(), nullable=True),
            sa.Column('created_by', sa.UUID(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_industry_agent_solution_drafts_status', 'industry_agent_solution_drafts', ['status'])
        op.create_index('ix_industry_agent_solution_drafts_created_by', 'industry_agent_solution_drafts', ['created_by'])
        return

    inspector = sa.inspect(bind)
    if inspector.has_table('industry_agent_solution_drafts'):
        existing_columns = {
            column['name']
            for column in inspector.get_columns('industry_agent_solution_drafts')
        }
        if 'stage' not in existing_columns:
            op.add_column(
                'industry_agent_solution_drafts',
                sa.Column('stage', sa.String(), nullable=False, server_default='queued'),
            )
        if 'current_step' not in existing_columns:
            op.add_column(
                'industry_agent_solution_drafts',
                sa.Column('current_step', sa.String(), nullable=False, server_default='已创建生成任务'),
            )
        if 'progress' not in existing_columns:
            op.add_column(
                'industry_agent_solution_drafts',
                sa.Column('progress', sa.Integer(), nullable=False, server_default='5'),
            )

        existing_indexes = {
            index['name']
            for index in inspector.get_indexes('industry_agent_solution_drafts')
        }
        if 'ix_industry_agent_solution_drafts_status' not in existing_indexes:
            op.create_index(
                'ix_industry_agent_solution_drafts_status',
                'industry_agent_solution_drafts',
                ['status'],
            )
        if 'ix_industry_agent_solution_drafts_created_by' not in existing_indexes:
            op.create_index(
                'ix_industry_agent_solution_drafts_created_by',
                'industry_agent_solution_drafts',
                ['created_by'],
            )
        return

    op.create_table(
        'industry_agent_solution_drafts',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('status', status_enum, nullable=False, server_default='PROCESSING'),
        sa.Column('stage', sa.String(), nullable=False, server_default='queued'),
        sa.Column('current_step', sa.String(), nullable=False, server_default='已创建生成任务'),
        sa.Column('progress', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('request_payload', sa.JSON(), nullable=True),
        sa.Column('result', sa.JSON(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_by', sa.UUID(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_industry_agent_solution_drafts_status', 'industry_agent_solution_drafts', ['status'])
    op.create_index('ix_industry_agent_solution_drafts_created_by', 'industry_agent_solution_drafts', ['created_by'])


def downgrade():
    op.drop_index('ix_industry_agent_solution_drafts_created_by', table_name='industry_agent_solution_drafts')
    op.drop_index('ix_industry_agent_solution_drafts_status', table_name='industry_agent_solution_drafts')
    op.drop_table('industry_agent_solution_drafts')
    sa.Enum(name='industryagentsolutiondraftstatus').drop(op.get_bind(), checkfirst=True)
