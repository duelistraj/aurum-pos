---
name: zephyr-pkf
description: Generate and maintain this repository's PKF runtime and OKF-compatible knowledge base.
---

# Zephyr PKF

## Purpose

Generate and maintain a repository-specific, Open Knowledge Format (OKF) compatible knowledge base optimized for minimal-context retrieval by AI coding agents.

Zephyr PKF continuously extracts verified repository knowledge, stores each fact in one authoritative location, and routes agents to the smallest useful context set for a task.

---

## Execution

### 1. Analyze Repository

Determine:

- Repository structure
- Technologies
- Functional modules
- Existing PKF runtime (`.ai/`)
- Existing OKF knowledge base
- Current change set, when available

Do not modify files during analysis.

---

### 2. Determine Execution Mode

If `.ai/` does **not** exist:

- Execute `initialize.md`
- Validate
- Execute `extract.md` using **Full Extraction**
- Validate
- Execute `optimize.md`
- Validate

Otherwise:

- Execute `extract.md` using **Incremental Extraction**
- Validate
- Execute `optimize.md`
- Validate

Stop immediately if validation fails.

---

## Retrieval Contract

Every generated knowledge base must support this loading path:

```text
PKF.md
  -> MEMORY.md
  -> ARCHITECTURE.md
  -> knowledge/INDEX.md
  -> knowledge/<module>/INDEX.md
  -> only the task-required OKF documents
```

Use each layer for a different job:

- `PKF.md`: startup sequence, operating rules, and validation gates.
- `MEMORY.md`: stable repository facts that apply across most tasks.
- `ARCHITECTURE.md`: repository structure and module ownership.
- `knowledge/INDEX.md`: root routing by task, keyword, module, and file path.
- Module `INDEX.md`: module-level routing by task and document.
- Leaf OKF documents: concise source-backed facts for one knowledge type.

`pkf.loads` means "load automatically for this task." Keep it minimal.

`pkf.related` means "useful if the task expands." Do not treat related documents as automatic context.

---

## Knowledge Quality Standard

Each durable fact must be:

- Verified from source files, repository configuration, tests, or existing docs.
- Stored in the narrowest authoritative document.
- Written as retrieval-ready notes, not prose documentation.
- Traceable to source paths, symbols, commands, or config keys.
- Removed or marked `TODO` when no longer verifiable.

Prefer compact tables and bullets over long explanations. Do not copy large source snippets into `.ai/`.

---

## Context Budget

Optimize for small, predictable loads:

- Root and module indexes should be short routing surfaces, not knowledge dumps.
- Shared documents contain only repository-wide facts.
- Module documents contain only module-specific facts.
- Avoid repeating the same fact across indexes and leaf documents.
- Split a document only when independent tasks can load the split sections separately.
- Preserve useful manual notes, but move them to the correct authoritative location.

---

## Global Rules

- Source code is the single source of truth.
- Generate an OKF-compatible knowledge base.
- Preserve existing documentation whenever possible.
- Never invent implementation details.
- Never modify application code.
- Prefer incremental updates.
- Optimize for minimal AI context retrieval.
- Keep routing deterministic and easy to validate.
- Treat stale or unverified knowledge as a blocking issue when it could mislead an agent.

---

## Success

Execution succeeds only when:

- Validation passes after every phase.
- The PKF runtime is synchronized.
- The OKF knowledge base reflects the repository.
- AI retrieval is optimized.
