import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings, get_settings
from app.main import app

pytestmark = pytest.mark.anyio


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


async def test_public_health_requires_no_secret_or_database(client):
    response = await client.get("/api/v1/health", headers={"X-Request-ID": "test-request-123"})
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "infrashader-api", "version": "0.1.0"}
    assert response.headers["X-Request-ID"] == "test-request-123"


async def test_local_settings_cors_preflight_accepts_put(client):
    response = await client.options(
        "/api/v1/profile",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "Authorization,Content-Type",
        },
    )
    assert response.status_code == 200
    assert "PUT" in response.headers["access-control-allow-methods"]


async def test_readiness_distinguishes_skeleton_from_configured_service(client):
    response = await client.get("/api/v1/readiness")
    assert response.status_code == 503
    assert response.json()["checks"] == {"database": "not_configured", "auth": "not_configured"}


async def test_oversized_stream_is_rejected_before_json_parsing(client):
    response = await client.post(
        "/api/v1/organisations/00000000-0000-0000-0000-000000000000/projects",
        content=b" " * (2 * 1024 * 1024 + 1),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


async def test_protected_api_rejects_missing_identity_before_database(client):
    response = await client.get("/api/v1/session")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "authentication_required"
    assert response.json()["request_id"] == response.headers["X-Request-ID"]


async def test_bad_request_id_is_replaced_and_unknown_routes_use_error_contract(client):
    response = await client.get("/api/v1/missing", headers={"X-Request-ID": "bad/request?private"})
    assert response.status_code == 404
    assert response.headers["X-Request-ID"] != "bad/request?private"
    assert response.json()["error"]["code"] == "http_error"


async def test_openapi_documents_real_project_revision_and_site_contract(client):
    response = await client.get("/openapi.json")
    schema = response.json()
    assert "expected_revision" in schema["components"]["schemas"]["ProjectUpdate"]["required"]
    assert "site" in schema["components"]["schemas"]["ProjectCreate"]["required"]
    assert "/api/v1/organisations/{organisation_id}/projects/{project_id}" in schema["paths"]
