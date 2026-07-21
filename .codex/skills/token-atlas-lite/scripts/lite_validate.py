#!/usr/bin/env python3
"""Validate a Token Atlas Lite repository runtime using only the standard library."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Sequence


SCHEMA_VERSION = 1
MANIFEST_PATH = ".ai/token-atlas-lite.json"
MEMORY_TOKEN_LIMIT = 1_000
REQUIRED_DOCS = {
    ".ai/INDEX.md": (
        "# Token Atlas Lite Index",
        "## Repository Summary",
        "## Navigation",
        "## Inline Update Rules",
    ),
    ".ai/ARCHITECTURE.md": ("# Architecture",),
    ".ai/DECISIONS.md": ("# Decisions",),
    ".ai/GLOSSARY.md": ("# Glossary",),
    ".ai/DEPENDENCIES.md": ("# Dependencies",),
    ".ai/MEMORY.md": ("# Memory",),
}
KNOWLEDGE_DOCS = tuple(REQUIRED_DOCS)
EXPECTED_MANIFEST = {
    "edition": "lite",
    "schema_version": SCHEMA_VERSION,
    "entrypoint": ".ai/INDEX.md",
}
BOOTSTRAP_START = "<!-- token-atlas-lite:bootstrap:start -->"
BOOTSTRAP_END = "<!-- token-atlas-lite:bootstrap:end -->"
BOOTSTRAP = """<!-- token-atlas-lite:bootstrap:start -->
## Token Atlas Lite

This repository uses the lean knowledge base declared by
`.ai/token-atlas-lite.json`.

At the beginning of every session, read `.ai/INDEX.md` and `.ai/MEMORY.md`.
Load `.ai/ARCHITECTURE.md`, `.ai/DECISIONS.md`, `.ai/GLOSSARY.md`, or
`.ai/DEPENDENCIES.md` only when the current task needs that knowledge.

