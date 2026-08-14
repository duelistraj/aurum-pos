"""Add shared Aurum WhatsApp invoice delivery.

Revision ID: v1w2x3y4z5a6
Revises: u0v1w2x3y4z5
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "v1w2x3y4z5a6"
down_revision: str | None = "u0v1w2x3y4z5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TENANT_DEFAULT = sa.text("NULLIF(current_setting('app.current_shop_id', true), '')::uuid")


def upgrade() -> None:
    op.create_table(
        "whatsapp_invoice_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "shop_id",
            postgresql.UUID(as_uuid=True),
            server_default=TENANT_DEFAULT,
            nullable=False,
        ),
        sa.Column("sale_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recipient_e164", sa.String(16), nullable=False),
        sa.Column("recipient_hmac", sa.String(64), nullable=False),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column(
            "consent_confirmed_by_user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("consent_confirmed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consent_copy_version", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("lease_token", postgresql.UUID(as_uuid=True)),
        sa.Column("meta_message_id", sa.String(255)),
        sa.Column("last_error_code", sa.String(100)),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("failed_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'accepted', 'sent', 'delivered', "
            "'read', 'failed', 'unknown')",
            name="whatsapp_deliveries_status_check",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["shop_id", "sale_id"],
            ["sales.shop_id", "sales.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["consent_confirmed_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "shop_id",
            "idempotency_key",
            name="uq_whatsapp_deliveries_shop_idempotency",
        ),
    )
    op.create_index(
        "ix_whatsapp_deliveries_organization_id",
        "whatsapp_invoice_deliveries",
        ["organization_id"],
    )
    op.create_index(
        "ix_whatsapp_deliveries_shop_id",
        "whatsapp_invoice_deliveries",
        ["shop_id"],
    )
    op.create_index(
        "ix_whatsapp_deliveries_recipient_hmac",
        "whatsapp_invoice_deliveries",
        ["recipient_hmac"],
    )
    op.create_index(
        "ix_whatsapp_deliveries_shop_sale",
        "whatsapp_invoice_deliveries",
        ["shop_id", "sale_id"],
    )
    op.create_index(
        "ix_whatsapp_deliveries_pending",
        "whatsapp_invoice_deliveries",
        ["next_attempt_at", "created_at"],
        postgresql_where=sa.text("status IN ('pending', 'processing')"),
    )
    op.create_index(
        "uq_whatsapp_deliveries_meta_message",
        "whatsapp_invoice_deliveries",
        ["meta_message_id"],
        unique=True,
        postgresql_where=sa.text("meta_message_id IS NOT NULL"),
    )
    op.execute('ALTER TABLE "whatsapp_invoice_deliveries" ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE "whatsapp_invoice_deliveries" FORCE ROW LEVEL SECURITY')
    op.execute(
        """CREATE POLICY tenant_isolation_whatsapp_invoice_deliveries
        ON whatsapp_invoice_deliveries
        USING (shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid)
        WITH CHECK (
            shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid
        )"""
    )

    op.create_table(
        "whatsapp_delivery_jobs",
        sa.Column("delivery_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("shop_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("lease_token", postgresql.UUID(as_uuid=True)),
        sa.Column("meta_message_id", sa.String(255)),
        sa.Column("last_error_code", sa.String(100)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["delivery_id"], ["whatsapp_invoice_deliveries.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("delivery_id"),
    )
    op.create_index(
        "ix_whatsapp_delivery_jobs_shop_id",
        "whatsapp_delivery_jobs",
        ["shop_id"],
    )
    op.create_index(
        "ix_whatsapp_delivery_jobs_pending",
        "whatsapp_delivery_jobs",
        ["next_attempt_at", "created_at"],
        postgresql_where=sa.text("status IN ('pending', 'processing')"),
    )
    op.create_index(
        "uq_whatsapp_delivery_jobs_meta_message",
        "whatsapp_delivery_jobs",
        ["meta_message_id"],
        unique=True,
        postgresql_where=sa.text("meta_message_id IS NOT NULL"),
    )

    op.create_table(
        "whatsapp_recipient_suppressions",
        sa.Column("recipient_hmac", sa.String(64), nullable=False),
        sa.Column("reason", sa.String(50), nullable=False),
        sa.Column(
            "suppressed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("cleared_at", sa.DateTime(timezone=True)),
        sa.Column("reconsented_delivery_id", postgresql.UUID(as_uuid=True)),
        sa.ForeignKeyConstraint(
            ["reconsented_delivery_id"],
            ["whatsapp_invoice_deliveries.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("recipient_hmac"),
    )
    op.create_table(
        "whatsapp_integration_state",
        sa.Column("integration_key", sa.String(50), nullable=False),
        sa.Column("template_status", sa.String(30), server_default="unknown", nullable=False),
        sa.Column("sender_status", sa.String(30), server_default="unknown", nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("integration_key"),
    )
    op.execute(
        "INSERT INTO whatsapp_integration_state "
        "(integration_key, template_status, sender_status) "
        "VALUES ('shared_aurum', 'unknown', 'unknown')"
    )


def downgrade() -> None:
    op.drop_table("whatsapp_integration_state")
    op.drop_table("whatsapp_recipient_suppressions")
    op.execute(
        "DROP POLICY IF EXISTS tenant_isolation_whatsapp_invoice_deliveries "
        "ON whatsapp_invoice_deliveries"
    )
    op.drop_table("whatsapp_delivery_jobs")
    op.drop_table("whatsapp_invoice_deliveries")
