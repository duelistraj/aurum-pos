"""add shared-database SaaS tenancy

Revision ID: c3d4e5f6a7b8
Revises: b14a9709a2f6
Create Date: 2026-07-21 00:00:00.000000

This migration intentionally resets legacy non-item data. Production BMR data is
migrated into a new database with the item-only import command.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "b14a9709a2f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TENANT_TABLES = ("items", "metal_rates", "sales", "sale_items", "change_log", "subscriptions")
LEGACY_SHOP_ID = "00000000-0000-0000-0000-000000000001"


def _tenant_policy(table_name: str) -> None:
    op.execute(f'ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY')
    op.execute(f'ALTER TABLE "{table_name}" FORCE ROW LEVEL SECURITY')
    op.execute(
        f'''CREATE POLICY tenant_isolation_{table_name} ON "{table_name}"
        USING (shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid)
        WITH CHECK (shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid)'''
    )


def upgrade() -> None:
    op.drop_table("sale_items")
    op.drop_table("sales")
    op.drop_table("change_log")
    op.drop_table("metal_rates")
    op.drop_table("devices")
    op.drop_table("users")

    op.create_table(
        "shops",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_shops_slug", "shops", ["slug"], unique=True)

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(255)),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("email_verified_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "user_identities",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("provider_subject", sa.String(255), nullable=False),
        sa.Column("email_snapshot", sa.String(320), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "provider_subject"),
    )
    op.create_index("ix_user_identities_user_id", "user_identities", ["user_id"])

    op.create_table(
        "devices",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("device_uuid", sa.String(100), nullable=False),
        sa.Column("device_name", sa.String(100), nullable=False),
        sa.Column("platform", sa.String(50), nullable=False),
        sa.Column("app_version", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("registered_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "device_uuid"),
    )
    op.create_index("ix_devices_user_id", "devices", ["user_id"])
    op.create_index("ix_devices_device_uuid", "devices", ["device_uuid"])

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("refresh_token_hash", sa.String(64), nullable=False),
        sa.Column("device_uuid", sa.String(100), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("refresh_token_hash"),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])

    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("purpose", sa.String(30), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_auth_tokens_user_id", "auth_tokens", ["user_id"])

    op.create_table(
        "google_nonces",
        sa.Column("nonce_hash", sa.String(64), primary_key=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "shop_memberships",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')"),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "user_id"),
    )
    op.create_index("ix_shop_memberships_shop_id", "shop_memberships", ["shop_id"])
    op.create_index("ix_shop_memberships_user_id", "shop_memberships", ["user_id"])

    op.create_table(
        "shop_invitations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("invited_by_user_id", sa.UUID(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('ADMIN', 'MANAGER', 'CASHIER')"),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_shop_invitations_shop_id", "shop_invitations", ["shop_id"])
    op.create_index("ix_shop_invitations_email", "shop_invitations", ["email"])

    op.create_table(
        "shop_device_access",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False),
        sa.Column("device_id", sa.UUID(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "device_id"),
    )
    op.create_index("ix_shop_device_access_shop_id", "shop_device_access", ["shop_id"])

    op.execute(
        f"""INSERT INTO shops (id, name, slug)
        SELECT '{LEGACY_SHOP_ID}'::uuid, 'Legacy Shop', 'legacy-import'
        WHERE EXISTS (SELECT 1 FROM items)"""
    )
    op.drop_index("ix_items_barcode", table_name="items")
    op.add_column(
        "items",
        sa.Column(
            "shop_id",
            sa.UUID(),
            sa.ForeignKey("shops.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.execute(f"UPDATE items SET shop_id = '{LEGACY_SHOP_ID}'::uuid WHERE shop_id IS NULL")
    op.alter_column(
        "items",
        "shop_id",
        nullable=False,
        server_default=sa.text("NULLIF(current_setting('app.current_shop_id', true), '')::uuid"),
    )
    op.create_index("ix_items_shop_id", "items", ["shop_id"])
    op.create_index("ix_items_barcode", "items", ["barcode"])
    op.create_unique_constraint("uq_items_shop_barcode", "items", ["shop_id", "barcode"])
    op.create_unique_constraint("uq_items_shop_id", "items", ["shop_id", "id"])

    tenant_default = sa.text("NULLIF(current_setting('app.current_shop_id', true), '')::uuid")
    op.create_table(
        "metal_rates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False, server_default=tenant_default),
        sa.Column("metal", sa.String(20), nullable=False),
        sa.Column("purity", sa.Numeric(5, 2), nullable=False),
        sa.Column("rate_per_gram", sa.Numeric(10, 2), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "metal", "purity"),
    )
    op.create_index("ix_metal_rates_shop_id", "metal_rates", ["shop_id"])
    op.create_index("ix_metal_rates_metal", "metal_rates", ["metal"])
    op.create_index("ix_metal_rates_purity", "metal_rates", ["purity"])
    op.create_index("ix_metal_rates_effective_from", "metal_rates", ["effective_from"])

    op.create_table(
        "sales",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False, server_default=tenant_default),
        sa.Column("invoice_no", sa.String(50), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("customer_name", sa.String(100), nullable=False),
        sa.Column("customer_phone", sa.String(15), nullable=False),
        sa.Column("customer_address", sa.String(255)),
        sa.Column("customer_state", sa.String(50), nullable=False, server_default="West Bengal"),
        sa.Column("customer_state_code", sa.String(5), nullable=False, server_default="19"),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "invoice_no", name="uq_sales_shop_invoice"),
        sa.UniqueConstraint("shop_id", "id", name="uq_sales_shop_id"),
    )
    op.create_index("ix_sales_shop_id", "sales", ["shop_id"])

    op.create_table(
        "sale_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False, server_default=tenant_default),
        sa.Column("sale_id", sa.UUID(), nullable=False),
        sa.Column("item_id", sa.UUID(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("price_breakdown", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["shop_id", "sale_id"],
            ["sales.shop_id", "sales.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["shop_id", "item_id"], ["items.shop_id", "items.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sale_items_shop_id", "sale_items", ["shop_id"])

    op.create_table(
        "change_log",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False, server_default=tenant_default),
        sa.Column("entity", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_change_log_shop_id", "change_log", ["shop_id"])
    op.create_index("ix_change_log_entity_id", "change_log", ["entity_id"])
    op.create_index("ix_change_log_created_at", "change_log", ["created_at"])

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("plan", sa.String(30), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="active"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("external_reference", sa.String(255)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("source IN ('play', 'trial', 'complimentary', 'admin_grant')"),
        sa.CheckConstraint("plan = 'premium'"),
        sa.CheckConstraint("status IN ('active', 'revoked', 'expired')"),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_reference"),
    )
    op.create_index("ix_subscriptions_shop_id", "subscriptions", ["shop_id"])
    op.create_index("ix_subscriptions_expires_at", "subscriptions", ["expires_at"])

    op.create_table(
        "play_subscriptions",
        sa.Column("subscription_id", sa.UUID(), nullable=False),
        sa.Column("shop_id", sa.UUID(), nullable=False),
        sa.Column("package_name", sa.String(255), nullable=False),
        sa.Column("product_id", sa.String(255), nullable=False),
        sa.Column("base_plan_id", sa.String(255)),
        sa.Column("purchase_token", sa.Text(), nullable=False),
        sa.Column("purchase_token_hash", sa.String(64), nullable=False),
        sa.Column("order_id", sa.String(255)),
        sa.Column("state", sa.String(50), nullable=False),
        sa.Column("auto_renewing", sa.Boolean()),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("subscription_id"),
        sa.UniqueConstraint("purchase_token_hash"),
    )
    op.create_index("ix_play_subscriptions_shop_id", "play_subscriptions", ["shop_id"])

    op.create_table(
        "billing_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("provider_event_id", sa.String(255), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("payload_digest", sa.String(64), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_event_id"),
    )

    op.create_table(
        "email_outbox",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("recipient", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("text_body", sa.Text(), nullable=False),
        sa.Column("template_data", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_outbox_status", "email_outbox", ["status"])

    for table_name in TENANT_TABLES:
        _tenant_policy(table_name)


def downgrade() -> None:
    for table_name in TENANT_TABLES:
        op.execute(f'DROP POLICY IF EXISTS tenant_isolation_{table_name} ON "{table_name}"')
    op.drop_table("email_outbox")
    op.drop_table("billing_events")
    op.drop_table("play_subscriptions")
    op.drop_table("subscriptions")
    op.drop_table("change_log")
    op.drop_table("sale_items")
    op.drop_table("sales")
    op.drop_table("metal_rates")
    op.drop_constraint("uq_items_shop_id", "items", type_="unique")
    op.drop_constraint("uq_items_shop_barcode", "items", type_="unique")
    op.drop_index("ix_items_shop_id", table_name="items")
    op.drop_column("items", "shop_id")
    op.drop_index("ix_items_barcode", table_name="items")
    op.create_index("ix_items_barcode", "items", ["barcode"], unique=True)
    op.drop_table("shop_device_access")
    op.drop_table("shop_invitations")
    op.drop_table("shop_memberships")
    op.drop_table("google_nonces")
    op.drop_table("auth_tokens")
    op.drop_table("auth_sessions")
    op.drop_table("devices")
    op.drop_table("user_identities")
    op.drop_table("users")
    op.drop_table("shops")
