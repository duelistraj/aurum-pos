# Refresh Token Atlas Lite

## Scope

Refresh only when explicitly requested. Prefer the smallest reliable change
scope in this order:

1. User-supplied changed paths.
2. Staged Git changes.
3. Unstaged Git changes.
4. A repository-wide audit only when explicitly requested or when no reliable
   changed-path scope exists.

## Workflow

1. Read `INDEX.md`, `MEMORY.md`, and only documents whose authoritative content
   may be affected.
2. Inspect the changed source, tests, configuration, and documentation needed to
   verify the durable result.
3. Update, remove, or relocate affected records. Do not retain stale evidence.
4. Record decisions only from source-backed rationale or explicit user
   confirmation. Do not reinterpret implementation choices as rationale.
5. Remove cross-document duplication and keep `MEMORY.md` within its 1,000-token
   budget.
6. Run the bundled validator and repair every finding until it passes.

Do not use refresh as an automatic closeout and do not change application files.
