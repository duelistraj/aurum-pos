import os
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.core.changelog.models import ChangeLog
from app.core.database import AsyncSessionLocal
from app.main import app
from app.modules.auth.models import Device, User
from app.modules.auth.security import get_password_hash
from app.modules.items.models import Item
from app.modules.metal_rates.models import MetalRate
from app.modules.sales.models import Sale, SaleItem

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested"),
]


@pytest.mark.asyncio
async def test_authenticated_inventory_sale_and_invoice_flow() -> None:
    suffix = uuid4().hex[:10]
    username = f"integration-{suffix}"
    device_uuid = f"device-{suffix}"
    metal = f"testmetal-{suffix}"
    invoice_no = f"INV-{suffix}"
    user_id: UUID | None = None
    item_id: UUID | None = None
    sale_id: UUID | None = None

    async with AsyncSessionLocal.begin() as session:
        user = User(
            username=username,
            password_hash=get_password_hash("strong-password"),
            full_name="Integration User",
            role="Admin",
        )
        session.add(user)
        await session.flush()
        user_id = user.id

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            login = await client.post(
                "/auth/login",
                json={
                    "username": username,
                    "password": "strong-password",
                    "device_uuid": device_uuid,
                    "device_name": "Integration Browser",
                    "platform": "web",
                    "app_version": "0.0.2",
                },
            )
            assert login.status_code == 200, login.text
            headers = {
                "Authorization": f"Bearer {login.json()['access_token']}",
                "X-Device-UUID": device_uuid,
            }

            rate = await client.post(
                "/metal-rates/",
                headers=headers,
                json={"metal": metal, "purity": 92.5, "rate_per_gram": 100},
            )
            assert rate.status_code == 200, rate.text

            item = await client.post(
                "/items/",
                headers=headers,
                json={
                    "sku": f"SKU-{suffix}",
                    "name": "Integration Ring",
                    "category": "ring",
                    "metal": metal,
                    "purity": 92.5,
                    "net_weight": 2.5,
                    "making_charge": 10,
                    "quantity": 1,
                },
            )
            assert item.status_code == 200, item.text
            item_id = UUID(item.json()["id"])
            assert item.json()["barcode"]

            sale = await client.post(
                "/sales/",
                headers=headers,
                json={
                    "invoice_no": invoice_no,
                    "items": [{"item_id": str(item_id), "quantity": 1}],
                    "customer_name": "Integration Customer",
                    "customer_phone": "9999999999",
                    "customer_address": "Kolkata",
                },
            )
            assert sale.status_code == 200, sale.text
            sale_id = UUID(sale.json()["id"])
            assert sale.json()["total_amount"] == 267.8

            invoice = await client.get(f"/sales/{sale_id}/invoice", headers=headers)
            assert invoice.status_code == 200
            assert invoice.headers["content-type"] == "application/pdf"
            assert invoice.content.startswith(b"%PDF")
    finally:
        async with AsyncSessionLocal.begin() as session:
            entity_ids = [entity_id for entity_id in (item_id, sale_id) if entity_id is not None]
            if entity_ids:
                await session.execute(delete(ChangeLog).where(ChangeLog.entity_id.in_(entity_ids)))
            if sale_id is not None:
                await session.execute(delete(SaleItem).where(SaleItem.sale_id == sale_id))
                await session.execute(delete(Sale).where(Sale.id == sale_id))
            if item_id is not None:
                await session.execute(delete(Item).where(Item.id == item_id))
            await session.execute(delete(MetalRate).where(MetalRate.metal == metal))
            await session.execute(delete(Device).where(Device.device_uuid == device_uuid))
            if user_id is not None:
                await session.execute(delete(User).where(User.id == user_id))
