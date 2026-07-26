"""Assign imported legacy items to BMR Chandiwala.

Revision ID: a8c9d0e1f2g3
Revises: f7b8c9d0e1f2
Create Date: 2026-07-26 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "a8c9d0e1f2g3"
down_revision: str | Sequence[str] | None = "f7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LEGACY_SHOP_ID = "00000000-0000-0000-0000-000000000001"
BMR_SHOP_ID = "965eaec5-b1bf-46b6-8c12-9f00c051e688"


def upgrade() -> None:
    op.execute(
        f"""
        DO $migration$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM shops
                WHERE id = '{BMR_SHOP_ID}'::uuid
            ) THEN
                IF EXISTS (
                    SELECT 1
                    FROM sale_items
                    WHERE shop_id = '{LEGACY_SHOP_ID}'::uuid
                ) THEN
                    RAISE EXCEPTION
                        'Cannot reassign legacy items while legacy sale lines exist';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM items AS legacy_item
                    JOIN items AS bmr_item
                      ON bmr_item.shop_id = '{BMR_SHOP_ID}'::uuid
                     AND bmr_item.barcode = legacy_item.barcode
                    WHERE legacy_item.shop_id = '{LEGACY_SHOP_ID}'::uuid
                ) THEN
                    RAISE EXCEPTION
                        'Cannot reassign legacy items because a BMR barcode conflicts';
                END IF;

                UPDATE items
                SET shop_id = '{BMR_SHOP_ID}'::uuid
                WHERE shop_id = '{LEGACY_SHOP_ID}'::uuid;
            END IF;
        END
        $migration$;
        """
    )


def downgrade() -> None:
    raise RuntimeError(
        "BMR item ownership is a production data correction and cannot be downgraded safely"
    )
