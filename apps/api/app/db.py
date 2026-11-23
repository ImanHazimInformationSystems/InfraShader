from collections.abc import Generator
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, create_engine
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.errors import APIError, unavailable
from app.schema_status import schema_status


@lru_cache
def engine_for(url: str) -> Engine:
    return create_engine(
        url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 5, "options": "-c statement_timeout=10000"},
    )


def database_session(settings: Annotated[Settings, Depends(get_settings)]) -> Generator[Session]:
    if not settings.database_url:
        raise unavailable("Database is not configured. Set DATABASE_URL and run migrations.")
    engine = engine_for(settings.database_url)
    with Session(engine) as session:
        try:
            yield session
        except SQLAlchemyError as exc:
            session.rollback()
            raise database_failure(exc, engine) from exc


# PostgreSQL SQLSTATE codes (https://www.postgresql.org/docs/current/errcodes-appendix.html).
UNDEFINED_SCHEMA_OBJECT = {"42703", "42P01"}  # undefined_column, undefined_table
QUERY_CANCELED = "57014"  # raised by the per-connection statement_timeout


def database_failure(exc: SQLAlchemyError, engine: Engine) -> APIError:
    """Explain a database failure without exposing SQL text, parameters or customer data."""
    code = getattr(getattr(exc, "orig", None), "sqlstate", None)
    if code in UNDEFINED_SCHEMA_OBJECT and schema_status(engine) in {"behind", "empty"}:
        return APIError(
            503,
            "migrations_pending",
            "The database is missing recent updates. An operator must apply the pending "
            "migrations (scripts/api.ps1 migrate), then retry.",
        )
    if code == QUERY_CANCELED:
        return APIError(
            503,
            "database_timeout",
            "The database took too long to answer. Retry; if it continues, report the reference.",
        )
    if isinstance(exc, OperationalError):
        return unavailable("The database is unavailable. Retry shortly or contact the operator.")
    return unavailable("Database operation failed. Retry or contact the operator.")
