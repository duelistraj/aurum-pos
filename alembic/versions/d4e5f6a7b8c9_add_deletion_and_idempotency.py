"""add account deletion and sale idempotency

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-21 00:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "account_deletion_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID()),
        sa.Column("email_hash", sa.String(64), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("delete_owned_shops", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("confirmed_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("execute_after", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        "ix_account_deletion_requests_user_id", "account_deletion_requests", ["user_id"]
    )
    op.create_index(
        "ix_account_deletion_requests_execute_after",
        "account_deletion_requests",
        ["execute_after"],
    )

    op.create_table(
        "sale_idempotency",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "shop_id",
            sa.UUID(),
            nullable=False,
            server_default=sa.text(
                "NULLIF(current_setting('app.current_shop_id', true), '')::uuid"
            ),
        ),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("sale_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sale_id"], ["sales.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "idempotency_key"),
    )
    op.create_index("ix_sale_idempotency_shop_id", "sale_idempotency", ["shop_id"])
    op.execute("ALTER TABLE sale_idempotency ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE sale_idempotency FORCE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_sale_idempotency ON sale_idempotency
        USING (shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid)
        WITH CHECK (shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid)"""
    )


def downgrade() -> None:
    op.drop_table("sale_idempotency")
    op.drop_table("account_deletion_requests")
