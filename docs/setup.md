# Local setup and operations

Run PowerShell commands from the repository root. This machine has Node 22, uv/Python 3.12, local PostgreSQL/PostGIS, Docker Desktop and WSL installed. Local Docker/Supabase startup was verified on 12 October 2026 after the restart/setup. No hosted account or paid service is required for this local setup.

## Run the project now

```powershell
npm ci
.\scripts\api.ps1 sync
.\scripts\local-db.ps1 start
.\scripts\api.ps1 migrate
```

In two separate terminals:

```powershell
.\scripts\api.ps1 dev
```

```powershell
npm run dev
```

Open http://127.0.0.1:5173. API health: http://127.0.0.1:8000/api/v1/health; API docs: http://127.0.0.1:8000/api/docs. Browser Demo works before Auth is configured, with browser-only drafts. It is not evidence of real persistence or authorisation. Real sign-in requires the local Supabase steps below.

The application database runs on 127.0.0.1:54322. Its generated credentials stay in ignored `.local/database.json`; `scripts/api.ps1` loads them automatically unless DATABASE_URL is explicitly supplied in the shell or API environment file. The application role is not a PostgreSQL superuser. A separate `infrashader_test` database is disposable. On a new checkout, `scripts/local-db.ps1 setup` downloads and configures the project-local Windows PostgreSQL/PostGIS distributions. Never copy database credentials into chat or Git.

## After restarting Windows: local Auth and private Storage

1. Open Docker Desktop and wait for its Linux engine to be ready.
2. Run these commands from the repository root:

```powershell
.\scripts\supabase.ps1 start
.\scripts\supabase.ps1 configure
```

The start command creates an ignored ES256 signing key and starts local containers. Configure writes the browser-safe public key to `apps/web/.env.local` and the server-only Storage key to `apps/api/.env`. It refuses to overwrite existing environment files. Keep the service-role key out of all VITE variables and browser code. This startup path has passed first-run and repeated-start checks with the local Docker engine.

If environment files already exist, use local CLI status to inspect values privately and update them manually. The browser needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. The API needs SUPABASE_URL and STORAGE_SERVICE_KEY; DATABASE_URL may be omitted when using the existing portable database. Do not paste CLI secret output into chat.

3. Open local Studio at http://127.0.0.1:54333. Create an email/password Auth user, confirm it locally, and copy its existing user UUID. Public signup is disabled. Local email is captured at http://127.0.0.1:54334; it does not send external messages.
4. Provision the initial organisation membership:

```powershell
.\scripts\api.ps1 bootstrap --organisation "Group 19" --user-id "<existing-auth-user-UUID>"
```

5. Restart the API and frontend terminals, then sign in normally. The bootstrap command creates membership, not an Auth bypass. The API verifies asymmetric tokens using local JWKS and checks current membership for every protected operation.

