# InfraShader

- Frontend: React/TypeScript/Vite in `apps/web`; npm workspace commands at root. Backend: Python 3.12/FastAPI in `apps/api`; use uv and committed locks.
- Read `docs/build-plan.md`, `docs/decisions.md` and `docs/validation.md` before continuing. SRS acceptance IDs map in `docs/requirements.md`.
- Backend owns authorisation, quantities, pricing, revisions and issued snapshots. Real persistence is PostgreSQL/PostGIS. Browser Demo is separate and is not acceptance evidence for real services.
- Check frontend lint/typecheck/test/build, backend Ruff/pytest, and relevant browser/integration paths. Report skipped/external checks honestly.
- Geographic transfer is WGS84 longitude/latitude; metric quantities require a declared suitable projected CRS. Money uses Decimal. Never assert field shade accuracy or hide stale/partial/unavailable results.
- No remote writes, PR, deployment, paid resources, service-role browser keys or external messages without explicit user authorisation. Keep staged F13/F16–F20 gated.
