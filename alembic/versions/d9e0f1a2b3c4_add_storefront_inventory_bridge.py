"""Add the shop-bound storefront inventory bridge.

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d9e0f1a2b3c4"
down_revision: str | None = "c8d9e0f1a2b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TENANT_DEFAULT = sa.text("NULLIF(current_setting('app.current_shop_id', true), '')::uuid")


def _enable_tenant_rls(table_name: str) -> None:
    op.execute(f'ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY')
    op.execute(f'ALTER TABLE "{table_name}" FORCE ROW LEVEL SECURITY')
    op.execute(
        f'''CREATE POLICY tenant_isolation_{table_name} ON "{table_name}"
        USING (shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid)
        WITH CHECK (
            shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid
        )'''
    )


def upgrade() -> None:
    op.add_column(
        "items",
        sa.Column("inventory_version", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_table(
        "storefront_reservations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "shop_id",
            postgresql.UUID(as_uuid=True),
            server_default=TENANT_DEFAULT,
            nullable=False,
        ),
        sa.Column("external_order_id", sa.String(length=100), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="held", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("confirmed_at", sa.DateTime(timezone=True)),
        sa.Column("fulfilled_at", sa.DateTime(timezone=True)),
        sa.Column("released_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('held', 'confirmed', 'fulfilled', 'released', 'expired')",
            name="storefront_reservations_status_check",
        ),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "id", name="uq_storefront_reservations_shop_id"),
        sa.UniqueConstraint(
            "shop_id", "external_order_id", name="uq_storefront_reservations_shop_order"
        ),
    )
    op.create_index(
        "ix_storefront_reservations_shop_status",
        "storefront_reservations",
        ["shop_id", "status"],
    )
    op.create_index(
        "ix_storefront_reservations_expiry",
        "storefront_reservations",
        ["expires_at"],
        postgresql_where=sa.text("status = 'held'"),
    )
    _enable_tenant_rls("storefront_reservations")

    op.create_table(
        "storefront_reservation_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("shop_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reservation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantity > 0", name="storefront_reservation_lines_quantity_positive"),
        sa.ForeignKeyConstraint(
            ["shop_id", "item_id"],
            ["items.shop_id", "items.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["shop_id", "reservation_id"],
            ["storefront_reservations.shop_id", "storefront_reservations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "reservation_id", "item_id", name="uq_storefront_reservation_lines_item"
        ),
    )
    op.create_index(
        "ix_storefront_reservation_lines_shop_item",
        "storefront_reservation_lines",
        ["shop_id", "item_id"],
    )
    _enable_tenant_rls("storefront_reservation_lines")

    op.create_table(
        "storefront_inventory_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("shop_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("lease_token", postgresql.UUID(as_uuid=True)),
        sa.Column("last_error_code", sa.String(length=100)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'delivered', 'failed')",
            name="storefront_inventory_events_status_check",
        ),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_storefront_inventory_events_pending",
        "storefront_inventory_events",
        ["next_attempt_at", "created_at"],
        postgresql_where=sa.text("status IN ('pending', 'processing')"),
    )
    op.create_index(
        "ix_storefront_inventory_events_shop_item",
        "storefront_inventory_events",
        ["shop_id", "item_id"],
    )


def downgrade() -> None:
    op.drop_table("storefront_inventory_events")
    op.execute(
        "DROP POLICY tenant_isolation_storefront_reservation_lines ON storefront_reservation_lines"
    )
    op.drop_table("storefront_reservation_lines")
    op.execute("DROP POLICY tenant_isolation_storefront_reservations ON storefront_reservations")
    op.drop_table("storefront_reservations")
    op.drop_column("items", "inventory_version")
