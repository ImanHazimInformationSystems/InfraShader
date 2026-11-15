# InfraShader

- For a new AI continuation, start with `docs/AI_HANDOFF.md` for the dated repository snapshot and precedence map. It is an orientation document, not a parallel status source; refresh it when architecture, branch state, or major verification changes. Never include `.env`, tokens, credentials, or private local database/config files in a handoff.
- Before feature work, read `docs/FEATURE_STATUS.md`, `docs/FEATURE_SPEC.md`, the relevant `docs/features/<ID>.md` and canonical CSV registers in `docs/tracking/`. Detailed specifications stay outside AGENTS.md.
- Preserve stable feature/requirement IDs and overlapping cross-references. Inspect code before changing status; keep implementation, verification, deployment and acceptance separate. Requirements express intent; investigate discrepancies with code rather than silently rewriting requirements.
- Work only within the requested feature scope and necessary dependencies; the tracker does not authorise implementing the whole backlog. Update affected CSV records and actual evidence after changes, then regenerate using `python scripts/tracking.py`; see `docs/tracking/README.md` for Excel generation.
- Record real code paths, commands, outcomes, skipped checks and remaining gaps. Report affected feature IDs and tracking updates when finishing. Do not claim acceptance from a screen, a test file, a mock or an unperformed check.
- Update the canonical CSV registers and generated Markdown in place. Excel is an optional export: do not regenerate or attach a workbook unless the user explicitly requests it. Preserve original attachments and historical exports.
- For product UI placement, consult `docs/UI_COVERAGE.md` and `docs/UI_DESIGN.md`; maintain `docs/tracking/ui-coverage.csv` using `python scripts/ui-catalogue.py` and `--check`. UI-only previews do not establish domain implementation or acceptance; preserve existing connected workflows when connecting a feature.

- Frontend: React/TypeScript/Vite in `apps/web`; npm workspace commands at root. Backend: Python 3.12/FastAPI in `apps/api`; use uv and committed locks.
- Read `docs/build-plan.md`, `docs/decisions.md` and `docs/validation.md` before continuing. SRS acceptance IDs map in `docs/requirements.md`.
- Backend owns authorisation, quantities, pricing, revisions and issued snapshots. Real persistence is PostgreSQL/PostGIS. Browser Demo is separate and is not acceptance evidence for real services.
- Check frontend lint/typecheck/test/build, backend Ruff/pytest, and relevant browser/integration paths. Report skipped/external checks honestly.
- Geographic transfer is WGS84 longitude/latitude; metric quantities require a declared suitable projected CRS. Money uses Decimal. Never assert field shade accuracy or hide stale/partial/unavailable results.
- No remote writes, PR, deployment, paid resources, service-role browser keys or external messages without explicit user authorisation. Keep staged F13/F16–F20 gated.
