# Phase 3 - Optimize OKF Knowledge Base

## Purpose

Optimize the OKF knowledge base for efficient AI retrieval.

Improve routing, reduce context size, eliminate duplication, and ensure AI agents can load only the minimum knowledge required for any task.

Do not extract new repository knowledge.

---

## Inputs

- Existing PKF runtime
- Existing OKF knowledge base

---

## Outputs

A concise, consistent, and retrieval-optimized OKF knowledge base.

---

## Execution

### 1. Optimize Root Knowledge Index

Review `knowledge/INDEX.md`.

Ensure it:

- Lists every available module.
- Contains accurate module summaries.
- Uses meaningful routing keywords.
- Routes correctly to every module `INDEX.md`.
- Maps source paths and common task intents to modules.
- Separates automatic startup context from optional discovery context.
- Avoids embedding module details that belong in module documents.

---

### 2. Optimize Module Indexes

Review every module `INDEX.md`.

Ensure each module:

- Clearly describes its purpose.
- Routes common development tasks.
- Loads the minimum required documents.
- Avoids unnecessary context.
- Distinguishes task-specific loads from optional related documents.
- Provides file-path and keyword routing for the module.

---

### 3. Optimize Knowledge Documents

Review every OKF document.

Ensure:

- Information is concise.
- Facts are implementation-backed.
- Duplicate knowledge is removed.
- Each concept has one authoritative location.
- Evidence is compact and points to source paths or symbols.
- Sections are task-oriented and skimmable.

Split oversized documents when necessary.

Prefer this document shape:

```text
Purpose
When to load
Source map
Verified facts
Open TODOs
Related knowledge
```

---

### 4. Optimize Metadata

Review every document's OKF metadata.

Ensure:

- Required fields are present.
- `resource` references are valid.
- `tags` remain accurate.
- `pkf.loads` loads only the minimum required documents.
- `pkf.related` references only meaningful related knowledge.

Remove obsolete metadata.

Reject broad load chains that pull unrelated modules into context.

---

### 5. Optimize Shared Knowledge

Review:

- `glossary.md`
- `dependencies.md`
- `decision_log.md`
- `MEMORY.md`
- `ARCHITECTURE.md`

Ensure they contain only repository-wide knowledge.

Move module-specific information into the appropriate module.

Repository-wide knowledge should help route work or avoid repeated rediscovery. It should not describe local implementation details that only matter after a module is selected.

---

### 6. Remove Stale Knowledge

Identify knowledge that no longer reflects the repository.

Update or remove:

- Deprecated APIs
- Removed schemas
- Obsolete business rules
- Invalid routing
- Broken references

---

### 7. Verify Retrieval Efficiency

Ensure an AI can navigate the knowledge base efficiently.

The expected retrieval flow is:

```text
PKF.md
    ->
MEMORY.md
    ->
ARCHITECTURE.md
    ->
knowledge/INDEX.md
    ->
Module INDEX.md
    ->
Required OKF documents
```

The knowledge base should support minimal-context retrieval without unnecessary repository exploration.

Test at least these retrieval scenarios:

- "Change an API route."
- "Change a schema or data model."
- "Change business logic."
- "Change UI behavior."
- "Understand repository architecture."
- "Update dependencies or tooling."

For each scenario, list the expected documents and remove any unnecessary loads.

---

## Rules

- Do not modify application code.
- Do not invent information.
- Do not duplicate knowledge.
- Prefer references over repetition.
- Keep documents concise.
- Optimize for minimal AI context loading.
- Preserve existing manual documentation whenever possible.
- Maintain valid OKF documents.
- Keep root and module indexes as routing surfaces.
- Treat excessive `pkf.loads` entries as optimization defects.

---

## Completion Criteria

Phase 3 succeeds when:

- The OKF knowledge base is fully navigable.
- Root and module routing are accurate.
- Duplicate knowledge has been removed.
- Metadata is consistent.
- Shared knowledge contains only repository-wide information.
- All cross references are valid.
- AI retrieval requires only the minimum necessary context.
- The knowledge base is optimized for long-term maintenance.
