"""Scale and tenant hardening.

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "l3m4n5o6p7q8"
down_revision: str | Sequence[str] | None = "k2l3m4n5o6p7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TENANT_DEFAULT = sa.text("NULLIF(current_setting('app.current_shop_id', true), '')::uuid")


def _enable_tenant_rls(table_name: str) -> None:
    op.execute(f'ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY')
    op.execute(f'ALTER TABLE "{table_name}" FORCE ROW LEVEL SECURITY')
    op.execute(
        f"""CREATE POLICY tenant_isolation_{table_name} ON "{table_name}"
        USING (shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid)
        WITH CHECK (
            shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid
        )"""
    )


def upgrade() -> None:
    for name, column_type in (
        ("legal_name", sa.String(length=200)),
        ("tax_id", sa.String(length=30)),
        ("address", sa.String(length=500)),
        ("state", sa.String(length=100)),
        ("state_code", sa.String(length=10)),
        ("invoice_prefix", sa.String(length=20)),
    ):
        op.add_column("shops", sa.Column(name, column_type, nullable=True))
    op.execute(
        """
        UPDATE shops
        SET legal_name = name,
            state = 'West Bengal',
            state_code = '19',
            invoice_prefix = 'INV'
        WHERE legal_name IS NULL
        """
    )

    for name, column_type in (
        ("seller_name", sa.String(length=200)),
        ("seller_tax_id", sa.String(length=30)),
        ("seller_address", sa.String(length=500)),
        ("seller_state", sa.String(length=100)),
        ("seller_state_code", sa.String(length=10)),
    ):
        op.add_column("sales", sa.Column(name, column_type, nullable=True))
    op.add_column(
        "sales",
        sa.Column(
            "invoice_pdf_status",
            sa.String(length=20),
            server_default="pending",
            nullable=False,
        ),
    )
    op.add_column(
        "sales",
        sa.Column("invoice_pdf_attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("sales", sa.Column("invoice_pdf_next_attempt_at", sa.DateTime(timezone=True)))
    op.add_column("sales", sa.Column("invoice_pdf_lease_until", sa.DateTime(timezone=True)))
    op.add_column("sales", sa.Column("invoice_pdf_last_error_code", sa.String(length=100)))
    op.execute(
        """
        UPDATE sales AS sale
        SET seller_name = COALESCE(shop.legal_name, shop.name),
            seller_tax_id = shop.tax_id,
            seller_address = shop.address,
            seller_state = COALESCE(shop.state, 'West Bengal'),
            seller_state_code = COALESCE(shop.state_code, '19'),
            invoice_pdf_status = CASE
                WHEN sale.s3_object_key IS NOT NULL THEN 'ready'
                ELSE 'pending'
            END
        FROM shops AS shop
        WHERE shop.id = sale.shop_id
        """
    )
    op.create_check_constraint(
        "sales_invoice_pdf_status_check",
        "sales",
        "invoice_pdf_status IN ('pending', 'processing', 'ready', 'failed')",
    )
    op.create_index(
        "ix_sales_pending_invoice_pdf",
        "sales",
        ["invoice_pdf_next_attempt_at", "created_at"],
        postgresql_where=sa.text(
            "s3_object_key IS NULL AND invoice_pdf_status IN ('pending', 'processing')"
        ),
    )
    op.create_table(
        "invoice_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("shop_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sale_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("last_error_code", sa.String(length=100)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["shop_id", "sale_id"],
            ["sales.shop_id", "sales.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "sale_id", name="uq_invoice_jobs_shop_sale"),
    )
    op.create_index(
        "ix_invoice_jobs_pending",
        "invoice_jobs",
        ["next_attempt_at", "created_at"],
        postgresql_where=sa.text("status IN ('pending', 'processing')"),
    )
    op.execute(
        """
        INSERT INTO invoice_jobs (id, shop_id, sale_id, status)
        SELECT gen_random_uuid(), shop_id, id, 'pending'
        FROM sales
        WHERE s3_object_key IS NULL
        """
    )

    op.add_column("items", sa.Column("archived_at", sa.DateTime(timezone=True)))
    op.create_index(
        "ix_items_shop_active_updated_at",
        "items",
        ["shop_id", sa.text("updated_at DESC")],
        postgresql_where=sa.text("archived_at IS NULL"),
    )

    op.create_table(
        "item_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "shop_id",
            postgresql.UUID(as_uuid=True),
            server_default=TENANT_DEFAULT,
            nullable=False,
        ),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=20), nullable=False),
        sa.Column("sku", sa.String(length=50), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("metal", sa.String(length=50), nullable=False),
        sa.Column("purity", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("net_weight", sa.Numeric(precision=10, scale=3), nullable=False),
        sa.Column("making_charge", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["shop_id", "item_id"],
            ["items.shop_id", "items.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_item_history_shop_item_effective",
        "item_history",
        ["shop_id", "item_id", sa.text("effective_from DESC")],
    )
    op.create_index(
        "ix_item_history_shop_effective",
        "item_history",
        ["shop_id", sa.text("effective_from DESC")],
    )
    _enable_tenant_rls("item_history")
    op.execute(
        """
        INSERT INTO item_history (
            id, shop_id, item_id, event_type, sku, category, metal, purity,
            net_weight, making_charge, quantity, status, effective_from
        )
        SELECT gen_random_uuid(), shop_id, id, 'baseline', sku, category, metal,
               purity, net_weight, making_charge, quantity, status,
               COALESCE(created_at, updated_at, now())
        FROM items
        """
    )

    op.execute(
        """
        DO $$
        DECLARE constraint_name text;
        BEGIN
            SELECT c.conname INTO constraint_name
            FROM pg_constraint AS c
            JOIN pg_class AS t ON t.oid = c.conrelid
            WHERE t.relname = 'metal_rates'
              AND c.contype = 'u'
              AND pg_get_constraintdef(c.oid)
                  = 'UNIQUE (shop_id, metal, purity)';
            IF constraint_name IS NOT NULL THEN
                EXECUTE format(
                    'ALTER TABLE metal_rates DROP CONSTRAINT %I',
                    constraint_name
                );
            END IF;
        END $$;
        """
    )
    op.create_index(
        "ix_metal_rates_shop_metal_purity_effective",
        "metal_rates",
        ["shop_id", "metal", "purity", sa.text("effective_from DESC")],
    )

    op.create_unique_constraint("uq_subscriptions_shop_id", "subscriptions", ["shop_id", "id"])
    op.drop_constraint(
        "play_subscriptions_subscription_id_fkey",
        "play_subscriptions",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_play_subscriptions_shop_subscription",
        "play_subscriptions",
        "subscriptions",
        ["shop_id", "subscription_id"],
        ["shop_id", "id"],
        ondelete="CASCADE",
    )
    op.drop_constraint(
        "sale_idempotency_sale_id_fkey",
        "sale_idempotency",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_sale_idempotency_shop_sale",
        "sale_idempotency",
        "sales",
        ["shop_id", "sale_id"],
        ["shop_id", "id"],
        ondelete="CASCADE",
    )

    op.add_column("change_log", sa.Column("barcode", sa.String(length=100)))
    op.add_column("change_log", sa.Column("invoice_no", sa.String(length=50)))
    op.execute(
        """
        UPDATE change_log
        SET barcode = NULLIF(payload ->> 'barcode', ''),
            invoice_no = NULLIF(payload ->> 'invoice_no', ''),
            payload = (payload::jsonb - 'customer_phone')::json
        """
    )
    op.create_index(
        "ix_change_log_shop_barcode_created",
        "change_log",
        ["shop_id", "barcode", sa.text("created_at DESC")],
        postgresql_where=sa.text("barcode IS NOT NULL"),
    )
    op.create_index(
        "ix_change_log_shop_invoice_created",
        "change_log",
        ["shop_id", "invoice_no", sa.text("created_at DESC")],
        postgresql_where=sa.text("invoice_no IS NOT NULL"),
    )

    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_index(
        "ix_items_name_trgm",
        "items",
        [sa.text("lower(name) gin_trgm_ops")],
        postgresql_using="gin",
    )
    op.create_index(
        "ix_items_sku_trgm",
        "items",
        [sa.text("lower(sku) gin_trgm_ops")],
        postgresql_using="gin",
    )

    op.create_table(
        "worker_heartbeats",
        sa.Column("worker_name", sa.String(length=100), nullable=False),
        sa.Column("revision", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text())),
        sa.PrimaryKeyConstraint("worker_name"),
    )


def downgrade() -> None:
    op.drop_table("worker_heartbeats")
    op.drop_index("ix_items_sku_trgm", table_name="items")
    op.drop_index("ix_items_name_trgm", table_name="items")
    op.drop_index("ix_change_log_shop_invoice_created", table_name="change_log")
    op.drop_index("ix_change_log_shop_barcode_created", table_name="change_log")
    op.drop_column("change_log", "invoice_no")
    op.drop_column("change_log", "barcode")

    op.drop_constraint("fk_sale_idempotency_shop_sale", "sale_idempotency", type_="foreignkey")
    op.create_foreign_key(
        "sale_idempotency_sale_id_fkey",
        "sale_idempotency",
        "sales",
        ["sale_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint(
        "fk_play_subscriptions_shop_subscription",
        "play_subscriptions",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "play_subscriptions_subscription_id_fkey",
        "play_subscriptions",
        "subscriptions",
        ["subscription_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint("uq_subscriptions_shop_id", "subscriptions", type_="unique")

    op.drop_index("ix_metal_rates_shop_metal_purity_effective", table_name="metal_rates")
    op.create_unique_constraint(
        "metal_rates_shop_id_metal_purity_key",
        "metal_rates",
        ["shop_id", "metal", "purity"],
    )

    op.execute("DROP POLICY tenant_isolation_item_history ON item_history")
    op.drop_table("item_history")
    op.drop_index("ix_items_shop_active_updated_at", table_name="items")
    op.drop_column("items", "archived_at")

    op.drop_table("invoice_jobs")
    op.drop_index("ix_sales_pending_invoice_pdf", table_name="sales")
    op.drop_constraint("sales_invoice_pdf_status_check", "sales", type_="check")
    for name in (
        "invoice_pdf_last_error_code",
        "invoice_pdf_lease_until",
        "invoice_pdf_next_attempt_at",
        "invoice_pdf_attempts",
        "invoice_pdf_status",
        "seller_state_code",
        "seller_state",
        "seller_address",
        "seller_tax_id",
        "seller_name",
    ):
        op.drop_column("sales", name)
    for name in (
        "invoice_prefix",
        "state_code",
        "state",
        "address",
        "tax_id",
        "legal_name",
    ):
        op.drop_column("shops", name)
