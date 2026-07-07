from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, distinct
from app.modules.metal_rates.models import MetalRate
from app.modules.metal_rates.schemas import MetalRateCreate
from app.core.changelog.service import log_change

# Supported metals and their purities in the system
SUPPORTED_METALS = {
    "Silver": [100.0],
}


async def add_metal_rate(
    db: AsyncSession,
    data: MetalRateCreate,
) -> MetalRate:
    """Add or update a metal rate. If a rate for this metal/purity exists, it will be updated."""
    metal_lower = data.metal.lower()
    
    # Check if rate already exists
    stmt = select(MetalRate).where(
        MetalRate.metal == metal_lower,
        MetalRate.purity == data.purity,
    )
    result = await db.execute(stmt)
    existing_rate = result.scalar_one_or_none()
    
    if existing_rate:
        # Update existing rate
        old_rate = existing_rate.rate_per_gram
        existing_rate.rate_per_gram = data.rate_per_gram
        await db.commit()
        await db.refresh(existing_rate)
        
        # Log the update
        await log_change(
            db,
            entity="metal_rate",
            entity_id=existing_rate.id,
            action="update",
            payload={
                "metal": existing_rate.metal,
                "purity": float(existing_rate.purity),
                "before": float(old_rate),
                "after": float(existing_rate.rate_per_gram),
            },
        )
        await db.commit()
        
        return existing_rate
    else:
        # Create new rate
        rate = MetalRate(
            metal=metal_lower,
            purity=data.purity,
            rate_per_gram=data.rate_per_gram,
        )
        db.add(rate)
        await db.commit()
        await db.refresh(rate)
        
        # Log the creation
        await log_change(
            db,
            entity="metal_rate",
            entity_id=rate.id,
            action="create",
            payload={
                "metal": rate.metal,
                "purity": float(rate.purity),
                "rate_per_gram": float(rate.rate_per_gram),
            },
        )
        await db.commit()
        
        return rate


async def get_available_metals(db: AsyncSession) -> dict[str, list[float]]:
    """Get supported metals and their purities
    
    Returns supported metals from configuration, which can be customized
    by modifying SUPPORTED_METALS.
    """
    return {metal: sorted(purities) for metal, purities in SUPPORTED_METALS.items()}


async def get_all_metal_rates(db: AsyncSession) -> list[MetalRate]:
    """Get all metal rates from the database"""
    stmt = select(MetalRate).order_by(MetalRate.metal, MetalRate.purity)
    result = await db.execute(stmt)
    return result.scalars().all()

async def get_latest_metal_rate(
    db,
    *,
    metal: str,
    purity: float,
):
    # 🔹 Business rule:
    # Silver is always priced at 100% purity
    effective_purity = 100.0 if str(metal).lower() == "silver" else purity

    stmt = (
        select(MetalRate)
        .where(
            MetalRate.metal == metal.lower(),
            MetalRate.purity == effective_purity,
        )
        .order_by(MetalRate.effective_from.desc())
        .limit(1)
    )

    result = await db.execute(stmt)
    return result.scalar_one_or_none()
