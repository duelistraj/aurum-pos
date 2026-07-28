from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Date, and_, case, cast, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.changelog.models import ChangeLog
from app.modules.items.models import Item, ItemHistory
from app.modules.metal_rates.models import MetalRateHistory
from app.modules.sales.models import Sale, SaleItem

HUNDRED = Decimal("100")
FIXED_MAKING_CATEGORIES = ("ring", "other", "pendant")


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
) -> dict[str, Decimal | int]:
    rates = await _rates_at(db, shop_id=shop_id, timestamp=timestamp)
    if use_current_state:
        inventory_at = (
            select(
                Item.id.label("item_id"),
                Item.category,
                Item.metal,
                Item.purity,
                Item.net_weight,
                Item.making_charge,
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
                ItemHistory.metal,
                ItemHistory.purity,
                ItemHistory.net_weight,
                ItemHistory.making_charge,
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
    metal_value = inventory_at.c.net_weight * effective_rate
    making_value = case(
        (
            func.lower(inventory_at.c.category).in_(FIXED_MAKING_CATEGORIES),
            inventory_at.c.making_charge,
        ),
        else_=inventory_at.c.making_charge * inventory_at.c.net_weight,
    )
    suggested_value = case(
        (func.lower(inventory_at.c.category) == "unique", inventory_at.c.making_charge),
        else_=metal_value + making_value,
    )
    positive_quantity = case(
        (quantity_at_timestamp > 0, quantity_at_timestamp),
        else_=0,
    )
    sold_metal = func.lower(func.coalesce(SaleItem.item_metal, Item.metal))
    sold_statement = (
        select(func.coalesce(func.sum(SaleItem.quantity), 0))
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
        func.coalesce(func.sum(positive_quantity * metal_value), 0),
        func.coalesce(func.sum(positive_quantity * suggested_value), 0),
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
        "sold_count": sold_count,
    }


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
) -> dict[str, Decimal]:
    normalized_metal = func.lower(func.coalesce(SaleItem.item_metal, Item.metal))
    normalized_category = func.lower(func.coalesce(SaleItem.item_category, Item.category))
    group_expression = normalized_metal if metal == "all" else normalized_category
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
            Sale.created_at <= end,
        )
        .group_by(group_expression)
    )
    if metal != "all":
        statement = statement.where(normalized_metal == metal)
    return {str(name): Decimal(amount or 0) for name, amount in await db.execute(statement)}


async def get_dashboard_summary(db: AsyncSession, *, shop_id: UUID) -> dict:
    now = datetime.now(UTC)
    metrics = await _inventory_metrics(
        db,
        shop_id=shop_id,
        timestamp=now,
        metal="all",
        use_current_state=True,
    )
    total_sales_amount = await db.scalar(
        select(func.coalesce(func.sum(Sale.total_amount), 0)).where(Sale.shop_id == shop_id)
    )
    activity_result = await db.execute(
        select(ChangeLog)
        .where(ChangeLog.shop_id == shop_id)
        .order_by(ChangeLog.created_at.desc())
        .limit(5)
    )
    return {
        "inventory_items": metrics["inventory_items"],
        "total_stock_value": float(metrics["total_stock_value"]),
        "Silver_rate_per_10g": float(metrics["silver_rate_10g"]),
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

    raw_categories = await _category_sales(
        db,
        shop_id=shop_id,
        start=from_date,
        end=to_date,
        metal=normalized_metal,
    )
    if normalized_metal == "all":
        categories = {
            f"{name.capitalize()} Jewellery": value
            for name, value in raw_categories.items()
            if name in {"gold", "silver", "platinum"}
        }
    else:
        categories = {name.capitalize(): value for name, value in raw_categories.items()}
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
