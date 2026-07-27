import argparse
import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from uuid import UUID

import anyio
import boto3
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import delete, func, or_, select, text, update

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.auth.models import (
    AccountDeletionRequest,
    AuthRateLimit,
    AuthSession,
    AuthToken,
    GoogleNonce,
    User,
)
from app.modules.billing.google_play import GooglePlayClient
from app.modules.billing.service import decrypt_purchase_token, verify_play_purchase
from app.modules.notifications.models import EmailOutbox
from app.modules.sales.models import Sale
from app.modules.sales.storage import get_invoice_storage
from app.modules.shops.models import Shop, ShopInvitation, ShopMembership
from app.modules.subscriptions.models import BillingEvent, PlaySubscription

LOGGER = logging.getLogger("aurum.worker")
EMAIL_LEASE = timedelta(minutes=10)
DELETION_LEASE = timedelta(minutes=30)
RECONCILIATION_LEASE = timedelta(minutes=10)


@dataclass(frozen=True)
class EmailMessage:
    id: UUID
    recipient: str
    subject: str
    text_body: str
    attempts: int


@dataclass(frozen=True)
class PlayTarget:
    subscription_id: UUID
    shop_id: UUID
    purchase_token: str
    product_id: str


@dataclass(frozen=True)
class DeletionTarget:
    user_id: UUID
    delete_owned_shops: bool


@lru_cache
def _ses_client():
    return boto3.client("ses", region_name=settings.ses_region)


async def _load_email_message(outbox_id: UUID) -> EmailMessage | None:
    async with AsyncSessionLocal.begin() as session:
        message = await session.get(EmailOutbox, outbox_id)
        if message is None or message.status != "processing":
            return None
        return EmailMessage(
            id=message.id,
            recipient=message.recipient,
            subject=message.subject,
            text_body=message.text_body,
            attempts=message.attempts,
        )


async def _finish_email(
    outbox_id: UUID,
    *,
    error_code: str | None,
) -> None:
    async with AsyncSessionLocal.begin() as session:
        message = await session.scalar(
            select(EmailOutbox).where(EmailOutbox.id == outbox_id).with_for_update()
        )
        if message is None or message.status != "processing":
            return
        now = datetime.now(UTC)
        message.claimed_at = None
        if error_code is None:
            message.status = "sent"
            message.sent_at = now
            message.last_error_code = None
            return
        message.attempts += 1
        message.last_error_code = error_code
        if message.attempts >= settings.worker_email_max_attempts:
            message.status = "failed"
            message.next_attempt_at = None
        else:
            message.status = "pending"
            message.next_attempt_at = now + timedelta(minutes=min(60, 2**message.attempts))


async def deliver_email(outbox_id: UUID) -> None:
    message = await _load_email_message(outbox_id)
    if message is None:
        return
    error_code: str | None = None
    try:
        if settings.env == "local":
            LOGGER.info("Email queued locally: %s", message.subject)
        else:

            def send() -> None:
                _ses_client().send_email(
                    Source=settings.email_from,
                    Destination={"ToAddresses": [message.recipient]},
                    Message={
                        "Subject": {"Data": message.subject},
                        "Body": {"Text": {"Data": message.text_body}},
                    },
                )

            await anyio.to_thread.run_sync(send)
    except Exception as exc:
        if isinstance(exc, ClientError):
            error_code = str(exc.response.get("Error", {}).get("Code", "ClientError"))
        elif isinstance(exc, BotoCoreError):
            error_code = type(exc).__name__
        else:
            error_code = type(exc).__name__
        LOGGER.error("Email delivery failed for outbox %s: %s", message.id, error_code)
    await _finish_email(message.id, error_code=error_code)


async def _claim_email_batch() -> list[UUID]:
    async with AsyncSessionLocal.begin() as session:
        now = datetime.now(UTC)
        result = await session.execute(
            select(EmailOutbox)
            .where(
                or_(
                    (
                        (EmailOutbox.status == "pending")
                        & or_(
                            EmailOutbox.next_attempt_at.is_(None),
                            EmailOutbox.next_attempt_at <= now,
                        )
                    ),
                    (
                        (EmailOutbox.status == "processing")
                        & (EmailOutbox.claimed_at < now - EMAIL_LEASE)
                    ),
                )
            )
            .order_by(EmailOutbox.created_at)
            .limit(20)
            .with_for_update(skip_locked=True)
        )
        messages = list(result.scalars())
        for message in messages:
            message.status = "processing"
            message.claimed_at = now
        return [message.id for message in messages]


