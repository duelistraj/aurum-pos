import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import delete, select, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.jobs import ownership_transfers as ownership_worker
from app.modules.auth.models import User
from app.modules.auth.security import hash_token
from app.modules.billing.service import _encrypt_token
from app.modules.shops.models import (
    Organization,
    OrganizationOwnershipTransfer,
    Shop,
    ShopMembership,
)
from app.modules.subscriptions.models import PlaySubscription, Subscription
from app.modules.subscriptions.service import (
    enforce_shop_creation_limit,
    enforce_shop_write_access,
    enforce_team_seat_limit,
    get_entitlement_response,
)
from tests.support import create_test_shop

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("RUN_INTEGRATION") != "1",
        reason="PostgreSQL not requested",
    ),
]


@pytest.mark.asyncio
async def test_organization_plan_controls_shops_seats_and_downgrade_access(
    monkeypatch,
) -> None:
    primary_shop_id = uuid4()
    secondary_shop_id = uuid4()
    second_user_id = uuid4()
    monkeypatch.setattr(settings, "deployment_mode", "hosted")
    monkeypatch.setattr(settings, "free_active_item_limit", 50)
    monkeypatch.setattr(settings, "free_shop_limit", 1)
    monkeypatch.setattr(settings, "pro_shop_limit", 3)
    monkeypatch.setattr(settings, "free_team_seat_limit", 2)
    monkeypatch.setattr(settings, "pro_team_seat_limit", 10)

    async with AsyncSessionLocal.begin() as session:
        organization, primary_shop, owner_id = await create_test_shop(
            session,
            shop_id=primary_shop_id,
            name="Primary Shop",
            slug=f"primary-{primary_shop_id}",
        )
        session.add(
            User(
                id=second_user_id,
                email=f"member-{second_user_id}@example.com",
                full_name="Organization Member",
            )
        )
        secondary_shop = Shop(
            id=secondary_shop_id,
            organization_id=organization.id,
            name="Secondary Shop",
            slug=f"secondary-{secondary_shop_id}",
        )
        session.add(secondary_shop)
        await session.flush()
        session.add_all(
            [
                ShopMembership(
                    shop_id=secondary_shop.id,
                    user_id=owner_id,
                    role="OWNER",
                ),
                ShopMembership(
                    shop_id=primary_shop.id,
                    user_id=second_user_id,
                    role="MANAGER",
                ),
                ShopMembership(
                    shop_id=secondary_shop.id,
                    user_id=second_user_id,
                    role="MANAGER",
                ),
            ]
        )

    try:
        async with AsyncSessionLocal.begin() as session:
            primary = await get_entitlement_response(
                session,
                primary_shop_id,
                primary_shop_id,
            )
            secondary = await get_entitlement_response(
                session,
                primary_shop_id,
                secondary_shop_id,
            )
            assert primary.plan == "free"
            assert primary.active_item_limit == 50
            assert primary.shop_count == 2
            assert primary.shop_limit == 1
            assert primary.team_seat_usage == 2
            assert primary.team_seat_limit == 2
            assert primary.access_mode == "read_write"
            assert secondary.access_mode == "read_only"

            with pytest.raises(HTTPException) as read_only:
                await enforce_shop_write_access(session, secondary_shop_id)
            assert read_only.value.detail["code"] == "SHOP_READ_ONLY"

            with pytest.raises(HTTPException) as shop_limit:
                await enforce_shop_creation_limit(session, primary_shop_id)
            assert shop_limit.value.detail["code"] == "PRO_REQUIRED"

            with pytest.raises(HTTPException) as seat_limit:
                await enforce_team_seat_limit(
                    session,
                    primary_shop_id,
                    candidate_email="third@example.com",
                )
            assert seat_limit.value.detail["code"] == "TEAM_LIMIT_REACHED"

        async with AsyncSessionLocal.begin() as session:
            await session.execute(
                text("SELECT set_config('app.current_organization_id', :organization_id, true)"),
                {"organization_id": str(primary_shop_id)},
            )
            session.add(
                Subscription(
                    organization_id=primary_shop_id,
                    source="complimentary",
                    plan="pro",
                    status="active",
                    starts_at=datetime.now(UTC) - timedelta(days=1),
                    expires_at=datetime.now(UTC) + timedelta(days=30),
                )
            )

        async with AsyncSessionLocal.begin() as session:
            pro = await get_entitlement_response(
                session,
                primary_shop_id,
                secondary_shop_id,
            )
            assert pro.plan == "pro"
            assert pro.active_item_limit is None
            assert pro.shop_limit == 3
            assert pro.team_seat_limit == 10
            assert pro.access_mode == "read_write"
    finally:
        async with AsyncSessionLocal.begin() as session:
            await session.execute(delete(Organization).where(Organization.id == primary_shop_id))
            await session.execute(delete(User).where(User.id.in_((owner_id, second_user_id))))