During implementation, update an affected Lite document inline only when facts
verified for the current task durably change its authoritative content. Use the
current working context; do not perform a post-task repository scan, start a
separate closeout phase, load unrelated Lite documents, or run Lite validation
automatically. Knowledge-neutral mutations do not change `.ai/`. Never record
inferred decision rationale unless repository evidence supports it or the user
explicitly confirms it.
<!-- token-atlas-lite:bootstrap:end -->"""

INCOMPLETE_PATTERN = re.compile(
    r"\b(?:TODO|FIXME|TBD)\b|\bplaceholder\b|\bto\s+be\s+determined\b|"
    r"\bpending\s+materiali[sz]ation\b",
    re.IGNORECASE,
)
SECTION_PATTERN = re.compile(r"(?m)^###\s+(.+?)\s*$")
EVIDENCE_LINE_PATTERN = re.compile(r"^-\s+`([^`]+)`\s*$")
FIELD_PATTERN = re.compile(r"^([A-Za-z][A-Za-z -]*):\s*(.*)$")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DECISION_STATUSES = {"proposed", "accepted", "superseded", "deprecated"}
DECISION_BASES = {"source-backed", "user-confirmed"}


@dataclass(frozen=True)
class Finding:
    file: str
    issue: str


@dataclass(frozen=True)
class Record:
    file: str
    heading: str
    normalized_evidence: tuple[str, ...]
    normalized_text: str
    tokens: frozenset[str]


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, default=Path("."))
    parser.add_argument("--format", choices=("text", "json"), default="text")
    return parser.parse_args(argv)


def approximate_tokens(text: str) -> int:
    return (len(text) + 3) // 4


def read_text(path: Path, relative: str, errors: list[Finding]) -> str | None:
    if not path.is_file():
        errors.append(Finding(relative, "required file is missing"))
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        errors.append(Finding(relative, f"file is unreadable UTF-8: {exc}"))
        return None
    if not text.strip():
        errors.append(Finding(relative, "required file is empty"))
        return None
    return text


def validate_manifest(root: Path, errors: list[Finding]) -> None:
    path = root / MANIFEST_PATH
    text = read_text(path, MANIFEST_PATH, errors)
    if text is None:
        return
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        errors.append(Finding(MANIFEST_PATH, f"manifest is invalid JSON: {exc.msg}"))
        return
    if value != EXPECTED_MANIFEST:
        errors.append(
            Finding(
                MANIFEST_PATH,
                "manifest must contain exactly edition=lite, schema_version=1, and entrypoint=.ai/INDEX.md",
            )
        )


def validate_bootstrap(root: Path, errors: list[Finding]) -> None:
    relative = "AGENTS.md"
    text = read_text(root / relative, relative, errors)
    if text is None:
        return
    if text.count(BOOTSTRAP_START) != 1 or text.count(BOOTSTRAP_END) != 1:
        errors.append(Finding(relative, "managed Lite bootstrap markers must each appear exactly once"))
        return
    start = text.index(BOOTSTRAP_START)
    end = text.index(BOOTSTRAP_END, start) + len(BOOTSTRAP_END)
    if text[start:end] != BOOTSTRAP:
        errors.append(Finding(relative, "managed Lite bootstrap does not match the runtime contract"))


def section_records(text: str) -> list[tuple[str, str]]:
    matches = list(SECTION_PATTERN.finditer(text))
    return [
        (
            match.group(1).strip(),
            text[match.end() : matches[index + 1].start() if index + 1 < len(matches) else len(text)].strip(),
        )
        for index, match in enumerate(matches)
    ]


def record_fields(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in body.splitlines():
        match = FIELD_PATTERN.match(line.strip())
        if match:
            fields[match.group(1).strip().lower()] = match.group(2).strip()
    return fields


def evidence_values(body: str, relative: str, heading: str, errors: list[Finding]) -> list[str]:
    lines = body.splitlines()
    evidence: list[str] = []
    for index, line in enumerate(lines):
        if line.strip() != "Evidence:":
            continue
        cursor = index + 1
        while cursor < len(lines) and lines[cursor].lstrip().startswith("-"):
            item = EVIDENCE_LINE_PATTERN.fullmatch(lines[cursor].strip())
            if item is None:
                errors.append(
                    Finding(relative, f"record {heading!r} contains a malformed evidence item")
                )
            else:
                evidence.append(item.group(1).strip())
            cursor += 1
    return evidence


def normalize_evidence(
    value: str,
    *,
    root: Path,
    relative: str,
    heading: str,
    errors: list[Finding],
) -> str | None:
    path_value, separator, locator = value.partition("::")
    path_value = path_value.strip().replace("\\", "/")
    locator = locator.strip()
    if not path_value or path_value.startswith("/"):
        errors.append(Finding(relative, f"record {heading!r} has a non-relative evidence path: {value}"))
        return None
    pure = PurePosixPath(path_value)
    while pure.parts and pure.parts[0] == ".":
        pure = PurePosixPath(*pure.parts[1:])
    if not pure.parts or ".." in pure.parts:
        errors.append(Finding(relative, f"record {heading!r} has an invalid evidence path: {value}"))
        return None
    normalized_path = pure.as_posix()
    if not (root / normalized_path).is_file():
        errors.append(
            Finding(relative, f"record {heading!r} evidence path does not resolve: {normalized_path}")
        )
    if separator and not locator:
        errors.append(Finding(relative, f"record {heading!r} has an empty evidence locator: {value}"))
        return None
    return f"{normalized_path}::{locator}" if separator else normalized_path


def normalized_record_text(body: str) -> str:
    kept: list[str] = []
    in_evidence = False
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if line == "Evidence:":
            in_evidence = True
            continue
        if in_evidence and line.startswith("-"):
            continue
        in_evidence = False
        field = FIELD_PATTERN.match(line)
        if field:
            line = field.group(2).strip()
        kept.append(line)
    value = " ".join(kept).casefold()
    value = re.sub(r"[`*_~#>\[\]()]", " ", value)
    value = re.sub(r"[^\w\s]", " ", value, flags=re.UNICODE)
    return re.sub(r"\s+", " ", value).strip()


def validate_decision(
    fields: dict[str, str],
    evidence: Sequence[str],
    relative: str,
    heading: str,
    errors: list[Finding],
) -> None:
    required = ("recorded", "status", "basis", "decision", "rationale", "consequences")
    for field in required:
        if not fields.get(field):
            errors.append(Finding(relative, f"decision {heading!r} is missing {field.title()}"))
    if fields.get("recorded") and not DATE_PATTERN.fullmatch(fields["recorded"]):
        errors.append(Finding(relative, f"decision {heading!r} has an invalid Recorded date"))
    if fields.get("status") and fields["status"] not in DECISION_STATUSES:
        errors.append(Finding(relative, f"decision {heading!r} has an invalid Status"))
    basis = fields.get("basis")
    if basis and basis not in DECISION_BASES:
        errors.append(Finding(relative, f"decision {heading!r} has an invalid Basis"))
    if basis == "source-backed" and not evidence:
        errors.append(Finding(relative, f"source-backed decision {heading!r} requires evidence"))
    if basis == "user-confirmed":
        confirmed = fields.get("confirmed")
        if not confirmed or not DATE_PATTERN.fullmatch(confirmed):
            errors.append(
                Finding(relative, f"user-confirmed decision {heading!r} requires a valid Confirmed date")
            )


def validate_documents(root: Path, errors: list[Finding]) -> tuple[list[Record], int]:
    texts: dict[str, str] = {}
    for relative, headings in REQUIRED_DOCS.items():
        text = read_text(root / relative, relative, errors)
        if text is None:
            continue
        texts[relative] = text
        for heading in headings:
            if not re.search(rf"(?m)^{re.escape(heading)}\s*$", text):
                errors.append(Finding(relative, f"required heading is missing: {heading}"))
        incomplete = INCOMPLETE_PATTERN.search(text)
        if incomplete:
            errors.append(Finding(relative, f"incomplete content is forbidden: {incomplete.group(0)}"))

    memory_tokens = approximate_tokens(texts.get(".ai/MEMORY.md", ""))
    if memory_tokens > MEMORY_TOKEN_LIMIT:
        errors.append(
            Finding(
                ".ai/MEMORY.md",
                f"memory budget exceeded: {memory_tokens} approximate tokens > {MEMORY_TOKEN_LIMIT}",
            )
        )

    records: list[Record] = []
    for relative in KNOWLEDGE_DOCS:
        text = texts.get(relative)
        if text is None:
            continue
        for heading, body in section_records(text):
            if relative == ".ai/INDEX.md" and "Evidence:" not in body:
                continue
            if not body:
                errors.append(Finding(relative, f"record {heading!r} is empty"))
                continue
            evidence = evidence_values(body, relative, heading, errors)
            fields = record_fields(body)
            if relative == ".ai/DECISIONS.md":
                validate_decision(fields, evidence, relative, heading, errors)
                requires_evidence = fields.get("basis") != "user-confirmed"
            else:
                requires_evidence = True
            if requires_evidence and not evidence:
                errors.append(Finding(relative, f"record {heading!r} requires repository evidence"))
            normalized = {
                result
                for item in evidence
                if (
                    result := normalize_evidence(
                        item,
                        root=root,
                        relative=relative,
                        heading=heading,
                        errors=errors,
                    )
                )
                is not None
            }
            text_value = normalized_record_text(body)
            records.append(
                Record(
                    file=relative,
                    heading=heading,
                    normalized_evidence=tuple(sorted(normalized)),
                    normalized_text=text_value,
                    tokens=frozenset(text_value.split()),
                )
            )
    return records, memory_tokens


def validate_duplicates(records: Sequence[Record], errors: list[Finding]) -> None:
    for index, left in enumerate(records):
        if not left.normalized_evidence or not left.normalized_text:
            continue
        for right in records[index + 1 :]:
            if left.file == right.file or left.normalized_evidence != right.normalized_evidence:
                continue
            exact = left.normalized_text == right.normalized_text
            union = left.tokens | right.tokens
            similarity = len(left.tokens & right.tokens) / len(union) if union else 0.0
            substantial = min(len(left.tokens), len(right.tokens)) >= 8 and similarity >= 0.85
            if exact or substantial:
                errors.append(
                    Finding(
                        f"{left.file}, {right.file}",
                        (
                            f"duplicate durable facts {left.heading!r} and {right.heading!r}; "
                            f"shared evidence={list(left.normalized_evidence)!r}; similarity={similarity:.2f}"
                        ),
                    )
                )


def validate(root: Path) -> dict[str, Any]:
    resolved = root.resolve()
    errors: list[Finding] = []
    if not resolved.is_dir():
        errors.append(Finding(".", f"repository path is not a directory: {resolved}"))
        memory_tokens = 0
    else:
        validate_manifest(resolved, errors)
        validate_bootstrap(resolved, errors)
        records, memory_tokens = validate_documents(resolved, errors)
        validate_duplicates(records, errors)
    return {
        "schema_version": SCHEMA_VERSION,
        "edition": "lite",
        "status": "failed" if errors else "passed",
        "memory": {
            "estimated_tokens": memory_tokens,
            "limit": MEMORY_TOKEN_LIMIT,
            "estimator": "ceil(character_count/4)",
        },
        "checked_documents": list(REQUIRED_DOCS),
        "errors": [{"file": finding.file, "issue": finding.issue} for finding in errors],
    }


def render_text(report: dict[str, Any]) -> str:
    lines = [
        f"Token Atlas Lite validation: {report['status']}",
        (
            "Memory: "
            f"{report['memory']['estimated_tokens']}/{report['memory']['limit']} "
            f"approximate tokens ({report['memory']['estimator']})"
        ),
    ]
    lines.extend(f"ERROR {item['file']}: {item['issue']}" for item in report["errors"])
    return "\n".join(lines) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    report = validate(args.path)
    if args.format == "json":
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(render_text(report), end="")
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
