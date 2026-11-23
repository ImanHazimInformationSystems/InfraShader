"""Refinement WP1: failures reach the browser as readable, honest errors.

Covers the cross-origin 500 that browsers reported as "API could not be reached", the
pending-migration check, and database failures explained without SQL or customer data.
"""

from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError

from app import db as db_module
from app.config import Settings, get_settings
from app.main import app
from app.schema_status import classify, code_revisions, schema_status

ORIGIN = "http://127.0.0.1:5173"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    app.dependency_overrides[get_settings] = lambda: Settings(
        database_url=None, supabase_url=None, _env_file=None
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def failing_route():
    def explode():
        raise RuntimeError("private detail: supplier cost 1234.56")

    app.add_api_route("/api/v1/_test/explode", explode)
    route = app.router.routes[-1]
    yield
    app.router.routes.remove(route)


@pytest.mark.anyio
async def test_unexpected_error_is_readable_cross_origin_with_reference(client, failing_route):
    response = await client.get(
        "/api/v1/_test/explode", headers={"Origin": ORIGIN, "X-Request-ID": "trace-abc-123"}
    )
    assert response.status_code == 500
    # Before the fix this response bypassed CORS, so the browser saw a network failure.
    assert response.headers["access-control-allow-origin"] == ORIGIN
    assert response.headers["X-Request-ID"] == "trace-abc-123"
    body = response.json()
    assert body["error"]["code"] == "internal_error"
    assert body["request_id"] == "trace-abc-123"
    assert "1234.56" not in response.text and "supplier" not in response.text


def test_schema_classification_distinguishes_pending_and_newer_databases():
    heads, known = frozenset({"0021"}), frozenset({"0019", "0020", "0021"})
    assert classify({"0021"}, heads, known) == "current"
    assert classify({"0019"}, heads, known) == "behind"
    assert classify({"0099"}, heads, known) == "unrecognised"
    assert classify(set(), heads, known) == "empty"


def test_code_revisions_reads_the_shipped_migration_head():
    heads, known = code_revisions()
    assert len(heads) == 1 and heads <= known
    assert "0020" in {revision[:4] for revision in known}


def fake_error(kind, sqlstate):
    return kind("SELECT secret", {"p": "customer"}, SimpleNamespace(sqlstate=sqlstate))


def test_database_failures_explain_cause_without_sql(monkeypatch):
    monkeypatch.setattr(db_module, "schema_status", lambda engine: "behind")
    missing = db_module.database_failure(fake_error(ProgrammingError, "42703"), engine=None)
    assert (missing.status_code, missing.code) == (503, "migrations_pending")
    timeout = db_module.database_failure(fake_error(OperationalError, "57014"), engine=None)
    assert timeout.code == "database_timeout"
    down = db_module.database_failure(fake_error(OperationalError, "08006"), engine=None)
    assert down.code == "service_unavailable" and "unavailable" in down.message
    for error in (missing, timeout, down):
        assert "SELECT" not in error.message and "customer" not in error.message
    # A missing column on a current schema is a code defect, not a migration instruction.
    monkeypatch.setattr(db_module, "schema_status", lambda engine: "current")
    defect = db_module.database_failure(fake_error(ProgrammingError, "42703"), engine=None)
    assert defect.code == "service_unavailable"


def test_schema_status_against_migrated_and_rolled_back_database(database):
    assert schema_status(database) == "current"
    with database.begin() as connection:
        connection.execute(text("UPDATE alembic_version SET version_num = '0019'"))
    assert schema_status(database) == "behind"