@pytest.mark.asyncio
async def test_ownership_handoff_cancels_renewal_before_moving_every_shop(
    monkeypatch,
) -> None:
    organization_id = uuid4()
    secondary_shop_id = uuid4()
    target_user_id = uuid4()
    cancelled_tokens: list[str] = []
    previous_key = settings.billing_token_encryption_key
    settings.billing_token_encryption_key = Fernet.generate_key().decode()

    class FakePlayClient:
        async def cancel_subscription(self, purchase_token: str) -> None:
            cancelled_tokens.append(purchase_token)

    monkeypatch.setattr(ownership_worker, "GooglePlayClient", FakePlayClient)

    async with AsyncSessionLocal.begin() as session:
        organization, primary_shop, former_owner_id = await create_test_shop(
            session,
            shop_id=organization_id,
            name="Transfer Organization",
            slug=f"transfer-{organization_id}",
        )
        session.add(
            User(
                id=target_user_id,
                email=f"target-{target_user_id}@example.com",
                full_name="New Organization Owner",
            )
        )
        secondary_shop = Shop(
            id=secondary_shop_id,
            organization_id=organization.id,
            name="Transfer Branch",
            slug=f"transfer-branch-{secondary_shop_id}",
        )
        session.add(secondary_shop)
        await session.flush()
        session.add_all(
            [
                ShopMembership(
                    shop_id=secondary_shop.id,
                    user_id=former_owner_id,
                    role="OWNER",
                ),
                ShopMembership(
                    shop_id=primary_shop.id,
                    user_id=target_user_id,
                    role="MANAGER",
                ),
            ]
        )
        await session.execute(
            text("SELECT set_config('app.current_organization_id', :organization_id, true)"),
            {"organization_id": str(organization.id)},
        )
        subscription = Subscription(
            organization_id=organization.id,
            source="play",
            plan="pro",
            status="active",
            starts_at=datetime.now(UTC) - timedelta(days=1),
            expires_at=datetime.now(UTC) + timedelta(days=20),
        )
        session.add(subscription)
        await session.flush()
        session.add(
            PlaySubscription(
                subscription_id=subscription.id,
                organization_id=organization.id,
                package_name=settings.google_play_package_name,
                product_id=settings.google_play_product_id,
                purchase_token=_encrypt_token("ownership-transfer-token"),
                purchase_token_hash=hash_token("ownership-transfer-token"),
                state="SUBSCRIPTION_STATE_ACTIVE",
                auto_renewing=True,
                last_verified_at=datetime.now(UTC),
            )
        )
        transfer = OrganizationOwnershipTransfer(
            organization_id=organization.id,
            requested_by_user_id=former_owner_id,
            target_user_id=target_user_id,
            status="processing",
        )
        session.add(transfer)
        await session.flush()
        transfer_id = transfer.id

    try:
        await ownership_worker._cancel_organization_renewal(transfer_id)
        await ownership_worker._complete_transfer(transfer_id)

        assert cancelled_tokens == ["ownership-transfer-token"]
        async with AsyncSessionLocal() as session:
            organization = await session.get(Organization, organization_id)
            transfer = await session.get(
                OrganizationOwnershipTransfer,
                transfer_id,
            )
            roles = {
                (membership.shop_id, membership.user_id): membership.role
                for membership in (
                    await session.scalars(
                        select(ShopMembership)
                        .join(Shop, Shop.id == ShopMembership.shop_id)
                        .where(Shop.organization_id == organization_id)
                    )
                )
            }
            assert organization is not None
            assert organization.owner_user_id == target_user_id
            assert transfer is not None
            assert transfer.status == "completed"
            assert roles[(organization_id, former_owner_id)] == "ADMIN"
            assert roles[(secondary_shop_id, former_owner_id)] == "ADMIN"
            assert roles[(organization_id, target_user_id)] == "OWNER"
            assert roles[(secondary_shop_id, target_user_id)] == "OWNER"
    finally:
        settings.billing_token_encryption_key = previous_key
        async with AsyncSessionLocal.begin() as session:
            await session.execute(delete(Organization).where(Organization.id == organization_id))
            await session.execute(
                delete(User).where(User.id.in_((former_owner_id, target_user_id)))
            )
