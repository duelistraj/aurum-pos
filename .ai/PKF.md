---
type: pkf-runtime
title: PKF Runtime
description: Startup and validation rules for the aurum-pos knowledge base.
resource: .ai/PKF.md
tags: [aurum-pos, pkf, runtime, routing]
timestamp: 2026-07-06

pkf:
  loads: [.ai/MEMORY.md, .ai/ARCHITECTURE.md, .ai/knowledge/INDEX.md]
  related: [.agents/skills/zephyr-pkf/SKILL.md]
---

# PKF Runtime

## Startup

1. Load `.ai/PKF.md`.
2. Load `.ai/MEMORY.md`.
3. Load `.ai/ARCHITECTURE.md`.
4. Load `.ai/knowledge/INDEX.md`.
5. Load only the module `INDEX.md` selected by the root knowledge index.
6. Load only task-required leaf documents from that module.

## Rules

- Source code, repository configuration, migrations, tests, and checked-in docs are authoritative.
- OKF files summarize source-backed facts for retrieval; they do not override implementation.
- Stale or unverifiable facts must be removed or marked `TODO`.
- Do not modify application code during PKF maintenance.
- `pkf.loads` means load automatically for the current document's task.
- `pkf.related` means useful only if the task expands.
- Keep `pkf.loads` narrow; broad automatic chains are validation defects.

## Validation Gates

- Runtime files exist: `PKF.md`, `MEMORY.md`, `ARCHITECTURE.md`.
- `knowledge/INDEX.md` routes to every module.
- Each module has `INDEX.md`, `api.md`, `schema.md`, `business_rules.md`, and `ui.md`.
- Every OKF document has required front matter fields.
- Referenced resources exist.
- Route, schema, dependency, and UI facts match source.
- Retrieval scenarios load only the minimum needed documents.
