"""Harden runtime data integrity, leases, and invoice search.

Revision ID: r7s8t9u0v1w2
Revises: q6r7s8t9u0v1
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "r7s8t9u0v1w2"
down_revision: str | Sequence[str] | None = "q6r7s8t9u0v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "shop_invitations_invited_by_user_id_fkey",
        "shop_invitations",
        type_="foreignkey",
    )
    op.alter_column(
        "shop_invitations",
        "invited_by_user_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.create_foreign_key(
        "shop_invitations_invited_by_user_id_fkey",
        "shop_invitations",
        "users",
        ["invited_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM metal_rates
                WHERE rate_per_gram <= 0 OR purity <= 0 OR purity > 100
            ) OR EXISTS (
                SELECT 1
                FROM metal_rate_history
                WHERE rate_per_gram <= 0 OR purity <= 0 OR purity > 100
            ) THEN
                RAISE EXCEPTION
                    'Invalid metal rates must be audited before applying readiness constraints';
            END IF;
        END $$;
        """
    )
    op.create_check_constraint(
        "metal_rates_positive_rate_check",
        "metal_rates",
        "rate_per_gram > 0",
    )
    op.create_check_constraint(
        "metal_rates_purity_range_check",
        "metal_rates",
        "purity > 0 AND purity <= 100",
    )
    op.create_check_constraint(
        "metal_rate_history_positive_rate_check",
        "metal_rate_history",
        "rate_per_gram > 0",
    )
    op.create_check_constraint(
        "metal_rate_history_purity_range_check",
        "metal_rate_history",
        "purity > 0 AND purity <= 100",
    )

    op.add_column(
        "email_outbox",
        sa.Column("claim_token", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "invoice_jobs",
        sa.Column("lease_token", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "play_subscriptions",
        sa.Column("verification_lease_token", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "account_deletion_requests",
        sa.Column("cleanup_lease_token", postgresql.UUID(as_uuid=True), nullable=True),
    )

    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_index(
        "ix_sales_shop_invoice_no_prefix",
        "sales",
        ["shop_id", sa.text("lower(invoice_no) text_pattern_ops")],
    )
    op.create_index(
        "ix_sales_shop_customer_phone_prefix",
        "sales",
        ["shop_id", sa.text("customer_phone text_pattern_ops")],
    )
    op.create_index(
        "ix_sales_customer_name_trgm",
        "sales",
        [sa.text("lower(customer_name) gin_trgm_ops")],
        postgresql_using="gin",
    )
    op.drop_index("ix_shops_slug", table_name="shops")
    op.drop_index("ix_users_email", table_name="users")


def downgrade() -> None:
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_shops_slug", "shops", ["slug"])
    op.drop_index("ix_sales_customer_name_trgm", table_name="sales")
    op.drop_index("ix_sales_shop_customer_phone_prefix", table_name="sales")
    op.drop_index("ix_sales_shop_invoice_no_prefix", table_name="sales")

    op.drop_column("account_deletion_requests", "cleanup_lease_token")
    op.drop_column("play_subscriptions", "verification_lease_token")
    op.drop_column("invoice_jobs", "lease_token")
    op.drop_column("email_outbox", "claim_token")

    op.drop_constraint(
        "metal_rate_history_purity_range_check",
        "metal_rate_history",
        type_="check",
    )
    op.drop_constraint(
        "metal_rate_history_positive_rate_check",
        "metal_rate_history",
        type_="check",
    )
    op.drop_constraint("metal_rates_purity_range_check", "metal_rates", type_="check")
    op.drop_constraint("metal_rates_positive_rate_check", "metal_rates", type_="check")

    op.drop_constraint(
        "shop_invitations_invited_by_user_id_fkey",
        "shop_invitations",
        type_="foreignkey",
    )
    op.alter_column(
        "shop_invitations",
        "invited_by_user_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
    op.create_foreign_key(
        "shop_invitations_invited_by_user_id_fkey",
        "shop_invitations",
        "users",
        ["invited_by_user_id"],
        ["id"],
    )
