"""Real PostGIS evidence, skipped explicitly when no disposable database is supplied."""

import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url


@pytest.fixture
def database():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL absent: real PostGIS migration/CRUD/isolation unverified")
    parsed = make_url(url)
    if parsed.drivername != "postgresql+psycopg" or not (parsed.database or "").lower().endswith(
        "_test"
    ):
        pytest.fail(
            "TEST_DATABASE_URL must use postgresql+psycopg and a disposable database ending _test"
        )
    schema = f"infrashader_test_{uuid4().hex}"
    admin_engine = create_engine(url)
    with admin_engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url)

    @event.listens_for(engine, "connect")
    def set_schema(connection, record):
        previous_autocommit = connection.autocommit
        connection.autocommit = True
        try:
            with connection.cursor() as cursor:
                cursor.execute(f'SET search_path TO "{schema}", public')
        finally:
            connection.autocommit = previous_autocommit

    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "migrations"))
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        yield engine
    finally:
        engine.dispose()
        with admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin_engine.dispose()
