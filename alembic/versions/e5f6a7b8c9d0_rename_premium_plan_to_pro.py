"""rename premium plan to pro

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-22 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY")
    op.drop_constraint("subscriptions_plan_check", "subscriptions", type_="check")
    op.execute("UPDATE subscriptions SET plan = 'pro' WHERE plan = 'premium'")
    op.execute(
        "UPDATE play_subscriptions SET product_id = 'aurum_cloud_pro' "
        "WHERE product_id = 'aurum_cloud_premium'"
    )
    op.create_check_constraint("subscriptions_plan_check", "subscriptions", "plan = 'pro'")
    op.execute("ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.execute("ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY")
    op.drop_constraint("subscriptions_plan_check", "subscriptions", type_="check")
    op.execute("UPDATE subscriptions SET plan = 'premium' WHERE plan = 'pro'")
    op.execute(
        "UPDATE play_subscriptions SET product_id = 'aurum_cloud_premium' "
        "WHERE product_id = 'aurum_cloud_pro'"
    )
    op.create_check_constraint("subscriptions_plan_check", "subscriptions", "plan = 'premium'")
    op.execute("ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY")
