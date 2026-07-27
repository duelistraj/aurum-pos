from datetime import UTC, datetime
from decimal import Decimal
from types import MappingProxyType
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.changelog.service import log_change
from app.modules.metal_rates.models import MetalRate
from app.modules.metal_rates.schemas import MetalRateCreate

# Item purities supported by the inventory form. Metal rates themselves are
# always stored at 100% and converted to the item's purity during pricing.
RATE_PURITY = Decimal("100")
SUPPORTED_METALS = MappingProxyType(
    {
        "Silver": (92.5, 99.9, 0.0),
        "Gold": (58.5, 75.0, 91.6, 99.9),
        "Platinum": (90.0, 95.0, 99.9),
    }
)


def calculate_effective_rate_per_gram(
    *,
    metal: str,
    purity: Decimal | float | str,
    base_rate_per_gram: Decimal | float | str,
) -> Decimal:
    """Convert a 100% base-metal rate into the item's effective rate."""
    base_rate = Decimal(str(base_rate_per_gram))
    if metal.strip().lower() == "silver":
        return base_rate
    return base_rate * Decimal(str(purity)) / RATE_PURITY


async def add_metal_rate(
    db: AsyncSession,
    data: MetalRateCreate,
    *,
    shop_id: UUID,
) -> MetalRate:
    """Append a metal rate so historical pricing remains reproducible."""
    metal_lower = data.metal.strip().lower()
    supported_metals = {metal.lower() for metal in SUPPORTED_METALS}
    if metal_lower not in supported_metals:
        raise ValueError(f"Unsupported metal: {data.metal}")
    if data.purity != RATE_PURITY:
        raise ValueError("Metal rates must be recorded at 100% purity.")

    existing_rate = await db.scalar(
        select(MetalRate)
        .where(
            MetalRate.shop_id == shop_id,
            MetalRate.metal == metal_lower,
            MetalRate.purity == data.purity,
        )
        .with_for_update()
    )
    old_rate = existing_rate.rate_per_gram if existing_rate is not None else None
    if existing_rate is None:
        rate = MetalRate(
            shop_id=shop_id,
            metal=metal_lower,
            purity=data.purity,
            rate_per_gram=data.rate_per_gram,
        )
        db.add(rate)
    else:
        rate = existing_rate
        rate.rate_per_gram = data.rate_per_gram
        rate.effective_from = datetime.now(UTC)
    await db.flush()
    await db.refresh(rate)
    await log_change(
        db,
        shop_id=shop_id,
        entity="metal_rate",
        entity_id=rate.id,
        action="create" if old_rate is None else "update",
        payload={
            "metal": rate.metal,
            "purity": float(rate.purity),
            "rate_per_gram": float(rate.rate_per_gram),
            "before": float(old_rate) if old_rate is not None else None,
        },
    )
    return rate


async def get_available_metals(db: AsyncSession) -> dict[str, list[float]]:
    """Get supported metals and their purities

    Returns supported metals from configuration, which can be customized
    by modifying SUPPORTED_METALS.
    """
    return {metal: list(purities) for metal, purities in SUPPORTED_METALS.items()}


async def get_all_metal_rates(db: AsyncSession, *, shop_id: UUID) -> list[MetalRate]:
    """Get all metal rates from the database"""
    latest_ids = (
        select(MetalRate.id)
        .where(
            MetalRate.shop_id == shop_id,
            MetalRate.purity == RATE_PURITY,
        )
        .distinct(MetalRate.metal, MetalRate.purity)
        .order_by(
            MetalRate.metal,
            MetalRate.purity,
            MetalRate.effective_from.desc(),
            MetalRate.created_at.desc(),
        )
        .subquery()
    )
    stmt = (
        select(MetalRate)
        .join(latest_ids, latest_ids.c.id == MetalRate.id)
        .order_by(MetalRate.metal, MetalRate.purity)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_latest_metal_rate(
    db,
    *,
    shop_id: UUID,
    metal: str,
):
    stmt = (
        select(MetalRate)
        .where(
            MetalRate.shop_id == shop_id,
            MetalRate.metal == metal.strip().lower(),
            MetalRate.purity == RATE_PURITY,
        )
        .order_by(MetalRate.effective_from.desc())
        .limit(1)
    )

    result = await db.execute(stmt)
    return result.scalar_one_or_none()
