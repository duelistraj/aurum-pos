# General Guidelines

- Never use the em dash "—". Use plain dash "-" instead.
- When writing commit messages, NEVER auto-add your agent name as co-author.
- When writing or substantially editing long Markdown files, put each full sentence on its own line. Preserve normal Markdown structure, but avoid wrapping multiple sentences onto one physical line.
- When making technical decisions, do not give much weight to development cost. Instead, prefer quality, simplicity, robustness, scalability, and long term maintainability.
- When doing bug fixes, always start with reproducing the bug in an E2E setting as closely aligned with how an end user experiences it. This makes sure you find the real problem so your fix will actually solve it.
- When end-to-end testing a product, be picky about the UI you see and be obsessed with pixel perfection. If something clearly looks off, even if it is not directly related to what you are doing, try to get it fixed along the way.
- Apply that same high standard to engineering excellence: lint issues, test failures, and test flakiness. If you see one, even if it is not caused by what you are working on right now, still get it fixed.

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

### Code Search

- Prefer `rg` (ripgrep) for text search and file discovery.
- Prefer `sg` (ast-grep) for syntax-aware code searches and refactoring.
- Avoid `grep -r` unless `rg` is unavailable.

#### Best Practices

- Read and always follow .codex/best-practices/PYTHON-BEST-PRACTICES.md.
- Read and always follow .codex/best-practices/REACT-BEST-PRACTICES.md.
