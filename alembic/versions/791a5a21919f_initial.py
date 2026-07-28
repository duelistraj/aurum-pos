"""initial

Revision ID: 791a5a21919f
Revises:
Create Date: 2025-12-14 17:38:34.102542

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "791a5a21919f"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
