---
name: commit
description:
  Create a well-formed git commit from current changes for
  rationale and summary; prepare a commit message. Do not actually commit the changes.
---

# Commit

## Goals

- Produce a commit that reflects the actual code changes.
- Follow common git conventions (type prefix, short subject, wrapped body).
- Include both summary and rationale in the body.

## Inputs

- `git status`, `git diff`, and `git diff --staged` for actual changes.
- Repo-specific commit conventions if documented.

## Steps

1 Inspect the working tree and staged changes (`git status`, `git diff`,
   `git diff --staged`).
2. Choose a conventional type and optional scope that match the change (e.g.,
   `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`).
3. Write a subject line in imperative mood, <= 72 characters, no trailing
   period.
4. Write a body that includes:
   - Summary of key changes (what changed).
   - Rationale and trade-offs (why it changed).
   - Tests or validation run (or explicit note if not run).

## Output

- A single commit message reflects that reflects the actual code changes.

## Template

Type and scope are examples only; adjust to fit the repo and changes.

```
<type>(<scope>): <short summary>

Summary:
- <what changed>
- <what changed>

Rationale:
- <why>
- <why>

Tests:
- <command or "not run (reason)">
```