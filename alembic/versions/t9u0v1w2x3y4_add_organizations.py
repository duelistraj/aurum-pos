"""Add organization-level shops, entitlements, and ownership transfers.

Revision ID: t9u0v1w2x3y4
Revises: s8t9u0v1w2x3
Create Date: 2026-07-29
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "t9u0v1w2x3y4"
down_revision: str | Sequence[str] | None = "s8t9u0v1w2x3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("owner_user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_organizations_owner_user_id",
        "organizations",
        ["owner_user_id"],
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM shops AS shop
            WHERE NOT EXISTS (
              SELECT 1
              FROM shop_memberships AS membership
              WHERE membership.shop_id = shop.id
                AND membership.role = 'OWNER'
                AND membership.is_active
            )
          ) THEN
            RAISE EXCEPTION 'Every shop must have an active owner before organization migration';
          END IF;
        END $$;
        """
    )
    op.execute(
        """
        INSERT INTO organizations (id, name, owner_user_id, created_at, updated_at)
        SELECT
          shop.id,
          shop.name,
          (
            SELECT membership.user_id
            FROM shop_memberships AS membership
            WHERE membership.shop_id = shop.id
              AND membership.role = 'OWNER'
              AND membership.is_active
            ORDER BY membership.created_at, membership.id
            LIMIT 1
          ),
          shop.created_at,
          shop.updated_at
        FROM shops AS shop
        """
    )
    op.add_column("shops", sa.Column("organization_id", sa.UUID(), nullable=True))
    op.execute("UPDATE shops SET organization_id = id")
    op.alter_column("shops", "organization_id", nullable=False)
    op.create_foreign_key(
        "fk_shops_organization",
        "shops",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_shops_organization_id", "shops", ["organization_id"])

    op.add_column(
        "organizations",
        sa.Column("primary_shop_id", sa.UUID(), nullable=True),
    )
    op.execute("UPDATE organizations SET primary_shop_id = id")
    op.create_unique_constraint(
        "uq_organizations_primary_shop_id",
        "organizations",
        ["primary_shop_id"],
    )
    op.create_foreign_key(
        "fk_organizations_primary_shop",
        "organizations",
        "shops",
        ["primary_shop_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.execute("DROP POLICY IF EXISTS tenant_isolation_subscriptions ON subscriptions")
    op.drop_constraint(
        "fk_play_subscriptions_shop_subscription",
        "play_subscriptions",
        type_="foreignkey",
    )
    op.drop_constraint(
        "play_subscriptions_shop_id_fkey",
        "play_subscriptions",
        type_="foreignkey",
    )
    op.drop_index("ix_play_subscriptions_shop_id", table_name="play_subscriptions")
    op.drop_constraint("uq_subscriptions_shop_id", "subscriptions", type_="unique")
    op.drop_constraint(
        "subscriptions_shop_id_fkey",
        "subscriptions",
        type_="foreignkey",
    )
    op.drop_index("ix_subscriptions_shop_id", table_name="subscriptions")

    op.alter_column("subscriptions", "shop_id", new_column_name="organization_id")
    op.alter_column("play_subscriptions", "shop_id", new_column_name="organization_id")
    op.create_foreign_key(
        "subscriptions_organization_id_fkey",
        "subscriptions",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_subscriptions_organization_id",
        "subscriptions",
        ["organization_id", "id"],
    )
    op.create_index(
        "ix_subscriptions_organization_id",
        "subscriptions",
        ["organization_id"],
    )
    op.create_foreign_key(
        "play_subscriptions_organization_id_fkey",
        "play_subscriptions",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_play_subscriptions_organization_subscription",
        "play_subscriptions",
        "subscriptions",
        ["organization_id", "subscription_id"],
        ["organization_id", "id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_play_subscriptions_organization_id",
        "play_subscriptions",
        ["organization_id"],
    )
    op.execute(
        """
        CREATE POLICY tenant_isolation_subscriptions ON subscriptions
        USING (
          organization_id =
          NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        )
        WITH CHECK (
          organization_id =
          NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        )
        """
    )

    op.create_table(
        "organization_ownership_transfers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("requested_by_user_id", sa.UUID(), nullable=False),
        sa.Column("target_user_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_organization_ownership_transfers_organization_id",
        "organization_ownership_transfers",
        ["organization_id"],
    )
    op.create_index(
        "uq_organization_ownership_transfers_active",
        "organization_ownership_transfers",
        ["organization_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('pending', 'processing')"),
    )
    op.create_index(
        "ix_organization_ownership_transfers_pending",
        "organization_ownership_transfers",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("organization_ownership_transfers")
    op.execute("DROP POLICY IF EXISTS tenant_isolation_subscriptions ON subscriptions")
    op.drop_constraint(
        "fk_play_subscriptions_organization_subscription",
        "play_subscriptions",
        type_="foreignkey",
    )
    op.drop_constraint(
        "play_subscriptions_organization_id_fkey",
        "play_subscriptions",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_play_subscriptions_organization_id",
        table_name="play_subscriptions",
    )
    op.drop_constraint(
        "uq_subscriptions_organization_id",
        "subscriptions",
        type_="unique",
    )
    op.drop_constraint(
        "subscriptions_organization_id_fkey",
        "subscriptions",
        type_="foreignkey",
    )
    op.drop_index("ix_subscriptions_organization_id", table_name="subscriptions")
    op.alter_column("subscriptions", "organization_id", new_column_name="shop_id")
    op.alter_column("play_subscriptions", "organization_id", new_column_name="shop_id")
    op.create_foreign_key(
        "subscriptions_shop_id_fkey",
        "subscriptions",
        "shops",
        ["shop_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_subscriptions_shop_id",
        "subscriptions",
        ["shop_id", "id"],
    )
    op.create_index("ix_subscriptions_shop_id", "subscriptions", ["shop_id"])
    op.create_foreign_key(
        "play_subscriptions_shop_id_fkey",
        "play_subscriptions",
        "shops",
        ["shop_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_play_subscriptions_shop_subscription",
        "play_subscriptions",
        "subscriptions",
        ["shop_id", "subscription_id"],
        ["shop_id", "id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_play_subscriptions_shop_id",
        "play_subscriptions",
        ["shop_id"],
    )
    op.execute(
        """
        CREATE POLICY tenant_isolation_subscriptions ON subscriptions
        USING (
          shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid
        )
        WITH CHECK (
          shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid
        )
        """
    )
    op.drop_constraint(
        "fk_organizations_primary_shop",
        "organizations",
        type_="foreignkey",
    )
    op.drop_constraint(
        "uq_organizations_primary_shop_id",
        "organizations",
        type_="unique",
    )
    op.drop_column("organizations", "primary_shop_id")
    op.drop_constraint("fk_shops_organization", "shops", type_="foreignkey")
    op.drop_index("ix_shops_organization_id", table_name="shops")
    op.drop_column("shops", "organization_id")
    op.drop_table("organizations")
