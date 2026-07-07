"""remove gross_weight from items table

Revision ID: g1h2i3j4k5l6
Revises: a1b2c3d4e5f6
Create Date: 2026-05-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g1h2i3j4k5l6'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Drop gross_weight column from items table
    op.drop_column('items', 'gross_weight')


def downgrade() -> None:
    """Downgrade schema."""
    # Restore gross_weight column to items table
    op.add_column('items', sa.Column('gross_weight', sa.Numeric(precision=10, scale=3), nullable=False))
