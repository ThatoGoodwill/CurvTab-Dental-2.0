# Phase 1 orthodontics — final build validation

This pull request intentionally adds no patient records or invoices.
It exercises the latest main commit using GitHub Actions.

Staging checks already performed:
- Migrated isolated Neon validation branch only.
- Retained all 10 existing copied patient records.
- Confirmed duplicate open intake prevented by unique partial index.
- Deleted test intake after validation.

Still gated: legally approved terms, durable files/PDF retrieval, advance fee ledger posting, and full authenticated role/tenant acceptance tests.
