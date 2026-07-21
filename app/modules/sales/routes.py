import hashlib
import re
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import ShopContext, get_shop_context
from app.modules.sales.invoice import generate_invoice_pdf
from app.modules.sales.models import SaleIdempotency
from app.modules.sales.schemas import SaleCreate, SaleOut
from app.modules.sales.service import create_sale, get_sale_by_id

router = APIRouter(prefix="/sales", tags=["Sales"])


@router.post("/", response_model=SaleOut)
async def create(
    data: SaleCreate,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=100)],
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    request_hash = hashlib.sha256(data.model_dump_json().encode()).hexdigest()
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
        {"key": f"{context.shop.id}:{idempotency_key}"},
    )
    existing = await db.scalar(
        select(SaleIdempotency).where(SaleIdempotency.idempotency_key == idempotency_key)
    )
    if existing:
        if existing.request_hash != request_hash:
            raise HTTPException(status_code=409, detail="Idempotency key was reused")
        sale = await get_sale_by_id(db, existing.sale_id)
        if sale is None:
            raise HTTPException(status_code=409, detail="Idempotent sale result is unavailable")
        return sale
    sale = await create_sale(db, data)
    db.add(
        SaleIdempotency(
            shop_id=context.shop.id,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            sale_id=sale.id,
        )
    )
    return sale


@router.get("/{sale_id}/invoice")
async def invoice(
    sale_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Response:
    sale = await get_sale_by_id(db, sale_id)
    if sale is None:
        raise HTTPException(status_code=404, detail="Sale does not exist")

    filename = re.sub(r"[^A-Za-z0-9._-]", "_", sale.invoice_no)
    return Response(
        content=generate_invoice_pdf(sale),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}.pdf"',
        },
    )
