# Code Search

- Prefer `rg` (ripgrep) for text search and file discovery.
- Prefer `sg` (ast-grep) for syntax-aware code searches and refactoring.
- Avoid `grep -r` unless `rg` is unavailable.

## Best Practices

- Read and always follow .codex/best-practices/PYTHON-BEST-PRACTICES.md.
- Read and always follow .codex/best-practices/REACT-BEST-PRACTICES.md.

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
