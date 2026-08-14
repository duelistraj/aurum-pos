import hashlib
import hmac
import re
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.sales.models import Sale
from app.modules.subscriptions.service import resolve_entitlement
from app.modules.whatsapp.models import (
    WhatsAppDeliveryJob,
    WhatsAppIntegrationState,
    WhatsAppInvoiceDelivery,
    WhatsAppRecipientSuppression,
)

CONSENT_COPY_VERSION = "shared_aurum_invoice_v1"
INTEGRATION_KEY = "shared_aurum"
PHONE_SEPARATORS = re.compile(r"[\s().-]+")


def normalize_whatsapp_phone(value: str) -> str:
    normalized = PHONE_SEPARATORS.sub("", value.strip())
    if normalized.startswith("00"):
        normalized = f"+{normalized[2:]}"
    elif normalized.isdigit() and len(normalized) == 10:
        normalized = f"+91{normalized}"
    elif normalized.isdigit():
        normalized = f"+{normalized}"
    if not normalized.startswith("+") or not normalized[1:].isdigit():
        raise HTTPException(status_code=422, detail="Enter a valid WhatsApp phone number")
    digits = normalized[1:]
    if not 8 <= len(digits) <= 15 or digits.startswith("0"):
        raise HTTPException(status_code=422, detail="Enter a valid WhatsApp phone number")
    return normalized


def recipient_hmac(recipient_e164: str) -> str:
    key = settings.whatsapp_recipient_hmac_key
    if not key:
        raise HTTPException(status_code=503, detail="WhatsApp delivery is unavailable")
    return hmac.new(key.encode(), recipient_e164.encode(), hashlib.sha256).hexdigest()


async def template_status(db: AsyncSession) -> str:
    state = await db.get(WhatsAppIntegrationState, INTEGRATION_KEY)
    if state is not None and state.template_status != "unknown":
        return state.template_status
    return settings.whatsapp_template_status.strip().lower()


async def get_capability(
    db: AsyncSession,
    *,
    organization_id: UUID,
) -> dict[str, object]:
    entitlement = await resolve_entitlement(db, organization_id)
    current_template_status = await template_status(db)
    enabled = settings.whatsapp_enabled and settings.is_hosted
    return {
        "enabled": enabled,
        "available": enabled
        and entitlement.plan == "pro"
        and current_template_status == "approved",
        "pro_required": True,
        "sender_name": settings.whatsapp_sender_name,
        "template_status": current_template_status,
    }


async def require_delivery_available(
    db: AsyncSession,
    *,
    organization_id: UUID,
) -> None:
    capability = await get_capability(db, organization_id=organization_id)
    if not capability["enabled"]:
        raise HTTPException(status_code=503, detail="WhatsApp delivery is unavailable")
    if (await resolve_entitlement(db, organization_id)).plan != "pro":
        raise HTTPException(
            status_code=403,
            detail={"code": "PRO_REQUIRED", "message": "WhatsApp invoice delivery requires Pro."},
        )
    if capability["template_status"] != "approved":
        raise HTTPException(
            status_code=503,
            detail="WhatsApp invoice delivery is temporarily unavailable",
        )


async def queue_invoice_delivery(
    db: AsyncSession,
    *,
    sale: Sale,
    organization_id: UUID,
    shop_id: UUID,
    user_id: UUID,
    phone: str,
    source: str,
    idempotency_key: str,
    confirm_customer_request: bool,
    resend: bool = False,
) -> WhatsAppInvoiceDelivery:
    if not confirm_customer_request:
        raise HTTPException(
            status_code=422,
            detail="Confirm that the customer requested WhatsApp invoice delivery",
        )
    await require_delivery_available(db, organization_id=organization_id)
    recipient_e164 = normalize_whatsapp_phone(phone)
    digest = recipient_hmac(recipient_e164)
    existing = await db.scalar(
        select(WhatsAppInvoiceDelivery).where(
            WhatsAppInvoiceDelivery.shop_id == shop_id,
            WhatsAppInvoiceDelivery.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.sale_id != sale.id or existing.recipient_hmac != digest:
            raise HTTPException(status_code=409, detail="Idempotency key was reused")
        return existing
    latest = await db.scalar(
        select(WhatsAppInvoiceDelivery)
        .where(
            WhatsAppInvoiceDelivery.shop_id == shop_id,
            WhatsAppInvoiceDelivery.sale_id == sale.id,
        )
        .order_by(WhatsAppInvoiceDelivery.created_at.desc())
        .limit(1)
    )
    if latest is not None:
        if latest.status in {"pending", "processing"}:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "DELIVERY_ALREADY_PENDING",
                    "message": "This invoice is already queued for WhatsApp delivery.",
                },
            )
        if not resend:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "RESEND_CONFIRMATION_REQUIRED",
                    "message": "Confirm before sending this invoice again.",
                },
            )
    now = datetime.now(UTC)
    delivery = WhatsAppInvoiceDelivery(
        organization_id=organization_id,
        shop_id=shop_id,
        sale_id=sale.id,
        recipient_e164=recipient_e164,
        recipient_hmac=digest,
        source=source,
        idempotency_key=idempotency_key,
        consent_confirmed_by_user_id=user_id,
        consent_confirmed_at=now,
        consent_copy_version=CONSENT_COPY_VERSION,
        status="pending",
    )
    db.add(delivery)
    await db.flush()
    db.add(
        WhatsAppDeliveryJob(
            delivery_id=delivery.id,
            shop_id=shop_id,
            status="pending",
        )
    )
    suppression = await db.get(WhatsAppRecipientSuppression, digest)
    if suppression is not None and suppression.cleared_at is None:
        suppression.cleared_at = now
        suppression.reconsented_delivery_id = delivery.id
    return delivery


async def latest_delivery_by_sale(
    db: AsyncSession,
    *,
    shop_id: UUID,
    sale_ids: list[UUID],
) -> dict[UUID, WhatsAppInvoiceDelivery]:
    if not sale_ids:
        return {}
    rows = list(
        await db.scalars(
            select(WhatsAppInvoiceDelivery)
            .where(
                WhatsAppInvoiceDelivery.shop_id == shop_id,
                WhatsAppInvoiceDelivery.sale_id.in_(sale_ids),
            )
            .order_by(
                WhatsAppInvoiceDelivery.sale_id,
                WhatsAppInvoiceDelivery.created_at.desc(),
            )
        )
    )
    latest_by_sale: dict[UUID, WhatsAppInvoiceDelivery] = {}
    for delivery in rows:
        latest_by_sale.setdefault(delivery.sale_id, delivery)
    return latest_by_sale
