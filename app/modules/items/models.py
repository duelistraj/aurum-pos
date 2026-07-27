import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    literal_column,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Item(Base):
    __tablename__ = "items"
    __table_args__ = (
        UniqueConstraint("shop_id", "barcode", name="uq_items_shop_barcode"),
        UniqueConstraint("shop_id", "id", name="uq_items_shop_id"),
        Index(
            "ix_items_shop_status_updated_at",
            "shop_id",
            "status",
            text("updated_at DESC"),
        ),
        Index(
            "ix_items_shop_active_updated_at",
            "shop_id",
            text("updated_at DESC"),
            postgresql_where=text("archived_at IS NULL"),
        ),
        Index(
            "ix_items_name_trgm",
            literal_column("lower(name)").label("name_lower"),
            postgresql_using="gin",
            postgresql_ops={"name_lower": "gin_trgm_ops"},
        ),
        Index(
            "ix_items_sku_trgm",
            literal_column("lower(sku)").label("sku_lower"),
            postgresql_using="gin",
            postgresql_ops={"sku_lower": "gin_trgm_ops"},
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

    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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


class ItemHistory(Base):
    __tablename__ = "item_history"
    __table_args__ = (
        ForeignKeyConstraint(
            ("shop_id", "item_id"),
            ("items.shop_id", "items.id"),
            ondelete="CASCADE",
        ),
        Index(
            "ix_item_history_shop_item_effective",
            "shop_id",
            "item_id",
            text("effective_from DESC"),
        ),
        Index(
            "ix_item_history_shop_effective",
            "shop_id",
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
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    event_type: Mapped[str] = mapped_column(String(20), nullable=False)
    sku: Mapped[str] = mapped_column(String(50), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    metal: Mapped[str] = mapped_column(String(50), nullable=False)
    purity: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    net_weight: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    making_charge: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
