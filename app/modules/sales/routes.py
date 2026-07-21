import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.sales.invoice import generate_invoice_pdf
from app.modules.sales.schemas import SaleCreate, SaleOut
from app.modules.sales.service import create_sale, get_sale_by_id

router = APIRouter(prefix="/sales", tags=["Sales"])


@router.post("/", response_model=SaleOut)
async def create(
    data: SaleCreate,
    db: AsyncSession = Depends(get_db),
):
    return await create_sale(db, data)


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
