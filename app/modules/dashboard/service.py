from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import TypedDict
from uuid import UUID

from sqlalchemy import Date, and_, case, cast, func, literal, not_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.changelog.models import ChangeLog
from app.core.time import india_day_bounds
from app.modules.changelog.service import get_sold_transaction_history
from app.modules.items.catalog import format_category_name
from app.modules.items.models import Item, ItemHistory
from app.modules.metal_rates.models import MetalRateHistory
from app.modules.sales.models import Sale, SaleItem
from app.modules.shops.models import Shop

HUNDRED = Decimal("100")
METAL_DISPLAY_ORDER = ("gold", "silver", "platinum")
ANALYTICS_MATERIALS = frozenset((*METAL_DISPLAY_ORDER, "stone"))
TOP_SELLING_ITEM_LIMIT = 3


class InventoryMetrics(TypedDict):
    inventory_items: int
    total_stock_value: Decimal
    total_sale_value: Decimal
    silver_rate_10g: Decimal
    sold_count: int
    rate_per_10g_by_metal: dict[str, Decimal]


def _change_percentage(current: Decimal | int, previous: Decimal | int) -> float:
    current_value = float(current)
    previous_value = float(previous)
    if previous_value > 0:
        return ((current_value - previous_value) / previous_value) * 100
    return 100.0 if current_value > 0 else 0.0


async def _rates_at(
    db: AsyncSession,
    *,
    shop_id: UUID,
    timestamp: datetime,
) -> dict[str, Decimal]:
    rows = await db.execute(
        select(MetalRateHistory.metal, MetalRateHistory.rate_per_gram)
        .where(
            MetalRateHistory.shop_id == shop_id,
            MetalRateHistory.effective_from <= timestamp,
            MetalRateHistory.purity == HUNDRED,
        )
        .distinct(MetalRateHistory.metal)
        .order_by(
            MetalRateHistory.metal,
            MetalRateHistory.effective_from.desc(),
            MetalRateHistory.id.desc(),
        )
    )
    return {str(metal).lower(): Decimal(rate) for metal, rate in rows}


