import uuid
from sqlalchemy import String, Numeric, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class MetalRate(Base):
    __tablename__ = "metal_rates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    metal: Mapped[str] = mapped_column(
        String(20),
        nullable=False,  # gold, Silver
        index=True,
    )

    purity: Mapped[float] = mapped_column(
        Numeric(5, 2),
        nullable=False,  # 24.0, 22.0, 92.5
        index=True,
    )

    rate_per_gram: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    effective_from: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )

    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
