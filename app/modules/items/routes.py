from fastapi import APIRouter, Depends, HTTPException, Query, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.database import get_db
from app.utils.label import generate_batch_labels_pdf, generate_batch_labels_xlsx
from app.modules.items.schemas import ItemCreate, ItemOut, ItemPOS, ItemPOSWithPrice, ItemUpdate, ItemPaginationOut
from app.modules.metal_rates.service import get_latest_metal_rate
from app.modules.items.pricing import calculate_suggested_price
from app.modules.items.service import (
    create_item,
    get_item_by_id,
    get_item_by_barcode,
    get_latest_item,
    list_items,
    get_item_for_pos_by_barcode,
    update_item,
    delete_item,
)


router = APIRouter(prefix="/items", tags=["Items"])


@router.post("/", response_model=ItemOut)
async def create(
    data: ItemCreate,
    db: AsyncSession = Depends(get_db),
):
    return await create_item(db, data)


@router.get("/", response_model=ItemPaginationOut)
async def list_all(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1),
    search: str | None = Query(None),
    category: str | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.items.service import list_items_paginated
    import math

    items, total = await list_items_paginated(
        db,
        page=page,
        limit=limit,
        search=search,
        category=category,
        status=status,
    )
    pages = math.ceil(total / limit) if limit > 0 else 0
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
    }


@router.get("/summary")
async def get_summary(
    db: AsyncSession = Depends(get_db),
):
    from app.modules.items.service import get_items_summary
    return await get_items_summary(db)



@router.get("/barcode/{barcode}", response_model=ItemOut)
async def get_by_barcode(
    barcode: str,
    db: AsyncSession = Depends(get_db),
):
    item = await get_item_by_barcode(db, barcode)
    if not item:
        raise HTTPException(status_code=404, detail="No item found with this barcode")
    return item


@router.get("/latest", response_model=ItemOut)
async def get_latest(db: AsyncSession = Depends(get_db)):
    item = await get_latest_item(db)
    if not item:
        raise HTTPException(status_code=404, detail="No items found")
    return item


@router.get("/{item_id}", response_model=ItemOut)
async def get_by_id(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    item = await get_item_by_id(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item does not exist")
    return item


@router.patch("/{item_id}", response_model=ItemOut)
async def update(
    item_id: UUID,
    data: ItemUpdate,
    db: AsyncSession = Depends(get_db),
):
    try:
        return await update_item(db, item_id, data)
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "does not exist" in message else 400
        raise HTTPException(status_code=status_code, detail=message)


@router.delete("/{item_id}", status_code=204)
async def delete(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    try:
        await delete_item(db, item_id)
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "does not exist" in message else 400
        raise HTTPException(status_code=status_code, detail=message)


@router.get("/pos/scan/{barcode}", response_model=ItemPOSWithPrice)
async def pos_scan(
    barcode: str,
    db: AsyncSession = Depends(get_db),
):
    item = await get_item_for_pos_by_barcode(db, barcode)
    if not item:
        raise HTTPException(
            status_code=404,
            detail="Item not found or is out of stock",
        )

    rate = await get_latest_metal_rate(
        db,
        metal=item.metal,
        purity=float(item.purity),
    )

    if not rate:
        raise HTTPException(
            status_code=400,
            detail="Metal rate not configured for this item",
        )

    pricing = calculate_suggested_price(
        category=item.category,
        net_weight=float(item.net_weight),
        rate_per_gram=float(rate.rate_per_gram),
        making_charge=float(item.making_charge),
    )

    return {
        **ItemPOS.model_validate(item).model_dump(),
        "pricing": pricing,
    }




@router.post("/labels/batch")
async def print_labels_batch(
    item_ids: list[UUID] = Body(...),
    format: str = Query("xlsx", regex="^(xlsx|pdf)$"),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from app.modules.items.models import Item

    stmt = select(Item).where(Item.id.in_(item_ids))
    result = await db.execute(stmt)
    items = result.scalars().all()

    if not items:
        raise HTTPException(status_code=404, detail="None of the selected items exist")

    if format.lower() == "pdf":
        pdf_bytes = generate_batch_labels_pdf(items)
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=jewellery-labels.pdf"
            },
        )

    xlsx_bytes = generate_batch_labels_xlsx(items)

    return StreamingResponse(
        iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=jewellery-labels.xlsx"
        },
    )

@router.get("/labels/all")
async def print_labels_for_all_items(
    format: str = Query("xlsx", regex="^(xlsx|pdf)$"),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.items.service import get_items_for_label_printing

    items = await get_items_for_label_printing(db)

    if not items:
        raise HTTPException(
            status_code=404,
            detail="No items available for label printing",
        )

    if format.lower() == "pdf":
        pdf_bytes = generate_batch_labels_pdf(items)
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=all-item-labels.pdf"
            },
        )

    xlsx_bytes = generate_batch_labels_xlsx(items)

    return StreamingResponse(
        iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=all-item-labels.xlsx"
        },
    )
