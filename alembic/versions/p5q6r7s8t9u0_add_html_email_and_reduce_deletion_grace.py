"""Add HTML email bodies and reduce the deletion grace period.

Revision ID: p5q6r7s8t9u0
Revises: n4o5p6q7r8s9
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "p5q6r7s8t9u0"
down_revision: str | Sequence[str] | None = "n4o5p6q7r8s9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("email_outbox", sa.Column("html_body", sa.Text(), nullable=True))
    op.execute(
        """
        UPDATE account_deletion_requests
        SET execute_after = confirmed_at + INTERVAL '7 days'
        WHERE confirmed_at IS NOT NULL
          AND cancelled_at IS NULL
          AND completed_at IS NULL
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE account_deletion_requests
        SET execute_after = confirmed_at + INTERVAL '30 days'
        WHERE confirmed_at IS NOT NULL
          AND cancelled_at IS NULL
          AND completed_at IS NULL
        """
    )
    op.drop_column("email_outbox", "html_body")
