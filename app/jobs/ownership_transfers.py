import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import or_, select, text

from app.core.database import AsyncSessionLocal
from app.modules.billing.google_play import GooglePlayClient
from app.modules.billing.service import decrypt_purchase_token
from app.modules.shops.models import (
    Organization,
    OrganizationOwnershipTransfer,
    Shop,
    ShopMembership,
)
from app.modules.subscriptions.models import PlaySubscription, Subscription

LOGGER = logging.getLogger("aurum.worker.ownership")
MAX_TRANSFER_ATTEMPTS = 8


async def _claim_transfer() -> UUID | None:
    async with AsyncSessionLocal.begin() as session:
        now = datetime.now(UTC)
        transfer = await session.scalar(
            select(OrganizationOwnershipTransfer)
            .where(
                OrganizationOwnershipTransfer.status == "pending",
                or_(
                    OrganizationOwnershipTransfer.next_attempt_at.is_(None),
                    OrganizationOwnershipTransfer.next_attempt_at <= now,
                ),
            )
            .order_by(OrganizationOwnershipTransfer.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if transfer is None:
            return None
        transfer.status = "processing"
        transfer.attempts += 1
        return transfer.id


async def _cancel_organization_renewal(transfer_id: UUID) -> None:
    async with AsyncSessionLocal() as session:
        transfer = await session.get(OrganizationOwnershipTransfer, transfer_id)
        if transfer is None:
            return
        await session.execute(
            text("SELECT set_config('app.current_organization_id', :organization_id, true)"),
            {"organization_id": str(transfer.organization_id)},
        )
        rows = await session.scalars(
            select(PlaySubscription)
            .join(Subscription, Subscription.id == PlaySubscription.subscription_id)
            .where(
                PlaySubscription.organization_id == transfer.organization_id,
                Subscription.status == "active",
                Subscription.revoked_at.is_(None),
            )
        )
        tokens = [decrypt_purchase_token(row.purchase_token) for row in rows]
    if not tokens:
        return
    client = GooglePlayClient()
    for token in tokens:
        await client.cancel_subscription(token)


async def _complete_transfer(transfer_id: UUID) -> None:
    async with AsyncSessionLocal.begin() as session:
        transfer = await session.scalar(
            select(OrganizationOwnershipTransfer)
            .where(OrganizationOwnershipTransfer.id == transfer_id)
            .with_for_update()
        )
        if transfer is None or transfer.status != "processing":
            return
        organization = await session.scalar(
            select(Organization)
            .where(Organization.id == transfer.organization_id)
            .with_for_update()
        )
        if organization is None or organization.owner_user_id != transfer.requested_by_user_id:
            transfer.status = "failed"
            transfer.last_error = "Organization ownership changed before transfer completed"
            return
        target_membership = await session.scalar(
            select(ShopMembership)
            .join(Shop, Shop.id == ShopMembership.shop_id)
            .where(
                Shop.organization_id == organization.id,
                ShopMembership.user_id == transfer.target_user_id,
                ShopMembership.is_active.is_(True),
            )
            .limit(1)
        )
        if target_membership is None:
            transfer.status = "failed"
            transfer.last_error = "Target is no longer an active organization member"
            return
        other_owned = await session.scalar(
            select(Organization.id).where(
                Organization.owner_user_id == transfer.target_user_id,
                Organization.id != organization.id,
            )
        )
        if other_owned is not None:
            transfer.status = "failed"
            transfer.last_error = "Target already owns another organization"
            return

        shops = list(
            await session.scalars(
                select(Shop).where(Shop.organization_id == organization.id).with_for_update()
            )
        )
        memberships = list(
            await session.scalars(
                select(ShopMembership)
                .where(ShopMembership.shop_id.in_([shop.id for shop in shops]))
                .with_for_update()
            )
        )
        by_shop_user = {
            (membership.shop_id, membership.user_id): membership for membership in memberships
        }
        for shop in shops:
            former = by_shop_user.get((shop.id, transfer.requested_by_user_id))
            if former is not None and former.role == "OWNER":
                former.role = "ADMIN"
            target = by_shop_user.get((shop.id, transfer.target_user_id))
            if target is None:
                session.add(
                    ShopMembership(
                        shop_id=shop.id,
                        user_id=transfer.target_user_id,
                        role="OWNER",
                    )
                )
            else:
                target.role = "OWNER"
                target.is_active = True
        organization.owner_user_id = transfer.target_user_id
        transfer.status = "completed"
        transfer.completed_at = datetime.now(UTC)
        transfer.last_error = None


async def _retry_or_fail(transfer_id: UUID, error: Exception) -> None:
    LOGGER.exception("Organization ownership transfer failed: %s", transfer_id)
    async with AsyncSessionLocal.begin() as session:
        transfer = await session.scalar(
            select(OrganizationOwnershipTransfer)
            .where(OrganizationOwnershipTransfer.id == transfer_id)
            .with_for_update()
        )
        if transfer is None or transfer.status != "processing":
            return
        transfer.last_error = f"{type(error).__name__}: {error}"[:2000]
        if transfer.attempts >= MAX_TRANSFER_ATTEMPTS:
            transfer.status = "failed"
            return
        transfer.status = "pending"
        transfer.next_attempt_at = datetime.now(UTC) + timedelta(
            minutes=min(60, 2 ** min(transfer.attempts, 6))
        )


async def process_organization_ownership_transfers() -> None:
    transfer_id = await _claim_transfer()
    if transfer_id is None:
        return
    try:
        await _cancel_organization_renewal(transfer_id)
        await _complete_transfer(transfer_id)
    except Exception as error:
        await _retry_or_fail(transfer_id, error)