async def _inventory_metrics(
    db: AsyncSession,
    *,
    shop_id: UUID,
    timestamp: datetime,
    metal: str,
    use_current_state: bool = False,
) -> InventoryMetrics:
    rates = await _rates_at(db, shop_id=shop_id, timestamp=timestamp)
    if use_current_state:
        inventory_at = (
            select(
                Item.id.label("item_id"),
                Item.category,
                Item.item_type,
                Item.pricing_method,
                Item.stock_mode,
                Item.metal,
                Item.purity,
                Item.net_weight,
                Item.making_charge,
                Item.fixed_rate,
                Item.stock_weight,
                Item.ratti,
                Item.rate_per_ratti,
                Item.quantity,
            )
            .where(
                Item.shop_id == shop_id,
                Item.archived_at.is_(None),
            )
            .subquery()
        )
    else:
        inventory_at = (
            select(
                ItemHistory.item_id,
                ItemHistory.category,
                ItemHistory.item_type,
                ItemHistory.pricing_method,
                ItemHistory.stock_mode,
                ItemHistory.metal,
                ItemHistory.purity,
                ItemHistory.net_weight,
                ItemHistory.making_charge,
                ItemHistory.fixed_rate,
                ItemHistory.stock_weight,
                ItemHistory.ratti,
                ItemHistory.rate_per_ratti,
                ItemHistory.quantity,
            )
            .where(
                ItemHistory.shop_id == shop_id,
                ItemHistory.effective_from <= timestamp,
            )
            .distinct(ItemHistory.item_id)
            .order_by(
                ItemHistory.item_id,
                ItemHistory.effective_from.desc(),
                ItemHistory.id.desc(),
            )
            .subquery()
        )
    quantity_at_timestamp = inventory_at.c.quantity
    normalized_metal = func.lower(inventory_at.c.metal)
    base_rate = (
        case(
            *((normalized_metal == name, rate) for name, rate in rates.items()),
            else_=Decimal(0),
        )
        if rates
        else literal(Decimal(0))
    )
    effective_rate = case(
        (normalized_metal == "silver", base_rate),
        else_=base_rate * inventory_at.c.purity / HUNDRED,
    )
    pricing_weight = case(
        (inventory_at.c.stock_mode == "weight", inventory_at.c.stock_weight),
        else_=inventory_at.c.net_weight,
    )
    metal_value = pricing_weight * effective_rate
    making_value = case(
        (
            inventory_at.c.pricing_method == "fixed_making_charge",
            inventory_at.c.making_charge,
        ),
        else_=inventory_at.c.making_charge * pricing_weight,
    )
    suggested_value = case(
        (
            inventory_at.c.item_type == "stone",
            inventory_at.c.ratti * inventory_at.c.rate_per_ratti,
        ),
        (inventory_at.c.pricing_method == "fixed_rate", inventory_at.c.fixed_rate),
        else_=metal_value + making_value,
    )
    positive_quantity = case(
        (quantity_at_timestamp > 0, quantity_at_timestamp),
        else_=0,
    )
    sold_metal = func.lower(func.coalesce(SaleItem.item_metal, Item.metal))
    sold_stock_mode = func.coalesce(SaleItem.item_stock_mode, Item.stock_mode)
    sold_statement = (
        select(
            func.coalesce(
                func.sum(case((sold_stock_mode != "weight", SaleItem.quantity), else_=0)),
                0,
            )
            + func.count(
                func.distinct(
                    case(
                        (
                            (sold_stock_mode == "weight") & (Item.status == "sold"),
                            SaleItem.item_id,
                        )
                    )
                )
            )
        )
        .select_from(SaleItem)
        .join(
            Sale,
            and_(
                Sale.id == SaleItem.sale_id,
                Sale.shop_id == SaleItem.shop_id,
            ),
        )
        .outerjoin(
            Item,
            and_(
                Item.id == SaleItem.item_id,
                Item.shop_id == SaleItem.shop_id,
            ),
        )
        .where(
            SaleItem.shop_id == shop_id,
            Sale.created_at <= timestamp,
        )
    )
    if metal != "all":
        sold_statement = sold_statement.where(sold_metal == metal)
    statement = select(
        func.coalesce(func.sum(positive_quantity), 0),
        func.coalesce(
            func.sum(
                case(
                    (inventory_at.c.stock_mode == "weight", metal_value),
                    else_=positive_quantity * metal_value,
                )
            ),
            0,
        ),
        func.coalesce(
            func.sum(
                case(
                    (inventory_at.c.stock_mode == "weight", suggested_value),
                    else_=positive_quantity * suggested_value,
                )
            ),
            0,
        ),
        sold_statement.scalar_subquery(),
    ).select_from(inventory_at)
    if metal != "all":
        statement = statement.where(normalized_metal == metal)
    inventory_items, total_stock_value, total_sale_value, sold_count = (
        await db.execute(statement)
    ).one()

    return {
        "inventory_items": int(inventory_items or 0),
        "total_stock_value": Decimal(total_stock_value or 0),
        "total_sale_value": Decimal(total_sale_value or 0),
        "silver_rate_10g": rates.get("silver", Decimal(0)) * 10,
        "sold_count": int(sold_count or 0),
        "rate_per_10g_by_metal": {name: rate * 10 for name, rate in rates.items()},
    }


def _ordered_metal_names(rate_per_10g_by_metal: dict[str, Decimal]) -> list[str]:
    known_names = [name for name in METAL_DISPLAY_ORDER if name in rate_per_10g_by_metal]
    extra_names = sorted(set(rate_per_10g_by_metal).difference(METAL_DISPLAY_ORDER))
    return [*known_names, *extra_names]


def _dashboard_rate_metrics(
    rate_per_10g_by_metal: dict[str, Decimal],
) -> list[dict[str, str | float]]:
    return [
        {
            "metal": name,
            "rate_per_10g": round(float(rate_per_10g_by_metal[name]), 2),
        }
        for name in _ordered_metal_names(rate_per_10g_by_metal)
    ]


