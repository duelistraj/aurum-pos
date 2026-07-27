"""Preserve the current metal-rate contract and add immutable history.

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "n4o5p6q7r8s9"
down_revision: str | Sequence[str] | None = "m3n4o5p6q7r8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_metal_rates_shop_metal_purity",
        "metal_rates",
        ["shop_id", "metal", "purity"],
    )
    op.create_table(
        "metal_rate_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "shop_id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text(
                "NULLIF(current_setting('app.current_shop_id', true), '')::uuid"
            ),
            nullable=False,
        ),
        sa.Column("metal", sa.String(length=20), nullable=False),
        sa.Column("purity", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("rate_per_gram", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_metal_rate_history_shop_metal_effective",
        "metal_rate_history",
        ["shop_id", "metal", "purity", sa.text("effective_from DESC")],
    )
    op.execute(
        """
        INSERT INTO metal_rate_history (
            id, shop_id, metal, purity, rate_per_gram, effective_from
        )
        SELECT gen_random_uuid(), shop_id, metal, purity, rate_per_gram,
               COALESCE(effective_from, created_at, now())
        FROM metal_rates
        """
    )
    op.execute(
        """
        CREATE FUNCTION append_metal_rate_history()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            INSERT INTO metal_rate_history (
                id, shop_id, metal, purity, rate_per_gram, effective_from
            )
            VALUES (
                gen_random_uuid(), NEW.shop_id, NEW.metal, NEW.purity,
                NEW.rate_per_gram, COALESCE(NEW.effective_from, now())
            );
            RETURN NEW;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE TRIGGER metal_rates_append_history
        AFTER INSERT OR UPDATE OF rate_per_gram ON metal_rates
        FOR EACH ROW
        EXECUTE FUNCTION append_metal_rate_history()
        """
    )
    op.execute("ALTER TABLE metal_rate_history ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE metal_rate_history FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation_metal_rate_history ON metal_rate_history
        USING (
            shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid
        )
        WITH CHECK (
            shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER metal_rates_append_history ON metal_rates")
    op.execute("DROP FUNCTION append_metal_rate_history()")
    op.drop_table("metal_rate_history")
    op.drop_constraint(
        "uq_metal_rates_shop_metal_purity",
        "metal_rates",
        type_="unique",
    )
