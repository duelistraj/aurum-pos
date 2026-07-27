import pytest
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.database import get_db
from app.main import app


@pytest.mark.asyncio
async def test_health_cors_and_removed_shared_manager_secret() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        health = await client.get("/")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        preflight = await client.options(
            "/",
            headers={
                "Origin": "http://localhost:5174",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == "http://localhost:5174"

        removed = await client.post(
            "/api/v1/auth/verify-manager-password",
            json={"password": "manager-test-password"},
        )
    assert removed.status_code == 404


def test_static_item_routes_precede_uuid_route() -> None:
    paths = [route.path for route in app.routes if isinstance(route, APIRoute)]
    assert paths.index("/api/v1/items/labels/all") < paths.index("/api/v1/items/{item_id}")
    assert "/api/v1/sales/{sale_id}/invoice" in paths


@pytest.mark.asyncio
async def test_readiness_checks_database_connectivity() -> None:
    statements: list[str] = []

    class ReadyDatabase:
        async def execute(self, statement) -> None:
            statements.append(str(statement))

    async def ready_database():
        yield ReadyDatabase()

    app.dependency_overrides[get_db] = ready_database
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health/ready")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    assert statements == ["SELECT 1"]


@pytest.mark.asyncio
async def test_version_reports_deployment_identity() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/version",
            headers={"X-Request-ID": "x" * 129},
        )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert len(response.headers["x-request-id"]) == 36
    assert response.json()["revision"] == "development"
    assert response.json()["image_digest"] == "development"
    assert response.json()["config_revision"] == "development"


@pytest.mark.asyncio
async def test_auth_providers_expose_only_public_google_configuration() -> None:
    previous_client_id = settings.google_web_client_id
    settings.google_web_client_id = " google-client.apps.googleusercontent.com "
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/auth/providers")
    finally:
        settings.google_web_client_id = previous_client_id

    assert response.status_code == 200
    assert response.json() == {
        "google": {
            "enabled": True,
            "client_id": "google-client.apps.googleusercontent.com",
        }
    }
    assert "service_account" not in response.text


@pytest.mark.asyncio
async def test_auth_providers_disable_google_when_client_id_is_absent() -> None:
    previous_client_id = settings.google_web_client_id
    settings.google_web_client_id = None
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/auth/providers")
    finally:
        settings.google_web_client_id = previous_client_id

    assert response.status_code == 200
    assert response.json() == {
        "google": {
            "enabled": False,
            "client_id": None,
        }
    }
