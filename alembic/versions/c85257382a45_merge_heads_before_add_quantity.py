"""merge heads before add quantity

Revision ID: c85257382a45
Revises: h7i8j9k0l1m2, j1k2l3m4n5o6
Create Date: 2026-06-09 22:44:03.654136

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c85257382a45'
down_revision: Union[str, Sequence[str], None] = ('h7i8j9k0l1m2', 'j1k2l3m4n5o6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "items",
        sa.Column(
            "quantity",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("items", "quantity")