async def process_email_batch() -> None:
    ids = await _claim_email_batch()
    semaphore = asyncio.Semaphore(settings.worker_email_concurrency)

    async def deliver(outbox_id: UUID) -> None:
        async with semaphore:
            await deliver_email(outbox_id)

    await asyncio.gather(*(deliver(outbox_id) for outbox_id in ids))


async def _claim_play_reconciliation() -> list[PlayTarget]:
    async with AsyncSessionLocal.begin() as session:
        now = datetime.now(UTC)
        result = await session.execute(
            select(PlaySubscription)
            .where(
                or_(
                    PlaySubscription.next_verification_at.is_(None),
                    PlaySubscription.next_verification_at <= now,
                ),
                or_(
                    PlaySubscription.verification_lease_until.is_(None),
                    PlaySubscription.verification_lease_until <= now,
                ),
            )
            .order_by(PlaySubscription.next_verification_at.asc().nullsfirst())
            .limit(settings.worker_reconciliation_batch_size)
            .with_for_update(skip_locked=True)
        )
        rows = list(result.scalars())
        for row in rows:
            row.verification_lease_until = now + RECONCILIATION_LEASE
        return [
            PlayTarget(
                subscription_id=row.subscription_id,
                shop_id=row.shop_id,
                purchase_token=decrypt_purchase_token(row.purchase_token),
                product_id=row.product_id,
            )
            for row in rows
        ]


async def _reconcile_play_target(target: PlayTarget) -> None:
    try:
        async with AsyncSessionLocal.begin() as session:
            await session.execute(
                text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
                {"shop_id": str(target.shop_id)},
            )
            await verify_play_purchase(
                session,
                shop_id=target.shop_id,
                purchase_token=target.purchase_token,
                product_id=target.product_id,
            )
            row = await session.get(PlaySubscription, target.subscription_id)
            if row is not None:
                row.next_verification_at = datetime.now(UTC) + timedelta(hours=1)
                row.verification_lease_until = None
    except Exception:
        LOGGER.exception("Play reconciliation failed for shop %s", target.shop_id)
        async with AsyncSessionLocal.begin() as session:
            row = await session.get(PlaySubscription, target.subscription_id)
            if row is not None:
                row.next_verification_at = datetime.now(UTC) + timedelta(minutes=10)
                row.verification_lease_until = None


async def reconcile_play_subscriptions() -> None:
    targets = await _claim_play_reconciliation()
    semaphore = asyncio.Semaphore(settings.worker_reconciliation_concurrency)

    async def reconcile(target: PlayTarget) -> None:
        async with semaphore:
            await _reconcile_play_target(target)

    await asyncio.gather(*(reconcile(target) for target in targets))


async def _claim_account_deletions() -> list[UUID]:
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
        return [request.id for request in requests]


async def _sole_owned_shop_ids(target: DeletionTarget) -> list[UUID]:
    if not target.delete_owned_shops:
        return []
    async with AsyncSessionLocal.begin() as session:
        memberships = await session.execute(
            select(ShopMembership).where(
                ShopMembership.user_id == target.user_id,
                ShopMembership.role == "OWNER",
                ShopMembership.is_active.is_(True),
            )
        )
        sole_owned: list[UUID] = []
        for membership in memberships.scalars():
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
        return sole_owned


async def _cleanup_shop_external_data(shop_id: UUID) -> set[str]:
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

    async with AsyncSessionLocal.begin() as session:
        await session.execute(
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(shop_id)},
        )
        result = await session.execute(
            select(Sale.s3_object_key).where(
                Sale.shop_id == shop_id,
                Sale.s3_object_key.is_not(None),
            )
        )
        object_keys = [key for key in result.scalars() if key]
    storage = get_invoice_storage()
    for object_key in object_keys:
        await storage.delete_pdf(object_key=object_key)
    return set(object_keys)


async def _mark_deletion_failure(request_id: UUID, error_code: str) -> None:
    async with AsyncSessionLocal.begin() as session:
        request = await session.get(AccountDeletionRequest, request_id)
        if request is None:
            return
        request.cleanup_started_at = None
        request.cleanup_last_error_code = error_code[:100]
        request.cleanup_next_attempt_at = datetime.now(UTC) + timedelta(
            minutes=min(12 * 60, 2 ** min(request.cleanup_attempts, 10))
        )


