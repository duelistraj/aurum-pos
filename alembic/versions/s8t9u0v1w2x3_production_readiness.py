"""Add production-readiness state, constraints, and queue indexes.

Revision ID: s8t9u0v1w2x3
Revises: r7s8t9u0v1w2
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "s8t9u0v1w2x3"
down_revision: str | Sequence[str] | None = "r7s8t9u0v1w2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "shops",
        sa.Column(
            "total_sales_amount",
            sa.Numeric(precision=16, scale=2),
            nullable=False,
            server_default="0",
        ),
    )
    op.execute(
        """
        UPDATE shops
        SET total_sales_amount = COALESCE(
            (
                SELECT SUM(sales.total_amount)
                FROM sales
                WHERE sales.shop_id = shops.id
            ),
            0
        )
        """
    )
    op.add_column(
        "account_deletion_requests",
        sa.Column("external_cleanup_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "play_subscriptions",
        sa.Column(
            "acknowledgement_pending",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "play_subscriptions",
        sa.Column(
            "acknowledgement_attempts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "play_subscriptions",
        sa.Column("acknowledgement_next_attempt_at", sa.DateTime(timezone=True)),
    )
    op.add_column(
        "play_subscriptions",
        sa.Column("acknowledgement_last_error_code", sa.String(length=100)),
    )
    op.add_column(
        "play_subscriptions",
        sa.Column("acknowledged_at", sa.DateTime(timezone=True)),
    )

    op.create_check_constraint("items_quantity_nonnegative", "items", "quantity >= 0")
    op.create_check_constraint(
        "items_purity_range",
        "items",
        "purity >= 0 AND purity <= 100",
    )
    op.create_check_constraint(
        "items_nonnegative_money_weight",
        "items",
        "net_weight >= 0 AND making_charge >= 0",
    )
    op.create_check_constraint(
        "items_status_allowed",
        "items",
        "status IN ('in_stock', 'sold', 'reserved', 'archived')",
    )
    op.create_check_constraint(
        "items_unique_weight_contract",
        "items",
        "(category = 'unique' AND net_weight = 0) OR (category <> 'unique' AND net_weight > 0)",
    )
    op.create_check_constraint(
        "sale_items_quantity_positive",
        "sale_items",
        "quantity > 0",
    )
    op.create_check_constraint(
        "sale_items_price_nonnegative",
        "sale_items",
        "price >= 0",
    )
    op.create_check_constraint(
        "item_history_values_valid",
        "item_history",
        "quantity >= 0 AND purity >= 0 AND purity <= 100 "
        "AND net_weight >= 0 AND making_charge >= 0",
    )

    op.create_index(
        "ix_auth_sessions_retention",
        "auth_sessions",
        ["expires_at", "revoked_at"],
    )
    op.create_index(
        "ix_auth_tokens_retention",
        "auth_tokens",
        ["expires_at", "consumed_at"],
    )
    op.create_index("ix_google_nonces_retention", "google_nonces", ["consumed_at"])
    op.create_index(
        "ix_shop_invitations_retention",
        "shop_invitations",
        ["expires_at", "accepted_at"],
    )
    op.create_index("ix_billing_events_retention", "billing_events", ["created_at"])
    op.create_index(
        "ix_invoice_jobs_reclaim",
        "invoice_jobs",
        ["lease_until", "created_at"],
        postgresql_where=sa.text("status = 'processing'"),
    )
    op.create_index(
        "ix_email_outbox_reclaim",
        "email_outbox",
        ["claimed_at", "created_at"],
        postgresql_where=sa.text("status = 'processing'"),
    )
    op.create_index(
        "ix_play_subscriptions_ack_due",
        "play_subscriptions",
        ["acknowledgement_next_attempt_at"],
        postgresql_where=sa.text("acknowledgement_pending"),
    )
    op.create_index(
        "ix_play_subscriptions_lease",
        "play_subscriptions",
        ["verification_lease_until"],
    )
    op.create_index(
        "ix_account_deletion_cleanup_due",
        "account_deletion_requests",
        ["cleanup_next_attempt_at", "cleanup_started_at"],
        postgresql_where=sa.text(
            "confirmed_at IS NOT NULL AND cancelled_at IS NULL AND completed_at IS NULL"
        ),
    )


def downgrade() -> None:
    op.drop_index("ix_account_deletion_cleanup_due", table_name="account_deletion_requests")
    op.drop_index("ix_play_subscriptions_lease", table_name="play_subscriptions")
    op.drop_index("ix_play_subscriptions_ack_due", table_name="play_subscriptions")
    op.drop_index("ix_email_outbox_reclaim", table_name="email_outbox")
    op.drop_index("ix_invoice_jobs_reclaim", table_name="invoice_jobs")
    op.drop_index("ix_google_nonces_retention", table_name="google_nonces")
    op.drop_index("ix_billing_events_retention", table_name="billing_events")
    op.drop_index("ix_shop_invitations_retention", table_name="shop_invitations")
    op.drop_index("ix_auth_tokens_retention", table_name="auth_tokens")
    op.drop_index("ix_auth_sessions_retention", table_name="auth_sessions")

    op.drop_constraint("item_history_values_valid", "item_history", type_="check")
    op.drop_constraint("sale_items_price_nonnegative", "sale_items", type_="check")
    op.drop_constraint("sale_items_quantity_positive", "sale_items", type_="check")
    op.drop_constraint("items_unique_weight_contract", "items", type_="check")
    op.drop_constraint("items_status_allowed", "items", type_="check")
    op.drop_constraint("items_nonnegative_money_weight", "items", type_="check")
    op.drop_constraint("items_purity_range", "items", type_="check")
    op.drop_constraint("items_quantity_nonnegative", "items", type_="check")

    op.drop_column("play_subscriptions", "acknowledged_at")
    op.drop_column("play_subscriptions", "acknowledgement_last_error_code")
    op.drop_column("play_subscriptions", "acknowledgement_next_attempt_at")
    op.drop_column("play_subscriptions", "acknowledgement_attempts")
    op.drop_column("play_subscriptions", "acknowledgement_pending")
    op.drop_column("account_deletion_requests", "external_cleanup_started_at")
    op.drop_column("shops", "total_sales_amount")