def _analytics_rate_metrics(
    current_rate_per_10g_by_metal: dict[str, Decimal],
    previous_rate_per_10g_by_metal: dict[str, Decimal],
    *,
    metal: str,
) -> list[dict[str, str | float]]:
    names = (
        _ordered_metal_names(current_rate_per_10g_by_metal)
        if metal == "all"
        else [metal]
        if metal in current_rate_per_10g_by_metal
        else []
    )
    return [
        {
            "metal": name,
            "rate_per_10g": round(float(current_rate_per_10g_by_metal[name]), 2),
            "change_percentage": round(
                _change_percentage(
                    current_rate_per_10g_by_metal[name],
                    previous_rate_per_10g_by_metal.get(name, Decimal(0)),
                ),
                2,
            ),
        }
        for name in names
    ]


async def _sales_period_totals(
    db: AsyncSession,
    *,
    shop_id: UUID,
    start: datetime,
    end: datetime,
    metal: str,
    previous_start: datetime,
) -> tuple[Decimal, Decimal]:
    if metal == "all":
        amount = Sale.total_amount
        statement = select(
            func.coalesce(
                func.sum(case((Sale.created_at >= start, amount), else_=0)),
                0,
            ),
            func.coalesce(
                func.sum(case((Sale.created_at < start, amount), else_=0)),
                0,
            ),
        ).where(
            Sale.shop_id == shop_id,
            Sale.created_at >= previous_start,
            Sale.created_at <= end,
        )
    else:
        amount = SaleItem.price
        statement = (
            select(
                func.coalesce(
                    func.sum(case((Sale.created_at >= start, amount), else_=0)),
                    0,
                ),
                func.coalesce(
                    func.sum(case((Sale.created_at < start, amount), else_=0)),
                    0,
                ),
            )
            .select_from(SaleItem)
            .join(
                Sale,
                and_(
                    Sale.id == SaleItem.sale_id,
                    Sale.shop_id == SaleItem.shop_id,
                ),
            )
            .outerjoin(
                Item,
                and_(
                    Item.id == SaleItem.item_id,
                    Item.shop_id == SaleItem.shop_id,
                ),
            )
            .where(
                SaleItem.shop_id == shop_id,
                Sale.created_at >= previous_start,
                Sale.created_at <= end,
                func.lower(func.coalesce(SaleItem.item_metal, Item.metal)) == metal,
            )
        )
    current, previous = (await db.execute(statement)).one()
    return Decimal(current or 0), Decimal(previous or 0)


async def _daily_sales(
    db: AsyncSession,
    *,
    shop_id: UUID,
    start: datetime,
    end: datetime,
    metal: str,
) -> dict[date, Decimal]:
    sale_day = cast(Sale.created_at, Date)
    if metal == "all":
        statement = (
            select(sale_day, func.sum(Sale.total_amount))
            .where(
                Sale.shop_id == shop_id,
                Sale.created_at >= start,
                Sale.created_at <= end,
            )
            .group_by(sale_day)
        )
    else:
        statement = (
            select(sale_day, func.sum(SaleItem.price))
            .select_from(SaleItem)
            .join(
                Sale,
                and_(
                    Sale.id == SaleItem.sale_id,
                    Sale.shop_id == SaleItem.shop_id,
                ),
            )
            .outerjoin(
                Item,
                and_(
                    Item.id == SaleItem.item_id,
                    Item.shop_id == SaleItem.shop_id,
                ),
            )
            .where(
                SaleItem.shop_id == shop_id,
                Sale.created_at >= start,
                Sale.created_at <= end,
                func.lower(func.coalesce(SaleItem.item_metal, Item.metal)) == metal,
            )
            .group_by(sale_day)
        )
    return {row_day: Decimal(amount or 0) for row_day, amount in await db.execute(statement)}


