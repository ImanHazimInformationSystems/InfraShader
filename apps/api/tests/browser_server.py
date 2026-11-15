"""TEST ONLY loopback server: real disposable PostGIS and test-signed identity.

This does not emulate or prove Supabase Auth. It exercises browser/API contracts,
JWT verification, permissions and persistence without adding an application bypass.
Never import from app/ or use against a non-test database.
"""

import json
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

import jwt
from alembic import command
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session

from app import onboarding
from app.access import ALL_CAPABILITIES
from app.auth import TokenVerifier, current_user, get_verifier
from app.config import Settings, get_settings
from app.db import database_session
from app.errors import APIError
from app.main import app
from app.models import Membership, Organisation

ROOT = Path(__file__).resolve().parents[3]
configuration = json.loads((ROOT / ".local/database.json").read_text(encoding="utf-8"))
url = f"postgresql+psycopg://infrashader:{configuration['app_password']}@127.0.0.1:{configuration['port']}/infrashader_test"
schema = "browser_test_" + uuid4().hex
engine = create_engine(url)
admin_engine = create_engine(url)
user_id = uuid4()
# A second, separate test identity and tenant for cross-organisation workflows (S03/L25/O05).
contractor_id = uuid4()
IDENTITIES = {"fixture@example.invalid": user_id, "contractor@example.invalid": contractor_id}
private_key = ec.generate_private_key(ec.SECP256R1())
public_key = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
public_key.update(kid="browser-fixture", alg="ES256", use="sig")
settings = Settings(
    database_url=url,
    supabase_url=os.getenv("INFRA_TEST_API_URL", "http://127.0.0.1:8000"),
    _env_file=None,
)
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
                    capabilities=ALL_CAPABILITIES,
                    active=True,
                )
            )
            contractor_org = Organisation(name="Contractor fixture (test only)")
            session.add(contractor_org)
            session.flush()
            session.add(
                Membership(
                    organisation_id=contractor_org.id,
                    user_id=contractor_id,
                    role="administrator",
                    capabilities=ALL_CAPABILITIES,
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
    allow_origins=["http://127.0.0.1:5173", "http://127.0.0.1:5174"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
app.dependency_overrides[database_session] = session_dependency
app.dependency_overrides[get_settings] = lambda: settings
app.dependency_overrides[get_verifier] = lambda: verifier


def fixture_verified_email(user: Annotated[UUID, Depends(current_user)]):
    # TEST ONLY: the signed test identity's fixed, confirmed email. Not Supabase Auth.
    for email, identity in IDENTITIES.items():
        if identity == user:
            return email
    raise APIError(403, "verified_email_required", "Unknown test identity.")


app.dependency_overrides[onboarding.verified_email] = fixture_verified_email


def user(email="fixture@example.invalid"):
    return {
        "id": str(IDENTITIES[email]),
        "aud": "authenticated",
        "role": "authenticated",
        "email": email,
        "email_confirmed_at": datetime.now(UTC).isoformat(),
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
    if body.get("email") not in IDENTITIES or body.get("password") != "fixture-only":
        from fastapi.responses import JSONResponse

        return JSONResponse({"msg": "Invalid test fixture credentials"}, status_code=400)
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(IDENTITIES[body["email"]]),
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
        "user": user(body["email"]),
    }


@app.get("/auth/v1/user")
def fixture_user(request: Request):
    # The bearer token was signed by this test server; read its subject to answer for that user.
    bearer = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    try:
        subject = UUID(jwt.decode(bearer, options={"verify_signature": False})["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return user()
    for email, identity in IDENTITIES.items():
        if identity == subject:
            return user(email)
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
