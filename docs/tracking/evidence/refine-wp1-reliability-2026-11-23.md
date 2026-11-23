# Refinement WP1 — reliability foundations (23 November 2026)

Scope: first slice of the customer-ready refinement ([plan](../../REFINEMENT_PLAN.md)). Feature IDs:
S06 (recovery, version checks, operational hardening), L04 (spatial editing defect), L13/L31 (road
pricing explanation browser check). Branch `refine/customer-ready`; local only; nothing deployed.

## Problems found at baseline

1. **Server errors were unreadable cross-origin.** The catch-all `Exception` handler runs in
   Starlette's outermost `ServerErrorMiddleware`, outside `CORSMiddleware`. On a deployment where the
   web and API have different origins (the hosted pilot), any unexpected 500 had no CORS headers.
   The browser blocked it and the client said "The API could not be reached", hiding the real failure.
   This matches the user-reported Price dialog message of 15 November.
2. **Timeouts read as outages.** The client turned every fetch rejection, including its own 15-second
   `AbortSignal.timeout`, into "could not be reached". It also retried timed-out reads.
3. **An unmigrated database produced generic failures.** A missing column surfaced as "Database operation
   failed. Retry…", which suggested retrying rather than migrating. Readiness only probed the
   `organisations` table.
4. **Save state was incomplete.** The studio header showed only Unsaved / All changes saved / Not saved
   yet. A failed or conflicting save looked the same as "unsaved".
5. **L04 polygon defect: an application defect, not automation.** `DrawingMap.start()` switches the
   default 3D view to plan view. The selected-feature effect listed `threeD`/`terrainEdited` as
   dependencies, so it re-ran, called `drawing.clear(); drawing.setMode('select')` and silently cancelled
   the polygon. The status still read "Click vertices…". Drawing only worked if the user had already
   switched to 2D.

6. **Object move on the embedded map: also an application defect.** This is the recorded reference
   `geographic-editor` failure ("object-move click misses the object"). In the Objects scene "move" tool,
   the click is handled by `ObjectScene` (move the selected object). `DrawingMap`'s Mapbox click handler
   also ran on the same canvas: it selected the site target outline under the pointer and switched the
   panel to Layout mid-move. A real user would see the same panel jump.
7. **Outdated test step, not an app defect.** The same spec then clicked "Map view" while already in map
   view. Since the 15 Nov journey change, that button exists only in List view. The step was never
   reached before because of item 6. It is now conditional; the assertion after it is unchanged.
8. **Stale baseline note.** The `studio-shell` ("Change workspace") and `roads` (phone "Layout")
   reference failures listed in the plan baseline already pass. They were fixed in the 16 Nov close-out,
   and both were re-run on 23 Nov.
9. **Pricing states (WP2 2.5).** One "Needs price" state covered both "nothing measured yet" and "no
   rate chosen". The brief asks for Needs quantity / Needs rate / Needs review / Priced.

## Changes

- `apps/api/app/error_middleware.py` (new): pure ASGI middleware *inside* CORS converts unexpected
  exceptions to the JSON error contract with `X-Request-ID`. It logs only the exception type and request ID.
- `apps/api/app/schema_status.py` (new): compares `alembic_version` with the shipped migration heads.
  The result is `current`, `behind`, `unrecognised`, `empty` or `unknown`.
- `apps/api/app/main.py`:
  - registers the middleware;
  - readiness adds `checks.schema` and reports `database: migrations_pending` when behind or empty. An
    unreachable database is not probed twice.
- `apps/api/app/db.py`: `database_failure()` maps SQLSTATE:
  - undefined column/table plus a pending schema → 503 `migrations_pending`;
  - 57014 → 503 `database_timeout`;
  - connection failures → "database is unavailable".

  No SQL text or parameters are returned.
- `apps/web/src/services/api.ts`:
  - `transportFailure()` separates `timeout` (slow/starting server; not retried), `offline`, `aborted`
    and `network_error`;
  - 5xx messages carry a short reference (first 8 characters of the request ID);
  - non-JSON gateway errors become `upstream_unavailable`;
  - `ApiError.body` keeps the parsed body.
- `apps/web/src/App.tsx`:
  - the top bar names "migrations pending" and "API starting or slow" from readiness/timeouts;
  - `displayError` no longer duplicates references.
- `apps/web/src/domain/save-status.ts` (new), `GeometryWorkspace.tsx`, `StudioShell.tsx`,
  `components/journey.css`:
  - the studio header shows Saving… / Save failed: not saved / Not saved: newer version exists, with an
    alert-styled pill (not brand maroon);
  - the error message says unsaved changes remain in the tab.
- `apps/web/src/components/DrawingMap.tsx`:
  - the camera fit is now a separate effect, so loading the selected feature into Terra Draw no longer
    depends on the camera state;
  - the map click handler skips feature selection while an embedded scene tool owns the pointer
    (`canvas.dataset.sceneTool`).
