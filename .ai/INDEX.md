# Token Atlas Lite Index

## Repository Summary

Aurum POS is a jewellery-shop point-of-sale and inventory system. It combines
an authenticated FastAPI API and PostgreSQL data model with a React client that
can run on the web, in Capacitor Android, or through the repository's Tauri
wrapper. The implemented domains are authentication and devices, inventory,
metal rates, sales and invoices, dashboard analytics, and change history.

## Navigation

| Document | Read when you need |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Components, boundaries, request flows, pricing, or client behavior |
| [Decisions](DECISIONS.md) | Durable choices and their supported rationale |
| [Glossary](GLOSSARY.md) | Repository-specific business and technical terms |
| [Dependencies](DEPENDENCIES.md) | Runtime services, libraries, platforms, and verification tooling |
| [Memory](MEMORY.md) | Always-loaded development and operational facts |

Source code, tests, configuration, repository documentation, and explicit user
decisions remain authoritative. These documents summarize verified facts; they
do not replace implementation evidence.

## Inline Update Rules

- Update the authoritative Lite document inline only when a verified durable
  fact changes during the current implementation task.
- Keep one fact in one authoritative document; add distinct slices elsewhere
  only when needed for navigation or operation.
- Do not infer decision rationale. Record it only from repository evidence or
  an explicit user confirmation.
- Keep `MEMORY.md` at or below 1,000 approximate tokens and move domain detail
  to its authoritative document.
- Do not create routes, module leaves, repository-local PKF tools, retrieval
  exports, or `.ai/PKF.md` for the Lite runtime.
