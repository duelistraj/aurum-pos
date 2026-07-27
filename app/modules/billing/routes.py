import base64
import hashlib
import json
from datetime import UTC, datetime

import anyio
from fastapi import APIRouter, Depends, Header, HTTPException
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.modules.auth.dependencies import RequireOwner, ShopContext, get_shop_context
from app.modules.billing.google_play import GooglePlayClient, GooglePlayError
from app.modules.billing.service import apply_play_purchase, fetch_play_purchase
from app.modules.subscriptions.models import BillingEvent, PlaySubscription, Subscription
from app.modules.subscriptions.schemas import PlayPurchaseRequest, PlayPurchaseResponse
from app.modules.subscriptions.service import get_entitlement_response

router = APIRouter(prefix="/billing/google-play", tags=["Billing"])


@router.post("/purchases", response_model=PlayPurchaseResponse, dependencies=[RequireOwner])
async def submit_purchase(
    data: PlayPurchaseRequest,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    shop_id = context.shop.id
    await db.commit()
    purchase, play_client = await fetch_play_purchase(
        shop_id=shop_id,
        purchase_token=data.purchase_token,
        product_id=data.product_id,
    )
    async with AsyncSessionLocal.begin() as session:
        await session.execute(
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(shop_id)},
        )
        _subscription, state, needs_acknowledgement = await apply_play_purchase(
            session,
            shop_id=shop_id,
            purchase_token=data.purchase_token,
            product_id=data.product_id,
            purchase=purchase,
        )
        entitlement = await get_entitlement_response(session, shop_id)
    if needs_acknowledgement:
        try:
            await play_client.acknowledge(data.purchase_token)
        except GooglePlayError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    return PlayPurchaseResponse(
        entitlement=entitlement,
        subscription_state=state,
    )


@router.post("/rtdn", status_code=204)
async def receive_rtdn(
    body: dict,
    authorization: str | None = Header(None),
):
    if settings.env != "local":
        if not (
            settings.google_play_pubsub_audience
            and settings.google_play_pubsub_service_account_email
        ):
            raise HTTPException(status_code=503, detail="Pub/Sub identity is not configured")
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing Pub/Sub identity")
        token = authorization.removeprefix("Bearer ").strip()
        try:
            claims = await anyio.to_thread.run_sync(
                google_id_token.verify_oauth2_token,
                token,
                GoogleRequest(),
                settings.google_play_pubsub_audience,
            )
        except (GoogleAuthError, ValueError) as exc:
            raise HTTPException(status_code=401, detail="Invalid Pub/Sub identity") from exc
        if (
            not claims.get("email_verified", True)
            or claims.get("email") != settings.google_play_pubsub_service_account_email
        ):
            raise HTTPException(status_code=401, detail="Invalid Pub/Sub identity")

    message = body.get("message") or {}
    message_id = str(message.get("messageId") or "")
    encoded_data = message.get("data")
    if not message_id or not encoded_data:
        raise HTTPException(status_code=400, detail="Invalid Pub/Sub message")
    payload_bytes = base64.b64decode(encoded_data)
    payload = json.loads(payload_bytes)
    notification = payload.get("subscriptionNotification") or {}
    purchase_token = notification.get("purchaseToken")
    if not purchase_token:
        return None
    token_digest = hashlib.sha256(purchase_token.encode()).hexdigest()
    async with AsyncSessionLocal.begin() as session:
        await session.execute(
            pg_insert(BillingEvent)
            .values(
                provider_event_id=message_id,
                event_type=str(notification.get("notificationType") or "unknown"),
                payload_digest=hashlib.sha256(payload_bytes).hexdigest(),
            )
            .on_conflict_do_nothing(index_elements=[BillingEvent.provider_event_id])
        )
        event = await session.scalar(
            select(BillingEvent)
            .where(BillingEvent.provider_event_id == message_id)
            .with_for_update()
        )
        if event is not None and event.processed_at is not None:
            return None
        play = await session.scalar(
            select(PlaySubscription).where(PlaySubscription.purchase_token_hash == token_digest)
        )
        if play is None:
            if event is not None:
                event.processed_at = datetime.now(UTC)
            return None
        shop_id = play.shop_id
        subscription_id = play.subscription_id

    purchase, play_client = await fetch_play_purchase(
        shop_id=shop_id,
        purchase_token=purchase_token,
        product_id=settings.google_play_product_id,
        client=GooglePlayClient(),
    )
    async with AsyncSessionLocal.begin() as session:
        await session.execute(
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(shop_id)},
        )
        if await session.get(Subscription, subscription_id) is None:
            return None
        _subscription, _state, needs_acknowledgement = await apply_play_purchase(
            session,
            shop_id=shop_id,
            purchase_token=purchase_token,
            product_id=settings.google_play_product_id,
            purchase=purchase,
        )
    if needs_acknowledgement:
        try:
            await play_client.acknowledge(purchase_token)
        except GooglePlayError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    async with AsyncSessionLocal.begin() as session:
        event = await session.scalar(
            select(BillingEvent)
            .where(BillingEvent.provider_event_id == message_id)
            .with_for_update()
        )
        if event is not None:
            event.processed_at = datetime.now(UTC)
    return None
