import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import delete, func, or_, select, text, update

from app.core.database import AsyncSessionLocal
from app.modules.auth.models import AccountDeletionRequest, User
from app.modules.billing.google_play import GooglePlayClient
from app.modules.billing.service import decrypt_purchase_token
from app.modules.sales.models import Sale
from app.modules.sales.storage import get_invoice_storage
from app.modules.shops.models import Shop, ShopMembership
from app.modules.subscriptions.models import PlaySubscription

LOGGER = logging.getLogger("aurum.worker.account_deletion")
DELETION_LEASE = timedelta(hours=2)
INVOICE_DELETE_BATCH_SIZE = 500


@dataclass(frozen=True)
class DeletionClaim:
    request_id: UUID
    lease_token: UUID


@dataclass(frozen=True)
class DeletionTarget:
    user_id: UUID
    delete_owned_shops: bool


async def _claim_account_deletions() -> list[DeletionClaim]:
    async with AsyncSessionLocal.begin() as session:
        now = datetime.now(UTC)
        result = await session.execute(
            select(AccountDeletionRequest)
            .where(
                AccountDeletionRequest.confirmed_at.is_not(None),
                AccountDeletionRequest.cancelled_at.is_(None),
                AccountDeletionRequest.completed_at.is_(None),
                AccountDeletionRequest.execute_after <= now,
                or_(
                    AccountDeletionRequest.cleanup_next_attempt_at.is_(None),
                    AccountDeletionRequest.cleanup_next_attempt_at <= now,
                ),
                or_(
                    AccountDeletionRequest.cleanup_started_at.is_(None),
                    AccountDeletionRequest.cleanup_started_at <= now - DELETION_LEASE,
                ),
            )
            .limit(10)
            .with_for_update(skip_locked=True)
        )
        requests = list(result.scalars())
        for request in requests:
            request.cleanup_started_at = now
            request.cleanup_attempts += 1
            request.cleanup_lease_token = uuid4()
        return [
            DeletionClaim(
                request_id=request.id,
                lease_token=request.cleanup_lease_token,
            )
            for request in requests
            if request.cleanup_lease_token is not None
        ]


async def _claim_owned_shops_for_deletion(target: DeletionTarget) -> list[UUID]:
    async with AsyncSessionLocal.begin() as session:
        memberships = await session.execute(
            select(ShopMembership, Shop)
            .join(Shop, Shop.id == ShopMembership.shop_id)
            .where(
                ShopMembership.user_id == target.user_id,
                ShopMembership.role == "OWNER",
                ShopMembership.is_active.is_(True),
            )
            .with_for_update()
        )
        sole_owned: list[UUID] = []
        for membership, shop in memberships:
            other_owners = await session.scalar(
                select(func.count(ShopMembership.id)).where(
                    ShopMembership.shop_id == membership.shop_id,
                    ShopMembership.user_id != target.user_id,
                    ShopMembership.role == "OWNER",
                    ShopMembership.is_active.is_(True),
                )
            )
            if not other_owners:
                sole_owned.append(membership.shop_id)
                if target.delete_owned_shops:
                    shop.is_active = False
        return sole_owned


async def _renew_deletion_lease(
    request_id: UUID,
    *,
    lease_token: UUID | None = None,
) -> bool:
    async with AsyncSessionLocal.begin() as session:
        conditions = [AccountDeletionRequest.id == request_id]
        if lease_token is not None:
            conditions.append(AccountDeletionRequest.cleanup_lease_token == lease_token)
        request = await session.scalar(
            select(AccountDeletionRequest).where(*conditions).with_for_update()
        )
        if request is not None and request.completed_at is None:
            request.cleanup_started_at = datetime.now(UTC)
            return True
        return False


async def _cleanup_shop_external_data(
    shop_id: UUID,
    *,
    request_id: UUID | None = None,
    lease_token: UUID | None = None,
) -> None:
    async with AsyncSessionLocal.begin() as session:
        play_rows = await session.execute(
            select(PlaySubscription).where(
                PlaySubscription.shop_id == shop_id,
                PlaySubscription.deletion_cancelled_at.is_(None),
            )
        )
        play_targets = [
            (row.subscription_id, decrypt_purchase_token(row.purchase_token))
            for row in play_rows.scalars()
        ]
    if play_targets:
        play_client = GooglePlayClient()
        for subscription_id, purchase_token in play_targets:
            await play_client.cancel_subscription(purchase_token)
            async with AsyncSessionLocal.begin() as session:
                row = await session.get(PlaySubscription, subscription_id)
                if row is not None:
                    row.deletion_cancelled_at = datetime.now(UTC)

    storage = get_invoice_storage()
    while True:
        async with AsyncSessionLocal.begin() as session:
            await session.execute(
                text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
                {"shop_id": str(shop_id)},
            )
            rows = list(
                await session.execute(
                    select(Sale.id, Sale.s3_object_key)
                    .where(
                        Sale.shop_id == shop_id,
                        Sale.s3_object_key.is_not(None),
                    )
                    .order_by(Sale.id)
                    .limit(INVOICE_DELETE_BATCH_SIZE)
                )
            )
        if not rows:
            return
        for index, (_sale_id, object_key) in enumerate(rows):
            if object_key is None:
                continue
            if request_id is not None and index % 50 == 0:
                if not await _renew_deletion_lease(request_id, lease_token=lease_token):
                    raise RuntimeError("Account deletion lease was lost")
            await storage.delete_pdf(object_key=object_key)
        async with AsyncSessionLocal.begin() as session:
            await session.execute(
                text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
                {"shop_id": str(shop_id)},
            )
            await session.execute(
                update(Sale)
                .where(
                    Sale.shop_id == shop_id,
                    or_(
                        *(
                            (Sale.id == sale_id) & (Sale.s3_object_key == object_key)
                            for sale_id, object_key in rows
                        )
                    ),
                )
                .values(s3_object_key=None)
            )


