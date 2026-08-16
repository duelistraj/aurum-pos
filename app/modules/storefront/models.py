import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class StorefrontReservation(Base):
    __tablename__ = "storefront_reservations"
    __table_args__ = (
        UniqueConstraint(
            "shop_id",
            "external_order_id",
            name="uq_storefront_reservations_shop_order",
        ),
        UniqueConstraint("shop_id", "id", name="uq_storefront_reservations_shop_id"),
        CheckConstraint(
            "status IN ('held', 'confirmed', 'fulfilled', 'released', 'expired')",
            name="storefront_reservations_status_check",
        ),
        Index("ix_storefront_reservations_shop_status", "shop_id", "status"),
        Index(
            "ix_storefront_reservations_expiry",
            "expires_at",
            postgresql_where=text("status = 'held'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shops.id", ondelete="CASCADE"),
        nullable=False,
        server_default=text("NULLIF(current_setting('app.current_shop_id', true), '')::uuid"),
    )
    external_order_id: Mapped[str] = mapped_column(String(100), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="held", server_default="held"
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    lines: Mapped[list["StorefrontReservationLine"]] = relationship(
        back_populates="reservation",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class StorefrontReservationLine(Base):
    __tablename__ = "storefront_reservation_lines"
    __table_args__ = (
        ForeignKeyConstraint(
            ("shop_id", "reservation_id"),
            ("storefront_reservations.shop_id", "storefront_reservations.id"),
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ("shop_id", "item_id"),
            ("items.shop_id", "items.id"),
            ondelete="RESTRICT",
        ),
        UniqueConstraint("reservation_id", "item_id", name="uq_storefront_reservation_lines_item"),
        CheckConstraint("quantity > 0", name="storefront_reservation_lines_quantity_positive"),
        Index("ix_storefront_reservation_lines_shop_item", "shop_id", "item_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    reservation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    reservation: Mapped[StorefrontReservation] = relationship(back_populates="lines")


class StorefrontInventoryEvent(Base):
    __tablename__ = "storefront_inventory_events"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'processing', 'delivered', 'failed')",
            name="storefront_inventory_events_status_check",
        ),
        Index(
            "ix_storefront_inventory_events_pending",
            "next_attempt_at",
            "created_at",
            postgresql_where=text("status IN ('pending', 'processing')"),
        ),
        Index("ix_storefront_inventory_events_shop_item", "shop_id", "item_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    last_error_code: Mapped[str | None] = mapped_column(String(100))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
