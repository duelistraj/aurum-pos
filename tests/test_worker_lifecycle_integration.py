import os
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import delete, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.jobs import account_deletions as worker
from app.modules.auth.models import AccountDeletionRequest, User
from app.modules.auth.security import hash_token
from app.modules.billing.service import _encrypt_token, record_play_acknowledgement
from app.modules.sales.models import Sale
from app.modules.shops.models import Organization, Shop, ShopInvitation, ShopMembership
from app.modules.subscriptions.models import PlaySubscription, Subscription
from tests.support import create_test_shop

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="PostgreSQL not requested"),
]


@pytest.mark.asyncio
async def test_play_acknowledgement_failure_remains_durable_until_success() -> None:
    shop_id = uuid4()
    subscription_id = uuid4()
    purchase_token = "durable-acknowledgement-token"
    previous_key = settings.billing_token_encryption_key
    settings.billing_token_encryption_key = Fernet.generate_key().decode()
    try:
        async with AsyncSessionLocal.begin() as session:
            await create_test_shop(
                session,
                shop_id=shop_id,
                name="Ack Test",
                slug=f"ack-{shop_id}",
            )
            await session.execute(
                text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
                {"shop_id": str(shop_id)},
            )
            subscription = Subscription(
                id=subscription_id,
                organization_id=shop_id,
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
                    organization_id=shop_id,
                    package_name=settings.google_play_package_name,
                    product_id=settings.google_play_product_id,
                    purchase_token=_encrypt_token(purchase_token),
                    purchase_token_hash=hash_token(purchase_token),
                    state="SUBSCRIPTION_STATE_ACTIVE",
                    last_verified_at=datetime.now(UTC),
                    acknowledgement_pending=True,
                )
            )

        async with AsyncSessionLocal.begin() as session:
            await record_play_acknowledgement(
                session,
                purchase_token=purchase_token,
                error=RuntimeError("provider unavailable"),
            )
        async with AsyncSessionLocal.begin() as session:
            play = await session.get(PlaySubscription, subscription_id)
            assert play is not None
            assert play.acknowledgement_pending is True
            assert play.acknowledgement_attempts == 1
            assert play.acknowledgement_next_attempt_at is not None

        async with AsyncSessionLocal.begin() as session:
            await record_play_acknowledgement(
                session,
                purchase_token=purchase_token,
                error=None,
            )
        async with AsyncSessionLocal.begin() as session:
            play = await session.get(PlaySubscription, subscription_id)
            assert play is not None
            assert play.acknowledgement_pending is False
            assert play.acknowledged_at is not None
    finally:
        settings.billing_token_encryption_key = previous_key
        async with AsyncSessionLocal.begin() as session:
            await session.execute(delete(Organization).where(Organization.id == shop_id))


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
            await create_test_shop(
                session,
                shop_id=shop_id,
                name="Deletion Test",
                slug=f"delete-{shop_id}",
            )
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
                organization_id=shop_id,
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
                    organization_id=shop_id,
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
            await session.execute(delete(Organization).where(Organization.id == shop_id))


