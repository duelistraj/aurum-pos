import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class ChangeLog(Base):
    __tablename__ = "change_log"
    __table_args__ = (
        Index(
            "ix_change_log_shop_created_at",
            "shop_id",
            text("created_at DESC"),
        ),
        Index(
            "ix_change_log_shop_barcode_created",
            "shop_id",
            "barcode",
            text("created_at DESC"),
            postgresql_where=text("barcode IS NOT NULL"),
        ),
        Index(
            "ix_change_log_shop_invoice_created",
            "shop_id",
            "invoice_no",
            text("created_at DESC"),
            postgresql_where=text("invoice_no IS NOT NULL"),
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

    entity: Mapped[str] = mapped_column(
        String(50),
        nullable=False,  # item, sale
    )

    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    action: Mapped[str] = mapped_column(
        String(20),
        nullable=False,  # create, update, sale
    )

    payload: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
    )
    barcode: Mapped[str | None] = mapped_column(String(100))
    invoice_no: Mapped[str | None] = mapped_column(String(50))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        server_default=func.now(),
        index=True,
    )
