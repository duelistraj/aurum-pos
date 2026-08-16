import asyncio
import hashlib
import hmac
import json
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
from sqlalchemy import or_, select, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.storefront.models import StorefrontInventoryEvent
from app.modules.storefront.service import expire_held_reservations

LOGGER = logging.getLogger("aurum.worker.storefront")
STOREFRONT_LEASE = timedelta(minutes=10)


@dataclass(frozen=True)
class StorefrontEventTarget:
    event_id: UUID
    lease_token: UUID
    payload: dict[str, object]


def webhook_signature(*, secret: str, timestamp: str, body: bytes) -> str:
    message = timestamp.encode() + b"." + body
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


async def _expire_reservations() -> None:
    if settings.storefront_shop_id is None:
        return
    async with AsyncSessionLocal.begin() as session:
        await session.execute(
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(settings.storefront_shop_id)},
        )
        await expire_held_reservations(session, shop_id=settings.storefront_shop_id)


async def _claim_events() -> list[StorefrontEventTarget]:
    async with AsyncSessionLocal.begin() as session:
        now = datetime.now(UTC)
        events = list(
            await session.scalars(
                select(StorefrontInventoryEvent)
                .where(
                    or_(
                        (
                            (StorefrontInventoryEvent.status == "pending")
                            & or_(
                                StorefrontInventoryEvent.next_attempt_at.is_(None),
                                StorefrontInventoryEvent.next_attempt_at <= now,
                            )
                        ),
                        (
                            (StorefrontInventoryEvent.status == "processing")
                            & (StorefrontInventoryEvent.lease_until < now)
                        ),
                    )
                )
                .order_by(StorefrontInventoryEvent.created_at)
                .limit(settings.worker_storefront_batch_size)
                .with_for_update(skip_locked=True)
            )
        )
        for event in events:
            event.status = "processing"
            event.lease_until = now + STOREFRONT_LEASE
            event.lease_token = uuid4()
        return [
            StorefrontEventTarget(
                event_id=event.id,
                lease_token=event.lease_token,
                payload=event.payload,
            )
            for event in events
            if event.lease_token is not None
        ]


async def _finish_event(
    target: StorefrontEventTarget,
    *,
    error_code: str | None,
    retryable: bool,
) -> None:
    now = datetime.now(UTC)
    async with AsyncSessionLocal.begin() as session:
        event = await session.scalar(
            select(StorefrontInventoryEvent)
            .where(
                StorefrontInventoryEvent.id == target.event_id,
                StorefrontInventoryEvent.lease_token == target.lease_token,
            )
            .with_for_update()
        )
        if event is None:
            return
        event.attempts += 1
        event.lease_until = None
        event.lease_token = None
        event.last_error_code = error_code[:100] if error_code else None
        if error_code is None:
            event.status = "delivered"
            event.delivered_at = now
            event.next_attempt_at = None
        elif retryable and event.attempts < settings.worker_storefront_max_attempts:
            event.status = "pending"
            event.next_attempt_at = now + timedelta(minutes=min(60, 2**event.attempts))
        else:
            event.status = "failed"
            event.next_attempt_at = None


async def _deliver_event(
    target: StorefrontEventTarget,
    *,
    client: httpx.AsyncClient,
) -> None:
    webhook_url = settings.storefront_webhook_url
    key_id = settings.storefront_key_id
    secret = settings.storefront_webhook_hmac_secret
    if not webhook_url or not key_id or not secret:
        return
    body = json.dumps(target.payload, sort_keys=True, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    try:
        response = await client.post(
            webhook_url,
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Aurum-Key-ID": key_id,
                "X-Aurum-Timestamp": timestamp,
                "X-Aurum-Signature": webhook_signature(
                    secret=secret,
                    timestamp=timestamp,
                    body=body,
                ),
            },
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        await _finish_event(
            target,
            error_code=f"HTTP{status_code}",
            retryable=status_code in {408, 425, 429} or status_code >= 500,
        )
        return
    except httpx.HTTPError as exc:
        await _finish_event(
            target,
            error_code=type(exc).__name__,
            retryable=True,
        )
        return
    await _finish_event(target, error_code=None, retryable=False)


async def process_storefront_events(
    *,
    client: httpx.AsyncClient | None = None,
) -> None:
    if not settings.storefront_integration_enabled:
        return
    await _expire_reservations()
    targets = await _claim_events()
    if not targets:
        return
    owns_client = client is None
    webhook_client = client or httpx.AsyncClient(timeout=10)
    semaphore = asyncio.Semaphore(settings.worker_storefront_concurrency)

    async def deliver(target: StorefrontEventTarget) -> None:
        async with semaphore:
            await _deliver_event(target, client=webhook_client)

    try:
        await asyncio.gather(*(deliver(target) for target in targets))
    finally:
        if owns_client:
            await webhook_client.aclose()
