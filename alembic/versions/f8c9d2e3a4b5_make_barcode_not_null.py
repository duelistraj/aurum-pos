"""Make barcode non-nullable and auto-generate unique barcodes

Revision ID: f8c9d2e3a4b5
Revises: d0daebab8b2b
Create Date: 2026-05-13 10:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
import random
import string
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'f8c9d2e3a4b5'
down_revision = 'd0daebab8b2b'
branch_labels = None
depends_on = None


def generate_unique_barcode(connection):
    """Generate a unique 8-digit barcode"""
    while True:
        barcode = ''.join(random.choices(string.digits, k=8))
        result = connection.execute(
            sa.text("SELECT barcode FROM items WHERE barcode = :barcode LIMIT 1"),
            {"barcode": barcode}
        )
        if not result.fetchone():
            return barcode


def upgrade() -> None:
    # First, generate barcodes for any items that don't have one
    connection = op.get_bind()
    
    # Get all items without a barcode
    items = connection.execute(sa.text("SELECT id FROM items WHERE barcode IS NULL")).fetchall()
    
    for item in items:
        barcode = generate_unique_barcode(connection)
        connection.execute(
            sa.text("UPDATE items SET barcode = :barcode WHERE id = :id"),
            {"barcode": barcode, "id": item[0]}
        )
    
    # Now make barcode NOT NULL
    op.alter_column(
        'items',
        'barcode',
        existing_type=sa.String(100),
        nullable=False,
        existing_nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        'items',
        'barcode',
        existing_type=sa.String(100),
        nullable=True,
        existing_nullable=False
    )