async def _category_sales(
    db: AsyncSession,
    *,
    shop_id: UUID,
    start: datetime,
    end: datetime,
    metal: str,
    end_is_exclusive: bool = False,
) -> dict[str, Decimal]:
    normalized_metal = _sale_item_material()
    normalized_category = func.lower(func.coalesce(SaleItem.item_category, Item.category))
    group_expression = normalized_metal if metal == "all" else normalized_category
    end_condition = Sale.created_at < end if end_is_exclusive else Sale.created_at <= end
    statement = (
        select(group_expression, func.coalesce(func.sum(SaleItem.price), 0))
        .select_from(SaleItem)
        .join(
            Sale,
            and_(
                Sale.id == SaleItem.sale_id,
                Sale.shop_id == SaleItem.shop_id,
            ),
        )
        .outerjoin(
            Item,
            and_(
                Item.id == SaleItem.item_id,
                Item.shop_id == SaleItem.shop_id,
            ),
        )
        .where(
            SaleItem.shop_id == shop_id,
            Sale.created_at >= start,
            end_condition,
        )
        .group_by(group_expression)
    )
    if metal != "all":
        statement = statement.where(normalized_metal == metal)
    raw_categories = {
        str(name): Decimal(amount or 0) for name, amount in await db.execute(statement)
    }
    if metal == "all":
        return {
            ("Stones" if name == "stone" else f"{name.capitalize()} Jewellery"): value
            for name, value in raw_categories.items()
            if name in ANALYTICS_MATERIALS
        }
    return {format_category_name(name): value for name, value in raw_categories.items()}


async def get_dashboard_summary(db: AsyncSession, *, shop_id: UUID) -> dict:
    now = datetime.now(UTC)
    metrics = await _inventory_metrics(
        db,
        shop_id=shop_id,
        timestamp=now,
        metal="all",
        use_current_state=True,
    )
    total_sales_amount = await db.scalar(select(Shop.total_sales_amount).where(Shop.id == shop_id))
    activity_result = await db.execute(
        select(ChangeLog)
        .where(
            ChangeLog.shop_id == shop_id,
            not_(and_(ChangeLog.entity == "item", ChangeLog.action == "sold")),
        )
        .order_by(ChangeLog.created_at.desc())
        .limit(3)
    )
    return {
        "inventory_items": metrics["inventory_items"],
        "total_stock_value": float(metrics["total_stock_value"]),
        "Silver_rate_per_10g": float(metrics["silver_rate_10g"]),
        "metal_rates": _dashboard_rate_metrics(metrics["rate_per_10g_by_metal"]),
        "total_sales_amount": float(total_sales_amount or 0),
        "total_sale_value": float(metrics["total_sale_value"]),
        "recent_activity": [
            {
                "id": str(entry.id),
                "entity": entry.entity,
                "action": entry.action,
                "payload": entry.payload,
                "created_at": entry.created_at.isoformat() if entry.created_at else None,
            }
            for entry in activity_result.scalars()
        ],
    }


async def get_cashier_dashboard_summary(db: AsyncSession, *, shop_id: UUID) -> dict:
    _, start, end = india_day_bounds()
    today_sales, invoice_count = (
        await db.execute(
            select(
                func.coalesce(func.sum(Sale.total_amount), 0),
                func.count(Sale.id),
            ).where(
                Sale.shop_id == shop_id,
                Sale.created_at >= start,
                Sale.created_at < end,
            )
        )
    ).one()
    units_sold = await _units_sold(
        db,
        shop_id=shop_id,
        start=start,
        end=end,
        metal="all",
    )
    sold_history = await get_sold_transaction_history(
        db,
        shop_id=shop_id,
        limit=3,
    )
    rates = await _rates_at(db, shop_id=shop_id, timestamp=datetime.now(UTC))
    return {
        "today_sales": round(float(today_sales or 0), 2),
        "invoice_count": int(invoice_count or 0),
        "units_sold": units_sold,
        "recent_sold_activity": sold_history["entries"],
        "metal_rates": [
            {
                "metal": metal,
                "rate_per_10g": round(float(rates.get(metal, Decimal(0)) * 10), 2),
            }
            for metal in METAL_DISPLAY_ORDER
        ],
    }


def _sale_item_material():
    item_metal = func.lower(func.coalesce(SaleItem.item_metal, Item.metal))
    item_type = func.lower(func.coalesce(SaleItem.item_type, Item.item_type))
    return case((item_type == "stone", literal("stone")), else_=item_metal)


def _cashier_item_filter(metal: str):
    return _sale_item_material() == metal


