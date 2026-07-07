# Phase 1 - Initialize OKF Knowledge Base

## Purpose

Initialize the Project Knowledge Framework (PKF) by creating a repository-specific, Open Knowledge Format (OKF) compatible knowledge base.

This phase creates the knowledge structure and retrieval contract only. Do **not** extract implementation details.

---

## Inputs

- Current repository
- PKF templates

---

## Outputs

Create or update:

```text
.ai/
|-- PKF.md
|-- MEMORY.md
|-- ARCHITECTURE.md
`-- knowledge/
    |-- INDEX.md
    |-- glossary.md
    |-- dependencies.md
    |-- decision_log.md
    `-- <module>/
        |-- INDEX.md
        |-- api.md
        |-- schema.md
        |-- business_rules.md
        `-- ui.md
```

All documents under `.ai/` must follow the Open Knowledge Format (OKF).

---

## Execution

### 1. Discover Repository

Detect:

- Project name
- Technologies
- Repository structure
- Functional modules
- Source roots, config roots, test roots, and documentation roots

Create knowledge only for modules that exist.

---

### 2. Initialize PKF Runtime

Create or update:

- `PKF.md`
- `MEMORY.md`
- `ARCHITECTURE.md`

These documents define the repository-specific PKF runtime and may evolve as the project evolves.

`PKF.md` must define:

- Startup sequence.
- Source-of-truth rules.
- Extraction, optimization, and validation gates.
- The difference between `pkf.loads` and `pkf.related`.

`MEMORY.md` must start with only stable repository-wide facts.

`ARCHITECTURE.md` must map repository paths to modules without describing implementation internals.

---

### 3. Create OKF Knowledge Base

Create:

- `knowledge/INDEX.md`
- `glossary.md`
- `dependencies.md`
- `decision_log.md`

Create one directory for every detected module.

---

### 4. Generate Module Skeletons

For every detected module create:

- `INDEX.md`
- `api.md`
- `schema.md`
- `business_rules.md`
- `ui.md`

Populate only:

- OKF metadata
- Document purpose
- Placeholders
- Routing slots for future tasks

Do **not** analyze implementation.

---

### 5. Initialize OKF Metadata

Every generated document must contain valid OKF front matter.

Required fields:

```yaml
---
type:
title:
description:
resource:
tags:
timestamp:

pkf:
  loads: []
  related: []
---
```

Populate only values verifiable from the repository structure.

Leave unknown values empty or marked as `TODO`.

Use consistent tags:

- Project tag, such as `zephyr-pkf`.
- Module tag.
- Knowledge type tag, such as `api`, `schema`, `rules`, `ui`, `routing`, or `architecture`.

---

### 6. Build Root Knowledge Index

Generate `knowledge/INDEX.md`.

It must contain:

- Project overview
- Technologies
- Available modules
- Module summaries
- Routing keywords
- Module entry points
- Path-to-module ownership map
- Common task routing table

This is the root entry point into the OKF knowledge base.

---

### 7. Configure PKF Runtime

Update `PKF.md` so every AI session follows this startup sequence:

```text
MEMORY.md
    ->
ARCHITECTURE.md
    ->
knowledge/INDEX.md
```

---

## Rules

- Source code is the single source of truth.
- Generate an OKF-compatible knowledge base.
- PKF runtime documents are repository-specific and may evolve.
- Never invent implementation details.
- Never inspect APIs, schemas, or business logic.
- Preserve existing documentation whenever possible.
- Update existing files instead of recreating them.
- Keep the process idempotent.
- Keep indexes as routers, not long-form documentation.
- Keep placeholders explicit and easy to remove during extraction.

---

## Completion Criteria

Phase 1 succeeds when:

- The PKF runtime has been initialized.
- The OKF knowledge base exists.
- Every detected module has an OKF skeleton.
- Every document contains valid OKF metadata.
- `knowledge/INDEX.md` routes to every module.
- `PKF.md` routes to the knowledge base.
- No implementation knowledge has been extracted.
- The repository is ready for Phase 2.
