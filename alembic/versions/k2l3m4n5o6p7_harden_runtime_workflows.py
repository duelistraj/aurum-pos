"""Harden runtime workflows and query paths.

Revision ID: k2l3m4n5o6p7
Revises: a8c9d0e1f2g3
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "k2l3m4n5o6p7"
down_revision: str | Sequence[str] | None = "a8c9d0e1f2g3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "shops",
        sa.Column("next_invoice_sequence", sa.BigInteger(), server_default="1", nullable=False),
    )

    for name, column_type in (
        ("item_sku", sa.String(length=50)),
        ("item_name", sa.String(length=255)),
        ("item_metal", sa.String(length=50)),
        ("item_category", sa.String(length=20)),
        ("item_purity", sa.Numeric(precision=5, scale=2)),
        ("item_net_weight", sa.Numeric(precision=10, scale=3)),
        ("item_making_charge", sa.Numeric(precision=10, scale=2)),
    ):
        op.add_column("sale_items", sa.Column(name, column_type, nullable=True))

    op.execute(
        """
        UPDATE sale_items AS si
        SET item_sku = i.sku,
            item_name = i.name,
            item_metal = i.metal,
            item_category = i.category,
            item_purity = i.purity,
            item_net_weight = i.net_weight,
            item_making_charge = i.making_charge
        FROM items AS i
        WHERE i.id = si.item_id
          AND i.shop_id = si.shop_id
        """
    )

    op.add_column(
        "account_deletion_requests",
        sa.Column("cleanup_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "account_deletion_requests",
        sa.Column("cleanup_next_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "account_deletion_requests",
        sa.Column("cleanup_attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "account_deletion_requests",
        sa.Column("cleanup_last_error_code", sa.String(length=100), nullable=True),
    )

    op.create_table(
        "auth_rate_limits",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scope", sa.String(length=50), nullable=False),
        sa.Column("subject_hash", sa.String(length=64), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("request_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scope", "subject_hash", "window_started_at"),
    )
    op.create_index(
        "ix_auth_rate_limits_window_started_at",
        "auth_rate_limits",
        ["window_started_at"],
    )

    op.add_column(
        "play_subscriptions",
        sa.Column("next_verification_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "play_subscriptions",
        sa.Column("verification_lease_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "play_subscriptions",
        sa.Column("deletion_cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_play_subscriptions_next_verification_at",
        "play_subscriptions",
        ["next_verification_at"],
    )

    op.add_column(
        "email_outbox",
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "email_outbox",
        sa.Column("last_error_code", sa.String(length=100), nullable=True),
    )

    op.create_index("ix_sales_shop_created_at", "sales", ["shop_id", "created_at"])
    op.create_index("ix_sale_items_shop_sale", "sale_items", ["shop_id", "sale_id"])
    op.create_index("ix_sale_items_shop_item", "sale_items", ["shop_id", "item_id"])
    op.create_index(
        "ix_change_log_shop_created_at",
        "change_log",
        ["shop_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_items_shop_status_updated_at",
        "items",
        ["shop_id", "status", sa.text("updated_at DESC")],
    )
    op.create_index(
        "ix_email_outbox_pending_schedule",
        "email_outbox",
        ["next_attempt_at", "created_at"],
        postgresql_where=sa.text("status IN ('pending', 'processing')"),
    )


def downgrade() -> None:
    op.drop_index("ix_email_outbox_pending_schedule", table_name="email_outbox")
    op.drop_index("ix_items_shop_status_updated_at", table_name="items")
    op.drop_index("ix_change_log_shop_created_at", table_name="change_log")
    op.drop_index("ix_sale_items_shop_item", table_name="sale_items")
    op.drop_index("ix_sale_items_shop_sale", table_name="sale_items")
    op.drop_index("ix_sales_shop_created_at", table_name="sales")

    op.drop_column("email_outbox", "last_error_code")
    op.drop_column("email_outbox", "claimed_at")

    op.drop_index("ix_play_subscriptions_next_verification_at", table_name="play_subscriptions")
    op.drop_column("play_subscriptions", "deletion_cancelled_at")
    op.drop_column("play_subscriptions", "verification_lease_until")
    op.drop_column("play_subscriptions", "next_verification_at")

    op.drop_index("ix_auth_rate_limits_window_started_at", table_name="auth_rate_limits")
    op.drop_table("auth_rate_limits")

    op.drop_column("account_deletion_requests", "cleanup_last_error_code")
    op.drop_column("account_deletion_requests", "cleanup_attempts")
    op.drop_column("account_deletion_requests", "cleanup_next_attempt_at")
    op.drop_column("account_deletion_requests", "cleanup_started_at")

    for name in (
        "item_making_charge",
        "item_net_weight",
        "item_purity",
        "item_category",
        "item_metal",
        "item_name",
        "item_sku",
    ):
        op.drop_column("sale_items", name)

    op.drop_column("shops", "next_invoice_sequence")
