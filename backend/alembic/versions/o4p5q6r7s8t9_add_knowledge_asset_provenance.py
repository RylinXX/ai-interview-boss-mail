"""add knowledge asset provenance

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2026-06-17

"""
from alembic import context, op
import sqlalchemy as sa


revision = "o4p5q6r7s8t9"
down_revision = "n3o4p5q6r7s8"
branch_labels = None
depends_on = None


def upgrade():
    columns = [
        ("source_document_id", sa.Column("source_document_id", sa.String(), nullable=True)),
        ("chunk_index", sa.Column("chunk_index", sa.Integer(), nullable=True)),
        ("chunk_total", sa.Column("chunk_total", sa.Integer(), nullable=True)),
        ("source_page", sa.Column("source_page", sa.Integer(), nullable=True)),
        ("source_section", sa.Column("source_section", sa.String(), nullable=True)),
        ("source_locator", sa.Column("source_locator", sa.String(), nullable=True)),
        ("source_excerpt", sa.Column("source_excerpt", sa.Text(), nullable=True)),
        ("retrieval_metadata", sa.Column("retrieval_metadata", sa.JSON(), nullable=True)),
    ]

    if context.is_offline_mode():
        for _, column in columns:
            op.add_column("knowledge_assets", column)
        op.create_index(
            "ix_knowledge_assets_source_document_id",
            "knowledge_assets",
            ["source_document_id"],
        )
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("knowledge_assets"):
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns("knowledge_assets")
    }
    for name, column in columns:
        if name not in existing_columns:
            op.add_column("knowledge_assets", column)

    existing_indexes = {
        index["name"]
        for index in inspector.get_indexes("knowledge_assets")
    }
    if "ix_knowledge_assets_source_document_id" not in existing_indexes:
        op.create_index(
            "ix_knowledge_assets_source_document_id",
            "knowledge_assets",
            ["source_document_id"],
        )


def downgrade():
    column_names = [
        "retrieval_metadata",
        "source_excerpt",
        "source_locator",
        "source_section",
        "source_page",
        "chunk_total",
        "chunk_index",
        "source_document_id",
    ]

    if context.is_offline_mode():
        op.drop_index("ix_knowledge_assets_source_document_id", table_name="knowledge_assets")
        for name in column_names:
            op.drop_column("knowledge_assets", name)
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("knowledge_assets"):
        return

    existing_indexes = {
        index["name"]
        for index in inspector.get_indexes("knowledge_assets")
    }
    if "ix_knowledge_assets_source_document_id" in existing_indexes:
        op.drop_index("ix_knowledge_assets_source_document_id", table_name="knowledge_assets")

    existing_columns = {
        column["name"]
        for column in inspector.get_columns("knowledge_assets")
    }
    for name in column_names:
        if name in existing_columns:
            op.drop_column("knowledge_assets", name)
