# Validate Token Atlas Lite

Run the bundled validator from the target repository:

```text
python -S <token-atlas-lite-skill>/scripts/lite_validate.py --path . --format json
```

It deterministically checks:

- the exact edition manifest;
- all six required documents and headings;
- the exact managed `AGENTS.md` block;
- incomplete or placeholder content;
- the 1,000-token `MEMORY.md` budget;
- durable record shape and evidence-path resolution;
- decision basis, date, status, and evidence requirements;
- duplicate records with identical normalized evidence and identical or highly
  similar normalized text.

The validator does not prove semantic completeness, evidence relevance, symbol
accuracy, user intent, or inferred rationale. Review those against source and
explicit user statements.

When repair is requested, modify only Lite knowledge, its manifest, and its
managed instruction block. Rerun validation until it reports `passed`.