async def _units_sold(
    db: AsyncSession,
    *,
    shop_id: UUID,
    start: datetime,
    end: datetime,
    metal: str,
) -> int:
    stock_mode = func.lower(func.coalesce(SaleItem.item_stock_mode, Item.stock_mode))
    statement = (
        select(
            func.coalesce(
                func.sum(case((stock_mode == "weight", 1), else_=SaleItem.quantity)),
                0,
            )
        )
        .select_from(SaleItem)
        .join(Sale, and_(Sale.id == SaleItem.sale_id, Sale.shop_id == SaleItem.shop_id))
        .outerjoin(Item, and_(Item.id == SaleItem.item_id, Item.shop_id == SaleItem.shop_id))
        .where(
            SaleItem.shop_id == shop_id,
            Sale.created_at >= start,
            Sale.created_at < end,
        )
    )
    if metal != "all":
        statement = statement.where(_cashier_item_filter(metal))
    return int(await db.scalar(statement) or 0)


async def _top_selling_items(
    db: AsyncSession,
    *,
    shop_id: UUID,
    start: datetime,
    end: datetime,
    metal: str,
    end_is_exclusive: bool = False,
) -> list[dict[str, str | float]]:
    stock_mode = func.lower(
        func.coalesce(SaleItem.item_stock_mode, Item.stock_mode, literal("quantity"))
    )
    item_name = func.coalesce(SaleItem.item_name, Item.name, literal("Unknown item"))
    item_sku = func.coalesce(SaleItem.item_sku, Item.sku, literal("Unavailable"))
    sold_amount = case(
        (stock_mode == "weight", func.coalesce(SaleItem.sold_weight, 0)),
        else_=SaleItem.quantity,
    )
    end_condition = Sale.created_at < end if end_is_exclusive else Sale.created_at <= end
    sale_lines_statement = (
        select(
            SaleItem.item_id.label("item_id"),
            stock_mode.label("stock_mode"),
            item_name.label("item_name"),
            item_sku.label("item_sku"),
            SaleItem.price.label("sales_value"),
            sold_amount.label("sold_amount"),
            func.row_number()
            .over(
                partition_by=(SaleItem.item_id, stock_mode),
                order_by=(Sale.created_at.desc(), SaleItem.id.desc()),
            )
            .label("snapshot_rank"),
        )
        .select_from(SaleItem)
        .join(Sale, and_(Sale.id == SaleItem.sale_id, Sale.shop_id == SaleItem.shop_id))
        .outerjoin(Item, and_(Item.id == SaleItem.item_id, Item.shop_id == SaleItem.shop_id))
        .where(
            SaleItem.shop_id == shop_id,
            Sale.created_at >= start,
            end_condition,
        )
    )
    if metal != "all":
        sale_lines_statement = sale_lines_statement.where(_sale_item_material() == metal)
    sale_lines = sale_lines_statement.subquery()
    latest_name = func.max(case((sale_lines.c.snapshot_rank == 1, sale_lines.c.item_name)))
    latest_sku = func.max(case((sale_lines.c.snapshot_rank == 1, sale_lines.c.item_sku)))
    total_sales = func.sum(sale_lines.c.sales_value)
    total_sold = func.sum(sale_lines.c.sold_amount)
    statement = (
        select(
            latest_name,
            latest_sku,
            sale_lines.c.stock_mode,
            total_sales,
            total_sold,
        )
        .group_by(sale_lines.c.item_id, sale_lines.c.stock_mode)
        .order_by(total_sales.desc(), latest_name.asc(), latest_sku.asc())
        .limit(TOP_SELLING_ITEM_LIMIT)
    )
    return [
        {
            "name": str(name),
            "sku": str(sku),
            "sales_value": round(float(sales_value or 0), 2),
            "sold_amount": round(float(total_amount or 0), 3),
            "sold_unit": "gram" if mode == "weight" else "piece",
        }
        for name, sku, mode, sales_value, total_amount in await db.execute(statement)
    ]