@pytest.mark.asyncio
async def test_confirmed_deletion_removes_user_and_sole_owned_shop(monkeypatch) -> None:
    user_id = uuid4()
    shop_id = uuid4()
    surviving_shop_id = uuid4()
    invitation_id = uuid4()
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
        await create_test_shop(
            session,
            shop_id=shop_id,
            name="Owned Shop",
            slug=f"owned-{shop_id}",
            owner_user_id=user_id,
        )
        await create_test_shop(
            session,
            shop_id=surviving_shop_id,
            name="Surviving Shop",
            slug=f"surviving-{surviving_shop_id}",
        )
        session.add_all(
            [
                ShopInvitation(
                    id=invitation_id,
                    shop_id=surviving_shop_id,
                    email=f"invitee-{invitation_id}@example.com",
                    role="CASHIER",
                    token_hash=uuid4().hex + uuid4().hex,
                    invited_by_user_id=user_id,
                    expires_at=datetime.now(UTC) + timedelta(days=7),
                ),
            ]
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
        invitation = await session.get(ShopInvitation, invitation_id)
        assert invitation is not None
        assert invitation.invited_by_user_id is None

    async with AsyncSessionLocal.begin() as session:
        await session.execute(
            delete(AccountDeletionRequest).where(AccountDeletionRequest.id == request_id)
        )
        await session.execute(delete(Organization).where(Organization.id == surviving_shop_id))


@pytest.mark.asyncio
async def test_account_deletion_revalidates_ownership_after_external_cleanup(monkeypatch) -> None:
    owner_id = uuid4()
    replacement_id = uuid4()
    shop_id = uuid4()
    request_id = uuid4()

    async with AsyncSessionLocal.begin() as session:
        session.add_all(
            [
                User(
                    id=owner_id,
                    email=f"deleting-{owner_id}@example.com",
                    full_name="Deleting Owner",
                ),
                User(
                    id=replacement_id,
                    email=f"replacement-{replacement_id}@example.com",
                    full_name="Replacement Owner",
                ),
            ]
        )
        await create_test_shop(
            session,
            shop_id=shop_id,
            name="Transfer Race Shop",
            slug=f"race-{shop_id}",
            owner_user_id=owner_id,
        )
        session.add_all(
            [
                ShopMembership(
                    shop_id=shop_id,
                    user_id=replacement_id,
                    role="MANAGER",
                    is_active=True,
                ),
                AccountDeletionRequest(
                    id=request_id,
                    user_id=owner_id,
                    email_hash="c" * 64,
                    token_hash=uuid4().hex + uuid4().hex,
                    delete_owned_shops=True,
                    confirmed_at=datetime.now(UTC) - timedelta(days=31),
                    execute_after=datetime.now(UTC) - timedelta(days=1),
                    cleanup_started_at=datetime.now(UTC),
                    cleanup_attempts=1,
                ),
            ]
        )

    async def transfer_during_cleanup(
        _shop_id,
        **kwargs,
    ) -> None:
        request_id = kwargs.get("request_id")
        lease_token = kwargs.get("lease_token")
        assert request_id is not None
        assert lease_token is None
        async with AsyncSessionLocal.begin() as session:
            owner = await session.get(User, owner_id)
            replacement = await session.get(User, replacement_id)
            assert owner is not None
            assert replacement is not None
            memberships = (
                await session.execute(
                    ShopMembership.__table__.select().where(ShopMembership.shop_id == shop_id)
                )
            ).mappings()
            by_user = {row["user_id"]: row["id"] for row in memberships}
            await session.execute(
                ShopMembership.__table__.update()
                .where(ShopMembership.id == by_user[owner_id])
                .values(role="ADMIN")
            )
            await session.execute(
                ShopMembership.__table__.update()
                .where(ShopMembership.id == by_user[replacement_id])
                .values(role="OWNER")
            )
            organization = await session.get(Organization, shop_id)
            assert organization is not None
            organization.owner_user_id = replacement_id

    monkeypatch.setattr(worker, "_cleanup_shop_external_data", transfer_during_cleanup)

    try:
        await worker._process_account_deletion(request_id)

        async with AsyncSessionLocal.begin() as session:
            assert await session.get(User, owner_id) is not None
            shop = await session.get(Shop, shop_id)
            assert shop is not None
            assert shop.is_active is False
            request = await session.get(AccountDeletionRequest, request_id)
            assert request is not None
            assert request.completed_at is None
            assert request.external_cleanup_started_at is not None
            assert request.cleanup_started_at is None
            assert request.cleanup_last_error_code == "RuntimeError"
    finally:
        async with AsyncSessionLocal.begin() as session:
            await session.execute(
                delete(AccountDeletionRequest).where(AccountDeletionRequest.id == request_id)
            )
            await session.execute(delete(Organization).where(Organization.id == shop_id))
            await session.execute(delete(User).where(User.id.in_((owner_id, replacement_id))))
