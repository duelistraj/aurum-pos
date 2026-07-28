"""remove_sale_item_unique_item_id

Revision ID: b14a9709a2f6
Revises: 39a7cf200e89
Create Date: 2026-07-01 19:22:19.455734

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b14a9709a2f6"
down_revision: str | Sequence[str] | None = "39a7cf200e89"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint("sale_items_item_id_key", "sale_items", type_="unique")


def downgrade() -> None:
    """Downgrade schema."""
    op.create_unique_constraint("sale_items_item_id_key", "sale_items", ["item_id"])
