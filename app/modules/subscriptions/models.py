import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "id",
            name="uq_subscriptions_organization_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    plan: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    external_reference: Mapped[str | None] = mapped_column(String(255), unique=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True, server_default=func.now(), onupdate=func.now()
    )


class PlaySubscription(Base):
    __tablename__ = "play_subscriptions"
    __table_args__ = (
        ForeignKeyConstraint(
            ("organization_id", "subscription_id"),
            ("subscriptions.organization_id", "subscriptions.id"),
            ondelete="CASCADE",
            name="fk_play_subscriptions_organization_subscription",
        ),
        Index(
            "ix_play_subscriptions_ack_due",
            "acknowledgement_next_attempt_at",
            postgresql_where=text("acknowledgement_pending"),
        ),
        Index("ix_play_subscriptions_lease", "verification_lease_until"),
    )

    subscription_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    package_name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_id: Mapped[str] = mapped_column(String(255), nullable=False)
    base_plan_id: Mapped[str | None] = mapped_column(String(255))
    purchase_token: Mapped[str] = mapped_column(Text, nullable=False)
    purchase_token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    order_id: Mapped[str | None] = mapped_column(String(255))
    state: Mapped[str] = mapped_column(String(50), nullable=False)
    auto_renewing: Mapped[bool | None] = mapped_column(Boolean)
    last_verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    next_verification_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True
    )
    verification_lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_lease_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    acknowledgement_pending: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    acknowledgement_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    acknowledgement_next_attempt_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    acknowledgement_last_error_code: Mapped[str | None] = mapped_column(String(100))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deletion_cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BillingEvent(Base):
    __tablename__ = "billing_events"
    __table_args__ = (Index("ix_billing_events_retention", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider_event_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True, server_default=func.now()
    )
