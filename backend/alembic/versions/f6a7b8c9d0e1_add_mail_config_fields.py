"""add mail config fields to system_configs

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-03-06

"""
from alembic import op
import sqlalchemy as sa


revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table('system_configs'):
        return

    existing_columns = {column['name'] for column in inspector.get_columns('system_configs')}
    columns = [
        sa.Column('smtp_host', sa.String(), nullable=True),
        sa.Column('smtp_port', sa.Integer(), nullable=True, server_default='465'),
        sa.Column('smtp_username', sa.String(), nullable=True),
        sa.Column('smtp_password', sa.String(), nullable=True),
        sa.Column('mail_from', sa.String(), nullable=True),
        sa.Column('mail_from_name', sa.String(), nullable=True, server_default='\u62db\u8058\u7cfb\u7edf'),
        sa.Column('mail_enabled', sa.Boolean(), nullable=True, server_default='false'),
    ]
    for column in columns:
        if column.name not in existing_columns:
            op.add_column('system_configs', column)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table('system_configs'):
        return

    existing_columns = {column['name'] for column in inspector.get_columns('system_configs')}
    for column_name in (
        'mail_enabled',
        'mail_from_name',
        'mail_from',
        'smtp_password',
        'smtp_username',
        'smtp_port',
        'smtp_host',
    ):
        if column_name in existing_columns:
            op.drop_column('system_configs', column_name)
