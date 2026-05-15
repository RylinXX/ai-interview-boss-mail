"""add industry agent solution drafts

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2026-05-15

"""
from alembic import op
import sqlalchemy as sa


revision = 'n3o4p5q6r7s8'
down_revision = 'm2n3o4p5q6r7'
branch_labels = None
depends_on = None


def upgrade():
    status_enum = sa.Enum('PROCESSING', 'COMPLETED', 'FAILED', name='industryagentsolutiondraftstatus')
    status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'industry_agent_solution_drafts',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('status', status_enum, nullable=False, server_default='PROCESSING'),
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
