# Dependency/source register - organisation access increment

Versions below are from committed package-lock.json / apps/api/uv.lock; no new service or package was added. Official references reviewed 19 October 2026.

| Feature | Existing technology / locked version | Implementation and evidence | Official resource |
|---|---|---|---|
| Identity and current verified email | supabase-js 2.117.3; PyJWT 2.15.1; HTTPX 0.28.1 | auth.py, onboarding.py; live-browser and access tests | https://supabase.com/docs/reference/javascript/auth-getuser |
| Tenant/project authorisation | FastAPI 0.143.0, SQLAlchemy 2.0.54 | access.py and protected API modules; test_access_foundation.py | https://fastapi.tiangolo.com/tutorial/dependencies/ |
| Invitation concurrency and migrations | PostgreSQL/PostGIS, psycopg 3.3.6, Alembic 1.20.0 | migration 0011, organisation/row locks, replay/concurrent acceptance and legacy migration tests | https://www.postgresql.org/docs/current/explicit-locking.html ; https://alembic.sqlalchemy.org/ |
| Workspace shells and routing | React 19.3.0, React Router 7.18.4, TypeScript 5.9.3, Vite 8.3.4 | App.tsx, routes.ts, onboarding/invitation/project-access components | https://reactrouter.com/start/data/routing |
| Verification | pytest 9.1.1, Playwright 1.64.0, existing Vitest/Ruff/ESLint | access-browser, live-browser, integration-browser, API tests | https://playwright.dev/docs/test-intro |

The server-side current-account request follows Supabase's documented authenticated user lookup. PostgreSQL row locks serialise invitation acceptance and last-administrator mutations. Router paths organise UI navigation only; backend checks remain authoritative. These references support the implementation approach, not a claim that all product acceptance gates passed. See validation.md.

Existing map stack remains MapLibre 6.13.0 with pvlib 0.16.1, PyProj 3.8.0 and Shapely 2.2.0. The explorer environment increment uses native MapLibre/WebGL2; terrain, automatic live weather and cross-organisation disclosure are outside this increment.

## MVP completion addition (13 November 2026)

| Feature | Added dependency / exact version | Reason and scope | Licence / source |
|---|---|---|---|
| S08 accessibility verification | `@axe-core/playwright` 4.14.0 (dev only; pulls `axe-core` ~4.14.0), released 15 Oct 2026 | Automated WCAG 2.1 A/AA scan of connected screens in `tests/integration-browser/accessibility.spec.mjs`; not shipped in the web bundle; does not replace assistive-technology testing with users | MPL-2.0, Deque Systems; https://github.com/dequelabs/axe-core-npm ; https://github.com/dequelabs/axe-core |

No runtime dependency was added for output template v3, the O17 memorandum (existing `@react-pdf/renderer` 4.9.0) or CSV safety (Python `csv`). PDF text checks in tests use the existing `pypdf` (`apps/api/pyproject.toml`).
