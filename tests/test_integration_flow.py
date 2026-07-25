import os
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.main import app
from app.modules.auth.models import User
from app.modules.items.models import Item
from app.modules.shops.models import Shop

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested"),
]


@pytest.mark.asyncio
async def test_tenant_inventory_sale_invoice_and_isolation_flow() -> None:
    suffix = uuid4().hex[:10]
    email = f"integration-{suffix}@example.com"
    device_uuid = f"device-{suffix}"
    metal = "Silver"
    invoice_no = f"INV-{suffix}"
    shop_id: UUID | None = None
    user_id: UUID | None = None
    second_shop_id: UUID | None = None
    second_user_id: UUID | None = None

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            registration = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": email,
                    "password": "strong-password-123",
                    "full_name": "Integration Owner",
                    "shop_name": f"Integration Shop {suffix}",
                    "device_uuid": device_uuid,
                    "device_name": "Integration Browser",
                    "platform": "web",
                    "app_version": "0.0.2",
                },
            )
            assert registration.status_code == 201, registration.text
            verification = await client.post(
                "/api/v1/auth/verify-email",
                json={"token": registration.json()["verification_token"]},
            )
            assert verification.status_code == 200, verification.text
            login = await client.post(
                "/api/v1/auth/login",
                json={
                    "email": email,
                    "password": "strong-password-123",
                    "device_uuid": device_uuid,
                    "device_name": "Integration Browser",
                    "platform": "web",
                    "app_version": "0.0.2",
                },
            )
            assert login.status_code == 200, login.text
            login_data = login.json()
            user_id = UUID(login_data["user_id"])
            shop_id = UUID(login_data["memberships"][0]["shop_id"])
            headers = {
                "Authorization": f"Bearer {login_data['access_token']}",
                "X-Device-UUID": device_uuid,
                "X-Shop-ID": str(shop_id),
            }

            second_email = f"integration-second-{suffix}@example.com"
            second_device = f"device-second-{suffix}"
            second_registration = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": second_email,
                    "password": "another-strong-password-123",
                    "full_name": "Second Owner",
                    "shop_name": f"Second Shop {suffix}",
                    "device_uuid": second_device,
                    "device_name": "Second Browser",
                    "platform": "web",
                    "app_version": "0.0.2",
                },
            )
            assert second_registration.status_code == 201, second_registration.text
            await client.post(
                "/api/v1/auth/verify-email",
                json={"token": second_registration.json()["verification_token"]},
            )
            invitation = await client.post(
                f"/api/v1/shops/{shop_id}/invitations",
                headers=headers,
                json={"email": second_email, "role": "MANAGER"},
            )
            assert invitation.status_code == 200, invitation.text
            accepted = await client.post(
                "/api/v1/auth/invitations/accept",
                json={
                    "token": invitation.json()["token"],
                    "email": second_email,
                    "password": "another-strong-password-123",
                    "full_name": "Second Owner",
                    "device_uuid": second_device,
                    "device_name": "Second Browser",
                    "platform": "web",
                    "app_version": "0.0.2",
                },
            )
            assert accepted.status_code == 200, accepted.text
            second_user_id = UUID(accepted.json()["user_id"])
            assert len(accepted.json()["memberships"]) == 2
            second_shop_id = UUID(
                next(
                    membership["shop_id"]
                    for membership in accepted.json()["memberships"]
                    if membership["role"] == "OWNER"
                )
            )
            deletion = await client.post(
                "/api/v1/auth/account-deletion/request",
                json={"email": second_email, "delete_owned_shops": True},
            )
            assert deletion.status_code == 202, deletion.text
            deletion_token = deletion.json()["confirmation_token"]
            deletion_confirmation = await client.post(
                "/api/v1/auth/account-deletion/confirm",
                json={"token": deletion_token},
            )
            assert deletion_confirmation.status_code == 200, deletion_confirmation.text
            deletion_cancellation = await client.post(
                "/api/v1/auth/account-deletion/cancel",
                json={"token": deletion_token},
            )
            assert deletion_cancellation.status_code == 200, deletion_cancellation.text

            rate = await client.post(
                "/api/v1/metal-rates/",
                headers=headers,
                json={"metal": metal, "purity": 100, "rate_per_gram": 100},
            )
            assert rate.status_code == 200, rate.text

            item = await client.post(
                "/api/v1/items/",
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

            wrong_shop_headers = {**headers, "X-Shop-ID": str(uuid4())}
            hidden = await client.get(f"/api/v1/items/{item_id}", headers=wrong_shop_headers)
            assert hidden.status_code == 404

            sale = await client.post(
                "/api/v1/sales/",
                headers={**headers, "Idempotency-Key": f"sale-{suffix}"},
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
            replay = await client.post(
                "/api/v1/sales/",
                headers={**headers, "Idempotency-Key": f"sale-{suffix}"},
                json={
                    "invoice_no": invoice_no,
                    "items": [{"item_id": str(item_id), "quantity": 1}],
                    "customer_name": "Integration Customer",
                    "customer_phone": "9999999999",
                    "customer_address": "Kolkata",
                },
            )
            assert replay.status_code == 200
            assert replay.json()["id"] == str(sale_id)

            invoice = await client.get(f"/api/v1/sales/{sale_id}/invoice", headers=headers)
            assert invoice.status_code == 200
            assert invoice.headers["content-type"] == "application/pdf"
            assert invoice.content.startswith(b"%PDF")

            previous_mode = settings.deployment_mode
            settings.deployment_mode = "hosted"
            try:
                async with AsyncSessionLocal.begin() as session:
                    await session.execute(
                        text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
                        {"shop_id": str(shop_id)},
                    )
                    session.add_all(
                        [
                            Item(
                                shop_id=shop_id,
                                sku=f"LIMIT-{suffix}-{index}",
                                barcode=f"{suffix}{index:03d}",
                                category="ring",
                                name="Limit item",
                                metal=metal,
                                purity=92.5,
                                net_weight=1,
                                making_charge=1,
                                quantity=1,
                                status="in_stock",
                            )
                            for index in range(50)
                        ]
                    )
                limited = await client.post(
                    "/api/v1/items/",
                    headers=headers,
                    json={
                        "sku": "OVER-LIMIT",
                        "name": "Blocked item",
                        "category": "ring",
                        "metal": metal,
                        "purity": 92.5,
                        "net_weight": 1,
                        "making_charge": 1,
                        "quantity": 1,
                    },
                )
                assert limited.status_code == 409
                assert limited.json()["detail"]["code"] == "ITEM_LIMIT_REACHED"
            finally:
                settings.deployment_mode = previous_mode
    finally:
        async with AsyncSessionLocal.begin() as session:
            if second_shop_id is not None:
                await session.execute(delete(Shop).where(Shop.id == second_shop_id))
            if shop_id is not None:
                await session.execute(delete(Shop).where(Shop.id == shop_id))
            if second_user_id is not None:
                await session.execute(delete(User).where(User.id == second_user_id))
            if user_id is not None:
                await session.execute(delete(User).where(User.id == user_id))
