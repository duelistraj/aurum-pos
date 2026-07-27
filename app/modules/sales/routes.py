import hashlib
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import ShopContext, get_shop_context
from app.modules.sales.models import SaleIdempotency
from app.modules.sales.schemas import InvoiceDownloadOut, SaleCreate, SaleOut
from app.modules.sales.service import create_sale, get_sale_by_id, persist_invoice_pdf
from app.modules.sales.storage import InvoiceStorage, InvoiceStorageError, get_invoice_storage

router = APIRouter(prefix="/sales", tags=["Sales"])
LOGGER = logging.getLogger(__name__)


@router.post("/", response_model=SaleOut)
async def create(
    data: SaleCreate,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=100)],
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
    storage: InvoiceStorage = Depends(get_invoice_storage),
):
    request_hash = hashlib.sha256(data.model_dump_json(exclude={"invoice_no"}).encode()).hexdigest()
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
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
    await db.commit()

    try:
        await persist_invoice_pdf(
            shop_id=context.shop.id,
            sale_id=sale.id,
            storage=storage,
        )
    except Exception:
        LOGGER.exception("Invoice PDF persistence failed for sale %s", sale.id)
    return sale


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


@router.get("/{sale_id}/invoice", response_model=InvoiceDownloadOut)
async def invoice(
    sale_id: UUID,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
    storage: InvoiceStorage = Depends(get_invoice_storage),
) -> InvoiceDownloadOut:
    sale = await get_sale_by_id(
        db,
        sale_id=sale_id,
        shop_id=context.shop.id,
    )
    if sale is None:
        raise HTTPException(status_code=404, detail="Sale does not exist")

    if sale.s3_object_key is None:
        await db.commit()
        try:
            sale = await persist_invoice_pdf(
                shop_id=context.shop.id,
                sale_id=sale.id,
                storage=storage,
            )
        except Exception as exc:
            LOGGER.exception("Invoice PDF retry failed for sale %s", sale_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Invoice storage is unavailable",
            ) from exc
        if sale is None:
            raise HTTPException(status_code=404, detail="Sale does not exist")

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