async def _mark_deletion_failure(
    request_id: UUID,
    error_code: str,
    *,
    lease_token: UUID | None = None,
) -> None:
    async with AsyncSessionLocal.begin() as session:
        conditions = [AccountDeletionRequest.id == request_id]
        if lease_token is not None:
            conditions.append(AccountDeletionRequest.cleanup_lease_token == lease_token)
        request = await session.scalar(
            select(AccountDeletionRequest).where(*conditions).with_for_update()
        )
        if request is None:
            return
        request.cleanup_started_at = None
        request.cleanup_lease_token = None
        request.cleanup_last_error_code = error_code[:100]
        request.cleanup_next_attempt_at = datetime.now(UTC) + timedelta(
            minutes=min(12 * 60, 2 ** min(request.cleanup_attempts, 10))
        )


async def _process_account_deletion(
    request_id: UUID,
    *,
    lease_token: UUID | None = None,
) -> None:
    try:
        async with AsyncSessionLocal.begin() as session:
            conditions = [AccountDeletionRequest.id == request_id]
            if lease_token is not None:
                conditions.append(AccountDeletionRequest.cleanup_lease_token == lease_token)
            request = await session.scalar(
                select(AccountDeletionRequest).where(*conditions).with_for_update()
            )
            if (
                request is None
                or request.user_id is None
                or request.completed_at is not None
                or request.cancelled_at is not None
            ):
                return
            target = DeletionTarget(
                user_id=request.user_id,
                delete_owned_shops=request.delete_owned_shops,
            )
        shop_ids = await _claim_owned_shops_for_deletion(target)
        if shop_ids and not target.delete_owned_shops:
            raise RuntimeError("Owned shops must be transferred before account deletion")
        for shop_id in shop_ids:
            if not await _renew_deletion_lease(request_id, lease_token=lease_token):
                raise RuntimeError("Account deletion lease was lost")
            await _cleanup_shop_external_data(
                shop_id,
                request_id=request_id,
                lease_token=lease_token,
            )

        async with AsyncSessionLocal.begin() as session:
            request = await session.scalar(
                select(AccountDeletionRequest)
                .where(
                    AccountDeletionRequest.id == request_id,
                    *(
                        (AccountDeletionRequest.cleanup_lease_token == lease_token,)
                        if lease_token is not None
                        else ()
                    ),
                )
                .with_for_update()
            )
            if (
                request is None
                or request.user_id is None
                or request.completed_at is not None
                or request.cancelled_at is not None
            ):
                return
            for shop_id in shop_ids:
                shop = await session.scalar(
                    select(Shop).where(Shop.id == shop_id).with_for_update()
                )
                owner = await session.scalar(
                    select(ShopMembership)
                    .where(
                        ShopMembership.shop_id == shop_id,
                        ShopMembership.user_id == target.user_id,
                        ShopMembership.role == "OWNER",
                        ShopMembership.is_active.is_(True),
                    )
                    .with_for_update()
                )
                other_owners = await session.scalar(
                    select(func.count(ShopMembership.id)).where(
                        ShopMembership.shop_id == shop_id,
                        ShopMembership.user_id != target.user_id,
                        ShopMembership.role == "OWNER",
                        ShopMembership.is_active.is_(True),
                    )
                )
                if shop is None:
                    continue
                if shop.is_active or owner is None or other_owners:
                    raise RuntimeError("Shop ownership changed during account deletion")
                await session.execute(
                    text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
                    {"shop_id": str(shop_id)},
                )
                current_key = await session.scalar(
                    select(Sale.s3_object_key)
                    .where(
                        Sale.shop_id == shop_id,
                        Sale.s3_object_key.is_not(None),
                    )
                    .with_for_update()
                    .limit(1)
                )
                if current_key is not None:
                    raise RuntimeError("Invoice set changed during account deletion")
                await session.execute(delete(Shop).where(Shop.id == shop_id))
            user = await session.get(User, request.user_id)
            if user is not None:
                await session.delete(user)
                await session.flush()
            request.completed_at = datetime.now(UTC)
            request.cleanup_started_at = None
            request.cleanup_lease_token = None
            request.cleanup_last_error_code = None
            request.cleanup_next_attempt_at = None
    except Exception as exc:
        error_code = type(exc).__name__
        LOGGER.exception(
            "Account deletion cleanup failed for request %s: %s",
            request_id,
            error_code,
        )
        await _mark_deletion_failure(
            request_id,
            error_code,
            lease_token=lease_token,
        )


async def process_account_deletions() -> None:
    claims = await _claim_account_deletions()
    for claim in claims:
        await _process_account_deletion(
            claim.request_id,
            lease_token=claim.lease_token,
        )
