import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class MetalRate(Base):
    __tablename__ = "metal_rates"
    __table_args__ = (
        CheckConstraint(
            "rate_per_gram > 0",
            name="metal_rates_positive_rate_check",
        ),
        CheckConstraint(
            "purity > 0 AND purity <= 100",
            name="metal_rates_purity_range_check",
        ),
        UniqueConstraint(
            "shop_id",
            "metal",
            "purity",
            name="uq_metal_rates_shop_metal_purity",
        ),
        Index(
            "ix_metal_rates_shop_metal_purity_effective",
            "shop_id",
            "metal",
            "purity",
            text("effective_from DESC"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shops.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        server_default=text("NULLIF(current_setting('app.current_shop_id', true), '')::uuid"),
    )

    metal: Mapped[str] = mapped_column(
        String(20),
        nullable=False,  # gold, Silver
        index=True,
    )

    purity: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        nullable=False,  # 24.0, 22.0, 92.5
        index=True,
    )

    rate_per_gram: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        server_default=func.now(),
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        server_default=func.now(),
    )


class MetalRateHistory(Base):
    __tablename__ = "metal_rate_history"
    __table_args__ = (
        CheckConstraint(
            "rate_per_gram > 0",
            name="metal_rate_history_positive_rate_check",
        ),
        CheckConstraint(
            "purity > 0 AND purity <= 100",
            name="metal_rate_history_purity_range_check",
        ),
        Index(
            "ix_metal_rate_history_shop_metal_effective",
            "shop_id",
            "metal",
            "purity",
            text("effective_from DESC"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shops.id", ondelete="CASCADE"),
        nullable=False,
        server_default=text("NULLIF(current_setting('app.current_shop_id', true), '')::uuid"),
    )
    metal: Mapped[str] = mapped_column(String(20), nullable=False)
    purity: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    rate_per_gram: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
