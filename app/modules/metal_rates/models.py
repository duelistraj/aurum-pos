import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class MetalRate(Base):
    __tablename__ = "metal_rates"
    __table_args__ = (UniqueConstraint("shop_id", "metal", "purity"),)

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
        server_default=func.now(),
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
