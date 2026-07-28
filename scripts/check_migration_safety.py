#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

ALLOW_MARKER = "migration-safety: allow"
DESTRUCTIVE_SQL_PATTERN = re.compile(
    r"\b(?:DROP\s+(?:TABLE|COLUMN)|ALTER\s+COLUMN\b.*\b(?:SET\s+NOT\s+NULL|TYPE)\b)",
    re.IGNORECASE | re.DOTALL,
)


@dataclass(frozen=True)
class Finding:
    path: Path
    line: int
    severity: Literal["error", "warning"]
    message: str


def _operation_name(node: ast.Call) -> str | None:
    function = node.func
    if (
        isinstance(function, ast.Attribute)
        and isinstance(function.value, ast.Name)
        and function.value.id in {"op", "batch_op"}
    ):
        return function.attr
    return None


def _keyword_by_name(node: ast.Call) -> dict[str, ast.expr]:
    return {keyword.arg: keyword.value for keyword in node.keywords if keyword.arg is not None}


def _is_false(node: ast.expr | None) -> bool:
    return isinstance(node, ast.Constant) and node.value is False


def _is_none(node: ast.expr | None) -> bool:
    return isinstance(node, ast.Constant) and node.value is None


def _literal_string(node: ast.expr | None) -> str | None:
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def _column_call(node: ast.Call) -> ast.Call | None:
    if len(node.args) < 2:
        return None
    candidate = node.args[1]
    if not isinstance(candidate, ast.Call):
        return None
    function = candidate.func
    if isinstance(function, ast.Attribute) and function.attr == "Column":
        return candidate
    if isinstance(function, ast.Name) and function.id == "Column":
        return candidate
    return None


def _has_allow_marker(lines: list[str], line: int) -> bool:
    relevant_lines = lines[max(0, line - 2) : line]
    return any(ALLOW_MARKER in candidate for candidate in relevant_lines)


def _finding(
    *,
    path: Path,
    lines: list[str],
    node: ast.Call,
    severity: Literal["error", "warning"],
    message: str,
) -> Finding:
    if severity == "error" and _has_allow_marker(lines, node.lineno):
        return Finding(
            path=path,
            line=node.lineno,
            severity="warning",
            message=f"explicitly allowed exceptional operation: {message}",
        )
    return Finding(path=path, line=node.lineno, severity=severity, message=message)


def analyze_migration(path: Path) -> list[Finding]:
    source = path.read_text(encoding="utf-8")
    lines = source.splitlines()
    tree = ast.parse(source, filename=str(path))
    upgrade = next(
        (
            node
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "upgrade"
        ),
        None,
    )
    if upgrade is None:
        return [
            Finding(
                path=path,
                line=1,
                severity="error",
                message="migration does not define upgrade()",
            )
        ]

    findings: list[Finding] = []
    for node in ast.walk(upgrade):
        if not isinstance(node, ast.Call):
            continue
        operation = _operation_name(node)
        if operation is None:
            continue

        if operation in {"drop_table", "drop_column"}:
            findings.append(
                _finding(
                    path=path,
                    lines=lines,
                    node=node,
                    severity="error",
                    message=f"op.{operation} requires an expand-and-contract release",
                )
            )
            continue

        if operation in {"drop_constraint", "drop_index"}:
            findings.append(
                _finding(
                    path=path,
                    lines=lines,
                    node=node,
                    severity="warning",
                    message=f"review op.{operation} for compatibility with the running release",
                )
            )
            continue

        if operation == "create_index":
            keywords = _keyword_by_name(node)
            if not (
                isinstance(keywords.get("postgresql_concurrently"), ast.Constant)
                and keywords["postgresql_concurrently"].value is True
            ):
                findings.append(
                    _finding(
                        path=path,
                        lines=lines,
                        node=node,
                        severity="warning",
                        message=(
                            "review non-concurrent index creation against production table size"
                        ),
                    )
                )
            continue

        if operation == "create_check_constraint":
            findings.append(
                _finding(
                    path=path,
                    lines=lines,
                    node=node,
                    severity="warning",
                    message=("review constraint validation for blocking scans on populated tables"),
                )
            )
            continue

        if operation == "alter_column":
            keywords = _keyword_by_name(node)
            if _is_false(keywords.get("nullable")):
                findings.append(
                    _finding(
                        path=path,
                        lines=lines,
                        node=node,
                        severity="error",
                        message="setting NOT NULL in place is unsafe without a staged backfill",
                    )
                )
            if "type_" in keywords:
                findings.append(
                    _finding(
                        path=path,
                        lines=lines,
                        node=node,
                        severity="error",
                        message=(
                            "in-place column type changes require an expand-and-contract release"
                        ),
                    )
                )
            continue

        if operation == "add_column":
            column = _column_call(node)
            if column is None:
                continue
            keywords = _keyword_by_name(column)
            if _is_false(keywords.get("nullable")):
                server_default = keywords.get("server_default")
                severity: Literal["error", "warning"] = (
                    "error" if server_default is None or _is_none(server_default) else "warning"
                )
                findings.append(
                    _finding(
                        path=path,
                        lines=lines,
                        node=node,
                        severity=severity,
                        message=(
                            "adding a non-null column requires a staged nullable add and backfill"
                            if severity == "error"
                            else "review non-null column addition and remove its default later"
                        ),
                    )
                )
            continue

        if operation == "execute":
            sql = _literal_string(node.args[0] if node.args else None)
            if sql is None:
                findings.append(
                    _finding(
                        path=path,
                        lines=lines,
                        node=node,
                        severity="warning",
                        message="dynamic SQL could not be checked automatically",
                    )
                )
            elif DESTRUCTIVE_SQL_PATTERN.search(sql):
                findings.append(
                    _finding(
                        path=path,
                        lines=lines,
                        node=node,
                        severity="error",
                        message="raw SQL contains a destructive or blocking schema operation",
                    )
                )

    return sorted(findings, key=lambda finding: (finding.line, finding.severity))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check newly changed Alembic upgrades for unsafe operations."
    )
    parser.add_argument("paths", nargs="*", type=Path)
    arguments = parser.parse_args()

    findings = [finding for path in arguments.paths for finding in analyze_migration(path)]
    for finding in findings:
        print(f"{finding.path}:{finding.line}: {finding.severity}: {finding.message}")

    error_count = sum(finding.severity == "error" for finding in findings)
    if error_count:
        raise SystemExit(
            f"Migration safety check failed with {error_count} error(s). "
            f"Use {ALLOW_MARKER!r} only for an explicitly reviewed exception."
        )

    print(f"Migration safety check passed for {len(arguments.paths)} changed file(s)")


if __name__ == "__main__":
    main()
