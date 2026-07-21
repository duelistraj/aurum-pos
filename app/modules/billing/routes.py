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
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.modules.auth.dependencies import RequireOwner, ShopContext, get_shop_context
from app.modules.billing.google_play import GooglePlayClient
from app.modules.billing.service import verify_play_purchase
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
    _subscription, state = await verify_play_purchase(
        db,
        shop_id=context.shop.id,
        purchase_token=data.purchase_token,
        product_id=data.product_id,
    )
    return PlayPurchaseResponse(
        entitlement=await get_entitlement_response(db, context.shop.id),
        subscription_state=state,
    )


@router.post("/rtdn", status_code=204)
async def receive_rtdn(
    body: dict,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
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
    if await db.scalar(select(BillingEvent.id).where(BillingEvent.provider_event_id == message_id)):
        return None
    payload_bytes = base64.b64decode(encoded_data)
    payload = json.loads(payload_bytes)
    notification = payload.get("subscriptionNotification") or {}
    purchase_token = notification.get("purchaseToken")
    if not purchase_token:
        return None
    token_digest = hashlib.sha256(purchase_token.encode()).hexdigest()
    play = await db.scalar(
        select(PlaySubscription).where(PlaySubscription.purchase_token_hash == token_digest)
    )
    if play is None:
        return None
    await db.execute(
        text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
        {"shop_id": str(play.shop_id)},
    )
    subscription = await db.get(Subscription, play.subscription_id)
    if subscription is None:
        return None
    event = BillingEvent(
        provider_event_id=message_id,
        event_type=str(notification.get("notificationType") or "unknown"),
        payload_digest=hashlib.sha256(payload_bytes).hexdigest(),
    )
    db.add(event)
    await verify_play_purchase(
        db,
        shop_id=play.shop_id,
        purchase_token=purchase_token,
        product_id=settings.google_play_product_id,
        client=GooglePlayClient(),
    )
    event.processed_at = datetime.now(UTC)
    return None
