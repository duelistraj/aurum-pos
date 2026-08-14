import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import or_, select, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.sales.models import Sale
from app.modules.sales.storage import InvoiceStorage, get_invoice_storage
from app.modules.whatsapp.models import (
    WhatsAppDeliveryJob,
    WhatsAppInvoiceDelivery,
    WhatsAppRecipientSuppression,
)
from app.modules.whatsapp.provider import MetaWhatsAppClient, WhatsAppProviderError

LOGGER = logging.getLogger("aurum.worker.whatsapp")
WHATSAPP_LEASE = timedelta(minutes=10)


@dataclass(frozen=True)
class WhatsAppTarget:
    delivery_id: UUID
    shop_id: UUID
    lease_token: UUID


async def _claim_delivery_jobs() -> list[WhatsAppTarget]:
    async with AsyncSessionLocal.begin() as session:
        now = datetime.now(UTC)
        jobs = list(
            await session.scalars(
                select(WhatsAppDeliveryJob)
                .where(
                    or_(
                        (
                            (WhatsAppDeliveryJob.status == "pending")
                            & or_(
                                WhatsAppDeliveryJob.next_attempt_at.is_(None),
                                WhatsAppDeliveryJob.next_attempt_at <= now,
                            )
                        ),
                        (
                            (WhatsAppDeliveryJob.status == "processing")
                            & (WhatsAppDeliveryJob.lease_until < now)
                        ),
                    )
                )
                .order_by(WhatsAppDeliveryJob.created_at)
                .limit(settings.worker_whatsapp_batch_size)
                .with_for_update(skip_locked=True)
            )
        )
        for job in jobs:
            job.status = "processing"
            job.lease_until = now + WHATSAPP_LEASE
            job.lease_token = uuid4()
        return [
            WhatsAppTarget(
                delivery_id=job.delivery_id,
                shop_id=job.shop_id,
                lease_token=job.lease_token,
            )
            for job in jobs
            if job.lease_token is not None
        ]


async def _load_delivery(
    target: WhatsAppTarget,
) -> tuple[WhatsAppInvoiceDelivery, Sale] | None:
    async with AsyncSessionLocal.begin() as session:
        await session.execute(
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(target.shop_id)},
        )
        delivery = await session.scalar(
            select(WhatsAppInvoiceDelivery).where(
                WhatsAppInvoiceDelivery.id == target.delivery_id,
                WhatsAppInvoiceDelivery.shop_id == target.shop_id,
            )
        )
        if delivery is None:
            return None
        sale = await session.scalar(
            select(Sale).where(
                Sale.id == delivery.sale_id,
                Sale.shop_id == target.shop_id,
            )
        )
        if sale is None:
            return None
        return delivery, sale


async def _defer_for_pdf(target: WhatsAppTarget) -> None:
    async with AsyncSessionLocal.begin() as session:
        job = await session.scalar(
            select(WhatsAppDeliveryJob)
            .where(
                WhatsAppDeliveryJob.delivery_id == target.delivery_id,
                WhatsAppDeliveryJob.lease_token == target.lease_token,
            )
            .with_for_update()
        )
        if job is None:
            return
        job.status = "pending"
        job.next_attempt_at = datetime.now(UTC) + timedelta(seconds=5)
        job.lease_until = None
        job.lease_token = None


