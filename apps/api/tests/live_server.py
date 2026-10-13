"""LOCAL TEST ONLY: real Supabase Auth/Storage and isolated disposable PostGIS."""

import json
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID, uuid4

import httpx
from alembic import command
from alembic.config import Config
from fastapi import Request
from fastapi.responses import JSONResponse
from PIL import Image
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import Session

from app.auth import TokenVerifier, get_verifier
from app.config import Settings, get_settings
from app.db import database_session
from app.evidence import PrivateStorage
from app.main import app
from app.models import Evidence, Membership, Organisation

ROOT = Path(__file__).resolve().parents[3]
configuration = json.loads((ROOT / ".local/database.json").read_text(encoding="utf-8"))
url = f"postgresql+psycopg://infrashader:{configuration['app_password']}@127.0.0.1:{configuration['port']}/infrashader_test"
settings = Settings(database_url=url)
if settings.supabase_url != "http://127.0.0.1:54331":
    raise RuntimeError("Live tests require the configured local Supabase endpoint on 54331.")
key = settings.storage_service_key.get_secret_value()
headers = {"apikey": key, "Authorization": f"Bearer {key}"}
schema = "live_browser_" + uuid4().hex
engine = create_engine(url)
admin_engine = create_engine(url)
fixture_file = ROOT / ".local/live-browser-fixture.json"
cleanup_key = secrets.token_urlsafe(32)
users = []
created_schema = False
cleaned = False


@event.listens_for(engine, "connect")
def search_path(connection, _):
    connection.autocommit = True
    with connection.cursor() as cursor:
        cursor.execute(f'SET search_path TO "{schema}", public')
    connection.autocommit = False


def cleanup_owned():
    global cleaned
    if cleaned:
        return
    if created_schema:
        with Session(engine) as session:
            for record in session.scalars(select(Evidence)).all():
                PrivateStorage(settings).delete(record.object_path)
        engine.dispose()
        with admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
    for user in users:
        response = httpx.delete(
            f"{settings.supabase_url}/auth/v1/admin/users/{user['id']}", headers=headers, timeout=15
        )
        response.raise_for_status()
    fixture_file.unlink(missing_ok=True)
    cleaned = True


@asynccontextmanager
async def lifespan(_):
    global created_schema
    with admin_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    created_schema = True
    config = Config(str(ROOT / "apps/api/alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "apps/api/migrations"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    Image.new("RGB", (20, 20), "green").save(ROOT / ".local/live-evidence-fixture.png")
    try:
        for name in ("owner", "foreign"):
            email = f"local-test-{name}-{uuid4().hex}@example.invalid"
            password = secrets.token_urlsafe(30)
            response = httpx.post(
                f"{settings.supabase_url}/auth/v1/admin/users",
                headers=headers,
                json={"email": email, "password": password, "email_confirm": True},
                timeout=15,
            )
            response.raise_for_status()
            users.append({"id": response.json()["id"], "email": email, "password": password})
        with Session(engine) as session:
            org = Organisation(name="Real local services fixture")
            session.add(org)
            session.flush()
            session.add(
                Membership(
                    organisation_id=org.id,
                    user_id=UUID(users[0]["id"]),
                    role="administrator",
                    capabilities=[],
                )
            )
            session.commit()
        web_values = dict(
            line.split("=", 1)
            for line in (ROOT / "apps/web/.env.local").read_text().splitlines()
            if "=" in line and not line.startswith("#")
        )
        fixture_file.write_text(
            json.dumps(
                {
                    "users": users,
                    "cleanup_key": cleanup_key,
                    "supabase_url": settings.supabase_url,
                    "public_key": web_values["VITE_SUPABASE_PUBLISHABLE_KEY"],
                }
            )
        )
        yield
    finally:
        cleanup_owned()
        admin_engine.dispose()


def session_dependency():
    with Session(engine) as session:
        yield session


app.router.lifespan_context = lifespan
app.dependency_overrides[database_session] = session_dependency
app.dependency_overrides[get_settings] = lambda: settings
app.dependency_overrides[get_verifier] = lambda: TokenVerifier(settings)


@app.post("/fixture/cleanup")
def cleanup(request: Request):
    if not secrets.compare_digest(request.headers.get("X-Fixture-Key", ""), cleanup_key):
        return JSONResponse({"error": "fixture authorization required"}, status_code=403)
    cleanup_owned()
    return {"status": "cleaned"}
