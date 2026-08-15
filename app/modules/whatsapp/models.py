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
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class WhatsAppInvoiceDelivery(Base):
    __tablename__ = "whatsapp_invoice_deliveries"
    __table_args__ = (
        ForeignKeyConstraint(
            ("shop_id", "sale_id"),
            ("sales.shop_id", "sales.id"),
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "shop_id",
            "idempotency_key",
            name="uq_whatsapp_deliveries_shop_idempotency",
        ),
        CheckConstraint(
            "status IN ('pending', 'processing', 'accepted', 'sent', 'delivered', "
            "'read', 'failed', 'unknown')",
            name="whatsapp_deliveries_status_check",
        ),
        Index(
            "ix_whatsapp_deliveries_pending",
            "next_attempt_at",
            "created_at",
            postgresql_where=text("status IN ('pending', 'processing')"),
        ),
        Index("ix_whatsapp_deliveries_shop_sale", "shop_id", "sale_id"),
        Index("ix_whatsapp_deliveries_organization_id", "organization_id"),
        Index("ix_whatsapp_deliveries_shop_id", "shop_id"),
        Index("ix_whatsapp_deliveries_recipient_hmac", "recipient_hmac"),
        Index(
            "uq_whatsapp_deliveries_meta_message",
            "meta_message_id",
            unique=True,
            postgresql_where=text("meta_message_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shops.id", ondelete="CASCADE"),
        nullable=False,
        server_default=text("NULLIF(current_setting('app.current_shop_id', true), '')::uuid"),
    )
    sale_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    recipient_e164: Mapped[str] = mapped_column(String(16), nullable=False)
    recipient_hmac: Mapped[str] = mapped_column(String(64), nullable=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    consent_confirmed_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    consent_confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consent_copy_version: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default="pending", nullable=False
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    meta_message_id: Mapped[str | None] = mapped_column(String(255))
    last_error_code: Mapped[str | None] = mapped_column(String(100))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class WhatsAppRecipientSuppression(Base):
    __tablename__ = "whatsapp_recipient_suppressions"

    recipient_hmac: Mapped[str] = mapped_column(String(64), primary_key=True)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    suppressed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reconsented_delivery_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("whatsapp_invoice_deliveries.id", ondelete="SET NULL"),
    )


class WhatsAppDeliveryJob(Base):
    __tablename__ = "whatsapp_delivery_jobs"
    __table_args__ = (
        Index(
            "ix_whatsapp_delivery_jobs_pending",
            "next_attempt_at",
            "created_at",
            postgresql_where=text("status IN ('pending', 'processing')"),
        ),
        Index(
            "uq_whatsapp_delivery_jobs_meta_message",
            "meta_message_id",
            unique=True,
            postgresql_where=text("meta_message_id IS NOT NULL"),
        ),
    )

    delivery_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("whatsapp_invoice_deliveries.id", ondelete="CASCADE"),
        primary_key=True,
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default="pending", nullable=False
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    meta_message_id: Mapped[str | None] = mapped_column(String(255))
    last_error_code: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class WhatsAppIntegrationState(Base):
    __tablename__ = "whatsapp_integration_state"

    integration_key: Mapped[str] = mapped_column(String(50), primary_key=True)
    template_status: Mapped[str] = mapped_column(
        String(30), default="unknown", server_default="unknown", nullable=False
    )
    sender_status: Mapped[str] = mapped_column(
        String(30), default="unknown", server_default="unknown", nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
