import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
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


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (
        UniqueConstraint("shop_id", "invoice_no", name="uq_sales_shop_invoice"),
        UniqueConstraint("shop_id", "id", name="uq_sales_shop_id"),
        Index("ix_sales_shop_created_at", "shop_id", "created_at"),
        Index(
            "ix_sales_shop_invoice_no_prefix",
            "shop_id",
            literal_column("lower(invoice_no)").label("invoice_no_lower"),
            postgresql_ops={"invoice_no_lower": "text_pattern_ops"},
        ),
        Index(
            "ix_sales_shop_customer_phone_prefix",
            "shop_id",
            "customer_phone",
            postgresql_ops={"customer_phone": "text_pattern_ops"},
        ),
        Index(
            "ix_sales_customer_name_trgm",
            literal_column("lower(customer_name)").label("customer_name_lower"),
            postgresql_using="gin",
            postgresql_ops={"customer_name_lower": "gin_trgm_ops"},
        ),
        CheckConstraint(
            "invoice_pdf_status IN ('pending', 'processing', 'ready', 'failed')",
            name="sales_invoice_pdf_status_check",
        ),
        Index(
            "ix_sales_pending_invoice_pdf",
            "invoice_pdf_next_attempt_at",
            "created_at",
            postgresql_where=text(
                "s3_object_key IS NULL AND invoice_pdf_status IN ('pending', 'processing')"
            ),
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

    seller_name: Mapped[str | None] = mapped_column(String(200))
    seller_tax_id: Mapped[str | None] = mapped_column(String(30))
    seller_phone: Mapped[str | None] = mapped_column(String(30))
    seller_address: Mapped[str | None] = mapped_column(String(500))
    seller_state: Mapped[str | None] = mapped_column(String(100))
    seller_state_code: Mapped[str | None] = mapped_column(String(10))
    tax_rate_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))

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
    invoice_pdf_status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default="pending", nullable=False
    )
    invoice_pdf_attempts: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    invoice_pdf_next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invoice_pdf_lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invoice_pdf_last_error_code: Mapped[str | None] = mapped_column(String(100))

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
        Index("ix_sale_items_shop_sale", "shop_id", "sale_id"),
        Index("ix_sale_items_shop_item", "shop_id", "item_id"),
        CheckConstraint("quantity > 0", name="sale_items_quantity_positive"),
        CheckConstraint("price >= 0", name="sale_items_price_nonnegative"),
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
    item_sku: Mapped[str | None] = mapped_column(String(50))
    item_name: Mapped[str | None] = mapped_column(String(255))
    item_metal: Mapped[str | None] = mapped_column(String(50))
    item_category: Mapped[str | None] = mapped_column(String(20))
    item_purity: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    item_net_weight: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    item_making_charge: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    item_fixed_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

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
    __table_args__ = (
        UniqueConstraint("shop_id", "idempotency_key"),
        ForeignKeyConstraint(
            ("shop_id", "sale_id"),
            ("sales.shop_id", "sales.id"),
            ondelete="CASCADE",
        ),
    )

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
    sale_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True, server_default=func.now()
    )


class InvoiceJob(Base):
    __tablename__ = "invoice_jobs"
    __table_args__ = (
        ForeignKeyConstraint(
            ("shop_id", "sale_id"),
            ("sales.shop_id", "sales.id"),
            ondelete="CASCADE",
        ),
        UniqueConstraint("shop_id", "sale_id", name="uq_invoice_jobs_shop_sale"),
        Index(
            "ix_invoice_jobs_pending",
            "next_attempt_at",
            "created_at",
            postgresql_where=text("status IN ('pending', 'processing')"),
        ),
        Index(
            "ix_invoice_jobs_reclaim",
            "lease_until",
            "created_at",
            postgresql_where=text("status = 'processing'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )
    sale_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default="pending", nullable=False
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    last_error_code: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
