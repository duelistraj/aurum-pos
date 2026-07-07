import uuid
from sqlalchemy import (
    String,
    DateTime,
    Numeric,
    ForeignKey,
    JSON,
    Integer,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    invoice_no: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
    )

    total_amount: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
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

    items = relationship(
        "SaleItem",
        back_populates="sale",
        cascade="all, delete-orphan",
    )


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
    )

    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("items.id"),
        nullable=False,
    )

    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )

    price: Mapped[float] = mapped_column(
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
    )

    item = relationship(
        "Item",
        back_populates="sale_items",
    )