async def get_cashier_analytics(
    db: AsyncSession,
    *,
    shop_id: UUID,
    metal: str,
) -> dict:
    local_date, start, end = india_day_bounds()
    local_hour = func.extract("hour", func.timezone("Asia/Kolkata", Sale.created_at))

    if metal == "all":
        sales_statement = select(
            func.coalesce(func.sum(Sale.total_amount), 0),
            func.count(Sale.id),
        ).where(
            Sale.shop_id == shop_id,
            Sale.created_at >= start,
            Sale.created_at < end,
        )
        hourly_statement = (
            select(local_hour, func.coalesce(func.sum(Sale.total_amount), 0))
            .where(
                Sale.shop_id == shop_id,
                Sale.created_at >= start,
                Sale.created_at < end,
            )
            .group_by(local_hour)
        )
    else:
        filter_condition = _cashier_item_filter(metal)
        sales_statement = (
            select(
                func.coalesce(func.sum(SaleItem.price), 0),
                func.count(func.distinct(Sale.id)),
            )
            .select_from(SaleItem)
            .join(Sale, and_(Sale.id == SaleItem.sale_id, Sale.shop_id == SaleItem.shop_id))
            .outerjoin(Item, and_(Item.id == SaleItem.item_id, Item.shop_id == SaleItem.shop_id))
            .where(
                SaleItem.shop_id == shop_id,
                Sale.created_at >= start,
                Sale.created_at < end,
                filter_condition,
            )
        )
        hourly_statement = (
            select(local_hour, func.coalesce(func.sum(SaleItem.price), 0))
            .select_from(SaleItem)
            .join(Sale, and_(Sale.id == SaleItem.sale_id, Sale.shop_id == SaleItem.shop_id))
            .outerjoin(Item, and_(Item.id == SaleItem.item_id, Item.shop_id == SaleItem.shop_id))
            .where(
                SaleItem.shop_id == shop_id,
                Sale.created_at >= start,
                Sale.created_at < end,
                filter_condition,
            )
            .group_by(local_hour)
        )

    total_sales, invoice_count = (await db.execute(sales_statement)).one()

    units_sold = await _units_sold(
        db,
        shop_id=shop_id,
        start=start,
        end=end,
        metal=metal,
    )

    hourly_totals = {
        int(hour): Decimal(amount or 0) for hour, amount in await db.execute(hourly_statement)
    }

    category_sales = await _category_sales(
        db,
        shop_id=shop_id,
        start=start,
        end=end,
        metal=metal,
        end_is_exclusive=True,
    )
    category_total = sum(category_sales.values(), start=Decimal(0))
    categories = sorted(category_sales.items(), key=lambda entry: entry[1], reverse=True)
    top_selling_items = await _top_selling_items(
        db,
        shop_id=shop_id,
        start=start,
        end=end,
        metal=metal,
        end_is_exclusive=True,
    )
    invoice_count_value = int(invoice_count or 0)
    total_sales_value = Decimal(total_sales or 0)
    return {
        "date": local_date.isoformat(),
        "metal": metal,
        "total_sales": round(float(total_sales_value), 2),
        "invoice_count": invoice_count_value,
        "units_sold": units_sold,
        "average_invoice_value": round(
            float(total_sales_value / invoice_count_value) if invoice_count_value else 0,
            2,
        ),
        "sales_by_hour": [
            {"hour": hour, "total_amount": round(float(hourly_totals.get(hour, 0)), 2)}
            for hour in range(24)
        ],
        "sales_by_category": [
            {
                "category": name,
                "sales_value": round(float(value), 2),
                "share": round(float(value / category_total * 100), 1) if category_total else 0,
            }
            for name, value in categories
        ],
        "top_selling_items": top_selling_items,
    }


