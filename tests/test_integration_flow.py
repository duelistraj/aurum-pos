import asyncio
import hashlib
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.main import app
from app.modules.auth.models import AccountDeletionRequest, User
from app.modules.dashboard.service import _rates_at
from app.modules.items.models import Item
from app.modules.metal_rates.models import MetalRate, MetalRateHistory
from app.modules.sales.models import InvoiceJob, Sale
from app.modules.sales.storage import (
    InvoiceStorageError,
    InvoiceUploadMetadata,
    get_invoice_storage,
)
from app.modules.shops.models import Shop, ShopMembership
from app.worker import process_invoice_jobs

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested"),
]


class FakeInvoiceStorage:
    expiry_seconds = 600

    def __init__(self, *, failed_uploads: int) -> None:
        self.failed_uploads = failed_uploads
        self.upload_keys: list[str] = []
        self.presigned_keys: list[str] = []

    async def upload_pdf(self, *, object_key: str, pdf: bytes) -> InvoiceUploadMetadata:
        self.upload_keys.append(object_key)
        if len(self.upload_keys) <= self.failed_uploads:
            raise InvoiceStorageError("simulated S3 outage")
        return InvoiceUploadMetadata(checksum_sha256=hashlib.sha256(pdf).hexdigest())

    async def generate_download_url(
        self,
        *,
        object_key: str,
        download_filename: str,
    ) -> str:
        self.presigned_keys.append(object_key)
        return f"https://example.invalid/invoice?filename={download_filename}"


