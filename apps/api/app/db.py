from collections.abc import Generator
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.errors import unavailable


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
    with Session(engine_for(settings.database_url)) as session:
        try:
            yield session
        except SQLAlchemyError as exc:
            session.rollback()
            raise unavailable("Database operation failed. Retry or contact the operator.") from exc
