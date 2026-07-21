import pytest
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient

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