async def get_dashboard_analytics(
    db: AsyncSession,
    from_date: datetime,
    to_date: datetime,
    metal: str = "all",
    *,
    shop_id: UUID,
) -> dict:
    if from_date.tzinfo is None:
        from_date = from_date.replace(tzinfo=UTC)
    if to_date.tzinfo is None:
        to_date = to_date.replace(tzinfo=UTC)
    normalized_metal = metal.strip().lower()
    duration = to_date - from_date
    previous_start = from_date - duration

    total_sales, previous_sales = await _sales_period_totals(
        db,
        shop_id=shop_id,
        start=from_date,
        end=to_date,
        metal=normalized_metal,
        previous_start=previous_start,
    )
    current_metrics = await _inventory_metrics(
        db,
        shop_id=shop_id,
        timestamp=to_date,
        metal=normalized_metal,
    )
    previous_metrics = await _inventory_metrics(
        db,
        shop_id=shop_id,
        timestamp=from_date,
        metal=normalized_metal,
    )

    totals_by_day = await _daily_sales(
        db,
        shop_id=shop_id,
        start=from_date,
        end=to_date,
        metal=normalized_metal,
    )
    sales_overview = []
    current_day = from_date.date()
    while current_day <= to_date.date():
        sales_overview.append(
            {
                "date": current_day.strftime("%b %d"),
                "total_amount": round(float(totals_by_day.get(current_day, Decimal(0))), 2),
            }
        )
        current_day += timedelta(days=1)

    categories = await _category_sales(
        db,
        shop_id=shop_id,
        start=from_date,
        end=to_date,
        metal=normalized_metal,
    )
    category_total = sum(categories.values(), start=Decimal(0))
    sales_by_category: list[dict[str, str | float]] = [
        {
            "category": name,
            "sales_value": round(float(value), 2),
            "share": round(float(value / category_total * 100), 1) if category_total else 0.0,
        }
        for name, value in categories.items()
    ]
    sales_by_category.sort(
        key=lambda entry: float(entry["sales_value"]),
        reverse=True,
    )
    top_selling_items = await _top_selling_items(
        db,
        shop_id=shop_id,
        start=from_date,
        end=to_date,
        metal=normalized_metal,
    )

    in_stock_count = int(current_metrics["inventory_items"])
    sold_count = int(current_metrics["sold_count"])
    total_count = in_stock_count + sold_count
    inventory_summary = {
        "in_stock_count": in_stock_count,
        "in_stock_percentage": round(in_stock_count / total_count * 100, 1) if total_count else 0.0,
        "sold_count": sold_count,
        "sold_percentage": round(sold_count / total_count * 100, 1) if total_count else 0.0,
        "total_count": total_count,
    }

    return {
        "total_sales": round(float(total_sales), 2),
        "total_sales_change_percentage": round(
            _change_percentage(total_sales, previous_sales),
            2,
        ),
        "total_sale_value": round(float(current_metrics["total_sale_value"]), 2),
        "total_sale_value_change_percentage": round(
            _change_percentage(
                current_metrics["total_sale_value"],
                previous_metrics["total_sale_value"],
            ),
            2,
        ),
        "inventory_items": in_stock_count,
        "inventory_items_change_percentage": round(
            _change_percentage(
                in_stock_count,
                int(previous_metrics["inventory_items"]),
            ),
            2,
        ),
        "silver_rate_10g": round(float(current_metrics["silver_rate_10g"]), 2),
        "silver_rate_change_percentage": round(
            _change_percentage(
                current_metrics["silver_rate_10g"],
                previous_metrics["silver_rate_10g"],
            ),
            2,
        ),
        "metal_rates": _analytics_rate_metrics(
            current_metrics["rate_per_10g_by_metal"],
            previous_metrics["rate_per_10g_by_metal"],
            metal=normalized_metal,
        ),
        "total_stock_value": round(float(current_metrics["total_stock_value"]), 2),
        "total_stock_value_change_percentage": round(
            _change_percentage(
                current_metrics["total_stock_value"],
                previous_metrics["total_stock_value"],
            ),
            2,
        ),
        "sales_overview": sales_overview,
        "sales_by_category": sales_by_category,
        "top_selling_items": top_selling_items,
        "inventory_summary": inventory_summary,
        "sales_trend": {
            "current": {
                "period": f"{from_date:%b %d} - {to_date:%b %d}",
                "sales_value": round(float(total_sales), 2),
            },
            "previous": {
                "period": f"{previous_start:%b %d} - {from_date:%b %d}",
                "sales_value": round(float(previous_sales), 2),
            },
        },
    }
