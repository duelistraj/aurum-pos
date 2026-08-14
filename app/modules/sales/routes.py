import hashlib
import math
from datetime import datetime
from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import (
    RequireWritableShop,
    ShopContext,
    get_shop_context,
)
from app.modules.sales.models import InvoiceJob, SaleIdempotency
from app.modules.sales.schemas import (
    InvoiceDownloadOut,
    InvoicePageOut,
    InvoicePdfStatus,
    InvoicePendingOut,
    InvoiceSummaryOut,
    SaleCreate,
    SaleOut,
)
from app.modules.sales.service import create_sale, get_sale_by_id, list_invoices
from app.modules.sales.storage import InvoiceStorage, InvoiceStorageError, get_invoice_storage
from app.modules.whatsapp.schemas import (
    WhatsAppDeliveryCreate,
    WhatsAppDeliveryOut,
    WhatsAppDeliveryStatus,
)
from app.modules.whatsapp.service import latest_delivery_by_sale, queue_invoice_delivery

router = APIRouter(prefix="/sales", tags=["Sales"])


@router.post("/", response_model=SaleOut, dependencies=[RequireWritableShop])
async def create(
    data: SaleCreate,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=100)],
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    request_hash = hashlib.sha256(data.model_dump_json(exclude={"invoice_no"}).encode()).hexdigest()
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"{context.shop.id}:{idempotency_key}"},
    )
    existing = await db.scalar(
        select(SaleIdempotency).where(
            SaleIdempotency.shop_id == context.shop.id,
            SaleIdempotency.idempotency_key == idempotency_key,
        )
    )
    if existing:
        if existing.request_hash != request_hash:
            raise HTTPException(status_code=409, detail="Idempotency key was reused")
        sale = await get_sale_by_id(
            db,
            sale_id=existing.sale_id,
            shop_id=context.shop.id,
        )
        if sale is None:
            raise HTTPException(status_code=409, detail="Idempotent sale result is unavailable")
    else:
        sale = await create_sale(db, data, shop_id=context.shop.id)
        db.add(
            SaleIdempotency(
                shop_id=context.shop.id,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                sale_id=sale.id,
            )
        )
    whatsapp_delivery = None
    if data.send_invoice_via_whatsapp:
        whatsapp_delivery = await queue_invoice_delivery(
            db,
            sale=sale,
            organization_id=context.organization.id,
            shop_id=context.shop.id,
            user_id=context.user.id,
            phone=sale.customer_phone,
            source="checkout",
            idempotency_key=("checkout:" + hashlib.sha256(idempotency_key.encode()).hexdigest()),
            confirm_customer_request=True,
        )
    await db.commit()

    return SaleOut(
        id=sale.id,
        invoice_no=sale.invoice_no,
        total_amount=float(sale.total_amount),
        whatsapp_delivery_status=(whatsapp_delivery.status if whatsapp_delivery else None),
    )