- `apps/web/src/components/ObjectScene.tsx`: an active (non-navigate) embedded scene tool marks the
  shared canvas. It clears the mark only if it set it, because a navigate-only placement scene can share
  the canvas.
- `tests/reference-browser/geographic-editor.spec.mjs`: the outdated "Map view" click is now conditional.
- `apps/web/src/domain/pricing.ts`, `PricingBoard.tsx`, `pricing.css`: new `needs_quantity` state
  ("Needs quantity") when the API returned no measured line. `needs_price` is now labelled "Needs rate".
  While no preview exists, chips show "…", so a failed preview cannot mislabel items.
- `tests/integration-browser/pricing-road.spec.mjs` (new): a road without layers shows "This road has no
  material layers yet", offers no rate choice, keeps Apply disabled, and "Define layers in Materials"
  opens Materials with that road selected. `pricing-home.spec.mjs` now expects "Needs rate".

## Checks run (actual results)

| Command | Result |
|---|---|
| Baseline before changes: `npm run lint`, `npm run typecheck`, `npm test` | clean, clean, 163 passed |
| Baseline: `.\scripts\api.ps1 test -q`, `.\scripts\api.ps1 lint` | 425 passed / 1 skipped; clean |
| `.\scripts\api.ps1 test -q tests/test_reliability.py tests/test_api.py` | 13 passed |
| After changes: `.\scripts\api.ps1 test -q` | 430 passed / 1 skipped |
| `.\scripts\api.ps1 lint` | first run E501 in `error_middleware.py`; fixed; Ruff check and format clean |
| `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` | clean, clean, 170 passed (42 files), built (existing >500 kB chunk warning) |
| Integration (`INFRA_IT_API_PORT=8130 INFRA_IT_WEB_PORT=5174 npx playwright test --config playwright.integration.config.mjs reliability pricing-home`) | 2 passed |
| Browser Demo `tests/browser/foundation.spec.mjs -g "Terra Draw polygon"` before fix | failed (desktop): coordinates stayed empty; diagnostic showed clicks reached `canvas.mapboxgl-canvas` with status "Click vertices…" |
| Same, after fix (unchanged spec, all three viewports) | 3 passed |
| Full Browser Demo suite (`INFRA_BROWSER_API_PORT=8102 INFRA_BROWSER_WEB_PORT=5176 npx playwright test`) | **30 passed** (16 Nov record: 27/30, polygon failing on all sizes) |
| Full integration suite (first attempt) | 20 failed. **Invalid run**: a concurrent Playwright run emptied `test-results/`, deleting the built bundle mid-run. Not a product result; rerun below |
| Full integration suite, run alone (`... playwright.integration.config.mjs`) | **21 passed** (includes new `reliability` and `pricing-road`) |
| `pricing-home` + `pricing-road` after the Needs quantity/rate split (fresh build) | 2 passed |
| `restore_drill` (`.\scripts\api.ps1 test -q -rs tests/test_restore_drill.py`) on head 0021 | 1 passed: pg_dump → schema drop → pg_restore; retained issued/review files verified by SHA-256 through authorised downloads |
| Reference `geographic-editor studio-shell roads` (cross-origin, `playwright.reference.config.mjs`) | before fix: geographic-editor failed at line 72 (panel switched to Layout, "Selected: Traced target"); studio-shell and roads passed |
| Reference `geographic-editor` after the scene-tool fix | then failed at line 106 (outdated "Map view" step); after the test correction: **1 passed** |
| Full reference suite (`npx playwright test --config playwright.reference.config.mjs`, cross-origin) | **29 passed, 1 failed** (9.8 min). geographic-editor now passes (16 Nov: failing). `scene-textures` failed in the shared helper `openListView` ("More tools" click timeout 20 s) |
| `scene-textures` rerun alone | 1 passed. Recorded as an **intermittent timing failure under full-suite load**, not as fixed; it passed in the 16 Nov full run |
| Live Supabase suites (live, access) | **Not run**: Docker/local Supabase not running on 23 Nov |

Rendered UI inspected: `test-results/reliability/save-failed.png` (1280×900). It shows the header pill
"Save failed: not saved", the full message with "Reference: feedc0de.", and the draft retained (Pricing
still shows the applied bench rate as a preview). Seen while inspecting: the selected-item card at
bottom-left overlaps a map caption. This existing visual defect is logged as WP4 4.5.

## Boundaries and remaining gates

- The CORS fix is verified with an ASGI cross-origin request in tests, not on the hosted pilot. Nothing
  was deployed.
- Request references help operators find log lines. No monitoring or alerting provider is configured.
- The browser checks use fixtures and synthetic failures (Playwright routing) plus one real recovery save.
  No physical device, touch or live Mapbox was exercised for the polygon fix.
- Other workspaces (Organisation Review forms, tree detail forms) keep their own save messages.
