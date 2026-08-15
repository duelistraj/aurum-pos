"""Normalize the earrings category to singular.

Revision ID: y4z5a6b7c8d9
Revises: x3y4z5a6b7c8
"""

from collections.abc import Sequence

from alembic import op

revision: str = "y4z5a6b7c8d9"
down_revision: str | None = "x3y4z5a6b7c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE items SET category = 'earring' WHERE lower(category) = 'earrings'")
    op.execute("UPDATE item_history SET category = 'earring' WHERE lower(category) = 'earrings'")
    op.execute(
        "UPDATE sale_items SET item_category = 'earring' WHERE lower(item_category) = 'earrings'"
    )

    op.execute(
        "UPDATE sale_items "
        "SET price_breakdown = jsonb_set("
        "price_breakdown::jsonb, '{category}', to_jsonb('earring'::text), false"
        ")::json "
        "WHERE lower(price_breakdown ->> 'category') = 'earrings'"
    )
    op.execute(
        "UPDATE change_log "
        "SET payload = jsonb_set("
        "payload::jsonb, '{category}', to_jsonb('earring'::text), false"
        ")::json "
        "WHERE lower(payload ->> 'category') = 'earrings'"
    )
    op.execute(
        "UPDATE change_log "
        "SET payload = jsonb_set("
        "payload::jsonb, '{changes,category,before}', "
        "to_jsonb('earring'::text), false"
        ")::json "
        "WHERE lower(payload #>> '{changes,category,before}') = 'earrings'"
    )
    op.execute(
        "UPDATE change_log "
        "SET payload = jsonb_set("
        "payload::jsonb, '{changes,category,after}', "
        "to_jsonb('earring'::text), false"
        ")::json "
        "WHERE lower(payload #>> '{changes,category,after}') = 'earrings'"
    )


def downgrade() -> None:
    # This canonicalization cannot distinguish historical singular and plural values.
    pass
