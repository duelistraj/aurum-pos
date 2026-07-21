# Initialize Token Atlas Lite

## Preconditions

Initialize only when explicitly requested and `.ai/token-atlas-lite.json` is
absent. If any managed Lite target file already exists without the manifest,
report the collision and stop rather than overwriting it.

Preserve existing repository instructions outside the managed Lite markers.

## Complete extraction

1. Inspect repository documentation, manifests, configuration, source roots,
   tests, and operational commands broadly enough to understand the implemented
   repository rather than only the user's current task.
2. Derive the repository summary, major components, boundaries, important flows,
   meaningful dependencies, repository terminology, supported decisions, and
   small cross-session operational memory from verified evidence.
3. Create the manifest, six complete Markdown documents, and exact managed
   `AGENTS.md` block from `contract.md`.
4. Use `###` evidence-bearing records in each knowledge document. Do not create
   records for unverified, planned, or nonapplicable knowledge.
5. Review the complete output for omissions, unsupported rationale, duplicate
   facts, misplaced memory, and evidence that does not support the claim.
6. Run the bundled validator. Repair every finding and rerun until it passes.

Initialization is complete only when all six documents are useful, the complete
`MEMORY.md` is at most 1,000 approximate tokens, and no TODO or placeholder
content remains.

Do not modify application files and do not generate Full Token Atlas artifacts.