@router.get("/idempotency/{idempotency_key}", response_model=SaleOut)
async def get_idempotent_sale(
    idempotency_key: str,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    if not 8 <= len(idempotency_key) <= 100:
        raise HTTPException(status_code=422, detail="Invalid idempotency key")
    existing = await db.scalar(
        select(SaleIdempotency).where(
            SaleIdempotency.shop_id == context.shop.id,
            SaleIdempotency.idempotency_key == idempotency_key,
        )
    )
    if existing is None:
        raise HTTPException(status_code=404, detail="Sale operation does not exist")
    sale = await get_sale_by_id(
        db,
        sale_id=existing.sale_id,
        shop_id=context.shop.id,
    )
    if sale is None:
        raise HTTPException(status_code=404, detail="Sale result does not exist")
    return sale


@router.get(
    "/invoices",
    response_model=InvoicePageOut,
)
async def invoices(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    pdf_status: InvoicePdfStatus | None = Query(None),
    cursor_created_at: datetime | None = Query(None),
    cursor_id: UUID | None = Query(None),
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
) -> InvoicePageOut:
    if (cursor_created_at is None) != (cursor_id is None):
        raise HTTPException(
            status_code=422,
            detail="Both invoice cursor fields are required",
        )
    rows, total, has_more = await list_invoices(
        db,
        shop_id=context.shop.id,
        page=page,
        limit=limit,
        search=search,
        from_date=from_date,
        to_date=to_date,
        pdf_status=pdf_status,
        cursor_created_at=cursor_created_at,
        cursor_id=cursor_id,
    )
    deliveries = await latest_delivery_by_sale(
        db,
        shop_id=context.shop.id,
        sale_ids=[row.id for row in rows],
    )
    last_row = rows[-1] if rows and has_more else None
    return InvoicePageOut(
        invoices=[
            InvoiceSummaryOut(
                sale_id=row.id,
                invoice_no=row.invoice_no,
                created_at=row.created_at,
                customer_name=row.customer_name,
                customer_phone=row.customer_phone,
                total_amount=float(row.total_amount),
                pdf_status=cast(InvoicePdfStatus, row.invoice_pdf_status),
                pdf_generated_at=row.pdf_generated_at,
                whatsapp_delivery_status=(
                    deliveries[row.id].status if row.id in deliveries else None
                ),
                whatsapp_consent_confirmed_at=(
                    deliveries[row.id].consent_confirmed_at if row.id in deliveries else None
                ),
            )
            for row in rows
        ],
        total=total,
        page=page,
        limit=limit,
        pages=math.ceil(total / limit),
        next_cursor_created_at=last_row.created_at if last_row is not None else None,
        next_cursor_id=last_row.id if last_row is not None else None,
    )


@router.get(
    "/{sale_id}/invoice",
    response_model=InvoiceDownloadOut | InvoicePendingOut,
)
async def invoice(
    sale_id: UUID,
    response: Response,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
    storage: InvoiceStorage = Depends(get_invoice_storage),
) -> InvoiceDownloadOut | InvoicePendingOut:
    sale = await get_sale_by_id(
        db,
        sale_id=sale_id,
        shop_id=context.shop.id,
    )
    if sale is None:
        raise HTTPException(status_code=404, detail="Sale does not exist")

    if sale.s3_object_key is None:
        job = await db.scalar(
            select(InvoiceJob).where(
                InvoiceJob.shop_id == context.shop.id,
                InvoiceJob.sale_id == sale.id,
            )
        )
        if job is None:
            db.add(InvoiceJob(shop_id=context.shop.id, sale_id=sale.id))
        elif job.status == "failed":
            job.status = "pending"
            job.attempts = 0
            job.next_attempt_at = None
            job.last_error_code = None
            sale.invoice_pdf_status = "pending"
            sale.invoice_pdf_attempts = 0
            sale.invoice_pdf_next_attempt_at = None
            sale.invoice_pdf_last_error_code = None
        response.status_code = status.HTTP_202_ACCEPTED
        response.headers["Retry-After"] = "2"
        return InvoicePendingOut()

    assert sale.s3_object_key is not None
    try:
        url = await storage.generate_download_url(
            object_key=sale.s3_object_key,
            download_filename=f"{sale.invoice_no}.pdf",
        )
    except InvoiceStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invoice storage is unavailable",
        ) from exc
    return InvoiceDownloadOut(
        url=url,
        expires_in_seconds=storage.expiry_seconds,
    )


@router.get("/{sale_id}/invoice/content")
async def invoice_content(
    sale_id: UUID,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
    storage: InvoiceStorage = Depends(get_invoice_storage),
) -> Response:
    sale = await get_sale_by_id(db, sale_id=sale_id, shop_id=context.shop.id)
    if sale is None:
        raise HTTPException(status_code=404, detail="Sale does not exist")
    if sale.s3_object_key is None or sale.invoice_pdf_status != "ready":
        raise HTTPException(status_code=409, detail="Invoice PDF is not ready")
    try:
        pdf = await storage.read_pdf(
            object_key=sale.s3_object_key,
            expected_checksum_sha256=sale.pdf_checksum_sha256,
        )
    except InvoiceStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invoice storage is unavailable",
        ) from exc
    safe_invoice_no = "".join(
        character if character.isalnum() or character in "._-" else "_"
        for character in sale.invoice_no
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{safe_invoice_no}.pdf"',
            "Cache-Control": "no-store",
        },
    )


@router.post(
    "/{sale_id}/whatsapp-deliveries",
    response_model=WhatsAppDeliveryOut,
    dependencies=[RequireWritableShop],
)
async def send_invoice_to_whatsapp(
    sale_id: UUID,
    data: WhatsAppDeliveryCreate,
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=100),
    ],
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
) -> WhatsAppDeliveryOut:
    sale = await get_sale_by_id(db, sale_id=sale_id, shop_id=context.shop.id)
    if sale is None:
        raise HTTPException(status_code=404, detail="Sale does not exist")
    delivery = await queue_invoice_delivery(
        db,
        sale=sale,
        organization_id=context.organization.id,
        shop_id=context.shop.id,
        user_id=context.user.id,
        phone=data.recipient_phone or sale.customer_phone,
        source="invoice_history",
        idempotency_key=idempotency_key,
        confirm_customer_request=data.confirm_customer_request,
        resend=data.resend,
    )
    await db.commit()
    return WhatsAppDeliveryOut(
        delivery_id=delivery.id,
        status=cast(WhatsAppDeliveryStatus, delivery.status),
        consent_confirmed_at=delivery.consent_confirmed_at,
    )
