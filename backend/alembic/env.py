from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context
import os
import sys
from dotenv import load_dotenv

# 添加项目根目录到 sys.path，以便能够导入 app 模块
sys.path.append(os.getcwd())

from app.models.base import Base
# Import all models here to register them with Base.metadata
from app.models import models, workflow_models

load_dotenv()

from alembic.operations import Operations
original_create_fk = Operations.create_foreign_key
def sqlite_safe_create_fk(self, *args, **kwargs):
    if self.migration_context.dialect.name == 'sqlite':
        return None
    return original_create_fk(self, *args, **kwargs)
Operations.create_foreign_key = sqlite_safe_create_fk

original_drop_constraint = Operations.drop_constraint
def sqlite_safe_drop_constraint(self, *args, **kwargs):
    if self.migration_context.dialect.name == 'sqlite':
        return None
    return original_drop_constraint(self, *args, **kwargs)
Operations.drop_constraint = sqlite_safe_drop_constraint

original_alter_column = Operations.alter_column
def sqlite_safe_alter_column(self, *args, **kwargs):
    if self.migration_context.dialect.name == 'sqlite':
        return None
    return original_alter_column(self, *args, **kwargs)
Operations.alter_column = sqlite_safe_alter_column

original_execute = Operations.execute
def sqlite_safe_execute(self, sql, *args, **kwargs):
    if self.migration_context.dialect.name == 'sqlite':
        sql_str = str(sql).strip().upper()
        if "DO $$" in sql_str or "CREATE TYPE" in sql_str or "DROP TYPE" in sql_str or "ALTER TYPE" in sql_str:
            return None
        if "IF NOT EXISTS" in sql_str and "ADD COLUMN" in sql_str:
            new_sql = str(sql).replace("IF NOT EXISTS", "").replace("if not exists", "")
            return original_execute(self, new_sql, *args, **kwargs)
        if "GEN_RANDOM_UUID" in sql_str:
            new_sql = str(sql).replace("DEFAULT gen_random_uuid()", "").replace("default gen_random_uuid()", "").replace("gen_random_uuid()", "NULL").replace("GEN_RANDOM_UUID()", "NULL")
            return original_execute(self, new_sql, *args, **kwargs)
    return original_execute(self, sql, *args, **kwargs)
Operations.execute = sqlite_safe_execute

original_create_table = Operations.create_table
def sqlite_safe_create_table(self, name, *args, **kwargs):
    if self.migration_context.dialect.name == 'sqlite':
        import sqlalchemy as sa
        new_args = []
        for arg in args:
            if isinstance(arg, sa.Column):
                if arg.server_default is not None:
                    sd_str = str(arg.server_default.arg).lower()
                    if "gen_random_uuid" in sd_str or "uuid" in sd_str:
                        arg.server_default = None
                    elif "now(" in sd_str:
                        arg.server_default = sa.DefaultClause(sa.text("CURRENT_TIMESTAMP"))
            new_args.append(arg)
        return original_create_table(self, name, *new_args, **kwargs)
    return original_create_table(self, name, *args, **kwargs)
Operations.create_table = sqlite_safe_create_table





# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.

def get_url():
    return os.getenv("DATABASE_URL")

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        original_conn_execute = connection.execute
        def sqlite_safe_conn_execute(statement, *args, **kwargs):
            if connection.dialect.name == 'sqlite':
                stmt_str = str(statement).strip().upper()
                if "INFORMATION_SCHEMA" in stmt_str or "PG_INDEXES" in stmt_str:
                    class MockResult:
                        def fetchone(self):
                            return None
                        def fetchall(self):
                            return []
                    return MockResult()
            return original_conn_execute(statement, *args, **kwargs)
        connection.execute = sqlite_safe_conn_execute

        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
