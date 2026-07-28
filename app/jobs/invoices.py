import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import or_, select, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.sales.models import InvoiceJob, Sale
from app.modules.sales.service import persist_invoice_pdf
from app.modules.sales.storage import InvoiceStorage, get_invoice_storage
from app.modules.shops.models import Shop

LOGGER = logging.getLogger("aurum.worker.invoice")
INVOICE_LEASE = timedelta(minutes=10)


@dataclass(frozen=True)
class InvoiceTarget:
    job_id: UUID
    shop_id: UUID
    sale_id: UUID
    lease_token: UUID


async def _claim_invoice_jobs() -> list[InvoiceTarget]:
    async with AsyncSessionLocal.begin() as session:
        now = datetime.now(UTC)
        result = await session.execute(
            select(InvoiceJob)
            .join(Shop, Shop.id == InvoiceJob.shop_id)
            .where(
                Shop.is_active.is_(True),
                or_(
                    (
                        (InvoiceJob.status == "pending")
                        & or_(
                            InvoiceJob.next_attempt_at.is_(None),
                            InvoiceJob.next_attempt_at <= now,
                        )
                    ),
                    ((InvoiceJob.status == "processing") & (InvoiceJob.lease_until < now)),
                ),
            )
            .order_by(InvoiceJob.created_at)
            .limit(settings.worker_invoice_batch_size)
            .with_for_update(skip_locked=True)
        )
        jobs = list(result.scalars())
        for job in jobs:
            job.status = "processing"
            job.lease_until = now + INVOICE_LEASE
            job.lease_token = uuid4()
        return [
            InvoiceTarget(
                job_id=job.id,
                shop_id=job.shop_id,
                sale_id=job.sale_id,
                lease_token=job.lease_token,
            )
            for job in jobs
            if job.lease_token is not None
        ]


async def _finish_invoice_job(
    target: InvoiceTarget,
    *,
    error_code: str | None,
) -> None:
    now = datetime.now(UTC)
    async with AsyncSessionLocal.begin() as session:
        job = await session.scalar(
            select(InvoiceJob)
            .where(
                InvoiceJob.id == target.job_id,
                InvoiceJob.lease_token == target.lease_token,
            )
            .with_for_update()
        )
        if job is None:
            return
        job.lease_until = None
        job.lease_token = None
        if error_code is None:
            job.status = "ready"
            job.last_error_code = None
            return
        job.attempts += 1
        job.last_error_code = error_code[:100]
        if job.attempts >= settings.worker_invoice_max_attempts:
            job.status = "failed"
            job.next_attempt_at = None
        else:
            job.status = "pending"
            job.next_attempt_at = now + timedelta(minutes=min(60, 2**job.attempts))
        status = job.status
        attempts = job.attempts
        next_attempt_at = job.next_attempt_at
        last_error_code = job.last_error_code
    async with AsyncSessionLocal.begin() as session:
        await session.execute(
            text("SELECT set_config('app.current_shop_id', :shop_id, true)"),
            {"shop_id": str(target.shop_id)},
        )
        sale = await session.scalar(
            select(Sale)
            .where(Sale.id == target.sale_id, Sale.shop_id == target.shop_id)
            .with_for_update()
        )
        if sale is not None:
            sale.invoice_pdf_status = "failed" if status == "failed" else "pending"
            sale.invoice_pdf_attempts = attempts
            sale.invoice_pdf_next_attempt_at = next_attempt_at
            sale.invoice_pdf_lease_until = None
            sale.invoice_pdf_last_error_code = last_error_code


async def process_invoice_jobs(*, storage: InvoiceStorage | None = None) -> None:
    targets = await _claim_invoice_jobs()
    invoice_storage = storage or get_invoice_storage()
    semaphore = asyncio.Semaphore(settings.worker_invoice_concurrency)

    async def process(target: InvoiceTarget) -> None:
        error_code: str | None = None
        async with semaphore:
            try:
                await persist_invoice_pdf(
                    shop_id=target.shop_id,
                    sale_id=target.sale_id,
                    storage=invoice_storage,
                )
            except Exception as exc:
                error_code = type(exc).__name__
                LOGGER.exception(
                    "Invoice generation failed for sale %s: %s",
                    target.sale_id,
                    error_code,
                )
            await _finish_invoice_job(target, error_code=error_code)

    await asyncio.gather(*(process(target) for target in targets))
