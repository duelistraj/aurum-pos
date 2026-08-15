import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
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
        CheckConstraint("quantity >= 0", name="items_quantity_nonnegative"),
        CheckConstraint("purity >= 0 AND purity <= 100", name="items_purity_range"),
        CheckConstraint(
            "notes IS NULL OR char_length(notes) <= 50",
            name="items_notes_length",
        ),
        CheckConstraint(
            "net_weight >= 0 AND making_charge >= 0 AND fixed_rate >= 0 "
            "AND (stock_weight IS NULL OR stock_weight >= 0) "
            "AND (ratti IS NULL OR ratti >= 0) "
            "AND (rate_per_ratti IS NULL OR rate_per_ratti >= 0)",
            name="items_nonnegative_money_weight",
        ),
        CheckConstraint(
            "status IN ('in_stock', 'sold', 'reserved', 'archived')",
            name="items_status_allowed",
        ),
        CheckConstraint(
            "item_type IN ('jewellery', 'stone') "
            "AND pricing_method IN ('fixed_rate', 'fixed_making_charge', "
            "'making_charge_per_gram', 'rate_per_ratti') "
            "AND stock_mode IN ('quantity', 'weight')",
            name="items_modes_allowed",
        ),
        CheckConstraint(
            "(item_type = 'stone' AND metal = 'stone' "
            "AND pricing_method = 'rate_per_ratti' AND stock_mode = 'quantity' "
            "AND purity = 0 AND net_weight = 0 AND making_charge = 0 AND fixed_rate = 0 "
            "AND stock_weight IS NULL AND ratti > 0 AND rate_per_ratti > 0) OR "
            "(item_type = 'jewellery' AND metal <> 'stone' "
            "AND pricing_method <> 'rate_per_ratti' "
            "AND ratti IS NULL AND rate_per_ratti IS NULL)",
            name="items_type_contract",
        ),
        CheckConstraint(
            "(stock_mode = 'quantity' AND stock_weight IS NULL) OR "
            "(stock_mode = 'weight' AND item_type = 'jewellery' "
            "AND pricing_method <> 'fixed_rate' AND net_weight > 0 "
            "AND stock_weight IS NOT NULL AND stock_weight <= net_weight "
            "AND quantity IN (0, 1))",
            name="items_stock_contract",
        ),
        CheckConstraint(
            "item_type = 'stone' OR "
            "(pricing_method = 'fixed_rate' AND fixed_rate > 0 "
            "AND making_charge = 0 AND stock_mode = 'quantity') OR "
            "(pricing_method IN ('fixed_making_charge', 'making_charge_per_gram') "
            "AND fixed_rate = 0 AND "
            "((stock_mode = 'quantity' AND net_weight > 0) OR stock_mode = 'weight'))",
            name="items_pricing_contract",
        ),
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

    item_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="jewellery", server_default="jewellery"
    )

    pricing_method: Mapped[str] = mapped_column(
        String(30), nullable=False, default="making_charge_per_gram"
    )

    stock_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, default="quantity", server_default="quantity"
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

    fixed_rate: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal(0), server_default="0"
    )

    stock_weight: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    ratti: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    rate_per_ratti: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
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
        String(50),
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
        CheckConstraint(
            "quantity >= 0 AND purity >= 0 AND purity <= 100 "
            "AND net_weight >= 0 AND making_charge >= 0 AND fixed_rate >= 0 "
            "AND (stock_weight IS NULL OR stock_weight >= 0) "
            "AND (ratti IS NULL OR ratti >= 0) "
            "AND (rate_per_ratti IS NULL OR rate_per_ratti >= 0) "
            "AND (stock_mode <> 'weight' OR "
            "(net_weight > 0 AND stock_weight IS NOT NULL "
            "AND stock_weight <= net_weight AND quantity IN (0, 1)))",
            name="item_history_values_valid",
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
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)
    pricing_method: Mapped[str] = mapped_column(String(30), nullable=False)
    stock_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    metal: Mapped[str] = mapped_column(String(50), nullable=False)
    purity: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    net_weight: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    making_charge: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    fixed_rate: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal(0), server_default="0"
    )
    stock_weight: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    ratti: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    rate_per_ratti: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
