from pathlib import Path

import pytest

from scripts.check_migration_safety import analyze_migration


def write_migration(tmp_path: Path, upgrade_body: str) -> Path:
    path = tmp_path / "migration.py"
    path.write_text(
        "from alembic import op\n"
        "import sqlalchemy as sa\n\n"
        "def upgrade() -> None:\n"
        f"{upgrade_body}\n\n"
        "def downgrade() -> None:\n"
        "    pass\n",
        encoding="utf-8",
    )
    return path


@pytest.mark.parametrize(
    "operation",
    [
        '    op.drop_table("sales")',
        '    op.drop_column("sales", "legacy")',
        '    op.alter_column("sales", "state", nullable=False)',
        '    op.alter_column("sales", "amount", type_=sa.Numeric())',
        '    op.add_column("sales", sa.Column("state", sa.String(), nullable=False))',
        '    op.execute("ALTER TABLE sales DROP COLUMN legacy")',
    ],
)
def test_destructive_upgrade_operations_fail(tmp_path: Path, operation: str) -> None:
    findings = analyze_migration(write_migration(tmp_path, operation))

    assert any(finding.severity == "error" for finding in findings)


def test_downgrade_operations_are_not_treated_as_production_upgrade(
    tmp_path: Path,
) -> None:
    path = write_migration(
        tmp_path,
        '    op.add_column("sales", sa.Column("pdf_key", sa.String(), nullable=True))',
    )
    path.write_text(
        path.read_text(encoding="utf-8").replace(
            "def downgrade() -> None:\n    pass",
            'def downgrade() -> None:\n    op.drop_column("sales", "pdf_key")',
        ),
        encoding="utf-8",
    )

    assert analyze_migration(path) == []


def test_explicit_exception_is_reported_as_warning(tmp_path: Path) -> None:
    path = write_migration(
        tmp_path,
        "    # migration-safety: allow approved maintenance window\n"
        '    op.drop_column("sales", "legacy")',
    )

    findings = analyze_migration(path)

    assert [finding.severity for finding in findings] == ["warning"]
    assert "explicitly allowed" in findings[0].message


def test_non_null_column_with_default_warns(tmp_path: Path) -> None:
    findings = analyze_migration(
        write_migration(
            tmp_path,
            "    op.add_column(\n"
            '        "sales",\n'
            '        sa.Column("state", sa.String(), nullable=False, server_default="new"),\n'
            "    )",
        )
    )

    assert [finding.severity for finding in findings] == ["warning"]


def test_batch_operation_drop_fails(tmp_path: Path) -> None:
    findings = analyze_migration(write_migration(tmp_path, '    batch_op.drop_column("legacy")'))

    assert [finding.severity for finding in findings] == ["error"]


def test_blocking_index_and_constraint_operations_warn(tmp_path: Path) -> None:
    findings = analyze_migration(
        write_migration(
            tmp_path,
            '    op.create_index("ix_sales_created", "sales", ["created_at"])\n'
            '    op.create_check_constraint("sales_total_positive", "sales", "total >= 0")',
        )
    )

    assert [finding.severity for finding in findings] == ["warning", "warning"]
