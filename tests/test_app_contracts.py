import pytest
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health_and_manager_verification() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        health = await client.get("/")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        valid = await client.post(
            "/auth/verify-manager-password",
            json={"password": "manager-test-password"},
        )
        invalid = await client.post(
            "/auth/verify-manager-password",
            json={"password": "wrong-password"},
        )
    assert valid.json() == {"valid": True}
    assert invalid.json() == {"valid": False}


def test_static_item_routes_precede_uuid_route() -> None:
    paths = [route.path for route in app.routes if isinstance(route, APIRoute)]
    assert paths.index("/items/labels/all") < paths.index("/items/{item_id}")
    assert "/sales/{sale_id}/invoice" in paths
