# Token Atlas Lite Runtime Contract

## Runtime manifest

Write `.ai/token-atlas-lite.json` with exactly:

```json
{
  "edition": "lite",
  "schema_version": 1,
  "entrypoint": ".ai/INDEX.md"
}
```

Do not add keys or use the manifest as a knowledge store.

## Document authority

| Document | Authoritative content |
| --- | --- |
| `INDEX.md` | Navigation, repository summary, document authority, and update rules |
| `ARCHITECTURE.md` | Current components, boundaries, ownership, and important flows |
| `DECISIONS.md` | Durable decisions, status, rationale, consequences, and confirmation basis |
| `GLOSSARY.md` | Repository-specific terms and domain concepts |
| `DEPENDENCIES.md` | Important libraries, services, infrastructure, and why they exist |
| `MEMORY.md` | Cross-session operational facts that belong nowhere else |

Store a durable fact in one authoritative document. A change may update several
documents only when each receives a distinct slice of knowledge. Keep indexes
as routing surfaces rather than duplicating knowledge.

`MEMORY.md` is always loaded and must remain at or below 1,000 approximate
tokens, measured as `ceil(character_count / 4)` across the complete file. Move
overflow to its authoritative document or remove lower-value memory. Do not
split an entry to evade the limit.

## Required headings

Use these exact top-level headings:

```text
# Token Atlas Lite Index
# Architecture
# Decisions
# Glossary
# Dependencies
# Memory
```

`INDEX.md` also contains:

```text
## Repository Summary
## Navigation
## Inline Update Rules
```

In the five knowledge documents other than `INDEX.md`, represent each durable
record as a `###` section. A document with no verified records may state a
concise explicit empty state instead of creating placeholder sections.

## Evidence

Every source-backed record uses this exact shape:

```markdown
Evidence:
- `backend/app/auth.py::AuthService.login`
- `backend/tests/test_auth.py::test_login_success`
```

The path before `::` is repository-relative and must resolve to a file. The
optional locator identifies a symbol, qualified symbol, configuration key,
command, or relevant section. The deterministic validator checks syntax and
file existence. Semantic locator accuracy remains model-reviewed.

Do not use external URLs as sole evidence for repository facts. Existing
repository documentation may be evidence when it is authoritative for the fact.

## Decisions

Every decision record includes:

```markdown
Recorded: YYYY-MM-DD
Status: proposed|accepted|superseded|deprecated
Basis: source-backed|user-confirmed
Decision: <the durable choice>
Rationale: <supported or explicitly confirmed rationale>
Consequences: <current consequences>
```

A source-backed decision requires repository evidence. A user-confirmed
decision additionally includes `Confirmed: YYYY-MM-DD` and may be recorded
before repository evidence exists.

Never infer rationale from an implementation choice. Record rationale only when
repository evidence supports it or the user explicitly confirms it. If a
current choice lacks supported rationale, describe it as current architecture
or dependency usage instead of inventing a decision record.

## Inline update protocol

Install this exact managed block in root `AGENTS.md`, preserving unrelated
instructions:

```markdown
<!-- token-atlas-lite:bootstrap:start -->
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
<!-- token-atlas-lite:bootstrap:end -->
```

Do not emit a closeout status. Explicit initialization, refresh, and validation
remain skill workflows; routine inline updates do not activate the skill.

## Quality rules

- Use concise retrieval-ready tables and bullets rather than long prose.
- Emit no TODO, FIXME, TBD, placeholder, pending, or speculative content.
- Preserve verified manual notes and relocate them only to the authoritative file.
- Do not copy large source snippets.
- Do not claim deterministic validation proves semantic completeness, locator
  correctness, rationale, or that differently evidenced facts are equivalent.
