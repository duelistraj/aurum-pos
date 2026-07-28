"""Add shop phone snapshots to invoices.

Revision ID: q6r7s8t9u0v1
Revises: p5q6r7s8t9u0
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "q6r7s8t9u0v1"
down_revision: str | Sequence[str] | None = "p5q6r7s8t9u0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("shops", sa.Column("phone", sa.String(length=30), nullable=True))
    op.add_column("sales", sa.Column("seller_phone", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("sales", "seller_phone")
    op.drop_column("shops", "phone")
