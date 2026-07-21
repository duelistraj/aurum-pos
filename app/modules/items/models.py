import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Item(Base):
    __tablename__ = "items"
    __table_args__ = (
        UniqueConstraint("shop_id", "barcode", name="uq_items_shop_barcode"),
        UniqueConstraint("shop_id", "id", name="uq_items_shop_id"),
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

    sku: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    barcode: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    category: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="jewellery",
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    metal: Mapped[str] = mapped_column(
        String(50),
        nullable=False,  # gold / Silver / platinum
    )

    purity: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        nullable=False,
    )

    net_weight: Mapped[Decimal] = mapped_column(
        Numeric(10, 3),
        nullable=False,
    )

    making_charge: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="in_stock",  # in_stock / sold / reserved
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    sale_items = relationship(
        "SaleItem",
        back_populates="item",
        overlaps="items,sale",
    )
