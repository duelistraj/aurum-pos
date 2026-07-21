from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.changelog.models import ChangeLog
from app.modules.items.models import Item
from app.modules.items.pricing import calculate_suggested_price
from app.modules.metal_rates.models import MetalRate
from app.modules.sales.models import Sale, SaleItem


async def get_dashboard_summary(db: AsyncSession) -> dict:
    total_sales_subquery = select(func.coalesce(func.sum(Sale.total_amount), 0)).scalar_subquery()
    stmt = select(
        func.coalesce(func.sum(Item.quantity), 0),
        func.coalesce(func.sum(Item.net_weight * Item.quantity), 0),
        total_sales_subquery,
    ).where(Item.status == "in_stock")
    inventory_count, total_net_weight, total_sales_amount = (await db.execute(stmt)).one()
    inventory_count = int(inventory_count or 0)
    total_net_weight = Decimal(total_net_weight or 0)
    total_sales_amount = Decimal(total_sales_amount or 0)

    rates_stmt = select(MetalRate).order_by(MetalRate.effective_from.desc())
    rates_result = await db.execute(rates_stmt)
    rate_by_key: dict[tuple[str, Decimal], Decimal] = {}
    for rate in rates_result.scalars():
        rate_by_key.setdefault((rate.metal.lower(), rate.purity), rate.rate_per_gram)

    silver_rate_per_gram = rate_by_key.get(("silver", Decimal("100")), Decimal(0))
    silver_rate_per_10g = silver_rate_per_gram * 10
    total_stock_value = total_net_weight * silver_rate_per_gram

    items_stmt = select(Item).where(Item.status == "in_stock")
    total_sale_value = Decimal(0)
    for item in (await db.execute(items_stmt)).scalars():
        metal_lower = item.metal.lower()
        purity = Decimal("100") if metal_lower == "silver" else item.purity
        pricing = calculate_suggested_price(
            category=item.category,
            net_weight=item.net_weight,
            rate_per_gram=rate_by_key.get((metal_lower, purity), Decimal(0)),
            making_charge=item.making_charge,
        )
        total_sale_value += Decimal(str(pricing["suggested_price"])) * item.quantity

    # Recent changelog entries
    activity_stmt = select(ChangeLog).order_by(ChangeLog.created_at.desc()).limit(5)
    activity_result = await db.execute(activity_stmt)
    recent_activity = activity_result.scalars().all()

    return {
        "inventory_items": inventory_count,
        "total_stock_value": float(total_stock_value),
        "Silver_rate_per_10g": float(silver_rate_per_10g),
        "total_sales_amount": float(total_sales_amount),
        "total_sale_value": float(total_sale_value),
        "recent_activity": [
            {
                "id": str(entry.id),
                "entity": entry.entity,
                "action": entry.action,
                "payload": entry.payload,
                "created_at": entry.created_at.isoformat() if entry.created_at else None,
            }
            for entry in recent_activity
        ],
    }