@pytest.mark.asyncio
async def test_tenant_inventory_sale_invoice_and_isolation_flow(monkeypatch) -> None:
    suffix = uuid4().hex[:10]
    email = f"integration-{suffix}@example.com"
    device_uuid = f"device-{suffix}"
    metal = "Silver"
    shop_id: UUID | None = None
    user_id: UUID | None = None
    second_shop_id: UUID | None = None
    second_user_id: UUID | None = None
    invoice_storage = FakeInvoiceStorage(failed_uploads=2)
    monkeypatch.setattr(settings, "worker_email_max_attempts", 1)
    monkeypatch.setattr(settings, "worker_invoice_max_attempts", 3)
    app.dependency_overrides[get_invoice_storage] = lambda: invoice_storage

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
            wrong_refresh_device = await client.post(
                "/api/v1/auth/refresh",
                json={
                    "refresh_token": login_data["refresh_token"],
                    "device_uuid": "different-device",
                },
            )
            assert wrong_refresh_device.status_code == 401
            refreshed = await client.post(
                "/api/v1/auth/refresh",
                json={
                    "refresh_token": login_data["refresh_token"],
                    "device_uuid": device_uuid,
                },
            )
            assert refreshed.status_code == 200, refreshed.text
            headers = {
                "Authorization": f"Bearer {login_data['access_token']}",
                "X-Device-UUID": device_uuid,
                "X-Shop-ID": str(shop_id),
            }
            wrong_device = await client.get(
                "/api/v1/items/",
                headers={**headers, "X-Device-UUID": f"wrong-{device_uuid}"},
            )
            assert wrong_device.status_code == 403

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
            accepted_data = accepted.json()
            second_user_id = UUID(accepted_data["user_id"])
            assert len(accepted_data["memberships"]) == 2
            second_shop_id = UUID(
                next(
                    membership["shop_id"]
                    for membership in accepted_data["memberships"]
                    if membership["role"] == "OWNER"
                )
            )
            manager_invoice_list = await client.get(
                "/api/v1/sales/invoices",
                headers={
                    "Authorization": f"Bearer {accepted_data['access_token']}",
                    "X-Device-UUID": second_device,
                    "X-Shop-ID": str(shop_id),
                },
            )
            assert manager_invoice_list.status_code == 200, manager_invoice_list.text
            assert manager_invoice_list.json()["invoices"] == []
            async with AsyncSessionLocal.begin() as session:
                await session.execute(
                    update(ShopMembership)
                    .where(
                        ShopMembership.shop_id == shop_id,
                        ShopMembership.user_id == second_user_id,
                    )
                    .values(role="CASHIER")
                )
            cashier_invoice_list = await client.get(
                "/api/v1/sales/invoices",
                headers={
                    "Authorization": f"Bearer {accepted_data['access_token']}",
                    "X-Device-UUID": second_device,
                    "X-Shop-ID": str(shop_id),
                },
            )
            assert cashier_invoice_list.status_code == 200, cashier_invoice_list.text
            assert cashier_invoice_list.json()["invoices"] == []
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
            assert deletion_confirmation.json()["message"] == "Account deletion scheduled in 7 days"
            async with AsyncSessionLocal.begin() as session:
                deletion_request = await session.scalar(
                    select(AccountDeletionRequest)
                    .where(AccountDeletionRequest.user_id == second_user_id)
                    .order_by(AccountDeletionRequest.created_at.desc())
                )
                assert deletion_request is not None
                assert deletion_request.confirmed_at is not None
                assert deletion_request.execute_after is not None
                assert deletion_request.execute_after - deletion_request.confirmed_at == timedelta(
                    days=7
                )
            deletion_cancellation = await client.post(
                "/api/v1/auth/account-deletion/cancel",
                json={"token": deletion_token},
            )
            assert deletion_cancellation.status_code == 200, deletion_cancellation.text
            second_login = await client.post(
                "/api/v1/auth/login",
                json={
                    "email": second_email,
                    "password": "another-strong-password-123",
                    "device_uuid": second_device,
                    "device_name": "Second Browser",
                    "platform": "web",
                    "app_version": "0.0.2",
                },
            )
            assert second_login.status_code == 200, second_login.text
            second_shop_headers = {
                "Authorization": f"Bearer {second_login.json()['access_token']}",
                "X-Device-UUID": second_device,
                "X-Shop-ID": str(second_shop_id),
            }
            second_primary_headers = {
                **second_shop_headers,
                "X-Shop-ID": str(shop_id),
            }
            staff = await client.get(
                f"/api/v1/shops/{shop_id}/members",
                headers=headers,
            )
            assert staff.status_code == 200, staff.text
            second_membership = next(
                member for member in staff.json() if member["email"] == second_email
            )
            deactivated = await client.patch(
                f"/api/v1/shops/{shop_id}/members/{second_membership['id']}",
                headers=headers,
                json={"is_active": False},
            )
            assert deactivated.status_code == 200, deactivated.text
            assert deactivated.json()["is_active"] is False
            revoked_access = await client.get(
                "/api/v1/items/",
                headers=second_primary_headers,
            )
            assert revoked_access.status_code == 404
            reactivated = await client.patch(
                f"/api/v1/shops/{shop_id}/members/{second_membership['id']}",
                headers=headers,
                json={"is_active": True},
            )
            assert reactivated.status_code == 200, reactivated.text
            restored_access = await client.get(
                "/api/v1/items/",
                headers=second_primary_headers,
            )
            assert restored_access.status_code == 200, restored_access.text

            shop_profile = await client.patch(
                f"/api/v1/shops/{shop_id}",
                headers=headers,
                json={
                    "legal_name": "Integration Jewellers Private Limited",
                    "tax_id": "19ABCDE1234F1Z5",
                    "phone": "+91 98765 43210",
                    "address": "Kolkata",
                    "state": "West Bengal",
                    "state_code": "19",
                    "invoice_prefix": "TEST",
                },
            )
            assert shop_profile.status_code == 200, shop_profile.text
            assert shop_profile.json()["phone"] == "+91 98765 43210"

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
            barcode = item.json()["barcode"]
            active_entitlement = await client.get(
                "/api/v1/subscriptions/entitlement",
                headers=headers,
            )
            assert active_entitlement.status_code == 200, active_entitlement.text
            assert active_entitlement.json()["active_item_count"] == 1

            cashier_all_labels = await client.get(
                "/api/v1/items/labels/all",
                headers=second_primary_headers,
            )
            assert cashier_all_labels.status_code == 403
            cashier_batch_labels = await client.post(
                "/api/v1/items/labels/batch",
                headers=second_primary_headers,
                json=[str(item_id)],
            )
            assert cashier_batch_labels.status_code == 403
            async with AsyncSessionLocal.begin() as session:
                await session.execute(
                    update(ShopMembership)
                    .where(
                        ShopMembership.shop_id == shop_id,
                        ShopMembership.user_id == second_user_id,
                    )
                    .values(role="MANAGER")
                )
            manager_all_labels = await client.get(
                "/api/v1/items/labels/all",
                headers=second_primary_headers,
            )
            assert manager_all_labels.status_code == 200, manager_all_labels.text
            manager_batch_labels = await client.post(
                "/api/v1/items/labels/batch",
                headers=second_primary_headers,
                json=[str(item_id)],
            )
            assert manager_batch_labels.status_code == 200, manager_batch_labels.text
            async with AsyncSessionLocal.begin() as session:
                await session.execute(
                    update(ShopMembership)
                    .where(
                        ShopMembership.shop_id == shop_id,
                        ShopMembership.user_id == second_user_id,
                    )
                    .values(role="CASHIER")
                )

            second_shop_items = await client.get(
                "/api/v1/items/",
                headers=second_shop_headers,
            )
            assert second_shop_items.status_code == 200, second_shop_items.text
            assert second_shop_items.json()["total"] == 0
            assert second_shop_items.json()["items"] == []

            second_shop_summary = await client.get(
                "/api/v1/items/summary",
                headers=second_shop_headers,
            )
            assert second_shop_summary.status_code == 200, second_shop_summary.text
            assert second_shop_summary.json() == {
                "total_items": 0,
                "in_stock": 0,
                "unique_items": 0,
                "sold_items": 0,
                "items_925_count": 0,
            }

            second_shop_rate = await client.get(
                "/api/v1/metal-rates",
                headers=second_shop_headers,
            )
            assert second_shop_rate.status_code == 200, second_shop_rate.text
            assert second_shop_rate.json() == []

            hidden_item = await client.get(
                f"/api/v1/items/{item_id}",
                headers=second_shop_headers,
            )
            assert hidden_item.status_code == 404
            hidden_barcode = await client.get(
                f"/api/v1/items/barcode/{barcode}",
                headers=second_shop_headers,
            )
            assert hidden_barcode.status_code == 404
            hidden_latest = await client.get(
                "/api/v1/items/latest",
                headers=second_shop_headers,
            )
            assert hidden_latest.status_code == 404
            hidden_scan = await client.get(
                f"/api/v1/items/pos/scan/{barcode}",
                headers=second_shop_headers,
            )
            assert hidden_scan.status_code == 404
            hidden_labels = await client.post(
                "/api/v1/items/labels/batch",
                headers=second_shop_headers,
                json=[str(item_id)],
            )
            assert hidden_labels.status_code == 404
            hidden_update = await client.patch(
                f"/api/v1/items/{item_id}",
                headers=second_shop_headers,
                json={"name": "Cross-shop update"},
            )
            assert hidden_update.status_code == 404
            hidden_delete = await client.delete(
                f"/api/v1/items/{item_id}",
                headers=second_shop_headers,
            )
            assert hidden_delete.status_code == 404
            second_shop_dashboard = await client.get(
                "/api/v1/dashboard/summary",
                headers=second_shop_headers,
            )
            assert second_shop_dashboard.status_code == 200, second_shop_dashboard.text
            assert second_shop_dashboard.json()["inventory_items"] == 0
            assert second_shop_dashboard.json()["total_sales_amount"] == 0
            second_shop_history = await client.get(
                "/api/v1/change-log/history",
                headers=second_shop_headers,
                params={"page": 1, "limit": 50},
            )
            assert second_shop_history.status_code == 200, second_shop_history.text
            assert second_shop_history.json() == {
                "entries": [],
                "total": 0,
                "page": 1,
                "limit": 50,
                "pages": 0,
            }
            legacy_history = await client.get(
                "/api/v1/change-log/history",
                headers=second_shop_headers,
            )
            assert legacy_history.status_code == 200
            assert legacy_history.json() == []

            wrong_shop_headers = {**headers, "X-Shop-ID": str(uuid4())}
            hidden = await client.get(f"/api/v1/items/{item_id}", headers=wrong_shop_headers)
            assert hidden.status_code == 404
            hidden_invoice_list = await client.get(
                "/api/v1/sales/invoices",
                headers=wrong_shop_headers,
            )
            assert hidden_invoice_list.status_code == 404

            sale = await client.post(
                "/api/v1/sales/",
                headers={**headers, "Idempotency-Key": f"sale-{suffix}"},
                json={
                    "items": [{"item_id": str(item_id), "quantity": 1}],
                    "customer_name": "Integration Customer",
                    "customer_phone": "9999999999",
                    "customer_address": "Kolkata",
                },
            )
            assert sale.status_code == 200, sale.text
            sale_id = UUID(sale.json()["id"])
            assert sale.json()["invoice_no"].startswith("TEST-")
            sold_entitlement = await client.get(
                "/api/v1/subscriptions/entitlement",
                headers=headers,
            )
            assert sold_entitlement.status_code == 200, sold_entitlement.text
            assert sold_entitlement.json()["active_item_count"] == 0
            sold_item_deletion = await client.delete(
                f"/api/v1/items/{item_id}",
                headers=headers,
            )
            assert sold_item_deletion.status_code == 400
            assert sold_item_deletion.json()["detail"] == "Only in_stock items can be deleted"

            pending_invoice_list = await client.get(
                "/api/v1/sales/invoices",
                headers=headers,
                params={"search": "Integration Customer", "pdf_status": "pending"},
            )
            assert pending_invoice_list.status_code == 200, pending_invoice_list.text
            assert pending_invoice_list.json()["total"] == 1
            assert pending_invoice_list.json()["invoices"][0]["sale_id"] == str(sale_id)
            assert "s3_object_key" not in pending_invoice_list.text

            unavailable_invoice = await client.get(
                f"/api/v1/sales/{sale_id}/invoice",
                headers=headers,
            )
            assert unavailable_invoice.status_code == 202
            assert unavailable_invoice.json()["status"] == "pending"

            for attempt in range(3):
                await process_invoice_jobs(storage=invoice_storage)
                if attempt < 2:
                    async with AsyncSessionLocal.begin() as session:
                        await session.execute(
                            update(InvoiceJob)
                            .where(
                                InvoiceJob.shop_id == shop_id,
                                InvoiceJob.sale_id == sale_id,
                            )
                            .values(status="pending", next_attempt_at=None)
                        )

            replay = await client.post(
                "/api/v1/sales/",
                headers={**headers, "Idempotency-Key": f"sale-{suffix}"},
                json={
                    "items": [{"item_id": str(item_id), "quantity": 1}],
                    "customer_name": "Integration Customer",
                    "customer_phone": "9999999999",
                    "customer_address": "Kolkata",
                },
            )
            assert replay.status_code == 200
            assert replay.json()["id"] == str(sale_id)
            operation_result = await client.get(
                f"/api/v1/sales/idempotency/sale-{suffix}",
                headers=headers,
            )
            assert operation_result.status_code == 200
            assert operation_result.json()["id"] == str(sale_id)
            assert len(invoice_storage.upload_keys) == 3
            assert len(set(invoice_storage.upload_keys)) == 1

            invoice = await client.get(f"/api/v1/sales/{sale_id}/invoice", headers=headers)
            assert invoice.status_code == 200
            assert invoice.json()["expires_in_seconds"] == 600
            assert invoice.json()["url"].startswith("https://example.invalid/invoice")

            ready_invoice_list = await client.get(
                "/api/v1/sales/invoices",
                headers=headers,
                params={"search": sale.json()["invoice_no"], "pdf_status": "ready"},
            )
            assert ready_invoice_list.status_code == 200, ready_invoice_list.text
            assert ready_invoice_list.json()["total"] == 1
            assert ready_invoice_list.json()["invoices"][0]["pdf_generated_at"] is not None

            isolated_invoice_list = await client.get(
                "/api/v1/sales/invoices",
                headers=second_shop_headers,
            )
            assert isolated_invoice_list.status_code == 200, isolated_invoice_list.text
            assert isolated_invoice_list.json()["invoices"] == []

            hidden_invoice = await client.get(
                f"/api/v1/sales/{sale_id}/invoice",
                headers=second_shop_headers,
            )
            assert hidden_invoice.status_code == 404
            assert invoice_storage.presigned_keys == [invoice_storage.upload_keys[-1]]

            async with AsyncSessionLocal.begin() as session:
                await session.execute(
                    text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
                    {"shop_id": str(shop_id)},
                )
                persisted_sale = await session.scalar(
                    select(Sale)
                    .where(
                        Sale.id == sale_id,
                        Sale.shop_id == shop_id,
                    )
                    .options(selectinload(Sale.items))
                )
                assert persisted_sale is not None
                assert persisted_sale.s3_object_key == invoice_storage.upload_keys[-1]
                assert persisted_sale.pdf_generated_at is not None
                assert persisted_sale.pdf_checksum_sha256 is not None
                assert not hasattr(persisted_sale, "presigned_url")
                assert persisted_sale.seller_name == "Integration Jewellers Private Limited"
                assert persisted_sale.seller_tax_id == "19ABCDE1234F1Z5"
                assert persisted_sale.seller_phone == "+91 98765 43210"
                assert persisted_sale.items[0].item_name == "Integration Ring"
                assert persisted_sale.items[0].item_sku == f"SKU-{suffix}"

            historical_boundary = datetime.now(UTC)
            await asyncio.sleep(0.01)
            updated_rate = await client.post(
                "/api/v1/metal-rates/",
                headers=headers,
                json={"metal": metal, "purity": 100, "rate_per_gram": 200},
            )
            assert updated_rate.status_code == 200, updated_rate.text
            async with AsyncSessionLocal.begin() as session:
                await session.execute(
                    text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
                    {"shop_id": str(shop_id)},
                )
                assert (
                    await session.scalar(
                        select(func.count(MetalRate.id)).where(
                            MetalRate.shop_id == shop_id,
                            MetalRate.metal == metal.lower(),
                        )
                    )
                    == 1
                )
                assert (
                    await session.scalar(
                        select(func.count(MetalRateHistory.id)).where(
                            MetalRateHistory.shop_id == shop_id,
                            MetalRateHistory.metal == metal.lower(),
                        )
                    )
                    == 2
                )
                historical_rates = await _rates_at(
                    session,
                    shop_id=shop_id,
                    timestamp=historical_boundary,
                )
                assert historical_rates[metal.lower()] == 100

            multi_quantity_item = await client.post(
                "/api/v1/items/",
                headers=headers,
                json={
                    "sku": f"MULTI-{suffix}",
                    "name": "Multi quantity item",
                    "category": "ring",
                    "metal": metal,
                    "purity": 92.5,
                    "net_weight": 1,
                    "making_charge": 5,
                    "quantity": 2,
                },
            )
            assert multi_quantity_item.status_code == 200, multi_quantity_item.text
            multi_item_id = multi_quantity_item.json()["id"]
            partial_sale = await client.post(
                "/api/v1/sales/",
                headers={**headers, "Idempotency-Key": f"partial-{suffix}"},
                json={
                    "items": [{"item_id": multi_item_id, "quantity": 1}],
                    "customer_name": "Partial Sale Customer",
                    "customer_phone": "9999999999",
                },
            )
            assert partial_sale.status_code == 200, partial_sale.text
            archived = await client.delete(
                f"/api/v1/items/{multi_item_id}",
                headers=headers,
            )
            assert archived.status_code == 204, archived.text
            archived_lookup = await client.get(
                f"/api/v1/items/{multi_item_id}",
                headers=headers,
            )
            assert archived_lookup.status_code == 404

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

            transferred = await client.post(
                f"/api/v1/shops/{shop_id}/ownership",
                headers=headers,
                json={"target_membership_id": second_membership["id"]},
            )
            assert transferred.status_code == 200, transferred.text
            assert transferred.json()["role"] == "OWNER"
            old_owner_cannot_transfer = await client.post(
                f"/api/v1/shops/{shop_id}/ownership",
                headers=headers,
                json={"target_membership_id": second_membership["id"]},
            )
            assert old_owner_cannot_transfer.status_code == 403
            new_owner_staff = await client.get(
                f"/api/v1/shops/{shop_id}/members",
                headers=second_primary_headers,
            )
            assert new_owner_staff.status_code == 200, new_owner_staff.text
            original_owner = next(
                member for member in new_owner_staff.json() if member["email"] == email
            )
            transferred_back = await client.post(
                f"/api/v1/shops/{shop_id}/ownership",
                headers=second_primary_headers,
                json={"target_membership_id": original_owner["id"]},
            )
            assert transferred_back.status_code == 200, transferred_back.text
    finally:
        app.dependency_overrides.pop(get_invoice_storage, None)
        async with AsyncSessionLocal.begin() as session:
            if second_shop_id is not None:
                await session.execute(delete(Shop).where(Shop.id == second_shop_id))
            if shop_id is not None:
                await session.execute(delete(Shop).where(Shop.id == shop_id))
            if second_user_id is not None:
                await session.execute(delete(User).where(User.id == second_user_id))
            if user_id is not None:
                await session.execute(delete(User).where(User.id == user_id))
