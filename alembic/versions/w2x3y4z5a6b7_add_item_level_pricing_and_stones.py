"""Add item-level pricing, weighted stock, and stones.

Revision ID: w2x3y4z5a6b7
Revises: v1w2x3y4z5a6
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "w2x3y4z5a6b7"
down_revision: str | None = "v1w2x3y4z5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("items_unique_weight_contract", "items", type_="check")
    op.drop_constraint("items_nonnegative_money_weight", "items", type_="check")
    op.drop_constraint("item_history_values_valid", "item_history", type_="check")
    for table in ("items", "item_history"):
        op.add_column(
            table, sa.Column("item_type", sa.String(20), server_default="jewellery", nullable=False)
        )
        op.add_column(table, sa.Column("pricing_method", sa.String(30), nullable=True))
        op.add_column(
            table, sa.Column("stock_mode", sa.String(20), server_default="quantity", nullable=False)
        )
        op.add_column(table, sa.Column("stock_weight", sa.Numeric(10, 3)))
        op.add_column(table, sa.Column("ratti", sa.Numeric(10, 3)))
        op.add_column(table, sa.Column("rate_per_ratti", sa.Numeric(12, 2)))
        op.add_column(table, sa.Column("stone_tax_profile", sa.String(50)))

    op.execute(
        "UPDATE items SET pricing_method = CASE "
        "WHEN lower(category) = 'unique' THEN 'fixed_rate' "
        "WHEN lower(category) = 'other' THEN 'fixed_making_charge' "
        "ELSE 'making_charge_per_gram' END"
    )
    op.execute(
        "UPDATE item_history SET pricing_method = CASE "
        "WHEN lower(category) = 'unique' THEN 'fixed_rate' "
        "WHEN lower(category) = 'other' THEN 'fixed_making_charge' "
        "ELSE 'making_charge_per_gram' END"
    )
    # migration-safety: allow after every row is backfilled above
    op.alter_column("items", "pricing_method", nullable=False)
    # migration-safety: allow after every row is backfilled above
    op.alter_column("item_history", "pricing_method", nullable=False)

    op.create_check_constraint(
        "items_nonnegative_money_weight",
        "items",
        "net_weight >= 0 AND making_charge >= 0 AND fixed_rate >= 0 "
        "AND (stock_weight IS NULL OR stock_weight >= 0) "
        "AND (ratti IS NULL OR ratti >= 0) "
        "AND (rate_per_ratti IS NULL OR rate_per_ratti >= 0)",
    )
    op.create_check_constraint(
        "item_history_values_valid",
        "item_history",
        "quantity >= 0 AND purity >= 0 AND purity <= 100 "
        "AND net_weight >= 0 AND making_charge >= 0 AND fixed_rate >= 0 "
        "AND (stock_weight IS NULL OR stock_weight >= 0) "
        "AND (ratti IS NULL OR ratti >= 0) "
        "AND (rate_per_ratti IS NULL OR rate_per_ratti >= 0)",
    )

    op.create_check_constraint(
        "items_modes_allowed",
        "items",
        "item_type IN ('jewellery', 'stone') AND "
        "pricing_method IN ('fixed_rate', 'fixed_making_charge', "
        "'making_charge_per_gram', 'rate_per_ratti') AND "
        "stock_mode IN ('quantity', 'weight')",
    )
    op.create_check_constraint(
        "items_type_contract",
        "items",
        "(item_type = 'stone' AND metal = 'stone' AND pricing_method = 'rate_per_ratti' "
        "AND stock_mode = 'quantity' AND purity = 0 AND net_weight = 0 AND making_charge = 0 "
        "AND fixed_rate = 0 AND stock_weight IS NULL AND ratti > 0 AND rate_per_ratti > 0) OR "
        "(item_type = 'jewellery' AND metal <> 'stone' AND pricing_method <> 'rate_per_ratti' "
        "AND ratti IS NULL AND rate_per_ratti IS NULL)",
    )
    op.create_check_constraint(
        "items_stock_contract",
        "items",
        "(stock_mode = 'quantity' AND stock_weight IS NULL) OR "
        "(stock_mode = 'weight' AND item_type = 'jewellery' AND pricing_method <> 'fixed_rate' "
        "AND net_weight = 0 AND stock_weight IS NOT NULL AND quantity IN (0, 1))",
    )
    op.create_check_constraint(
        "items_pricing_contract",
        "items",
        "item_type = 'stone' OR "
        "(pricing_method = 'fixed_rate' AND fixed_rate > 0 AND making_charge = 0 "
        "AND stock_mode = 'quantity') OR "
        "(pricing_method IN ('fixed_making_charge', 'making_charge_per_gram') "
        "AND fixed_rate = 0 AND "
        "((stock_mode = 'quantity' AND net_weight > 0) OR stock_mode = 'weight'))",
    )

    for column, type_ in (
        ("item_type", sa.String(20)),
        ("item_pricing_method", sa.String(30)),
        ("item_stock_mode", sa.String(20)),
        ("item_ratti", sa.Numeric(10, 3)),
        ("item_rate_per_ratti", sa.Numeric(12, 2)),
        ("item_stone_tax_profile", sa.String(50)),
        ("sold_weight", sa.Numeric(10, 3)),
    ):
        op.add_column("sale_items", sa.Column(column, type_))


def downgrade() -> None:
    for column in (
        "sold_weight",
        "item_stone_tax_profile",
        "item_rate_per_ratti",
        "item_ratti",
        "item_stock_mode",
        "item_pricing_method",
        "item_type",
    ):
        op.drop_column("sale_items", column)
    for constraint in (
        "items_pricing_contract",
        "items_stock_contract",
        "items_type_contract",
        "items_modes_allowed",
    ):
        op.drop_constraint(constraint, "items", type_="check")
    op.drop_constraint("items_nonnegative_money_weight", "items", type_="check")
    op.drop_constraint("item_history_values_valid", "item_history", type_="check")
    for table in ("item_history", "items"):
        for column in (
            "stone_tax_profile",
            "rate_per_ratti",
            "ratti",
            "stock_weight",
            "stock_mode",
            "pricing_method",
            "item_type",
        ):
            op.drop_column(table, column)
    op.create_check_constraint(
        "items_unique_weight_contract",
        "items",
        "(category = 'unique' AND net_weight = 0 AND making_charge = 0) OR "
        "(category <> 'unique' AND net_weight > 0 AND fixed_rate = 0)",
    )
    op.create_check_constraint(
        "items_nonnegative_money_weight",
        "items",
        "net_weight >= 0 AND making_charge >= 0 AND fixed_rate >= 0",
    )
    op.create_check_constraint(
        "item_history_values_valid",
        "item_history",
        "quantity >= 0 AND purity >= 0 AND purity <= 100 "
        "AND net_weight >= 0 AND making_charge >= 0 AND fixed_rate >= 0",
    )
