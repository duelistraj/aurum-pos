---
name: token-atlas-lite
description: Initialize, explicitly refresh, or validate a lean repository knowledge base containing architecture, decisions, glossary, dependencies, memory, and navigation. Use when a user explicitly asks for Token Atlas Lite setup or repair, or when validating an existing `.ai/token-atlas-lite.json` runtime. Do not use for full Token Atlas PKF routing, leaf generation, retrieval exports, or a separate end-of-turn closeout; initialized repository instructions own inline Lite updates during implementation.
---

# Token Atlas Lite

## Purpose

Create a small human- and AI-readable repository memory without PKF routes,
module leaves, repository-local tools, or automatic closeout.

Treat source code, tests, configuration, existing documentation, and explicit
user decisions as truth. Never invent facts, rationale, dates, or ownership.

## Select the workflow

Inspect `.ai/token-atlas-lite.json` without loading other `.ai/` content first.

- For a missing runtime and an explicit initialization request, read
  `references/contract.md` and `references/initialize.md` completely.
- For an explicit refresh, read `references/contract.md` and
  `references/refresh.md` completely.
- For validation or repair, read `references/contract.md` and
  `references/validation.md` completely.
- For routine implementation in an initialized repository, follow its managed
  `AGENTS.md` block. Do not activate this skill or start a separate closeout.

If the Lite manifest is absent but any managed Lite target file already exists,
stop instead of overwriting it. Report the collisions and require the user to
resolve or explicitly repair them.

## Runtime boundary

The generated `.ai/` surface is exactly the Lite manifest plus these six
knowledge documents:

```text
.ai/token-atlas-lite.json
.ai/INDEX.md
.ai/ARCHITECTURE.md
.ai/DECISIONS.md
.ai/GLOSSARY.md
.ai/DEPENDENCIES.md
.ai/MEMORY.md
```

Do not generate `.ai/PKF.md`, `.ai/tools/`, routes, module indexes, knowledge
leaves, or retrieval exports. Do not modify application source, tests, or
configuration while running a Lite knowledge workflow.

## Validation

Run the bundled dependency-free validator after initialization, after explicit
refresh, and whenever validation is requested:

```text
python -S <token-atlas-lite-skill>/scripts/lite_validate.py --path . --format json
```

Repair all errors and rerun it until it reports `passed`. Routine inline
maintenance does not run the validator.

## Completion

Report the workflow used, knowledge files changed, evidence consulted, memory
token estimate, and validation result. Do not emit a PKF or Lite closeout status.
