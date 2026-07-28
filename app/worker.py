import argparse
import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import delete, or_, select, text, update

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.health import WorkerHeartbeat
from app.core.logging import configure_logging
from app.jobs.account_deletions import process_account_deletions
from app.jobs.emails import process_email_batch
from app.jobs.invoices import process_invoice_jobs
from app.modules.auth.models import (
    AuthRateLimit,
    AuthSession,
    AuthToken,
    GoogleNonce,
)
from app.modules.billing.service import (
    apply_play_purchase,
    decrypt_purchase_token,
    fetch_play_purchase,
)
from app.modules.notifications.models import EmailOutbox
from app.modules.shops.models import ShopInvitation
from app.modules.subscriptions.models import BillingEvent, PlaySubscription

LOGGER = logging.getLogger("aurum.worker")
RECONCILIATION_LEASE = timedelta(minutes=10)


@dataclass(frozen=True)
class PlayTarget:
    subscription_id: UUID
    shop_id: UUID
    purchase_token: str
    product_id: str
    lease_token: UUID


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
            row.verification_lease_token = uuid4()
        return [
            PlayTarget(
                subscription_id=row.subscription_id,
                shop_id=row.shop_id,
                purchase_token=decrypt_purchase_token(row.purchase_token),
                product_id=row.product_id,
                lease_token=row.verification_lease_token,
            )
            for row in rows
            if row.verification_lease_token is not None
        ]


async def _reconcile_play_target(target: PlayTarget) -> None:
    try:
        purchase, _play_client = await fetch_play_purchase(
            shop_id=target.shop_id,
            purchase_token=target.purchase_token,
            product_id=target.product_id,
        )
        async with AsyncSessionLocal.begin() as session:
            await session.execute(
                text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
                {"shop_id": str(target.shop_id)},
            )
            row = await session.scalar(
                select(PlaySubscription)
                .where(
                    PlaySubscription.subscription_id == target.subscription_id,
                    PlaySubscription.verification_lease_token == target.lease_token,
                )
                .with_for_update()
            )
            if row is None:
                return
            await apply_play_purchase(
                session,
                shop_id=target.shop_id,
                purchase_token=target.purchase_token,
                product_id=target.product_id,
                purchase=purchase,
            )
            row.next_verification_at = datetime.now(UTC) + timedelta(hours=1)
            row.verification_lease_until = None
            row.verification_lease_token = None
    except Exception:
        LOGGER.exception("Play reconciliation failed for shop %s", target.shop_id)
        async with AsyncSessionLocal.begin() as session:
            row = await session.scalar(
                select(PlaySubscription)
                .where(
                    PlaySubscription.subscription_id == target.subscription_id,
                    PlaySubscription.verification_lease_token == target.lease_token,
                )
                .with_for_update()
            )
            if row is not None:
                row.next_verification_at = datetime.now(UTC) + timedelta(minutes=10)
                row.verification_lease_until = None
                row.verification_lease_token = None


async def reconcile_play_subscriptions() -> None:
    targets = await _claim_play_reconciliation()
    semaphore = asyncio.Semaphore(settings.worker_reconciliation_concurrency)

    async def reconcile(target: PlayTarget) -> None:
        async with semaphore:
            await _reconcile_play_target(target)

    await asyncio.gather(*(reconcile(target) for target in targets))


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
                or_(
                    (
                        (EmailOutbox.status == "sent")
                        & (EmailOutbox.sent_at < now - timedelta(days=1))
                    ),
                    (
                        (EmailOutbox.status == "failed")
                        & (EmailOutbox.created_at < now - timedelta(days=1))
                    ),
                ),
                or_(
                    EmailOutbox.text_body != "[redacted]",
                    EmailOutbox.html_body != "[redacted]",
                ),
            )
            .values(text_body="[redacted]", html_body="[redacted]", template_data={})
        )
        await session.execute(
            delete(EmailOutbox).where(
                EmailOutbox.status.in_(("sent", "failed")),
                EmailOutbox.created_at < now - timedelta(days=30),
            )
        )
        await session.execute(
            delete(BillingEvent).where(BillingEvent.created_at < now - timedelta(days=90))
        )


async def _record_worker_heartbeat(
    *,
    details: dict[str, bool] | None = None,
) -> None:
    async with AsyncSessionLocal.begin() as session:
        heartbeat = await session.get(WorkerHeartbeat, "primary")
        if heartbeat is None:
            session.add(
                WorkerHeartbeat(
                    worker_name="primary",
                    revision=settings.git_sha,
                    status="running",
                    last_seen_at=datetime.now(UTC),
                    details=details,
                )
            )
        else:
            heartbeat.revision = settings.git_sha
            heartbeat.status = "running"
            heartbeat.last_seen_at = datetime.now(UTC)
            heartbeat.details = details


async def run_once(*, reconcile: bool, cleanup: bool = False) -> None:
    await _record_worker_heartbeat(details={"reconcile": reconcile, "cleanup": cleanup})
    tasks = [
        process_email_batch(),
        process_invoice_jobs(),
        process_account_deletions(),
    ]
    if reconcile:
        tasks.append(reconcile_play_subscriptions())
    if cleanup:
        tasks.append(cleanup_expired_records())
    await asyncio.gather(*tasks)


async def run_forever() -> None:
    cleanup_counter = 0

    async def heartbeat_loop() -> None:
        while True:
            await _record_worker_heartbeat()
            await asyncio.sleep(20)

    heartbeat_task = asyncio.create_task(heartbeat_loop())
    try:
        while True:
            await run_once(reconcile=True, cleanup=cleanup_counter == 0)
            cleanup_counter = (cleanup_counter + 1) % 360
            await asyncio.sleep(10)
    finally:
        heartbeat_task.cancel()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    configure_logging()
    asyncio.run(run_once(reconcile=True, cleanup=True) if args.once else run_forever())


if __name__ == "__main__":
    main()
