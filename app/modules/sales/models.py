import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (
        UniqueConstraint("shop_id", "invoice_no", name="uq_sales_shop_invoice"),
        UniqueConstraint("shop_id", "id", name="uq_sales_shop_id"),
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

    invoice_no: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        server_default=func.now(),
    )

    customer_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    customer_phone: Mapped[str] = mapped_column(
        String(15),
        nullable=False,
    )

    customer_address: Mapped[str] = mapped_column(
        String(255),
        nullable=True,
    )

    customer_state: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="West Bengal",
    )

    customer_state_code: Mapped[str] = mapped_column(
        String(5),
        nullable=False,
        default="19",
    )

    s3_object_key: Mapped[str | None] = mapped_column(
        String(1024),
        nullable=True,
    )

    pdf_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    pdf_checksum_sha256: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    items = relationship(
        "SaleItem",
        back_populates="sale",
        cascade="all, delete-orphan",
        overlaps="item,sale_items",
    )


class SaleItem(Base):
    __tablename__ = "sale_items"
    __table_args__ = (
        ForeignKeyConstraint(
            ("shop_id", "sale_id"), ("sales.shop_id", "sales.id"), ondelete="CASCADE"
        ),
        ForeignKeyConstraint(("shop_id", "item_id"), ("items.shop_id", "items.id")),
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

    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )

    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )

    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )

    price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    price_breakdown: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
    )

    sale = relationship(
        "Sale",
        back_populates="items",
        overlaps="item,sale_items",
    )

    item = relationship(
        "Item",
        back_populates="sale_items",
        overlaps="items,sale",
    )


class SaleIdempotency(Base):
    __tablename__ = "sale_idempotency"
    __table_args__ = (UniqueConstraint("shop_id", "idempotency_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shops.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        server_default=text("NULLIF(current_setting('app.current_shop_id', true), '')::uuid"),
    )
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True, server_default=func.now()
    )
