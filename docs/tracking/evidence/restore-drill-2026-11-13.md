# Joint database + retained-file restore drill — 13 November 2026

Feature IDs: S04, S06 (D0 retained PDFs/evidence restoration), supporting the D1A/D1B exit check "independently check actual retained-file recovery".

## Method (repeatable)

`apps/api/tests/test_restore_drill.py` (integration; skipped if `pg_dump`/`pg_restore` are unavailable). It runs only in the disposable `infrashader_test_<uuid>` schema of the `_test` database created by the test fixture — never the development database (asserted).

1. Populate through application paths: issued contractor proposal with retained PDF (`issued_files.retain`), a change request, and an owner review with a received original PDF, locked rubric, submitted score, recommendation and approval that retains the decision pack (JSON + CSV).
2. `pg_dump --format=custom --schema=<schema>` (PostgreSQL 17.11 client from `.local/tools/pgsql/bin`).
3. Simulated loss: `DROP SCHEMA … CASCADE`, recreate empty; asserted zero tables.
4. `pg_restore --clean --if-exists --no-owner`.
5. Verify through authorised download functions: issued proposal bytes equal and SHA-256 equal; received original and both decision-pack files match their recorded SHA-256; owner evaluation hash identical after restore; change register intact; row counts of `issued_files`/`review_files` equal; UPDATE on both tables still rejected by the immutability trigger.

## Result

`uv run pytest -q tests/test_restore_drill.py` → 1 passed (13 Nov 2026, local PostgreSQL 17.11/PostGIS 3.6.2).

## Limits

- Photo evidence bytes live in private Supabase Storage and are not covered; a joint Postgres + Storage restore is still required for S04/D09 acceptance.
- Schema-level dump on one local machine; no off-machine backup, retention schedule, point-in-time recovery, timing/RPO/RTO measurement or operator runbook acceptance.
- Supabase Auth identities are not part of this drill.
