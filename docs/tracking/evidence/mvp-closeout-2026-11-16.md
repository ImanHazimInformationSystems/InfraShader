# MVP software close-out — 16 November 2026

Local development machine (Windows 11, Edge), local portable PostGIS, local Supabase in Docker.
Nothing was deployed, pushed or sent. Fixture, demo and local checks are not user, pilot or
deployment acceptance.

## 1. Terrain site-work and proposal area in the Review summaries (L13, L24, L06)

- `apps/web/src/domain/studies-guide.ts`: site-work lines created from terrain edits now count in
  the Prices status, the Review list and the option comparison (previously filtered out with
  `!item.terrain_work`). New Review items:
  - stale site-work line → "Open Terrain";
  - reshaped ground with no site-work line → "Open Terrain";
  - no proposal area marked → "Open Site records".
- `GeometryWorkspace.tsx` progress count, `StudiesGuide.tsx` (`terrain` label),
  `CalculationsPanel.tsx` (`terrain` fix opens the Terrain tool).
- Check: `studies-guide.test.ts`, 12 passed, including 3 new tests.

## 2. Mapbox provider messages (L02, MAP)

- `apps/web/src/services/map.ts` `loadBasemap` tells the style-check failures apart:
  - HTTP 429 → "Mapbox is busy right now (rate limit reached, HTTP 429)…";
  - HTTP 401/403 → "Mapbox refused the public token…";
  - anything else → the existing connection/token message.
  A failed check is not cached, so the next load retries. Runtime tile 429s were already reported
  by `MapboxControls.tsx`.
- Check: `map.test.ts`, 6 passed, including 1 new test.
- A browser-public `pk.` token is configured in ignored `apps/web/.env.local` (the value was not
  read into any output). For the live Mapbox run, see section 7.

## 3. Test-debt fixes

- **Vitest cold-cache failure.** Root cause: the terminal reports the working directory with a
  lower-case drive letter (`c:\…`). The Vitest worker was then loaded as `file:///c:/…`, while Vite
  resolved `import … from 'vitest'` to `file:///C:/…`. Node kept two copies, and the 24 test files
  that import from `vitest` failed with "Cannot read properties of undefined (reading 'config')"
  unless a warm `.vite` cache happened to mask it.
  - Proven with a temporary probe test: `m.describe === globalThis.describe` was false; the
    worker argv was `c:\…\forks.js`. Relaunching with real-cased paths fixed it.
  - Fix: `apps/web/scripts/vitest.mjs` relaunches Vitest from `realpath` paths, and `npm test`
    uses it.
  - Check: cold cache (`node_modules/.vite` removed), `npm test` gave 40 files / 153 tests
    passing; repeated after the later changes, 154 passed. Running `npx vitest` directly from a
    lower-case-drive shell can still hit the issue; use `npm test`.
- **Reference config.** `playwright.access-fixture.config.mjs` ran
  `npm run dev --workspace apps/web` from `apps/web` (inherited `cwd`), which npm rejects. It now
  sets `cwd` to the repository root, and `playwright.reference.config.mjs` starts without the
  local override.
- **Reference specs updated to the current UI.**
  - Header `Active organisation` selector.
  - "Open Design Studio" before "Change workspace".
  - "More filters and options".
  - `openPrecisionTerrain()` helper (collapsed "Precision terrain controls").
  - Scenario buttons scoped to the `Scenario selection` group (the planting panel also has an "A").
  - "Precision object controls" before the 3D preview toggle.
  - Saved selections: "Selection name", "Save selection" and their collapsed disclosure.
- **Production CORS bug found while writing the runbook.** `apps/api/app/main.py` did not allow
  `DELETE`. Project deletion, brief-file removal and attachment removal would fail whenever the API
  is served from another origin (development hides this with the Vite proxy). Fixed, with the new
  test `test_cors_preflight_accepts_delete_for_cross_origin_deployments`.

## 4. Deployment package (S04, S06, S10, G7)

- `deploy/RUNBOOK.md`, `deploy/CHECKLIST.md`, `deploy/api.env.example`, `deploy/web.env.example`.
  These contain placeholders only, no values.
- `scripts/backup.py` (plus `scripts/api.ps1 backup`) captures:
  - the application DB (pg_dump custom format, password via `PGPASSWORD` only);
  - the private `evidence` Storage bucket, object by object, with path-escape checks;
  - an optional identity DB;
  - a manifest with SHA-256 digests, the migration revision and what was skipped.

  A backup only loses its `.partial` suffix when complete, and `--keep` prunes only complete
  backups that the script itself generated.
- Checks:
  - `apps/api/tests/test_backup_script.py`: 14 passed.
  - Real run against the local development database and local Supabase Storage: completed, with
    a 617,810-byte dump at migration `0021` and 0 Storage objects.
  - Cross-check: `pg_restore --list` reads the archive (51 tables); `evidence` has 0 rows and
    `projects` has 19, so the empty bucket is consistent. The test backup was then deleted
    because it held local data.
