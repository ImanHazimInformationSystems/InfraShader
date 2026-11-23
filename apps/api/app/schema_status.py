"""Compare the connected database's Alembic revision with the code's migration head.

An API started against an unmigrated database fails on the first query that touches a new
column. Readiness and unexpected-error responses use this check so an operator sees
"run migrations" instead of a generic failure. No SQL text or customer data is exposed.
"""

from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

API_ROOT = Path(__file__).resolve().parents[1]


@lru_cache(maxsize=1)
def code_revisions() -> tuple[frozenset[str], frozenset[str]]:
    """Return (heads, all known revisions) from the shipped migration scripts."""
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "migrations"))
    scripts = ScriptDirectory.from_config(config)
    known = frozenset(revision.revision for revision in scripts.walk_revisions())
    return frozenset(scripts.get_heads()), known


def classify(database_revisions: set[str], heads: frozenset[str], known: frozenset[str]) -> str:
    """current, behind (pending migrations), unrecognised (database newer than code) or empty."""
    if not database_revisions:
        return "empty"
    if database_revisions == set(heads):
        return "current"
    if database_revisions <= known:
        return "behind"
    return "unrecognised"


def schema_status(engine: Engine) -> str:
    try:
        heads, known = code_revisions()
    except Exception:  # noqa: BLE001 - migration scripts absent from this build
        return "unknown"
    try:
        with engine.connect() as connection:
            rows = connection.execute(text("SELECT version_num FROM alembic_version")).scalars()
            revisions = set(rows)
    except SQLAlchemyError:
        return "unknown"
    return classify(revisions, heads, known)
