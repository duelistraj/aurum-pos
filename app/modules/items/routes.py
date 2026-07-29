import math
from typing import Annotated
from uuid import UUID

import anyio
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import (
    RequireManager,
    RequireWritableShop,
    ShopContext,
    get_shop_context,
)
from app.modules.items.models import Item
from app.modules.items.pricing import lock_price_at_sale
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
from app.modules.metal_rates.service import (
    calculate_effective_rate_per_gram,
    get_latest_metal_rate,
)
from app.utils.label import generate_batch_labels_pdf, generate_batch_labels_xlsx

router = APIRouter(prefix="/items", tags=["Items"])
LABEL_EXPORT_LIMITER = anyio.CapacityLimiter(2)


@router.post(
    "/",
    response_model=ItemOut,
    dependencies=[RequireManager, RequireWritableShop],
)
async def create(
    data: ItemCreate,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await create_item(db, data, shop_id=context.shop.id)
    except IntegrityError as exc:
        if getattr(exc.orig, "constraint_name", None) == "uq_items_shop_barcode":
            raise HTTPException(
                status_code=409,
                detail="An item with this barcode already exists",
            ) from exc
        raise


@router.get("/", response_model=ItemPaginationOut)
async def list_all(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
    category: str | None = Query(None, max_length=20),
    status: str | None = Query(None, max_length=20),
    metal: str | None = Query(None, max_length=50),
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    items, total = await list_items_paginated(
        db,
        shop_id=context.shop.id,
        page=page,
        limit=limit,
        search=search,
        category=category,
        status=status,
        metal=metal,
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": math.ceil(total / limit),
    }


@router.get("/summary")
async def get_summary(
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    return await get_items_summary(db, shop_id=context.shop.id)


@router.get("/barcode/{barcode}", response_model=ItemOut)
async def get_by_barcode(
    barcode: str,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    item = await get_item_by_barcode(db, barcode, shop_id=context.shop.id)
    if item is None:
        raise HTTPException(status_code=404, detail="No item found with this barcode")
    return item


@router.get("/latest", response_model=ItemOut)
async def get_latest(
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    item = await get_latest_item(db, shop_id=context.shop.id)
    if item is None:
        raise HTTPException(status_code=404, detail="No items found")
    return item


@router.get("/pos/scan/{barcode}", response_model=ItemPOSWithPrice)
async def pos_scan(
    barcode: str,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    item = await get_item_for_pos_by_barcode(db, barcode, shop_id=context.shop.id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found or is out of stock")

    base_rate = await get_latest_metal_rate(
        db,
        shop_id=context.shop.id,
        metal=item.metal,
    )
    if base_rate is None:
        raise HTTPException(status_code=400, detail="Metal rate not configured for this item")

    rate_per_gram = calculate_effective_rate_per_gram(
        metal=item.metal,
        purity=item.purity,
        base_rate_per_gram=base_rate.rate_per_gram,
    )

    pricing = lock_price_at_sale(
        metal=item.metal,
        category=item.category,
        purity=item.purity,
        net_weight=item.net_weight,
        rate_per_gram=rate_per_gram,
        making_charge=item.making_charge,
        tax_rate_percent=context.shop.tax_rate_percent,
    )
    pricing["suggested_price"] = pricing["subtotal"]
    return {
        **ItemPOS.model_validate(item).model_dump(),
        "pricing": pricing,
        "tax_rate_percent": float(context.shop.tax_rate_percent),
    }


@router.get("/labels/all", dependencies=[RequireManager])
async def print_labels_for_all_items(
    output_format: str = Query("xlsx", alias="format", pattern="^(xlsx|pdf)$"),
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    items = await get_items_for_label_printing(db, shop_id=context.shop.id)
    if not items:
        raise HTTPException(status_code=404, detail="No items available for label printing")
    if len(items) > 500:
        raise HTTPException(
            status_code=422,
            detail="All-item label exports are limited to 500 items; use a batch export",
        )
    await db.commit()

    if output_format == "pdf":
        document = await anyio.to_thread.run_sync(
            generate_batch_labels_pdf,
            items,
            limiter=LABEL_EXPORT_LIMITER,
        )
        return StreamingResponse(
            iter([document]),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=all-item-labels.pdf"},
        )
    document = await anyio.to_thread.run_sync(
        generate_batch_labels_xlsx,
        items,
        limiter=LABEL_EXPORT_LIMITER,
    )
    return StreamingResponse(
        iter([document]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=all-item-labels.xlsx"},
    )


@router.post("/labels/batch", dependencies=[RequireManager])
async def print_labels_batch(
    item_ids: Annotated[list[UUID], Body(min_length=1, max_length=200)],
    output_format: str = Query("xlsx", alias="format", pattern="^(xlsx|pdf)$"),
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Item).where(
            Item.id.in_(item_ids),
            Item.shop_id == context.shop.id,
            Item.archived_at.is_(None),
        )
    )
    items = result.scalars().all()
    if not items:
        raise HTTPException(status_code=404, detail="None of the selected items exist")
    await db.commit()

    if output_format == "pdf":
        document = await anyio.to_thread.run_sync(
            generate_batch_labels_pdf,
            items,
            limiter=LABEL_EXPORT_LIMITER,
        )
        return StreamingResponse(
            iter([document]),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=jewellery-labels.pdf"},
        )
    document = await anyio.to_thread.run_sync(
        generate_batch_labels_xlsx,
        items,
        limiter=LABEL_EXPORT_LIMITER,
    )
    return StreamingResponse(
        iter([document]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=jewellery-labels.xlsx"},
    )


@router.get("/{item_id}", response_model=ItemOut)
async def get_by_id(
    item_id: UUID,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    item = await get_item_by_id(db, item_id, shop_id=context.shop.id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item does not exist")
    return item


@router.patch(
    "/{item_id}",
    response_model=ItemOut,
    dependencies=[RequireManager, RequireWritableShop],
)
async def update(
    item_id: UUID,
    data: ItemUpdate,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await update_item(db, item_id, data, shop_id=context.shop.id)
    except IntegrityError as exc:
        if getattr(exc.orig, "constraint_name", None) == "uq_items_shop_barcode":
            raise HTTPException(
                status_code=409,
                detail="An item with this barcode already exists",
            ) from exc
        raise
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "does not exist" in message else 400
        raise HTTPException(status_code=status_code, detail=message) from exc


@router.delete(
    "/{item_id}",
    status_code=204,
    dependencies=[RequireManager, RequireWritableShop],
)
async def delete(
    item_id: UUID,
    context: ShopContext = Depends(get_shop_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await delete_item(db, item_id, shop_id=context.shop.id)
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "does not exist" in message else 400
        raise HTTPException(status_code=status_code, detail=message) from exc
