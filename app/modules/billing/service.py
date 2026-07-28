from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from cryptography.fernet import Fernet, MultiFernet
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.auth.security import hash_token
from app.modules.billing.google_play import GooglePlayClient, GooglePlayError, parse_google_time
from app.modules.subscriptions.models import PlaySubscription, Subscription

ENTITLED_PLAY_STATES = frozenset(
    {
        "SUBSCRIPTION_STATE_ACTIVE",
        "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
        "SUBSCRIPTION_STATE_CANCELED",
    }
)


def _token_cipher() -> MultiFernet:
    if not settings.billing_token_encryption_key:
        raise HTTPException(status_code=503, detail="Billing token encryption is not configured")
    keys = [settings.billing_token_encryption_key]
    keys.extend(
        key.strip()
        for key in settings.billing_token_encryption_previous_keys.split(",")
        if key.strip()
    )
    return MultiFernet([Fernet(key.encode()) for key in keys])


def _encrypt_token(token: str) -> str:
    return _token_cipher().encrypt(token.encode()).decode()


def decrypt_purchase_token(token: str) -> str:
    try:
        return _token_cipher().decrypt(token.encode()).decode()
    except HTTPException as exc:
        raise RuntimeError("Billing token encryption is not configured") from exc


async def fetch_play_purchase(
    *,
    shop_id: UUID,
    purchase_token: str,
    product_id: str,
    client: GooglePlayClient | None = None,
) -> tuple[dict[str, Any], GooglePlayClient]:
    if product_id != settings.google_play_product_id:
        raise HTTPException(status_code=400, detail="Unknown subscription product")
    play_client = client or GooglePlayClient()
    try:
        purchase = await play_client.get_subscription(purchase_token)
    except GooglePlayError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    line_items = purchase.get("lineItems") or []
    if not any(item.get("productId") == product_id for item in line_items):
        raise HTTPException(status_code=400, detail="Purchase product does not match")
    identifiers = purchase.get("externalAccountIdentifiers") or {}
    if identifiers.get("obfuscatedExternalProfileId") != hash_token(str(shop_id)):
        raise HTTPException(status_code=400, detail="Purchase is not linked to this shop")
    return purchase, play_client


async def verify_play_purchase(
    db: AsyncSession,
    *,
    shop_id: UUID,
    purchase_token: str,
    product_id: str,
    client: GooglePlayClient | None = None,
) -> tuple[Subscription, str]:
    purchase, play_client = await fetch_play_purchase(
        shop_id=shop_id,
        purchase_token=purchase_token,
        product_id=product_id,
        client=client,
    )
    subscription, state, needs_acknowledgement = await apply_play_purchase(
        db,
        shop_id=shop_id,
        purchase_token=purchase_token,
        product_id=product_id,
        purchase=purchase,
    )
    if needs_acknowledgement:
        try:
            await play_client.acknowledge(purchase_token)
        except GooglePlayError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    return subscription, state


async def apply_play_purchase(
    db: AsyncSession,
    *,
    shop_id: UUID,
    purchase_token: str,
    product_id: str,
    purchase: dict[str, Any],
) -> tuple[Subscription, str, bool]:
    line_items = purchase.get("lineItems") or []

    token_digest = hash_token(purchase_token)
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:token_digest, 0))"),
        {"token_digest": token_digest},
    )
    existing_play = await db.scalar(
        select(PlaySubscription).where(PlaySubscription.purchase_token_hash == token_digest)
    )
    subscription = (
        await db.get(Subscription, existing_play.subscription_id) if existing_play else None
    )
    if existing_play and subscription is None:
        raise HTTPException(status_code=409, detail="Purchase token belongs to another shop")
    if subscription and subscription.shop_id != shop_id:
        raise HTTPException(status_code=409, detail="Purchase token belongs to another shop")

    state = str(purchase.get("subscriptionState") or "SUBSCRIPTION_STATE_UNSPECIFIED")
    expiry = max(
        (parse_google_time(item.get("expiryTime")) for item in line_items),
        default=None,
        key=lambda value: value or datetime.min.replace(tzinfo=UTC),
    )
    entitled = state in ENTITLED_PLAY_STATES and (expiry is None or expiry > datetime.now(UTC))
    if subscription is None:
        subscription = Subscription(
            shop_id=shop_id,
            source="play",
            plan="pro",
            status="active" if entitled else "expired",
            starts_at=parse_google_time(purchase.get("startTime")) or datetime.now(UTC),
            expires_at=expiry,
            external_reference=f"play:{token_digest}",
        )
        db.add(subscription)
        await db.flush()
        existing_play = PlaySubscription(
            subscription_id=subscription.id,
            shop_id=shop_id,
            package_name=settings.google_play_package_name,
            product_id=product_id,
            purchase_token=_encrypt_token(purchase_token),
            purchase_token_hash=token_digest,
            state=state,
            last_verified_at=datetime.now(UTC),
        )
        db.add(existing_play)
    else:
        assert existing_play is not None
        subscription.status = "active" if entitled else "expired"
        subscription.expires_at = expiry
        existing_play.purchase_token = _encrypt_token(purchase_token)
        existing_play.state = state
        existing_play.last_verified_at = datetime.now(UTC)
    base_plan = next(
        (
            item.get("offerDetails", {}).get("basePlanId")
            for item in line_items
            if item.get("offerDetails", {}).get("basePlanId")
        ),
        None,
    )
    assert existing_play is not None
    existing_play.base_plan_id = base_plan
    existing_play.auto_renewing = any(
        item.get("autoRenewingPlan", {}).get("autoRenewEnabled") is True for item in line_items
    )

    needs_acknowledgement = purchase.get("acknowledgementState") == "ACKNOWLEDGEMENT_STATE_PENDING"
    existing_play.acknowledgement_pending = needs_acknowledgement
    if needs_acknowledgement:
        existing_play.acknowledgement_next_attempt_at = datetime.now(UTC)
    else:
        existing_play.acknowledgement_next_attempt_at = None
        existing_play.acknowledgement_last_error_code = None
        existing_play.acknowledged_at = existing_play.acknowledged_at or datetime.now(UTC)
    return subscription, state, needs_acknowledgement


async def record_play_acknowledgement(
    db: AsyncSession,
    *,
    purchase_token: str,
    error: Exception | None,
) -> None:
    row = await db.scalar(
        select(PlaySubscription)
        .where(PlaySubscription.purchase_token_hash == hash_token(purchase_token))
        .with_for_update()
    )
    if row is None:
        return
    if error is None:
        row.acknowledgement_pending = False
        row.acknowledgement_next_attempt_at = None
        row.acknowledgement_last_error_code = None
        row.acknowledged_at = datetime.now(UTC)
        return
    row.acknowledgement_pending = True
    row.acknowledgement_attempts += 1
    row.acknowledgement_last_error_code = type(error).__name__[:100]
    row.acknowledgement_next_attempt_at = datetime.now(UTC) + timedelta(
        minutes=min(60, 2 ** min(row.acknowledgement_attempts, 6))
    )
