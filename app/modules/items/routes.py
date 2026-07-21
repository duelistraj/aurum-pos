import math
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import RequireManager, ShopContext, get_shop_context
from app.modules.items.models import Item
from app.modules.items.pricing import calculate_suggested_price
from app.modules.items.schemas import (
    ItemCreate,
    ItemOut,
    ItemPaginationOut,
    ItemPOS,
    ItemPOSWithPrice,
    ItemUpdate,
)
from app.modules.items.service import (
    create_item,
    delete_item,
    get_item_by_barcode,
    get_item_by_id,
    get_item_for_pos_by_barcode,
    get_items_for_label_printing,
    get_items_summary,
    get_latest_item,
    list_items_paginated,
    update_item,
)
from app.modules.metal_rates.service import get_latest_metal_rate
from app.utils.label import generate_batch_labels_pdf, generate_batch_labels_xlsx

router = APIRouter(prefix="/items", tags=["Items"])


@router.post("/", response_model=ItemOut, dependencies=[RequireManager])
async def create(
    data: ItemCreate,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    return await create_item(db, data, shop_id=context.shop.id)


@router.get("/", response_model=ItemPaginationOut)
async def list_all(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1),
    search: str | None = Query(None),
    category: str | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    items, total = await list_items_paginated(
        db,
        page=page,
        limit=limit,
        search=search,
        category=category,
        status=status,
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": math.ceil(total / limit),
    }


@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db)):
    return await get_items_summary(db)


@router.get("/barcode/{barcode}", response_model=ItemOut)
async def get_by_barcode(
    barcode: str,
    db: AsyncSession = Depends(get_db),
):
    item = await get_item_by_barcode(db, barcode)
    if item is None:
        raise HTTPException(status_code=404, detail="No item found with this barcode")
    return item


@router.get("/latest", response_model=ItemOut)
async def get_latest(db: AsyncSession = Depends(get_db)):
    item = await get_latest_item(db)
    if item is None:
        raise HTTPException(status_code=404, detail="No items found")
    return item


@router.get("/pos/scan/{barcode}", response_model=ItemPOSWithPrice)
async def pos_scan(
    barcode: str,
    db: AsyncSession = Depends(get_db),
):
    item = await get_item_for_pos_by_barcode(db, barcode)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found or is out of stock")

    rate = await get_latest_metal_rate(db, metal=item.metal, purity=float(item.purity))
    if rate is None:
        raise HTTPException(status_code=400, detail="Metal rate not configured for this item")

    pricing = calculate_suggested_price(
        category=item.category,
        net_weight=item.net_weight,
        rate_per_gram=rate.rate_per_gram,
        making_charge=item.making_charge,
    )
    return {
        **ItemPOS.model_validate(item).model_dump(),
        "pricing": pricing,
    }


@router.get("/labels/all")
async def print_labels_for_all_items(
    output_format: str = Query("xlsx", alias="format", pattern="^(xlsx|pdf)$"),
    db: AsyncSession = Depends(get_db),
):
    items = await get_items_for_label_printing(db)
    if not items:
        raise HTTPException(status_code=404, detail="No items available for label printing")

    if output_format == "pdf":
        return StreamingResponse(
            iter([generate_batch_labels_pdf(items)]),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=all-item-labels.pdf"},
        )
    return StreamingResponse(
        iter([generate_batch_labels_xlsx(items)]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=all-item-labels.xlsx"},
    )


@router.post("/labels/batch")
async def print_labels_batch(
    item_ids: list[UUID] = Body(...),
    output_format: str = Query("xlsx", alias="format", pattern="^(xlsx|pdf)$"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Item).where(Item.id.in_(item_ids)))
    items = result.scalars().all()
    if not items:
        raise HTTPException(status_code=404, detail="None of the selected items exist")

    if output_format == "pdf":
        return StreamingResponse(
            iter([generate_batch_labels_pdf(items)]),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=jewellery-labels.pdf"},
        )
    return StreamingResponse(
        iter([generate_batch_labels_xlsx(items)]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=jewellery-labels.xlsx"},
    )


@router.get("/{item_id}", response_model=ItemOut)
async def get_by_id(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    item = await get_item_by_id(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item does not exist")
    return item


@router.patch("/{item_id}", response_model=ItemOut, dependencies=[RequireManager])
async def update(
    item_id: UUID,
    data: ItemUpdate,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await update_item(db, item_id, data, shop_id=context.shop.id)
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "does not exist" in message else 400
        raise HTTPException(status_code=status_code, detail=message) from exc


@router.delete("/{item_id}", status_code=204, dependencies=[RequireManager])
async def delete(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await delete_item(db, item_id)
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "does not exist" in message else 400
        raise HTTPException(status_code=status_code, detail=message) from exc
