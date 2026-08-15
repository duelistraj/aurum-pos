"""Normalize audit events and preserve actor snapshots.

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c8d9e0f1a2b3"
down_revision: str | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("change_log", sa.Column("event_type", sa.String(length=60)))
    op.add_column("change_log", sa.Column("subject_label", sa.String(length=200)))
    op.add_column("change_log", sa.Column("reference", sa.String(length=100)))
    op.add_column("change_log", sa.Column("actor_kind", sa.String(length=20)))
    op.add_column("change_log", sa.Column("actor_user_id", sa.UUID()))
    op.add_column("change_log", sa.Column("actor_name", sa.String(length=100)))
    op.add_column("change_log", sa.Column("actor_role", sa.String(length=20)))

    op.execute(
        """
        UPDATE change_log
        SET event_type = CASE
                WHEN entity = 'item' AND action = 'create' THEN 'inventory.item_created'
                WHEN entity = 'item' AND action = 'update' THEN 'inventory.item_updated'
                WHEN entity = 'item' AND action = 'delete' THEN 'inventory.item_archived'
                WHEN entity = 'item' AND action = 'sold' THEN 'sales.item_sold'
                WHEN entity = 'sale' AND action = 'create' THEN 'sales.sale_completed'
                WHEN entity = 'metal_rate' AND action = 'create' THEN 'rates.rate_created'
                WHEN entity = 'metal_rate' AND action = 'update' THEN 'rates.rate_updated'
                ELSE entity || '.' || action
            END,
            subject_label = COALESCE(
                NULLIF(payload ->> 'name', ''),
                NULLIF(payload ->> 'sku', ''),
                NULLIF(invoice_no, ''),
                NULLIF(barcode, ''),
                entity
            ),
            reference = COALESCE(NULLIF(invoice_no, ''), NULLIF(barcode, '')),
            actor_kind = 'unknown'
        """
    )
    # migration-safety: allow - the preceding update backfills every existing row.
    op.alter_column("change_log", "event_type", nullable=False)
    # migration-safety: allow - the preceding update backfills every existing row.
    op.alter_column("change_log", "actor_kind", nullable=False)

    op.create_index(
        "ix_change_log_shop_event_created",
        "change_log",
        ["shop_id", "event_type", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_change_log_shop_actor_created",
        "change_log",
        ["shop_id", "actor_user_id", sa.text("created_at DESC")],
        postgresql_where=sa.text("actor_user_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_change_log_shop_actor_created", table_name="change_log")
    op.drop_index("ix_change_log_shop_event_created", table_name="change_log")
    op.drop_column("change_log", "actor_role")
    op.drop_column("change_log", "actor_name")
    op.drop_column("change_log", "actor_user_id")
    op.drop_column("change_log", "actor_kind")
    op.drop_column("change_log", "reference")
    op.drop_column("change_log", "subject_label")
    op.drop_column("change_log", "event_type")
