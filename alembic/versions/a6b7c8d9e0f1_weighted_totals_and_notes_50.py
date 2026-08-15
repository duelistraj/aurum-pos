"""Preserve weighted totals and limit notes to 50 characters.

Revision ID: a6b7c8d9e0f1
Revises: z5a6b7c8d9e0
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a6b7c8d9e0f1"
down_revision: str | None = "z5a6b7c8d9e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


ITEM_STOCK_CONTRACT = (
    "(stock_mode = 'quantity' AND stock_weight IS NULL) OR "
    "(stock_mode = 'weight' AND item_type = 'jewellery' "
    "AND pricing_method <> 'fixed_rate' AND net_weight > 0 "
    "AND stock_weight IS NOT NULL AND stock_weight <= net_weight "
    "AND quantity IN (0, 1))"
)

LEGACY_ITEM_STOCK_CONTRACT = (
    "(stock_mode = 'quantity' AND stock_weight IS NULL) OR "
    "(stock_mode = 'weight' AND item_type = 'jewellery' "
    "AND pricing_method <> 'fixed_rate' AND net_weight = 0 "
    "AND stock_weight IS NOT NULL AND quantity IN (0, 1))"
)

ITEM_PRICING_CONTRACT = (
    "item_type = 'stone' OR "
    "(pricing_method = 'fixed_rate' AND fixed_rate > 0 AND making_charge = 0 "
    "AND stock_mode = 'quantity') OR "
    "(pricing_method IN ('fixed_making_charge', 'making_charge_per_gram') "
    "AND fixed_rate = 0 AND "
    "((stock_mode = 'quantity' AND net_weight > 0) OR stock_mode = 'weight'))"
)

ITEM_HISTORY_VALUES_VALID = (
    "quantity >= 0 AND purity >= 0 AND purity <= 100 "
    "AND net_weight >= 0 AND making_charge >= 0 AND fixed_rate >= 0 "
    "AND (stock_weight IS NULL OR stock_weight >= 0) "
    "AND (ratti IS NULL OR ratti >= 0) "
    "AND (rate_per_ratti IS NULL OR rate_per_ratti >= 0) "
    "AND (stock_mode <> 'weight' OR "
    "(net_weight > 0 AND stock_weight IS NOT NULL "
    "AND stock_weight <= net_weight AND quantity IN (0, 1)))"
)

LEGACY_ITEM_HISTORY_VALUES_VALID = (
    "quantity >= 0 AND purity >= 0 AND purity <= 100 "
    "AND net_weight >= 0 AND making_charge >= 0 AND fixed_rate >= 0 "
    "AND (stock_weight IS NULL OR stock_weight >= 0) "
    "AND (ratti IS NULL OR ratti >= 0) "
    "AND (rate_per_ratti IS NULL OR rate_per_ratti >= 0)"
)


def upgrade() -> None:
    op.drop_constraint("items_stock_contract", "items", type_="check")
    op.drop_constraint("items_pricing_contract", "items", type_="check")
    op.drop_constraint("item_history_values_valid", "item_history", type_="check")

    op.execute(
        "UPDATE items AS item "
        "SET net_weight = item.stock_weight + COALESCE(("
        "SELECT SUM(sale_item.sold_weight) FROM sale_items AS sale_item "
        "WHERE sale_item.shop_id = item.shop_id "
        "AND sale_item.item_id = item.id "
        "AND sale_item.sold_weight IS NOT NULL"
        "), 0), "
        "quantity = CASE WHEN item.stock_weight > 0 THEN 1 ELSE 0 END "
        "WHERE item.stock_mode = 'weight'"
    )
    op.execute(
        "UPDATE item_history AS history "
        "SET net_weight = item.net_weight "
        "FROM items AS item "
        "WHERE history.shop_id = item.shop_id "
        "AND history.item_id = item.id "
        "AND history.stock_mode = 'weight'"
    )
    op.execute(
        "UPDATE sale_items AS sale_item "
        "SET item_net_weight = item.net_weight "
        "FROM items AS item "
        "WHERE sale_item.shop_id = item.shop_id "
        "AND sale_item.item_id = item.id "
        "AND COALESCE(sale_item.item_stock_mode, item.stock_mode) = 'weight'"
    )

    op.create_check_constraint("items_stock_contract", "items", ITEM_STOCK_CONTRACT)
    op.create_check_constraint("items_pricing_contract", "items", ITEM_PRICING_CONTRACT)
    op.create_check_constraint(
        "item_history_values_valid",
        "item_history",
        ITEM_HISTORY_VALUES_VALID,
    )

    op.execute("UPDATE items SET notes = LEFT(notes, 50) WHERE char_length(notes) > 50")
    op.drop_constraint("items_notes_length", "items", type_="check")
    # migration-safety: allow after every note is truncated above
    op.alter_column(
        "items",
        "notes",
        existing_type=sa.String(length=100),
        type_=sa.String(length=50),
        existing_nullable=True,
    )
    op.create_check_constraint(
        "items_notes_length",
        "items",
        "notes IS NULL OR char_length(notes) <= 50",
    )


def downgrade() -> None:
    op.drop_constraint("items_stock_contract", "items", type_="check")
    op.drop_constraint("items_pricing_contract", "items", type_="check")
    op.drop_constraint("item_history_values_valid", "item_history", type_="check")

    op.execute("UPDATE items SET net_weight = 0 WHERE stock_mode = 'weight'")
    op.execute("UPDATE item_history SET net_weight = 0 WHERE stock_mode = 'weight'")
    op.execute("UPDATE sale_items SET item_net_weight = 0 WHERE item_stock_mode = 'weight'")

    op.create_check_constraint(
        "items_stock_contract",
        "items",
        LEGACY_ITEM_STOCK_CONTRACT,
    )
    op.create_check_constraint("items_pricing_contract", "items", ITEM_PRICING_CONTRACT)
    op.create_check_constraint(
        "item_history_values_valid",
        "item_history",
        LEGACY_ITEM_HISTORY_VALUES_VALID,
    )

    op.drop_constraint("items_notes_length", "items", type_="check")
    op.alter_column(
        "items",
        "notes",
        existing_type=sa.String(length=50),
        type_=sa.String(length=100),
        existing_nullable=True,
    )
    op.create_check_constraint(
        "items_notes_length",
        "items",
        "notes IS NULL OR char_length(notes) <= 100",
    )
