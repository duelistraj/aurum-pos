import csv
from datetime import UTC, datetime
from decimal import Decimal
from io import StringIO
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.items.models import Item
from app.modules.items.pricing import lock_price_at_sale
from app.modules.metal_rates.models import MetalRate
from app.modules.metal_rates.service import calculate_effective_rate_per_gram
from app.modules.storefront.service import inventory_states

INVENTORY_EXPORT_FORMAT = "aurum-pos-inventory-csv-v1"
INVENTORY_EXPORT_FIELDS = (
    "export_format",
    "exported_at",
    "shop_id",
    "shop_slug",
    "item_id",
    "sku",
    "barcode",
    "name",
    "category",
    "item_type",
    "metal",
    "purity",
    "pricing_method",
    "stock_mode",
    "net_weight_grams",
    "making_charge",
    "fixed_rate",
    "stock_weight_grams",
    "ratti",
    "rate_per_ratti",
    "on_hand_quantity",
    "reserved_quantity",
    "available_quantity",
    "status",
    "notes",
    "created_at",
    "updated_at",
    "inventory_version",
    "price_state",
    "subtotal",
    "gst_rate_percent",
    "final_unit_price",
)
FORMULA_PREFIXES = ("=", "+", "-", "@")


def _spreadsheet_safe(value: object | None) -> str:
    if value is None:
        return ""
    rendered = str(value)
    return f"'{rendered}" if rendered.startswith(FORMULA_PREFIXES) else rendered


async def _latest_rate_by_metal(
    db: AsyncSession,
    *,
    shop_id: UUID,
) -> dict[str, Decimal]:
    rows = await db.execute(
        select(MetalRate)
        .where(MetalRate.shop_id == shop_id, MetalRate.purity == Decimal("100"))
        .order_by(func.lower(MetalRate.metal), MetalRate.effective_from.desc())
    )
    rate_by_metal: dict[str, Decimal] = {}
    for rate in rows.scalars():
        rate_by_metal.setdefault(rate.metal.casefold(), rate.rate_per_gram)
    return rate_by_metal


def _price_columns(item: Item, *, rate_by_metal: dict[str, Decimal]) -> dict[str, str]:
    rate_per_gram = Decimal(0)
    if item.item_type == "jewellery" and item.pricing_method != "fixed_rate":
        base_rate = rate_by_metal.get(item.metal.casefold())
        if base_rate is None:
            return {
                "price_state": "rate_unavailable",
                "subtotal": "",
                "gst_rate_percent": "",
                "final_unit_price": "",
            }
        rate_per_gram = calculate_effective_rate_per_gram(
            metal=item.metal,
            purity=item.purity,
            base_rate_per_gram=base_rate,
        )
    pricing = lock_price_at_sale(
        metal=item.metal,
        category=item.category,
        item_type=item.item_type,
        pricing_method=item.pricing_method,
        purity=item.purity,
        net_weight=item.net_weight,
        rate_per_gram=rate_per_gram,
        making_charge=item.making_charge,
        fixed_rate=item.fixed_rate,
        ratti=item.ratti,
        rate_per_ratti=item.rate_per_ratti,
    )
    return {
        "price_state": "available",
        "subtotal": str(pricing["subtotal"]),
        "gst_rate_percent": str(pricing["gst_rate_percent"]),
        "final_unit_price": str(pricing["final_price"]),
    }


async def build_inventory_csv(
    db: AsyncSession,
    *,
    shop_id: UUID,
    shop_slug: str,
) -> tuple[bytes, int]:
    items = list(
        await db.scalars(
            select(Item)
            .where(Item.shop_id == shop_id, Item.archived_at.is_(None))
            .order_by(Item.created_at, Item.id)
        )
    )
    state_by_item = {
        state.item_id: state for state in await inventory_states(db, shop_id=shop_id, items=items)
    }
    rate_by_metal = await _latest_rate_by_metal(db, shop_id=shop_id)
    exported_at = datetime.now(UTC).isoformat()
    output = StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=INVENTORY_EXPORT_FIELDS)
    writer.writeheader()
    for item in items:
        state = state_by_item[item.id]
        writer.writerow(
            {
                "export_format": INVENTORY_EXPORT_FORMAT,
                "exported_at": exported_at,
                "shop_id": str(shop_id),
                "shop_slug": _spreadsheet_safe(shop_slug),
                "item_id": str(item.id),
                "sku": _spreadsheet_safe(item.sku),
                "barcode": _spreadsheet_safe(item.barcode),
                "name": _spreadsheet_safe(item.name),
                "category": _spreadsheet_safe(item.category),
                "item_type": item.item_type,
                "metal": _spreadsheet_safe(item.metal),
                "purity": str(item.purity),
                "pricing_method": item.pricing_method,
                "stock_mode": item.stock_mode,
                "net_weight_grams": str(item.net_weight),
                "making_charge": str(item.making_charge),
                "fixed_rate": str(item.fixed_rate),
                "stock_weight_grams": "" if item.stock_weight is None else str(item.stock_weight),
                "ratti": "" if item.ratti is None else str(item.ratti),
                "rate_per_ratti": "" if item.rate_per_ratti is None else str(item.rate_per_ratti),
                "on_hand_quantity": state.on_hand_quantity,
                "reserved_quantity": state.reserved_quantity,
                "available_quantity": state.available_quantity,
                "status": item.status,
                "notes": _spreadsheet_safe(item.notes),
                "created_at": item.created_at.isoformat(),
                "updated_at": item.updated_at.isoformat(),
                "inventory_version": item.inventory_version,
                **_price_columns(item, rate_by_metal=rate_by_metal),
            }
        )
    return ("\ufeff" + output.getvalue()).encode("utf-8"), len(items)
