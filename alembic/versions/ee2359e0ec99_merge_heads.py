"""merge heads

Revision ID: ee2359e0ec99
Revises: a1b2c3d4e5f6, f8c9d2e3a4b5
Create Date: 2026-05-13 20:17:30.446780

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "ee2359e0ec99"
down_revision: str | Sequence[str] | None = ("a1b2c3d4e5f6", "f8c9d2e3a4b5")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