- Not done: a restore into a separate database (the drill in RUNBOOK.md), backups off the
  machine, and any hosted environment.

## 5. Feature audit (S12)

Of the 48 MVP IDs, only S12 was still "Not audited". It is now **Partial**:
- `/studio/workspace/help/S12` is a labelled UI preview whose entries are never saved;
- the written guides are repository documents, not an in-app manual;
- the AC-10 pilot procedure exists, and evidence is kept through the tracking files.

Not built: saved feedback, consented task timing. Not done: real representatives and pilots;
TRK-S12-001..005 remain Not run.

## 6. Real sign-in: owner–contractor flow on local Supabase (S01, S02, S03, L25, O05)

- New `tests/live-browser/opportunity-real-auth.spec.mjs`. Accounts are created by
  `tests/live_server.py`: an owner-organisation administrator, a foreign account with no
  membership, and a contractor in its own organisation. The API checks every verified email
  against the real Supabase `/auth/v1/user`.
  - The test runs: owner issues → foreign account gets 404 by id and is refused by token →
    contractor finds the invitation without the link, accepts, links a project and submits →
    owner receives it. Neither side can read the other's private records, and no private rate or
    note appears in the package.
  - The submission test has its own owner account because the recovery test changes `users[0]`'s
    password.
- **Bug found and fixed:** with more than one organisation, a project deep link
  (`/studio/organisations/<org>/projects/<id>`) stopped at "Choose an organisation", because only
  the current, stored or single organisation was ever selected. `apps/web/src/App.tsx` now selects
  the organisation in the URL first.
- **Test harness fixes:**
  - `playwright.live.config.mjs` sets `INFRA_TEST_API_URL`, so teardown reaches the API on custom
    ports. Without it, one run's throwaway users and schema stayed behind; they were then removed
    by hand from local Supabase and `infrashader_test`, along with 3 stray local Storage objects
    that were checked against the development organisations first.
  - `openProjectRecords()` opens Review's "Project details" disclosure.
  - The onboarding spec switches workspace with the sidebar.
  - The recovery spec picks its organisation when the account has two.
- Results:
  - `playwright.live.config.mjs` (same origin, ports 8102/5175): 4 of 4 passed.
  - `playwright.access.config.mjs` (cross-origin API, real Supabase, ports 8103/5176): 5 of 5
    passed.
- Not covered: hosted Supabase, real email delivery (local Mailpit only), and real users.

## 7. Full test set (16 November 2026, local)

| Check | Result |
| --- | --- |
| Backend Ruff and format | clean |
| Backend pytest (disposable PostGIS) | 426 passed |
| Frontend lint, typecheck, build | clean (existing chunk-size warning) |
| Vitest (`npm test`, also from a cold cache) | 40 files, 154 passed |
| Integration browser (test identity, PostGIS; 8101/5174) | 19 of 19 |
| Reference browser (8001/5174) | 29 of 30 (see below) |
| Live, real local Supabase, same origin (8102/5175) | 4 of 4 |
| Access, real local Supabase, cross-origin API (8103/5176) | 5 of 5 |
| Live Mapbox (`playwright.mapbox.config.mjs`) | 1 of 1 |
| Product UI (5175) | 5 passed, 4 skipped |
| Default browser, Browser Demo (8104/5177; desktop, tablet, phone) | 24 of 30; after the label fix, the desktop rerun of `foundation` passed 5 of 6 |

- **Mapbox:** the account's public token loaded the real Standard style, vector tiles and 3D
  buildings over Kuala Lumpur (screenshot `artifacts/mapbox-standard-project-tree.png`, not
  committed). Only 404s for missing procedural-building tiles were recorded, and no 429 occurred
  in this run. Satellite imagery is still served from a test fixture tile in that spec, so live
  satellite tiles are not verified.
- **Reference: remaining failure.** `geographic-editor.spec.mjs` now passes the terrain stroke,
  undo and redo, but the "move" step clicks the centre of the map canvas, which no longer lands
  on the placed object in the embedded geographic view. Picking the object needs a different
  method; not fixed.
- **Reference: load sensitivity.** `brief-checkpoint.spec.mjs` timed out once while two suites
  shared the machine. It passed alone and in the final full run.
- **Default browser (Browser Demo).**
  - Fixed: `foundation.spec.mjs` "both project purposes" expected the old "Saved · revision 2";
    the label is now "Brief saved · version 2".
  - Still failing: "Terra Draw polygon saves and reloads" on all three screen sizes. Drawing
    mode is active on the offline Demo canvas, but four clicks plus Enter produce no coordinates.
    The real-database graphical edit in `integration-browser/spatial.spec.mjs` passes, so this
    is limited to the Demo/offline canvas or to the test's click method. Not diagnosed further;
    Browser Demo is not acceptance evidence.
