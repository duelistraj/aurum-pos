"""Reassert weighted inventory constraints for already-migrated databases.

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | None = "a6b7c8d9e0f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


ITEM_STOCK_CONTRACT = (
    "(stock_mode = 'quantity' AND stock_weight IS NULL) OR "
    "(stock_mode = 'weight' AND item_type = 'jewellery' "
    "AND pricing_method <> 'fixed_rate' AND net_weight > 0 "
    "AND stock_weight IS NOT NULL AND stock_weight <= net_weight "
    "AND quantity IN (0, 1))"
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


def _reassert_constraints() -> None:
    op.drop_constraint("items_stock_contract", "items", type_="check")
    op.drop_constraint("items_pricing_contract", "items", type_="check")
    op.drop_constraint("item_history_values_valid", "item_history", type_="check")
    op.create_check_constraint("items_stock_contract", "items", ITEM_STOCK_CONTRACT)
    op.create_check_constraint("items_pricing_contract", "items", ITEM_PRICING_CONTRACT)
    op.create_check_constraint(
        "item_history_values_valid",
        "item_history",
        ITEM_HISTORY_VALUES_VALID,
    )


def upgrade() -> None:
    _reassert_constraints()


def downgrade() -> None:
    _reassert_constraints()
