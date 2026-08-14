import hashlib
import hmac
from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.modules.auth.dependencies import ShopContext, get_shop_context
from app.modules.whatsapp.models import (
    WhatsAppDeliveryJob,
    WhatsAppIntegrationState,
    WhatsAppInvoiceDelivery,
    WhatsAppRecipientSuppression,
)
from app.modules.whatsapp.schemas import WhatsAppCapabilityOut
from app.modules.whatsapp.service import (
    INTEGRATION_KEY,
    get_capability,
    normalize_whatsapp_phone,
    recipient_hmac,
)

protected_router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])
webhook_router = APIRouter(prefix="/webhooks/whatsapp", tags=["WhatsApp webhooks"])

OPT_OUT_WORDS = frozenset({"stop", "unsubscribe", "cancel", "end", "quit"})
SUPPRESSION_ERROR_CODES = frozenset({"131026", "131050"})
STATUS_ORDER = {
    "pending": 0,
    "processing": 1,
    "accepted": 2,
    "sent": 3,
    "delivered": 4,
    "read": 5,
}


@protected_router.get("/capability", response_model=WhatsAppCapabilityOut)
async def capability(
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
) -> WhatsAppCapabilityOut:
    result = await get_capability(db, organization_id=context.organization.id)
    return WhatsAppCapabilityOut.model_validate(result)


@webhook_router.get("")
async def verify_webhook(
    mode: str | None = Query(default=None, alias="hub.mode"),
    verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    challenge: str | None = Query(default=None, alias="hub.challenge"),
) -> Response:
    if (
        mode != "subscribe"
        or not settings.whatsapp_webhook_verify_token
        or not hmac.compare_digest(verify_token or "", settings.whatsapp_webhook_verify_token)
        or challenge is None
    ):
        raise HTTPException(status_code=403, detail="Webhook verification failed")
    return Response(content=challenge, media_type="text/plain")


def _verify_signature(body: bytes, supplied_signature: str | None) -> None:
    secret = settings.whatsapp_app_secret
    if not secret or not supplied_signature:
        raise HTTPException(status_code=401, detail="Webhook signature is missing")
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, supplied_signature):
        raise HTTPException(status_code=401, detail="Webhook signature is invalid")


def _changes(payload: dict[str, Any]) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    for entry in payload.get("entry") or []:
        if not isinstance(entry, dict):
            continue
        for change in entry.get("changes") or []:
            if isinstance(change, dict):
                changes.append(change)
    return changes


async def _suppress_recipient(
    db: AsyncSession,
    *,
    phone: str,
    reason: str,
) -> None:
    digest = recipient_hmac(normalize_whatsapp_phone(phone))
    suppression = await db.get(WhatsAppRecipientSuppression, digest)
    now = datetime.now(UTC)
    if suppression is None:
        db.add(
            WhatsAppRecipientSuppression(
                recipient_hmac=digest,
                reason=reason,
                suppressed_at=now,
            )
        )
        return
    suppression.reason = reason
    suppression.suppressed_at = now
    suppression.cleared_at = None
    suppression.reconsented_delivery_id = None


