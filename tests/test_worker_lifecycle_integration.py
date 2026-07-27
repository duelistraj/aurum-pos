import os
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import delete, text

from app import worker
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.auth.models import AccountDeletionRequest, User
from app.modules.billing.service import _encrypt_token
from app.modules.sales.models import Sale
from app.modules.shops.models import Shop, ShopMembership
from app.modules.subscriptions.models import PlaySubscription, Subscription

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested"),
]


@pytest.mark.asyncio
async def test_shop_cleanup_cancels_billing_and_deletes_exact_invoice_keys(monkeypatch) -> None:
    shop_id = uuid4()
    subscription_id = uuid4()
    object_key = f"shops/{shop_id}/invoices/2026/{uuid4()}.pdf"
    cancelled_tokens: list[str] = []
    deleted_keys: list[str] = []
    previous_key = settings.billing_token_encryption_key
    settings.billing_token_encryption_key = Fernet.generate_key().decode()

    class FakePlayClient:
        async def cancel_subscription(self, purchase_token: str) -> None:
            cancelled_tokens.append(purchase_token)

    class FakeStorage:
        async def delete_pdf(self, *, object_key: str) -> None:
            deleted_keys.append(object_key)

    monkeypatch.setattr(worker, "GooglePlayClient", FakePlayClient)
    monkeypatch.setattr(worker, "get_invoice_storage", lambda: FakeStorage())

    try:
        async with AsyncSessionLocal.begin() as session:
            session.add(Shop(id=shop_id, name="Deletion Test", slug=f"delete-{shop_id}"))
            await session.flush()
            await session.execute(
                text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
                {"shop_id": str(shop_id)},
            )
            session.add(
                Sale(
                    id=uuid4(),
                    shop_id=shop_id,
                    invoice_no=f"INV-2026-{uuid4().hex[:6]}",
                    total_amount=Decimal("100.00"),
                    customer_name="Customer",
                    customer_phone="9999999999",
                    customer_state="West Bengal",
                    customer_state_code="19",
                    s3_object_key=object_key,
                )
            )
            subscription = Subscription(
                id=subscription_id,
                shop_id=shop_id,
                source="play",
                plan="pro",
                status="active",
                starts_at=datetime.now(UTC),
            )
            session.add(subscription)
            await session.flush()
            session.add(
                PlaySubscription(
                    subscription_id=subscription_id,
                    shop_id=shop_id,
                    package_name=settings.google_play_package_name,
                    product_id=settings.google_play_product_id,
                    purchase_token=_encrypt_token("purchase-token"),
                    purchase_token_hash="a" * 64,
                    state="SUBSCRIPTION_STATE_ACTIVE",
                    last_verified_at=datetime.now(UTC),
                )
            )

        await worker._cleanup_shop_external_data(shop_id)

        assert cancelled_tokens == ["purchase-token"]
        assert deleted_keys == [object_key]
        async with AsyncSessionLocal.begin() as session:
            play = await session.get(PlaySubscription, subscription_id)
            assert play is not None
            assert play.deletion_cancelled_at is not None
    finally:
        settings.billing_token_encryption_key = previous_key
        async with AsyncSessionLocal.begin() as session:
            await session.execute(delete(Shop).where(Shop.id == shop_id))


@pytest.mark.asyncio
async def test_confirmed_deletion_removes_user_and_sole_owned_shop(monkeypatch) -> None:
    user_id = uuid4()
    shop_id = uuid4()
    request_id = uuid4()

    class FakeStorage:
        async def delete_pdf(self, *, object_key: str) -> None:
            raise AssertionError(f"Unexpected object deletion: {object_key}")

    monkeypatch.setattr(worker, "get_invoice_storage", lambda: FakeStorage())

    async with AsyncSessionLocal.begin() as session:
        session.add(
            User(
                id=user_id,
                email=f"delete-{user_id}@example.com",
                full_name="Deletion Owner",
                is_active=True,
            )
        )
        session.add(Shop(id=shop_id, name="Owned Shop", slug=f"owned-{shop_id}"))
        await session.flush()
        session.add(
            ShopMembership(
                shop_id=shop_id,
                user_id=user_id,
                role="OWNER",
                is_active=True,
            )
        )
        session.add(
            AccountDeletionRequest(
                id=request_id,
                user_id=user_id,
                email_hash="b" * 64,
                token_hash=uuid4().hex + uuid4().hex,
                delete_owned_shops=True,
                confirmed_at=datetime.now(UTC) - timedelta(days=31),
                execute_after=datetime.now(UTC) - timedelta(days=1),
                cleanup_started_at=datetime.now(UTC),
                cleanup_attempts=1,
            )
        )

    await worker._process_account_deletion(request_id)

    async with AsyncSessionLocal.begin() as session:
        assert await session.get(User, user_id) is None
        assert await session.get(Shop, shop_id) is None
        request = await session.get(AccountDeletionRequest, request_id)
        assert request is not None
        assert request.user_id is None
        assert request.completed_at is not None

    async with AsyncSessionLocal.begin() as session:
        await session.execute(
            delete(AccountDeletionRequest).where(AccountDeletionRequest.id == request_id)
        )
