"""add workflow enum values used by ORM models

Revision ID: l1m2n3o4p5q6
Revises: k0l1m2n3o4p5
Create Date: 2026-05-11

"""
from alembic import op


revision = 'l1m2n3o4p5q6'
down_revision = 'k0l1m2n3o4p5'
branch_labels = None
depends_on = None


def upgrade():
    enum_values = {
        'workflowstatus': ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
        'workflowexecutionstatus': ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'],
        'nodetype': [
            'START',
            'END',
            'LLM',
            'CONDITION',
            'TOOL',
            'HTTP_REQUEST',
            'EMAIL',
            'DATABASE',
            'CODE',
            'VARIABLE',
            'LOOP',
            'PARALLEL',
            'HUMAN_INPUT',
        ],
    }
    for enum_name, values in enum_values.items():
        for value in values:
            op.execute(f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS '{value}'")


def downgrade():
    pass
