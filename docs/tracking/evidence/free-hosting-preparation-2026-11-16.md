# Free hosting preparation ? 16 November 2026

The user authorised deployment using the previously proposed free Render + Supabase pilot. This is a preparation checkpoint, **not a successful deployment**.

## Observed remote state

- Supabase signed-in account had no organisations. Created an InfraShader organisation with the visible Free $0/month plan.
- Opened the new-project form. Database-password creation and project creation were handed to the user; no password was entered by the agent. The new hosted database, API service and website are not yet verified/created at this checkpoint.
- Local development data has not been exported or uploaded. No paid resource, domain, email service or paid plan was selected.

## Prepared changes

- `render.yaml`: free Python API in Singapore plus static React site; no Render database, disk or paid plan. Manual releases, schema-validated secret placeholders, exact CORS setting, SPA route rewrite and readiness check. Python 3.12.15 and one worker.
- `deploy/start-api.sh`: migrate before listening on Render's PORT. Git attributes retain LF shell scripts. No development server or fixture API is used.
- `apps/api/pyproject.toml` and `uv.lock`: pypdf moved from the development group into runtime dependencies. The real offer text-extraction path imports it.
- Configurable bounded browser timeout: hosted build uses 90 seconds to allow a sleeping free API to wake up; invalid values use the prior 15-second default. Caller signals and the no-automatic-write-retry rule remain.
- `deploy/FREE_PILOT.md`: setup, private-schema/non-superuser-role requirements, secret/public settings, actual free-plan limits and real hosted verification gates.

## Actual checks

- Render Blueprint validated against `https://render.com/schema/render.yaml.json` with check-jsonschema: passed.
- Shell syntax `bash -n deploy/start-api.sh`: passed.
- Frontend lint/typecheck/build: passed; 41 Vitest files / 163 tests passed. Existing bundle-size warning remains.
- Backend Ruff and format: passed (130 Python files).
- Full local PostGIS suite: 425 passed, 1 skipped, 1 existing Starlette/httpx deprecation warning. The skipped test is the joint private-file restore drill: local Supabase Storage was not running (confirmed in the storage-only -rs follow-up).
- Isolated production-only virtual environment installed with `uv sync --frozen --no-dev`; imports of app.main and pypdf passed. No development dependency required for those imports.
- Initial backend command stopped because PowerShell treated uv's package-build stderr as an error. Synced the lock/environment explicitly and reran. Local Postgres was stopped; started it for disposable tests. The initial waiting test process was interrupted, and the subsequent full run above completed.
- No hosted login, database migration, Storage, map-provider, receipt/submission, backup or restore verification has happened. No browser integration rerun is claimed for this configuration-only checkpoint.

## Remaining deployment gates

User creates the free Supabase project and saves its new database credential securely. Then configure a private application schema/role, PostGIS, asymmetric Auth, evidence bucket, Render secret settings, actual API/frontend origins, restricted Mapbox public token and controlled real pilot accounts. Verify all hosted workflows and backup/restore before important data. If any service requests a paid plan or billing/overage commitment, stop for the user's explicit approval.

This checkpoint leaves all feature deployment/acceptance statuses unchanged. Local preflight does not establish hosted success or production readiness.
