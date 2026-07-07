"""remove shop_id for single-shop mode

Revision ID: a1b2c3d4e5f6
Revises: 7f984b48d5f2
Create Date: 2026-05-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '62780bf78a42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Drop shop_id from items table
    op.drop_index(op.f('ix_items_shop_id'), table_name='items')
    op.drop_column('items', 'shop_id')

    # Drop shop_id from sales table
    op.drop_index(op.f('ix_sales_shop_id'), table_name='sales')
    op.drop_column('sales', 'shop_id')

    # Drop shop_id from change_log table
    op.drop_index(op.f('ix_change_log_shop_id'), table_name='change_log')
    op.drop_column('change_log', 'shop_id')


def downgrade() -> None:
    """Downgrade schema."""
    # Restore shop_id to change_log table
    op.add_column('change_log', sa.Column('shop_id', sa.UUID(), nullable=False))
    op.create_index(op.f('ix_change_log_shop_id'), 'change_log', ['shop_id'], unique=False)

    # Restore shop_id to sales table
    op.add_column('sales', sa.Column('shop_id', sa.UUID(), nullable=False))
    op.create_index(op.f('ix_sales_shop_id'), 'sales', ['shop_id'], unique=False)

    # Restore shop_id to items table
    op.add_column('items', sa.Column('shop_id', sa.UUID(), nullable=False))
    op.create_index(op.f('ix_items_shop_id'), 'items', ['shop_id'], unique=False)