async def get_dashboard_analytics(
    db: AsyncSession,
    from_date: datetime,
    to_date: datetime,
    metal: str = "all",
) -> dict:
    # Ensure timezone awareness
    if from_date.tzinfo is None:
        from_date = from_date.replace(tzinfo=UTC)
    if to_date.tzinfo is None:
        to_date = to_date.replace(tzinfo=UTC)

    duration = to_date - from_date
    prev_start = from_date - duration
    prev_end = from_date

    # 1. Total Sales (Revenue)
    # Current period sales
    curr_sales_stmt = (
        select(Sale)
        .where(Sale.created_at >= from_date, Sale.created_at <= to_date)
        .options(selectinload(Sale.items).selectinload(SaleItem.item))
    )
    curr_sales_result = await db.execute(curr_sales_stmt)
    current_sales = curr_sales_result.scalars().all()

    if metal.lower() == "all":
        total_sales = sum(float(s.total_amount) for s in current_sales)
    else:
        total_sales = sum(
            float(si.price)
            for s in current_sales
            for si in s.items
            if si.item and si.item.metal.lower() == metal.lower()
        )

    # Previous period sales
    prev_sales_stmt = (
        select(Sale)
        .where(Sale.created_at >= prev_start, Sale.created_at < from_date)
        .options(selectinload(Sale.items).selectinload(SaleItem.item))
    )
    prev_sales_result = await db.execute(prev_sales_stmt)
    prev_sales = prev_sales_result.scalars().all()

    if metal.lower() == "all":
        total_sales_prev = sum(float(s.total_amount) for s in prev_sales)
    else:
        total_sales_prev = sum(
            float(si.price)
            for s in prev_sales
            for si in s.items
            if si.item and si.item.metal.lower() == metal.lower()
        )

    # Sales Change Percentage
    if total_sales_prev > 0:
        total_sales_change_percentage = ((total_sales - total_sales_prev) / total_sales_prev) * 100
    else:
        total_sales_change_percentage = 100.0 if total_sales > 0 else 0.0

    # Helper to calculate metrics at a given timestamp T
    async def get_metrics_at_timestamp(T: datetime):
        # Fetch rates active at or before T
        rates_stmt = (
            select(MetalRate)
            .where(MetalRate.effective_from <= T)
            .order_by(MetalRate.effective_from.desc())
        )
        rates_result = await db.execute(rates_stmt)
        rates_list = rates_result.scalars().all()

        rates_dict = {}
        for r in rates_list:
            key = (r.metal.lower(), float(r.purity))
            if key not in rates_dict:
                rates_dict[key] = float(r.rate_per_gram)

        silver_rate_per_gram = rates_dict.get(("silver", 100.0), 0.0)
        silver_rate_10g = silver_rate_per_gram * 10

        # Reconstruct stock at T
        sold_after_subquery = (
            select(func.coalesce(func.sum(SaleItem.quantity), 0))
            .join(Sale)
            .where(SaleItem.item_id == Item.id, Sale.created_at > T)
            .scalar_subquery()
        )

        stmt = select(Item, sold_after_subquery.label("sold_after")).where(Item.created_at <= T)
        if metal.lower() != "all":
            stmt = stmt.where(Item.metal.ilike(metal))

        items_result = await db.execute(stmt)
        items_at_T = items_result.all()

        inventory_items = 0
        total_stock_value = 0.0
        total_sale_value = 0.0

        for item, sold_after in items_at_T:
            qty_at_T = int(item.quantity) + int(sold_after)
            if qty_at_T <= 0:
                continue

            inventory_items += qty_at_T
            net_weight = float(item.net_weight or 0.0)
            total_stock_value += net_weight * qty_at_T * silver_rate_per_gram

            # Catalog value (suggested price)
            metal_lower = item.metal.lower()
            purity = 100.0 if metal_lower == "silver" else float(item.purity)
            rate_per_gram = rates_dict.get((metal_lower, purity), 0.0)

            category = str(item.category).strip().lower()
            making_charge = float(item.making_charge or 0.0)

            if category == "unique":
                suggested_price = making_charge
            else:
                metal_value = net_weight * rate_per_gram
                if category in {"ring", "other", "pendant"}:
                    making = making_charge
                else:
                    making = making_charge * net_weight
                suggested_price = metal_value + making

            total_sale_value += suggested_price * qty_at_T

        # Get count of items sold on or before T
        sold_stmt = (
            select(func.coalesce(func.sum(SaleItem.quantity), 0))
            .join(Sale)
            .where(Sale.created_at <= T)
        )
        if metal.lower() != "all":
            sold_stmt = sold_stmt.join(Item).where(Item.metal.ilike(metal))

        sold_count = int((await db.execute(sold_stmt)).scalar_one() or 0)

        return {
            "inventory_items": inventory_items,
            "total_stock_value": total_stock_value,
            "total_sale_value": total_sale_value,
            "silver_rate_10g": silver_rate_10g,
            "sold_count": sold_count,
        }

    # Calculate metrics for current and previous end dates
    curr_metrics = await get_metrics_at_timestamp(to_date)
    prev_metrics = await get_metrics_at_timestamp(from_date)

    # Calculate change percentages
    def calc_change_pct(curr_val, prev_val):
        if prev_val > 0:
            return ((curr_val - prev_val) / prev_val) * 100
        return 100.0 if curr_val > 0 else 0.0

    total_sale_value_change = calc_change_pct(
        curr_metrics["total_sale_value"], prev_metrics["total_sale_value"]
    )
    inventory_items_change = calc_change_pct(
        curr_metrics["inventory_items"], prev_metrics["inventory_items"]
    )
    silver_rate_change = calc_change_pct(
        curr_metrics["silver_rate_10g"], prev_metrics["silver_rate_10g"]
    )
    total_stock_value_change = calc_change_pct(
        curr_metrics["total_stock_value"], prev_metrics["total_stock_value"]
    )

    # 2. Sales Overview (Daily Line Chart Points)
    day_sales = {}
    curr_day = from_date.date()
    end_day = to_date.date()
    while curr_day <= end_day:
        day_sales[curr_day] = 0.0
        curr_day += timedelta(days=1)

    for s in current_sales:
        sale_date = s.created_at.date()
        if sale_date in day_sales:
            if metal.lower() == "all":
                day_sales[sale_date] += float(s.total_amount)
            else:
                day_sales[sale_date] += sum(
                    float(si.price)
                    for si in s.items
                    if si.item and si.item.metal.lower() == metal.lower()
                )

    sales_overview = [
        {"date": dt.strftime("%b %d"), "total_amount": round(amt, 2)}
        for dt, amt in sorted(day_sales.items())
    ]

    # 3. Category Mapping & Sales Breakdown
    if metal.lower() == "all":
        cat_totals = {
            "Gold Jewellery": 0.0,
            "Silver Jewellery": 0.0,
            "Platinum Jewellery": 0.0,
        }
        for s in current_sales:
            for si in s.items:
                if si.item:
                    m = si.item.metal.lower()
                    if m == "gold":
                        cat_totals["Gold Jewellery"] += float(si.price)
                    elif m == "silver":
                        cat_totals["Silver Jewellery"] += float(si.price)
                    elif m == "platinum":
                        cat_totals["Platinum Jewellery"] += float(si.price)
    else:
        # Categories: jewellery, unique, ring, necklace, bracelet, earring, pendant, other
        cat_totals = {
            "Jewellery": 0.0,
            "Unique": 0.0,
            "Ring": 0.0,
            "Necklace": 0.0,
            "Bracelet": 0.0,
            "Earring": 0.0,
            "Pendant": 0.0,
            "Other": 0.0,
        }
        for s in current_sales:
            for si in s.items:
                if si.item and si.item.metal.lower() == metal.lower():
                    cat = str(si.item.category).strip().lower()
                    cap_cat = cat.capitalize()
                    if cap_cat in cat_totals:
                        cat_totals[cap_cat] += float(si.price)
                    else:
                        cat_totals["Other"] += float(si.price)

    total_cat_sales = sum(cat_totals.values())
    sales_by_category: list[dict[str, str | float]] = []
    for cat, val in cat_totals.items():
        share = (val / total_cat_sales * 100) if total_cat_sales > 0 else 0.0
        sales_by_category.append(
            {"category": cat, "sales_value": round(val, 2), "share": round(share, 1)}
        )

    sales_by_category.sort(key=lambda entry: float(entry["sales_value"]), reverse=True)

    # 4. Inventory Ratio (In Stock vs Sold) at end of period (to_date)
    in_stock_count = curr_metrics["inventory_items"]
    sold_count = curr_metrics["sold_count"]
    total_count = in_stock_count + sold_count

    if total_count > 0:
        in_stock_percentage = (in_stock_count / total_count) * 100
        sold_percentage = (sold_count / total_count) * 100
    else:
        in_stock_percentage = 0.0
        sold_percentage = 0.0

    inventory_summary = {
        "in_stock_count": in_stock_count,
        "in_stock_percentage": round(in_stock_percentage, 1),
        "sold_count": sold_count,
        "sold_percentage": round(sold_percentage, 1),
        "total_count": total_count,
    }

    # 5. Sales Trend Compare (Trend Bar Graph)
    curr_start_str = from_date.strftime("%b %d")
    curr_end_str = to_date.strftime("%b %d")
    prev_start_str = prev_start.strftime("%b %d")
    prev_end_str = prev_end.strftime("%b %d")

    sales_trend = {
        "current": {
            "period": f"{curr_start_str} - {curr_end_str}",
            "sales_value": round(total_sales, 2),
        },
        "previous": {
            "period": f"{prev_start_str} - {prev_end_str}",
            "sales_value": round(total_sales_prev, 2),
        },
    }

    return {
        "total_sales": round(total_sales, 2),
        "total_sales_change_percentage": round(total_sales_change_percentage, 2),
        "total_sale_value": round(curr_metrics["total_sale_value"], 2),
        "total_sale_value_change_percentage": round(total_sale_value_change, 2),
        "inventory_items": curr_metrics["inventory_items"],
        "inventory_items_change_percentage": round(inventory_items_change, 2),
        "silver_rate_10g": round(curr_metrics["silver_rate_10g"], 2),
        "silver_rate_change_percentage": round(silver_rate_change, 2),
        "total_stock_value": round(curr_metrics["total_stock_value"], 2),
        "total_stock_value_change_percentage": round(total_stock_value_change, 2),
        "sales_overview": sales_overview,
        "sales_by_category": sales_by_category,
        "inventory_summary": inventory_summary,
        "sales_trend": sales_trend,
    }