async def _process_account_deletion(request_id: UUID) -> None:
    try:
        async with AsyncSessionLocal.begin() as session:
            request = await session.get(AccountDeletionRequest, request_id)
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
        shop_ids = await _sole_owned_shop_ids(target)
        deleted_keys_by_shop = {
            shop_id: await _cleanup_shop_external_data(shop_id) for shop_id in shop_ids
        }

        async with AsyncSessionLocal.begin() as session:
            request = await session.scalar(
                select(AccountDeletionRequest)
                .where(AccountDeletionRequest.id == request_id)
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
                await session.execute(
                    text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
                    {"shop_id": str(shop_id)},
                )
                current_keys = {
                    key
                    for key in (
                        await session.execute(
                            select(Sale.s3_object_key)
                            .where(
                                Sale.shop_id == shop_id,
                                Sale.s3_object_key.is_not(None),
                            )
                            .with_for_update()
                        )
                    ).scalars()
                    if key
                }
                if not current_keys.issubset(deleted_keys_by_shop[shop_id]):
                    raise RuntimeError("Invoice set changed during account deletion")
                await session.execute(delete(Shop).where(Shop.id == shop_id))
            user = await session.get(User, request.user_id)
            if user is not None:
                await session.delete(user)
                await session.flush()
            request.completed_at = datetime.now(UTC)
            request.cleanup_started_at = None
            request.cleanup_last_error_code = None
            request.cleanup_next_attempt_at = None
    except Exception as exc:
        error_code = type(exc).__name__
        LOGGER.exception(
            "Account deletion cleanup failed for request %s: %s",
            request_id,
            error_code,
        )
        await _mark_deletion_failure(request_id, error_code)


async def process_account_deletions() -> None:
    request_ids = await _claim_account_deletions()
    for request_id in request_ids:
        await _process_account_deletion(request_id)


async def cleanup_expired_records() -> None:
    now = datetime.now(UTC)
    async with AsyncSessionLocal.begin() as session:
        await session.execute(
            delete(AuthRateLimit).where(
                AuthRateLimit.window_started_at
                < now - timedelta(seconds=settings.auth_rate_limit_window_seconds * 2)
            )
        )
        await session.execute(
            delete(GoogleNonce).where(GoogleNonce.consumed_at < now - timedelta(days=1))
        )
        await session.execute(
            delete(AuthToken).where(
                or_(
                    AuthToken.expires_at < now - timedelta(days=7),
                    AuthToken.consumed_at < now - timedelta(days=7),
                )
            )
        )
        await session.execute(
            delete(AuthSession).where(
                or_(
                    AuthSession.expires_at < now - timedelta(days=30),
                    AuthSession.revoked_at < now - timedelta(days=30),
                )
            )
        )
        await session.execute(
            delete(ShopInvitation).where(
                or_(
                    ShopInvitation.expires_at < now - timedelta(days=30),
                    ShopInvitation.accepted_at < now - timedelta(days=30),
                )
            )
        )
        await session.execute(
            update(EmailOutbox)
            .where(
                EmailOutbox.status == "sent",
                EmailOutbox.sent_at < now - timedelta(days=1),
                EmailOutbox.text_body != "[redacted]",
            )
            .values(text_body="[redacted]", template_data={})
        )
        await session.execute(
            delete(EmailOutbox).where(
                EmailOutbox.status == "sent",
                EmailOutbox.sent_at < now - timedelta(days=30),
            )
        )
        await session.execute(
            delete(BillingEvent).where(BillingEvent.created_at < now - timedelta(days=90))
        )


async def run_once(*, reconcile: bool) -> None:
    await process_email_batch()
    await process_account_deletions()
    if reconcile:
        await reconcile_play_subscriptions()
        await cleanup_expired_records()


async def run_forever() -> None:
    reconcile_counter = 0
    while True:
        await run_once(reconcile=reconcile_counter == 0)
        reconcile_counter = (reconcile_counter + 1) % 360
        await asyncio.sleep(10)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_once(reconcile=True) if args.once else run_forever())


if __name__ == "__main__":
    main()
