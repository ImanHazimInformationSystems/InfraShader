"""TEST ONLY loopback server: real disposable PostGIS and test-signed identity.

This does not emulate or prove Supabase Auth. It exercises browser/API contracts,
JWT verification, permissions and persistence without adding an application bypass.
Never import from app/ or use against a non-test database.
"""

import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import jwt
from alembic import command
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session

from app.auth import TokenVerifier, get_verifier
from app.config import Settings, get_settings
from app.db import database_session
from app.main import app
from app.models import Membership, Organisation

ROOT = Path(__file__).resolve().parents[3]
configuration = json.loads((ROOT / ".local/database.json").read_text(encoding="utf-8"))
url = f"postgresql+psycopg://infrashader:{configuration['app_password']}@127.0.0.1:{configuration['port']}/infrashader_test"
schema = "browser_test_" + uuid4().hex
engine = create_engine(url)
admin_engine = create_engine(url)
user_id = uuid4()
private_key = ec.generate_private_key(ec.SECP256R1())
public_key = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
public_key.update(kid="browser-fixture", alg="ES256", use="sig")
settings = Settings(database_url=url, supabase_url="http://127.0.0.1:8000", _env_file=None)
verifier = TokenVerifier(settings)


@event.listens_for(engine, "connect")
def search_path(connection, _):
    connection.autocommit = True
    with connection.cursor() as cursor:
        cursor.execute(f'SET search_path TO "{schema}", public')
    connection.autocommit = False


@asynccontextmanager
async def lifespan(_):
    with admin_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    try:
        config = Config(str(ROOT / "apps/api/alembic.ini"))
        config.set_main_option("script_location", str(ROOT / "apps/api/migrations"))
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        with Session(engine) as session:
            org = Organisation(name="Browser integration fixture")
            session.add(org)
            session.flush()
            session.add(
                Membership(
                    organisation_id=org.id,
                    user_id=user_id,
                    role="administrator",
                    capabilities=[],
                    active=True,
                )
            )
            session.commit()
        yield
    finally:
        engine.dispose()
        with admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin_engine.dispose()


def session_dependency():
    with Session(engine) as session:
        yield session


app.router.lifespan_context = lifespan
# Test provider accepts Supabase client headers; production API keeps its narrower CORS policy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
app.dependency_overrides[database_session] = session_dependency
app.dependency_overrides[get_settings] = lambda: settings
app.dependency_overrides[get_verifier] = lambda: verifier


def user():
    return {
        "id": str(user_id),
        "aud": "authenticated",
        "role": "authenticated",
        "email": "fixture@example.invalid",
        "app_metadata": {"provider": "email"},
        "user_metadata": {},
        "created_at": datetime.now(UTC).isoformat(),
    }


@app.get("/auth/v1/.well-known/jwks.json")
def jwks():
    return {"keys": [public_key]}


@app.post("/auth/v1/token")
async def fixture_token(request: Request):
    body = await request.json()
    if body.get("email") != "fixture@example.invalid" or body.get("password") != "fixture-only":
        from fastapi.responses import JSONResponse

        return JSONResponse({"msg": "Invalid test fixture credentials"}, status_code=400)
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(user_id),
            "iss": settings.issuer,
            "aud": "authenticated",
            "iat": now,
            "exp": now + timedelta(hours=1),
            "role": "authenticated",
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "browser-fixture"},
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 3600,
        "refresh_token": "fixture-not-a-real-refresh-token",
        "user": user(),
    }


@app.get("/auth/v1/user")
def fixture_user():
    return user()


@app.post("/auth/v1/logout")
def fixture_logout():
    return {}


@app.post("/fixture/cleanup")
def cleanup():
    # This server owns exactly this randomly named schema in infrashader_test.
    engine.dispose()
    with admin_engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
    return {"status": "cleaned"}
