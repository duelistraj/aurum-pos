import argparse
import asyncio
import logging
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import and_, or_, select, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.health import WorkerHeartbeat
from app.core.logging import configure_logging
from app.jobs.account_deletions import process_account_deletions
from app.jobs.emails import process_email_batch
from app.jobs.invoices import process_invoice_jobs
from app.jobs.ownership_transfers import process_organization_ownership_transfers
from app.modules.billing.service import (
    apply_play_purchase,
    decrypt_purchase_token,
    fetch_play_purchase,
    record_play_acknowledgement,
)
from app.modules.subscriptions.models import PlaySubscription

LOGGER = logging.getLogger("aurum.worker")
RECONCILIATION_LEASE = timedelta(minutes=10)
WORKER_INSTANCE_ID = settings.worker_instance_id or socket.gethostname()
WORKER_STARTED_AT = datetime.now(UTC)


@dataclass(frozen=True)
class PlayTarget:
    subscription_id: UUID
    organization_id: UUID
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
                    or_(
                        PlaySubscription.next_verification_at.is_(None),
                        PlaySubscription.next_verification_at <= now,
                    ),
                    and_(
                        PlaySubscription.acknowledgement_pending.is_(True),
                        or_(
                            PlaySubscription.acknowledgement_next_attempt_at.is_(None),
                            PlaySubscription.acknowledgement_next_attempt_at <= now,
                        ),
                    ),
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
                organization_id=row.organization_id,
                purchase_token=decrypt_purchase_token(row.purchase_token),
                product_id=row.product_id,
                lease_token=row.verification_lease_token,
            )
            for row in rows
            if row.verification_lease_token is not None
        ]


async def _reconcile_play_target(target: PlayTarget) -> None:
    needs_acknowledgement = False
    try:
        purchase, play_client = await fetch_play_purchase(
            organization_id=target.organization_id,
            purchase_token=target.purchase_token,
            product_id=target.product_id,
        )
        async with AsyncSessionLocal.begin() as session:
            await session.execute(
                text("SELECT set_config('app.current_organization_id', :organization_id, true)"),
                {"organization_id": str(target.organization_id)},
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
            _subscription, _state, needs_acknowledgement = await apply_play_purchase(
                session,
                organization_id=target.organization_id,
                purchase_token=target.purchase_token,
                product_id=target.product_id,
                purchase=purchase,
            )
            row.next_verification_at = datetime.now(UTC) + timedelta(hours=1)
        if needs_acknowledgement:
            await play_client.acknowledge(target.purchase_token)
        async with AsyncSessionLocal.begin() as session:
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
            if needs_acknowledgement:
                await record_play_acknowledgement(
                    session,
                    purchase_token=target.purchase_token,
                    error=None,
                )
            row.verification_lease_until = None
            row.verification_lease_token = None
    except Exception as exc:
        LOGGER.exception(
            "Play reconciliation failed for organization %s",
            target.organization_id,
        )
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
                if needs_acknowledgement:
                    await record_play_acknowledgement(
                        session,
                        purchase_token=target.purchase_token,
                        error=exc,
                    )
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
    batch_size = 1000
    async with AsyncSessionLocal.begin() as session:
        cleanup_statements = (
            (
                "auth_rate_limits",
                "window_started_at < :cutoff",
                now - timedelta(seconds=settings.auth_rate_limit_window_seconds * 2),
            ),
            ("google_nonces", "consumed_at < :cutoff", now - timedelta(days=1)),
            (
                "auth_tokens",
                "(expires_at < :cutoff OR consumed_at < :cutoff)",
                now - timedelta(days=7),
            ),
            (
                "auth_sessions",
                "(expires_at < :cutoff OR revoked_at < :cutoff)",
                now - timedelta(days=30),
            ),
            (
                "shop_invitations",
                "(expires_at < :cutoff OR accepted_at < :cutoff)",
                now - timedelta(days=30),
            ),
            (
                "email_outbox",
                "status IN ('sent', 'failed') AND created_at < :cutoff",
                now - timedelta(days=30),
            ),
            ("billing_events", "created_at < :cutoff", now - timedelta(days=90)),
        )
        for table_name, predicate, cutoff in cleanup_statements:
            await session.execute(
                text(
                    f"""
                    DELETE FROM {table_name}
                    WHERE ctid IN (
                        SELECT ctid
                        FROM {table_name}
                        WHERE {predicate}
                        LIMIT :batch_size
                    )
                    """
                ),
                {"cutoff": cutoff, "batch_size": batch_size},
            )
        await session.execute(
            text(
                """
                UPDATE email_outbox
                SET text_body = '[redacted]',
                    html_body = '[redacted]',
                    template_data = '{}'::json
                WHERE ctid IN (
                    SELECT ctid
                    FROM email_outbox
                    WHERE (
                        (status = 'sent' AND sent_at < :cutoff)
                        OR (status = 'failed' AND created_at < :cutoff)
                    )
                    AND (
                        text_body <> '[redacted]'
                        OR html_body <> '[redacted]'
                    )
                    LIMIT :batch_size
                )
                """
            ),
            {"cutoff": now - timedelta(days=1), "batch_size": batch_size},
        )


async def _record_worker_heartbeat(
    *,
    details: dict[str, object] | None = None,
) -> None:
    heartbeat_details: dict[str, object] = {
        "started_at": WORKER_STARTED_AT.isoformat(),
        **(details or {}),
    }
    async with AsyncSessionLocal.begin() as session:
        heartbeat = await session.get(WorkerHeartbeat, WORKER_INSTANCE_ID)
        if heartbeat is None:
            session.add(
                WorkerHeartbeat(
                    worker_name=WORKER_INSTANCE_ID,
                    revision=settings.git_sha,
                    status="running",
                    last_seen_at=datetime.now(UTC),
                    details=heartbeat_details,
                )
            )
        else:
            heartbeat.revision = settings.git_sha
            heartbeat.status = "running"
            heartbeat.last_seen_at = datetime.now(UTC)
            heartbeat.details = heartbeat_details


async def run_once(*, reconcile: bool, cleanup: bool = False) -> None:
    await _record_worker_heartbeat(details={"reconcile": reconcile, "cleanup": cleanup})
    tasks = [
        process_email_batch(),
        process_invoice_jobs(),
        process_account_deletions(),
        process_organization_ownership_transfers(),
    ]
    if reconcile:
        tasks.append(reconcile_play_subscriptions())
    if cleanup:
        tasks.append(cleanup_expired_records())
    await asyncio.gather(*tasks)


async def run_forever() -> None:
    async def periodic(
        name: str,
        operation: Callable[[], Awaitable[object]],
        *,
        interval_seconds: int,
    ) -> None:
        while True:
            try:
                await operation()
            except Exception:
                LOGGER.exception("Worker loop failed: %s", name)
            await asyncio.sleep(interval_seconds)

    await asyncio.gather(
        periodic("heartbeat", _record_worker_heartbeat, interval_seconds=20),
        periodic("email", process_email_batch, interval_seconds=2),
        periodic("invoice", process_invoice_jobs, interval_seconds=2),
        periodic("account-deletion", process_account_deletions, interval_seconds=10),
        periodic(
            "ownership-transfer",
            process_organization_ownership_transfers,
            interval_seconds=10,
        ),
        periodic("play-reconciliation", reconcile_play_subscriptions, interval_seconds=30),
        periodic("retention-cleanup", cleanup_expired_records, interval_seconds=3600),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    configure_logging()
    asyncio.run(run_once(reconcile=True, cleanup=True) if args.once else run_forever())


if __name__ == "__main__":
    main()
