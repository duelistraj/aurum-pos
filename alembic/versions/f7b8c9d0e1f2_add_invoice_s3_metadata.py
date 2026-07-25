"""add invoice S3 metadata

Revision ID: f7b8c9d0e1f2
Revises: e5f6a7b8c9d0
Create Date: 2026-07-25 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f7b8c9d0e1f2"
down_revision: str | Sequence[str] | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sales", sa.Column("s3_object_key", sa.String(1024), nullable=True))
    op.add_column(
        "sales",
        sa.Column("pdf_generated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "sales",
        sa.Column("pdf_checksum_sha256", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sales", "pdf_checksum_sha256")
    op.drop_column("sales", "pdf_generated_at")
    op.drop_column("sales", "s3_object_key")