async def _record_status(
    db: AsyncSession,
    status_payload: dict[str, Any],
) -> None:
    message_id = str(status_payload.get("id") or "")
    provider_status = str(status_payload.get("status") or "").lower()
    if not message_id or provider_status not in {*STATUS_ORDER, "failed"}:
        return
    job = await db.scalar(
        select(WhatsAppDeliveryJob)
        .where(WhatsAppDeliveryJob.meta_message_id == message_id)
        .with_for_update()
    )
    if job is None:
        opaque_delivery_id = status_payload.get("biz_opaque_callback_data")
        try:
            delivery_id = UUID(str(opaque_delivery_id))
        except (TypeError, ValueError):
            delivery_id = None
        if delivery_id is not None:
            job = await db.scalar(
                select(WhatsAppDeliveryJob)
                .where(WhatsAppDeliveryJob.delivery_id == delivery_id)
                .with_for_update()
            )
    if job is None:
        return
    await db.execute(
        text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
        {"shop_id": str(job.shop_id)},
    )
    delivery = await db.scalar(
        select(WhatsAppInvoiceDelivery)
        .where(
            WhatsAppInvoiceDelivery.id == job.delivery_id,
            WhatsAppInvoiceDelivery.shop_id == job.shop_id,
        )
        .with_for_update()
    )
    if delivery is None:
        return
    current_order = STATUS_ORDER.get(delivery.status, -1)
    incoming_order = STATUS_ORDER.get(provider_status, -1)
    if provider_status == "failed" and delivery.status in {"sent", "delivered", "read"}:
        return
    if provider_status != "failed" and incoming_order < current_order:
        return
    event_time = datetime.now(UTC)
    timestamp = status_payload.get("timestamp")
    if isinstance(timestamp, str) and timestamp.isdigit():
        try:
            event_time = datetime.fromtimestamp(int(timestamp), tz=UTC)
        except (OverflowError, OSError, ValueError):
            pass
    delivery.status = provider_status
    job.status = provider_status
    delivery.meta_message_id = message_id
    job.meta_message_id = message_id
    field_name = f"{provider_status}_at"
    if hasattr(delivery, field_name):
        setattr(delivery, field_name, event_time)
    if provider_status == "failed":
        errors = status_payload.get("errors") or []
        error = errors[0] if errors and isinstance(errors[0], dict) else {}
        error_code = str(error.get("code") or "ProviderFailed")[:100]
        delivery.last_error_code = error_code
        job.last_error_code = error_code
        error_text = " ".join(
            str(error.get(key) or "") for key in ("title", "message", "error_data")
        ).lower()
        if (
            error_code in SUPPRESSION_ERROR_CODES
            or "block" in error_text
            or "opt out" in error_text
            or "opt-out" in error_text
        ):
            recipient_id = status_payload.get("recipient_id")
            if isinstance(recipient_id, str) and recipient_id:
                await _suppress_recipient(
                    db,
                    phone=recipient_id,
                    reason="provider_blocked",
                )


async def _record_template_state(
    db: AsyncSession,
    change: dict[str, Any],
) -> None:
    if change.get("field") != "message_template_status_update":
        return
    value = change.get("value") or {}
    if not isinstance(value, dict):
        return
    template_name = str(value.get("message_template_name") or value.get("name") or "")
    if template_name and template_name != settings.whatsapp_template_name:
        return
    template_state = str(value.get("event") or value.get("status") or "unknown").lower()
    state = await db.get(WhatsAppIntegrationState, INTEGRATION_KEY)
    if state is None:
        state = WhatsAppIntegrationState(integration_key=INTEGRATION_KEY)
        db.add(state)
    state.template_status = template_state[:30]


async def _record_inbound_opt_out(
    db: AsyncSession,
    value: dict[str, Any],
) -> None:
    for message in value.get("messages") or []:
        if not isinstance(message, dict):
            continue
        body = str((message.get("text") or {}).get("body") or "").strip().lower()
        phone = message.get("from")
        if body in OPT_OUT_WORDS and isinstance(phone, str) and phone:
            await _suppress_recipient(db, phone=phone, reason="recipient_opt_out")


@webhook_router.post("")
async def receive_webhook(
    request: Request,
    signature: Annotated[str | None, Header(alias="X-Hub-Signature-256")] = None,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    body = await request.body()
    _verify_signature(body, signature)
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload",
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")
    for change in _changes(payload):
        await _record_template_state(db, change)
        value = change.get("value") or {}
        if not isinstance(value, dict):
            continue
        await _record_inbound_opt_out(db, value)
        for status_payload in value.get("statuses") or []:
            if isinstance(status_payload, dict):
                await _record_status(db, status_payload)
    return {"status": "received"}