Supabase uses API port 54331 and its own internal database port 54332; application data stays in the separate PostGIS database on 54322. The configured evidence bucket is private. Uploads pass through the API's tenant checks, content/size validation and metadata stripping; downloads are authenticated API responses. Local email login, refresh and logout have passed direct service checks. Real browser password recovery (local Mailpit), private upload/download/metadata editing, refresh and foreign-user denial passed on 13 October.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
.\scripts\api.ps1 lint
.\scripts\api.ps1 test -q
npm run test:e2e
npm run test:e2e:integration
```

The API test wrapper supplies the disposable local test database. For another database explicitly set TEST_DATABASE_URL to a disposable PostGIS database whose name ends `_test`. Tests migrate isolated schemas. Never use a customer database.

Browser tests use installed Edge. Integration browser tests start a test-only signed identity provider and use real PostGIS; they do not verify Supabase Auth or Storage. Both browser configurations own their preview servers and stop them afterwards. Vite still warns about large lazy map/PDF chunks; build success is not a performance acceptance claim.

## Stop and recovery

Stop API/web with Ctrl+C. Use `scripts/supabase.ps1 stop` for local Supabase and `scripts/local-db.ps1 stop` for portable PostgreSQL. Do not remove their volumes/data directories as a routine shutdown step.

Before live use, approve retention/export/deletion and support policies. Back up the application database, Supabase identity database and private file bytes together; restore to a separate environment and verify linked geometry, rates, estimates, evidence and issued snapshots. No recovery target is accepted until that drill passes. Deployment, hosted services and paid resources require separate user approval.


## Current spatial and review workflow

Open a project and choose **Open geometry workspace**. Save a boundary and targets, then add buildings with explicit height/source information. **3D buildings** renders entered known heights; unknown heights remain footprints and prevent shade calculation. Use **2D plan** to edit a saved item: select its Edit button, drag a vertex, Apply item changes, then Validate & save workspace. Numeric coordinates remain available.

Run **Calculate all three scenarios**, then **Show baseline shade on map** (or the selected option). The overlay comes from the stored backend analysis; edits hide stale overlays. Flat-ground model limitations and field-validation gates still apply.

**Compare saved options** displays the same saved analysis across Baseline/A/B and available option estimates. **Save an option review** stores criteria, notes, preferred option and status independently of an issued document. **Reload review history** preserves entered notes when resolving a concurrent-review conflict. Changing the workspace or brief marks older reviews stale.

Explore Map uses OpenFreeMap context and explicit-submit Photon place search. Preserve provider attribution; public service availability is not guaranteed. Set `VITE_MAP_STYLE_URL=offline` and `VITE_GEOCODER_URL=offline` in the ignored web environment file to disable public providers. These services receive viewport/query information; they do not receive project records. The ordinary test suite disables external map tiles; `npx playwright test --config playwright.providers.config.mjs` separately checks actual provider rendering/search.


## Browse and revise rates

Within the geometry workspace, **Browse rate versions** searches code/description and filters units for the project's pricing basis. Use Previous/Next rate page for catalogues exceeding 20 results. Displayed versions become available in the rate assignment selectors; saved assignments remain visible even when excluded by the search. **Revise [code] v[number]** opens the dated-rate form with copied values. Saving creates another version; it never replaces the version bound to existing scope. Assign the new version explicitly and save the workspace when appropriate. Category filters and archive/restore are available. Archiving preserves existing assignments and historical estimates.


## Current core continuation (13 October)

Run `scripts/api.ps1 migrate` after updating this branch (current head: 0010), then restart API and web. Existing local data is retained. Structured brief and workspace history begins at the revision present during migration, with every subsequent save recorded. Restoring creates a new validated revision and makes dependent calculations stale.

Explore Map has **Explore in 3D** when its provider supplies building heights. This is navigation context, not surveyed project geometry or an analysis input. In the project workspace, entered buildings/canopies still need sourced heights for calculations. Canopy dimensions/rotation are generated by the backend in the site's projected CRS.

Use **Settings and members** for profile/organisation defaults and administrator-only role/capability changes. New users still need local Supabase and operator provisioning. Last-administrator protection applies even to concurrent edits. Display units can be metric or imperial; canonical geometry/rates remain metric and currency remains MYR.

**Preview draft PDF** validates the current saved scope and produces a clearly labelled draft without issuing a record. **Confirm and issue new version** independently rechecks current revisions. Saved developer outputs include both option-budget states and label missing/partial budgets. PDF bytes are still generated at download; retained-file lifecycle remains unfinished.

Unsaved workspace geometry and the current item form can be recovered in the same browser tab for eight hours. Recovery is account/project-scoped; changed server revisions require manual reconciliation via JSON download. Explicit sign-out or confirmed discard clears the draft. This does not yet recover every catalogue/review/evidence/settings form.

Additional browser suites (run sequentially with app development servers stopped):

```powershell
npx playwright test --config playwright.live.config.mjs
npx playwright test --config playwright.providers.config.mjs
```

Live tests require local Supabase on 54331 and local PostGIS. They create temporary local users, a disposable schema and private test photos, then remove those owned fixtures. Recovery mail stays in local Mailpit. The provider suite makes real public map/search requests; its results depend on those services.


Basic object controls group structures, surfaces/circulation, vegetation/furniture and manual quantities. Trees accept optional crown diameter with a source note; tree shade remains excluded. **Hide/Show** affects the editor map only and requires workspace save; hidden items still count in calculations and outputs. **Undo workspace edit / Redo workspace edit** covers up to 50 applied changes in the current tab. Saving or restoring resets that stack; saved revisions remain accessible through history.

## F01-F08 continuation

Migration 0010 is applied locally. Restart the API and web after updating. Baseline work is shared automatically by both options; edit existing shared objects in Baseline. Reset option to Baseline removes that option own scope after confirmation. Old analysis model records are marked stale and must be recalculated.

The comparison uses the selected target and time; changing either hides incompatible coverage. Purple overlays are saved model results; inspect Analysis sources and engine versions for provenance. Map layer controls affect this tab only.

Private site evidence supports Remove photo and Show removed photographs / Restore photo. Removal is reversible and blocks downloads/new output selection while retaining private recovery bytes. It is not permanent deletion. An operator-reviewed retention request remains necessary for erasure.

Brief edits include budget minimum/ceiling, site visit notes, known facts and unknown facts. Brief readiness lists missing required output fields. Site measurements, production provider approval and retention policy are still external release gates; see f01-f08-acceptance.md.
