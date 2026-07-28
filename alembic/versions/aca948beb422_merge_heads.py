"""merge heads

Revision ID: aca948beb422
Revises: ee2359e0ec99, g1h2i3j4k5l6
Create Date: 2026-05-13 23:37:51.641574

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "aca948beb422"
down_revision: str | Sequence[str] | None = ("ee2359e0ec99", "g1h2i3j4k5l6")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