async def _finish_delivery(
    target: WhatsAppTarget,
    *,
    status: str,
    error_code: str | None = None,
    meta_message_id: str | None = None,
    retryable: bool = False,
) -> None:
    now = datetime.now(UTC)
    async with AsyncSessionLocal.begin() as session:
        job = await session.scalar(
            select(WhatsAppDeliveryJob)
            .where(
                WhatsAppDeliveryJob.delivery_id == target.delivery_id,
                WhatsAppDeliveryJob.lease_token == target.lease_token,
            )
            .with_for_update()
        )
        if job is None:
            return
        job.lease_until = None
        job.lease_token = None
        job.last_error_code = error_code[:100] if error_code else None
        job.meta_message_id = meta_message_id
        job.attempts += 1
        if retryable and job.attempts < settings.worker_whatsapp_max_attempts:
            job.status = "pending"
            job.next_attempt_at = now + timedelta(minutes=min(60, 2**job.attempts))
            delivery_status = "pending"
        else:
            job.status = status
            job.next_attempt_at = None
            delivery_status = status

        await session.execute(
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(target.shop_id)},
        )
        delivery = await session.scalar(
            select(WhatsAppInvoiceDelivery)
            .where(
                WhatsAppInvoiceDelivery.id == target.delivery_id,
                WhatsAppInvoiceDelivery.shop_id == target.shop_id,
            )
            .with_for_update()
        )
        if delivery is None:
            return
        delivery.status = delivery_status
        delivery.attempts = job.attempts
        delivery.next_attempt_at = job.next_attempt_at
        delivery.lease_until = None
        delivery.lease_token = None
        delivery.last_error_code = job.last_error_code
        delivery.meta_message_id = meta_message_id
        if delivery_status == "accepted":
            delivery.accepted_at = now
        elif delivery_status == "failed":
            delivery.failed_at = now


async def _process_target(
    target: WhatsAppTarget,
    *,
    storage: InvoiceStorage,
    provider: MetaWhatsAppClient,
) -> None:
    loaded = await _load_delivery(target)
    if loaded is None:
        await _finish_delivery(target, status="failed", error_code="DeliveryMissing")
        return
    delivery, sale = loaded
    if sale.s3_object_key is None or sale.invoice_pdf_status != "ready":
        if sale.invoice_pdf_status == "failed":
            await _finish_delivery(target, status="failed", error_code="InvoicePdfFailed")
        else:
            await _defer_for_pdf(target)
        return

    async with AsyncSessionLocal.begin() as session:
        suppression = await session.get(WhatsAppRecipientSuppression, delivery.recipient_hmac)
        is_suppressed = suppression is not None and suppression.cleared_at is None
    if is_suppressed:
        await _finish_delivery(target, status="failed", error_code="RecipientSuppressed")
        return

    try:
        pdf = await storage.read_pdf(
            object_key=sale.s3_object_key,
            expected_checksum_sha256=sale.pdf_checksum_sha256,
        )
        filename = f"{sale.invoice_no}.pdf"
        media_id = await provider.upload_invoice(pdf=pdf, filename=filename)
        message_id = await provider.send_invoice_template(
            recipient_e164=delivery.recipient_e164,
            media_id=media_id,
            filename=filename,
            business_name=(sale.seller_name or "Store"),
            invoice_number=sale.invoice_no,
            amount=sale.total_amount,
            delivery_id=str(delivery.id),
        )
    except WhatsAppProviderError as exc:
        await _finish_delivery(
            target,
            status="unknown" if exc.ambiguous else "failed",
            error_code=exc.code,
            retryable=exc.retryable,
        )
        return
    except Exception as exc:
        LOGGER.exception("WhatsApp invoice delivery failed for %s", target.delivery_id)
        await _finish_delivery(
            target,
            status="failed",
            error_code=type(exc).__name__,
            retryable=True,
        )
        return
    await _finish_delivery(
        target,
        status="accepted",
        meta_message_id=message_id,
    )


async def process_whatsapp_deliveries(
    *,
    storage: InvoiceStorage | None = None,
    provider: MetaWhatsAppClient | None = None,
) -> None:
    if not settings.whatsapp_enabled or not settings.is_hosted:
        return
    targets = await _claim_delivery_jobs()
    invoice_storage = storage or get_invoice_storage()
    whatsapp_provider = provider or MetaWhatsAppClient()
    semaphore = asyncio.Semaphore(settings.worker_whatsapp_concurrency)

    async def process(target: WhatsAppTarget) -> None:
        async with semaphore:
            await _process_target(
                target,
                storage=invoice_storage,
                provider=whatsapp_provider,
            )

    await asyncio.gather(*(process(target) for target in targets))
