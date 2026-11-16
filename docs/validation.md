# Validation evidence

## Free pilot infrastructure live — 16 November 2026

Web and API are live on Render Free with new Supabase Free services. Hosted migration
0021, non-superuser role/private schema, health/readiness, exact CORS, anonymous API
denial, private Storage byte round trip/public denial and 1440/390 sign-in rendering
passed. Checked 31 public assets for server credentials; none found. Real-account
workflow and hosted backup/restore acceptance are still pending. See
[hosted evidence](tracking/evidence/free-pilot-hosted-2026-11-16.md).

## Free hosting preparation ? 16 November 2026

User authorised the free pilot. Render configuration/schema and shell checks passed; production-only API/PDF imports passed; frontend 163 tests plus lint/typecheck/build; backend Ruff/format and 425 passed / 1 skipped. Hosted project credentials and actual deployment remain pending. See [evidence](tracking/evidence/free-hosting-preparation-2026-11-16.md).

## MVP software close-out — 16 November 2026

Changed:
- terrain site-work lines and a missing proposal area now appear in Prices and Review;
- Mapbox style-check messages separate a rate limit (HTTP 429) and a refused token;
- `npm test` no longer depends on a warm Vite cache (a lower-case drive letter loaded two copies of
  Vitest);
- the reference config starts again, and its specs follow the current UI;
- the API CORS policy allows `DELETE`, which deployments with the API on another origin need;
- the live teardown now targets the configured API port;
- added the deployment package (`deploy/`) and `scripts/backup.py`.

Actual results:
- **Backend:** 426 passed; Ruff clean. Backup script tests: 14 passed. A real backup of the local
  development database and Storage completed and its archive was readable.
- **Frontend:** lint, typecheck and build clean; Vitest 40 files / 154 tests, also from a cold
  cache.
- **Live (real local Supabase Auth and Storage):** 4 of 4, including the new owner → contractor
  invitation, acceptance without the link, and submission test.
- **Access (real local Supabase, cross-origin API):** 5 of 5, after fixing a project deep link
  that stopped at "Choose an organisation" for accounts with several organisations.
- **Integration browser:** 19 of 19.
- **Reference browser:** 29 of 30. `geographic-editor` still fails: its object-move click
  misses the object in the embedded map view.
- **Live Mapbox:** 1 of 1. Real Standard tiles and 3D buildings rendered; only 404 coverage
  gaps were recorded. Satellite imagery is still a fixture tile.
- **Product UI:** 5 passed, 4 skipped.
- **Default browser (Browser Demo):** the Terra Draw polygon demo test fails on all 3 screen
  sizes; the rest pass after a label update.
- **Not done:** hosted deployment, a restore drill into a separate database, real users or
  pilots, and live satellite tiles.

[Evidence](tracking/evidence/mvp-closeout-2026-11-16.md).

## Submissions follow-up: limitations closed — 15 November 2026

Added:
- contractor supporting documents (staged, copied atomically);
- owner opt-in criteria sharing;
- same-name organisation labelling;
- package-total suggestion;
- a full linkable-project list;
- Go to Submit and an email-app link.

Migration 0021 is applied to the local development database.

Actual results:
- **Backend:** 410 passed; Ruff clean.
- **Frontend:** vitest 150; lint, typecheck and build clean.
- **Integration browser:** 19 of 19.
- **Product UI:** 5 passed, 4 skipped.
- **Not run:** access and live suites (local Supabase Auth not running).

[Evidence](tracking/evidence/opportunity-submissions-2026-11-15.md).

## Contractor-to-owner submissions (S03, L25, O05) — 15 November 2026

What now works:
- Owners invite a contractor from an Organisation Review project, with a frozen brief, files and a single-use link.
- The contractor accepts for its own organisation and links or creates a private Design Studio project.
- It submits an issued proposal as an allowlisted immutable package; the owner receives it automatically in the existing inbox.
- Revisions keep earlier versions and make confirmations and scores stale. Withdrawal is recorded.

Migration 0021 adds `opportunity_invitations`, `opportunity_files` and `submission_packages`.

Actual results:
- **Backend:** Ruff clean; 409 passed, including 4 new in `test_opportunities.py` (full flow, tenant separation, expiry/revocation/deadline/concurrency, mid-submission failure and retry).
- **Frontend:** lint, typecheck and build clean; vitest 40 files / 150 tests (2 new).
- **Integration browser:** full suite 19 of 19, including the new two-identity `opportunities.spec.mjs` (owner and contractor in separate tenants and browser contexts).
- **Product UI:** 5 passed (4 skipped by design). Reference `proposal` and `brief-checkpoint`: 2 passed.
- **Not run:** access and live suites, because local Supabase Auth was not running. Test identities are not Supabase Auth acceptance.

[Evidence and limits](tracking/evidence/opportunity-submissions-2026-11-15.md).

## Project deletion ? 15 November 2026

Deletion and project-hub browser cases passed, with responsive confirmation inspection; full backend 404 passed. Final focused deletion tests: 10 passed; frontend lint/typecheck/build and 148 Vitest tests passed; tracking and UI generators/checks passed. Details in [evidence](tracking/evidence/project-deletion-2026-11-15.md). Storage cleanup uses test adapters; live Storage and user acceptance are unperformed.

## Shared issue readiness ? 15 November 2026

L24/L13/L01/L03/K01/K04: one server-owned checklist, direct repair actions, confirmed proposal area and stale-total handling. See [implementation and actual check evidence](tracking/evidence/issue-readiness-2026-11-15.md). Frontend lint/typecheck/build passed; 147 Vitest tests; backend Ruff/format and 395 PostGIS-backed tests; seven requested browser cases plus three final race/output follow-ups passed. Tracking and UI generators/checks passed. Existing bundle-size and Starlette/httpx warnings remain. Fixture checks do not establish real-user, provider or deployment acceptance.

## Issue button feedback — 15 November 2026

User report: clicking "Confirm and issue new version" appeared to do nothing. Cause: the request ran, but success was only visible as a new row lower in Issued outputs, and refusals were shown at the top of the panel, out of view. The button now reads "Issuing…" while working. A message under the button, focused on completion, says the version was issued and its PDF saved (with a link to Issued outputs), shows the server's reason if it refused, or reports "Issued, but the PDF is not stored yet" with the retry route. Issue rules and server checks are unchanged.

Actual results: typecheck and lint clean. Integration `workflow.spec` run 1: contractor passed; the developer case timed out waiting for the second (repeat) download event. Run 2: 2 of 2 passed.

## Signed-in home refresh — 15 November 2026

A new launcher layout: hero with the next action, the latest project, workspace cards, recent project cards and the four-step guide. It adds skeleton, empty and no-organisation states. Frontend only (`StartPage.tsx`, `home.css`; obsolete home CSS removed).

Actual results:
- **Frontend:** typecheck, lint and build clean; vitest 38 files / 119 tests.
- **Integration browser:** full suite 15 of 16, then 2 of 2 on rerun. `project-hub` hit a race between the project page title and the auto-opened map header; the test now targets the level-1 heading.
- **Product UI:** 5 passed (4 skipped by design). The sidebar test helper now opens only the collapsed group holding the target.
- **Inspection:** fixture projects at 1440, 820 and 390 px with no horizontal overflow; reduced motion on phone.

## Design Studio journey: 1 Site → 2 Design → 3 Prices → 4 Proposal — 15 November 2026

Design Studio is reorganised around one journey. The header step bar shows plain statuses, and the dock only shows the current step's tools. Terrain, Shade study and List view sit under More tools. One option picker is on the map, and Pricing is the single pricing place, with Saved rates beside it. Step 4 has three parts: Review (what needs attention, with direct fixes, and an honest Option A/B comparison), Total, and Proposal. The project page leads with Open design map; its records sit in one disclosure. Design Studio catalogue previews are collapsed in the sidebar. Frontend only, except the draft PDF preview fix: preview no longer requires every issue field, lists what blocks issue, and issuing is unchanged.

Actual results:
- **Frontend:** typecheck and lint clean; vitest 38 files / 119 tests (4 new; needs the Vite dependency cache, see evidence); build clean.
- **Backend:** Ruff clean; 372 passed (2 new draft-preview tests).
- **Integration browser:** 16 of 16.
  - Run 1: 12 passed and 4 failed. Two failures were test-helper races and one was a duplicate accessible name; all fixed.
  - Rerun of the failed specs plus pricing-home: 5 passed.
  - Final clean full run: 16 passed; rerun after the draft-preview fix: 4 passed.
- **Product UI:** 5 passed (4 skipped by design).
- **Reference browser:** 22 passed, 8 failed. All 8 failures predate this change (Home-page sign-in assumptions, a closed terrain disclosure and earlier editor label changes); details in the evidence.

[Evidence and limits](tracking/evidence/design-studio-journey-2026-11-15.md).

## Pricing home: simpler Design Studio pricing — 15 November 2026

Design Studio has a new **Pricing** tool. It shows each tree, planting area, object, path and road in Option A or B as a card with an API quantity, rate source, API subtotal and status. The **Price this item** dialog offers:
- compatible saved rates only, with visible reuse;
- tree stock confirmation;
- per-layer m³ rates for roads and paths, with "area × thickness" explanations;
- plain planting-count text;
- a server-calculated subtotal for unsaved choices, from the new non-persisting `pricing-preview` endpoint.

A reviewed bulk apply lists the items that will change and those skipped, with reasons. Rates can now record a source type, supplier, quotation reference and exclusions (migration 0020), and supplier details are restricted without internal pricing.

Actual results:
- **Backend:** 370 passed (4 new); Ruff and format clean.
- **Frontend:** 115 tests passed (5 new); lint, typecheck and build clean.
- **Integration browser:** full suite 16 of 16, including the new connected flow from selection through save, estimate and readiness. Desktop and 390 px screens were inspected.
- **Reference browser:** four reference specs pass. The reference studio-shell spec fails on an outdated home-page control (unrelated).

[Evidence and limits](tracking/evidence/pricing-home-2026-11-15.md).

## Joint database and retained-file restore drill — 13 November 2026

Repeatable `tests/test_restore_drill.py`: populate via app paths (retained proposal PDF, owner original, approved decision pack, change request), `pg_dump` the disposable schema, drop it, `pg_restore`, then re-verify every retained file by SHA-256 through authorised downloads, identical owner evaluation hash and surviving immutability triggers. 1 passed. Supabase Storage photos, off-machine backups and RPO/RTO are not covered. [Evidence](tracking/evidence/restore-drill-2026-11-13.md).

## K03/L26 change register and changed-since-issue impact — 13 November 2026

Design Studio contractor projects now show item quantity and selling-total differences against the last issued proposal (price difference only from a complete current estimate) and keep an append-only change-request register: requester/reason, prepared → internally reviewed (impact frozen) → sent → client acknowledged/rejected with external person, date and evidence, explicit link to a later revised issue, CSV export. Actual results: 2 new backend tests (348 total passed), Ruff/format, frontend lint/typecheck/93 tests/build, one Edge browser workflow on disposable PostGIS; on-screen totals hand-checked. [Evidence](tracking/evidence/change-register-2026-11-13.md).

## D1B owner proposal review core — 13 November 2026

Organisation Review now has a connected owner workflow (O02/O04–O10/O12–O18/K06 subsets): versioned comparison basis, receipt of external PDF/XLSX or native JSON originals retained with SHA-256 (no supplier registration), manual source-linked confirmation, common scope mapping with comparison-only adjustments, locked rubric with explicit owner policy, reviewer sheets, deterministic Decimal evaluation with readiness states and input hash, clarifications/revised packages, reviewer-to-approver signoff and a retained JSON+CSV decision pack. Actual results: backend 346 passed (4 new, incl. hand-worked 77.50/74.50 and negative permission/stale/malformed cases), Ruff/format passed; frontend 93 tests, lint/typecheck/build passed; one Edge browser workflow on disposable PostGIS with test-signed identity passed, desktop and 390 px screens inspected. Owner policy (REC-010), representative documents, real Auth and pilot remain gates. [Evidence](tracking/evidence/owner-review-d1b-2026-11-13.md).

## Retained 3D road and ground textures — 13 November 2026

L31/L04/L06 now render the saved road finishes and grass paint in geographic and local metric 3D scenes, including terrain-draped surfaces. Road triangles share the rendered ground planes to prevent breaks over hills. Actual checks: 16 frontend tests; two reference browser cases and one actual Mapbox case; lint/typecheck/build passed. Flat, sculpted and local/live renders inspected. Backend checks skipped because calculations/persistence did not change; browser checks preserve road quantities and source strokes. [Evidence and remaining limits](tracking/evidence/scene-surface-textures-2026-11-13.md).

## Supplied ground, cut/fill and surface-water studies — later 13 November 2026

Explicit user authorization extends L06/F18/L13 with supplied-ground references, clipped TIN volumes/storage, sourced automatic m³ work quantities, retained rainfall/infiltration/drain studies and map playback. Actual results: 53 backend tests, 17 frontend tests, lint/typecheck/build/Ruff/format, one offline browser workflow and the same workflow over live Mapbox Standard tiles passed. Desktop/phone/provider scenes inspected. Live provider emitted tree-model and lineMetrics warnings; synthetic inputs and mathematical checks do not establish field/hydraulic/customer acceptance. [Methods, commands, outcomes and remaining gates](tracking/evidence/terrain-water-analysis-2026-11-13.md).

## Terrain builder and manual site work — 13 November 2026

L06/F18 now exposes timed circle/square sculpting, target offsets, erase, undo/redo/reset and rendered concept water over the existing saved heightfield, with L04 editor and L13 manual-cost connections. Site-work activity/resources/tools/assumptions and explicitly supplied h/m³/item quantities use sourced rates and backend Decimal estimates; terrain changes require review and missing work remains visible. Final focused results: 45 backend tests, 15 frontend tests, two terrain/Objects browser workflows, frontend lint/typecheck/build, backend Ruff/format and all tracking generators/checks passed. Desktop/phone fixture renders inspected. Initial form-lock and accessible rate-label corrections, commands and remaining live-provider/field/customer gates: [evidence](tracking/evidence/terrain-builder-2026-11-13.md). No automatic earthworks/pond volumes, hydrology or engineering claim; no deployment or Excel export.

## Landscape Objects and visual night lighting — 13 November 2026

Added a simple Objects builder over retained precision tools, four additive MIT presets (16 total), projected grouped fence drawing, saved per-axis/tilt/light metadata and illustrative sun shadows/dusk lighting. Actual focused checks: 24 backend tests, 7 frontend tests, two browser workflows, backend Ruff/format and frontend lint/typecheck/build passed. The retained 150-instance original-preset fixture measured 52 draw calls and 15,212 rendered triangles in automated local Chromium. Desktop day/night and phone renders were inspected. L07/L04/L11 canonical rows, derived criteria and generated views were updated without changing acceptance/deployment gates. Exact commands, initial test-selector/fixture corrections and limits: [evidence](tracking/evidence/object-builder-lighting-2026-11-13.md). No lux, electrical/structural design, solar output, analytical object shade or field/device/customer acceptance claim.

## L04 connected spatial editing — 12 November 2026

Connected L04 project entry, read-only canvas inspection, metric boundary/target outlines and inherited Baseline topology cleanup were implemented using existing services. Final checks: 296 backend tests, 21 focused spatial tests, 72 frontend tests, seven focused PostGIS browser cases and five distinct product UI checks passed across the recorded runs; four repeated UI smoke cases were intentionally skipped. Frontend lint/typecheck/build and backend Ruff/format passed. Desktop, geographic and phone renders were inspected. Initial fixture/selector failures, exact commands and acceptance limits are recorded in [evidence](tracking/evidence/l04-connected-2026-11-12.md). L04 remains Partial with Pending customer acceptance; no Excel export or deployment.

## Catalogue/concept documentation reconciliation - 12 November 2026

Read the 23-page approved PDF and both the main HTML concept and its 120-state/five-journey embedded reference. Created the all-84-ID reconciliation before canonical edits. Clarified 54 existing feature/reference descriptions and generated their views; protected identities, counts, priorities and all status dimensions are unchanged. Focused pricing/schedule/readiness tests: 32 passed; generated UI model invariants: three passed. Tracking, UI catalogue and feature-checklist generation/checks passed. Main concept Estimate/Terrain screenshots inspected; source Overview navigation defect and the missing suffix (1) PDF are recorded. This documentation task does not rerun full application/live-service/field/customer acceptance. See [actual evidence and open decisions](tracking/evidence/ui-concept-reconciliation-2026-11-12.md).

Historical base record: 18 October 2026; later dated checkpoints below and above retain subsequent evidence. Development evidence, not MVP release approval.

## E06/E07 explorer environment checkpoint - 18 October 2026

Local branch `build/core-spatial-completion`, based on 7effa9c plus local changes.
No package additions, migration, push, deployment or paid resource. Implementation
and manual walkthrough: [explorer-environment.md](explorer-environment.md).

- Frontend ESLint, TypeScript and production build passed; 36 Vitest tests passed.
- Backend Ruff/check formatting passed; 173 pytest tests passed against local
  PostgreSQL/PostGIS, zero skipped (16.24 seconds). Five new cases cover solar-day
  equivalence with the shadow engine, UTP/New York offsets, polar day/night and bounds.
- Environment browser suite: **15 passed in 2.6 minutes**, Edge 155, desktop
  1280x900, tablet 768x1024 and phone 390x844. Real local pvlib/shadow endpoints and
  live OpenFreeMap/Photon were used. Browser Demo supplies navigation/brief state;
  it is not evidence of saved-project persistence or real Auth/Storage acceptance.
- Existing responsive foundation suite: **27 passed in 1.2 minutes** after the
  phone selection fix, using `playwright.environment-foundation.config.mjs`.
  Covers drawing/reload, both project purposes, archive/edit, unsaved navigation,
  health/outage retry, keyboard entry, search failure/quota recovery and map selection.
- Checks cover time/offset/Now/date rollover, absent polar events, solar directions,
  night shadow removal, all six presets, numeric wind/rain, pause/off/reduced motion,
  site transfer, delayed obsolete shadow rejection, solar outage, style reload,
  WebGL context loss/restoration, site selection after sun-facing and navigation cleanup.
  Failure tests deliberately delay or reject real network responses.
- Real screenshots inspected: daylight, sunset, midnight, Heavy Rain and Storm,
  including desktop and phone layouts. Artifacts are local under ignored
  `artifacts/environment-*`; no mock screenshots used as rendering evidence.
- Three-second Medium/Heavy Rain samples in headless Edge 155 on Windows,
  ANGLE/D3D11 NVIDIA RTX 4060: desktop 86.24 shader draws/second, mean RAF interval
  11.60 ms / p95 16.70 ms; tablet viewport 106.64 draws/second, mean 9.38 / p95
  11.40 ms; phone viewport 172.27 draws/second, mean 5.80 / p95 6.20 ms. All share
  the same desktop GPU. These are short viewport samples, not physical-device,
  display-refresh, battery, sustained-load or worst-case city benchmarks.

Browser tests exposed fixes for camera state after Face sun direction, numeric
control labelling, and accesses to a temporarily absent map style during GPU
recovery. The effect reinstalls after MapLibre restores its style. The responsive
regression also found the phone timeline covering the second selection click;
controls now hide during two-corner selection while their state remains mounted.

Remaining warnings: existing large main/map/PDF bundles; upstream map sprite/filter
warnings; Starlette TestClient deprecation; router POP warning on existing flows.
MapLibre emits its expected custom-layer restoration warning in the intentional
GPU-loss check; application restoration and no uncaught page errors are asserted.

Not rerun this checkpoint: real Supabase Auth/Storage and saved-project integration
browser suites (historical evidence below). Physical low-end/touch devices,
long-duration GPU/resource soak, full assistive-technology acceptance, independent
field shade accuracy and existing operational/pilot gates remain open. Weather is
visual simulation, not measured/forecast weather or an analytical shade correction.
E08 live weather and staged F13/F16-F20 remain outside this task. This checkpoint
does not declare the entire MVP complete.

## F01-F08 implementation checkpoint - 13 October 2026

Local branch `build/core-spatial-completion`; application migration 0010 applied without deleting existing data. See [feature acceptance](f01-f08-acceptance.md) for FR-01 through FR-29 coverage and policy/field limits.

- Backend Ruff and formatting passed (52 files); 165 pytest checks passed against disposable PostgreSQL/PostGIS, zero skipped. Latest run: 9.04 seconds.
- Frontend lint, TypeScript and production build passed. Vitest: 30 tests passed across 10 files, including saved-time compatibility, display conversions and revision-safe/expired form recovery.
- Six expanded real-PostGIS browser workflows passed together (55.4 seconds): briefs/settings/support queue, catalogue recovery, URL/discard navigation, sourced 3D/edit/shade/review recovery, and both estimate-comparison/output-recovery/issued-PDF workflows. These use signed fixture identity, not Supabase.
- Real local Supabase browser: two passed on final rerun (17.4 seconds), including login/refresh/logout, password recovery, email/password changes, private photo upload/edit/download, foreign access denial, removal/content denial and restore. The first rerun could not start because Docker Desktop was manually paused; restarting the local engine resolved it. Temporary users/files/schema and local Mailpit messages were cleaned up; the credential fixture was absent after teardown and existing user data was not used.
- Responsive foundation: 24 passed on final rerun across desktop/tablet/phone (59.2 seconds). These checks are not physical touchscreen or full assistive-technology acceptance.
- PDF extraction: developer four pages, contractor three pages, with expected narrative/scope diagrams and no draft/internal-cost/profit labels. Generated bytes are still download-time artifacts, not retained PDFs.
- Actual UI screenshots inspected: sourced building 3D, saved shadow overlay, matched Baseline/A/B comparison and review. A near-cap fixture analyses 448 simple overlapping object instances; its 0.76-second test does not establish worst-case geometry or multi-user capacity.
- Prior live map-provider checks: two passed; not repeated for the latest local changes. Provider availability/terms/capacity remain external gates.

The expanded browser checks exposed a nested request-status label and an output draft that did not restore its selected option. Both were corrected; settings reload now resets child forms. Test navigation was corrected to reopen the workspace after reload, and recovered textarea checks use accessible textbox roles. The full six-workflow rerun passed after these changes.

New coverage includes budget bounds/site facts/readiness, evidence removal audit/conflicts, independent layers, zero counts/fixed scope, shared Baseline inheritance and deletion, independent proposed scope, engine/input provenance, invalid solar output rejection, compatible target/time comparison, and immutable output evidence references. Numerical shade claims remain excluded from issued outputs pending field validation.

Remaining warnings: large initial/map/PDF bundles; React Router warns about POP navigation created outside the router during provider/anchor navigation. The app's project URL/Back/discard path is tested; exhaustive provider callback/forced-expiry/multi-tab guarding remains open. G3 field measurements/tolerance, retention/permanent-erasure procedure, production provider approval, representative pilots and broader operational acceptance remain open. No hosted CI, push, deployment or paid resource use.

## Sources and environment

Existing clone, origin, MIT licence and all five reference paths were verified. Full master/SRS/stack/guide text was read, including DOCX table cells. HTML audit covered authored code and decoded gallery, excluding opaque font bytes from semantic reading. No concept monolith/assets ship in production code.

Node 22.15/npm 11.7; uv 0.13 and Python 3.12.15. PostgreSQL 17.11/PostGIS 3.6.2 installed project-locally from official distributions; PostGIS archive matched its published MD5. Local credentials are ignored, never printed. Docker Desktop 4.94 and WSL 2.7.13 installed after explicit user approval; Windows reports restart required. Real Supabase is not yet running.

## Executed checks

| Command/check | Actual result |
|---|---|
| `npm run lint` / `npm run typecheck` | Passed after charge-editor changes |
| `npm test` | **20 passed** |
| `npm run build` | Passed. Lazy map and PDF chunks still exceed Vite's 500 kB warning; no performance acceptance claim |
| `scripts/api.ps1 migrate` | Real PostgreSQL/PostGIS migrations 0001-0004 applied |
| `scripts/api.ps1 test -q` | **142 passed, zero skipped** against local PostGIS |
| Ruff check / format | Passed after final Python changes |
| `npm run test:e2e` | **18 passed** in Edge: desktop 1280 x 900, tablet 768 x 1024, phone 390 x 844 |
| `npm run test:e2e:integration` | **2 passed**: both purposes through real DB geometry, analysis, rates, duplicate-charge rejection, corrected charge estimate, issue and PDF; ES256 test identity provider, not Supabase |
| Generated PDF text checks | Both outputs have two pages, expected canopy/price/exclusions, no internal pricing fields |
| npm install audit | Zero reported vulnerabilities at installation; not a complete security audit |
| Hosted CI/deploy | Not run; no push/deploy |

Browser foundation tests include actual rendered site features, pointer polygon drawing, keyboard navigation, coordinate correction, both purposes, archive cancellation/restore, unsaved-navigation retention and API outage/retry. Responsive viewport checks are not physical touchscreen or assistive-technology acceptance.

Real database tests include isolated Alembic schemas, fresh-session reload, PostGIS SRID, tenant denial, revoked membership, concurrent writers, stale input rejection, immutable snapshot triggers, issue retry identity and output allowlists. Photo tests use real metadata persistence and isolated storage bytes; live Supabase Storage is unverified.

Solar/quantity fixtures include a 200 square metre rectangle, 7 m line, unsuitable CRS rejection, NREL solar position, opposite-sun direction, elevated roof-only displacement, union/clip and night/low-sun exclusion. These do not establish field accuracy. Numerical shade claims are omitted from issued outputs.

## Remaining gates

| Gate | Missing evidence/work |
|---|---|
| G1 | Team scope/access/provider limits and policy approval |
| G2 | Real local Supabase sign-in/recovery/refresh/storage; full member/admin/profile/settings and privacy controls |
| G3 | Field protocol/tolerance/observations, larger capacity and complete overlay/comparison workflow |
| G4 | D5 approval, component policy approval and independently reviewed takeoff |
| G5 | Reviewer history, all-language PDF/layout matrix, durable file workflow/restore |
| G6 | Full accessibility/touch/browser/load/performance matrix |
| G7 | Support/retention/deletion decisions and joint DB+private-file recovery drill |
| G8 | Representative developer and contractor user/buyer task evidence |
| G9-G11 | Each staged feature's approval, rights, samples, accuracy and performance evidence |

## Field protocol

Obtain site permission, record location and synchronised Malaysia timestamps, document footprint/height sources and uncertainty, and observe identifiable shadow edges at morning/noon/afternoon. Agree tolerances before comparing. Preserve notes/photos privately; record exclusions and deviations. A solar reference alone is not ground-shade validation.

## Local startup correction - 12 October 2026

Docker now reports a running Linux engine. The first Supabase startup exposed a CLI bootstrap dependency: loading the project configuration tried to read signing_keys.json before generation. The wrapper now generates the ES256 key using an isolated minimal local configuration, validates the key shape, and only then writes the ignored project key array. Actual key generation and ES256 sign/verify passed. First startup and a repeated startup passed without rotating the key. Containers reported healthy; Auth JWKS published ES256, the private evidence bucket responded, and Studio returned HTTP 200 after its expected redirect. Local environment files were configured and application migrations succeeded. Full user-session and file-transfer tests remain pending. Existing keys are preserved.

## Organisation bootstrap correction - 12 October 2026

The provisioning command committed successfully but tried to print an expired ORM attribute after closing its session. It now captures the UUID before commit and reports success without detached-state access. Sequential retries for an existing user/name membership make no changes, including no reactivation of revoked access. A real PostGIS regression verifies commit, reporting, retry and revoked-member preservation. Backend suite: 143 passed, zero skipped; Ruff check/format passed. Existing duplicate memberships from earlier failed-looking commands were preserved; no user data was deleted. Frontend/browser checks were not repeated for this backend operator-command fix.

## Local email provider correction - 12 October 2026

Enabled auth.email.enable_signup because the CLI maps it to the entire email provider, while auth.enable_signup=false continues to prohibit public registration. Restarted local services without deleting data. Live settings and an actual signup request confirmed registration is disabled. A temporary admin-created confirmed user passed password login, refresh and logout against real local Supabase; the temporary user was deleted afterwards, preserving existing users. Recovery, complete browser sessions and private file transfer remain separate pending checks.


## Core spatial and independent reviews checkpoint - 12 October 2026

Branch: `build/core-spatial-completion`. All work remains local. Browser Demo and signed identity fixtures are labelled separately from real Supabase acceptance.

| Check | Actual result |
|---|---|
| Backend Ruff / format | Passed, 40 files |
| Backend pytest against disposable PostGIS | 145 passed, zero skipped |
| Frontend lint / typecheck / build | Passed; map/PDF/initial bundle warnings remain |
| Vitest | 20 passed |
| Incremental Prettier check | Passed after formatting correction |
| Responsive foundation | 24 passed across desktop/tablet/phone; includes place-result extent, two-corner selection and search quota fallback |
| Real PostGIS browser workflows | Both developer and contractor issue/PDF paths passed. Spatial/review path passed on targeted rerun after fixing an ambiguous label and a test selector. |
| Live provider browser checks | 2 passed: actual OpenFreeMap rendered context/attribution and Photon Kuala Lumpur search, desktop/tablet. External availability is not guaranteed. |
| UI inspection | Inspected generated screenshots of actual rendered sourced-height 3D, top-down stored shadow overlay, live basemap/search and saved comparison/review history. |

Spatial regression saves an unknown-height building, verifies backend shade rejection, supplies an estimated height, observes rendered 3D, drags a saved vertex, saves/reloads changed geometry while preserving existing status, runs backend shade and displays its stored geometry. A Terra Draw clearing-event bug and mobile map-selection overlay pointer interception were found and fixed. Button styling now survives the existing global CSS reset. Fixture geometry is not a surveyed site or field evidence.

Independent review persistence uses the existing append-only Artifact table, scoped to organisation/project. Tests cover saved revision, fresh-session reload, idempotent retry, foreign-user denial, review conflict and stale workspace detection. Browser evidence covers criteria/status/notes/analysis linkage and page reload. Review records are excluded from calculation artifact responses so existing output contracts remain intact. Unsaved review changes participate in navigation/unload guards. Concurrent-review UI recovery is implemented but not yet browser-verified.

No migration is needed for the nullable building height already supported in Workspace JSONB or the existing artifact kind storage. Historical records and existing user organisations were preserved. No push, deployment, paid resource, external message or release acceptance occurred.

Remaining: full matched-map comparison, catalogue/takeoff management, structured briefs, evidence gallery/lifecycle, member/settings administration, real Supabase browser recovery/private byte transfer, joint restore drill, accessibility/performance matrix, policy decisions, field observations and representative pilots. F13/F16-F20 remain gated. Public provider styles emitted nonfatal upstream highway-shield filter warnings; public-service SLA and production provider approval remain open.


## Catalogue search and immutable-reference version editing - 12 October 2026

- Backend Ruff/format passed; 146 pytest tests passed against disposable PostGIS, zero skipped and no warnings.
- Frontend lint, typecheck, 20 unit tests, build and incremental formatting passed. Large initial/map/PDF bundle warnings remain.
- All four real-PostGIS browser workflows passed together: paginated catalogue/filtering, spatial/review, developer PDF, contractor PDF. Fixtures still use signed test identity, not real Supabase.
- New database checks cover page ordering/total, literal wildcard search, unit/basis filters, fresh-session old-version retrieval, restricted amounts and foreign/unauthorised access.
- Browser checks seed 21 persisted rates, navigate next/previous pages, filter by unit, search/no-results, revise a copied rate and retain the original assigned version through subsequent estimates and PDFs. Inspected artifacts/catalogue-filtered.png.
- The first expanded browser run exposed an old test assumption that the organisation had only one rate. The test now selects the explicit version under test, and the complete rerun passed. Frontend lint findings were corrected before final verification.
- The prior 24 foundation/device checks and two live-provider checks were not repeated for this catalogue-only change. No physical touch, field, pilot, live Supabase recovery/Storage or deployment acceptance was added.

F09 remains partial: categories, archive/restore and unsaved catalogue-form recovery are not implemented. F10-F12, administration/settings and the other open rows remain tracked in requirements.md. No migration was necessary; existing rate and estimate records were preserved. No push, deployment or paid resource use.


## Core briefs, administration, evidence and recovery checkpoint - 13 October 2026

Local branch: `build/core-spatial-completion`. No push, deployment, paid service or external message. Application migrations 0005 through 0009 applied successfully after disposable-schema validation; existing local data retained.

| Check | Actual result |
|---|---|
| Backend Ruff / format | Passed, 51 files |
| PostgreSQL/PostGIS pytest | 158 passed, zero skipped |
| Frontend ESLint / typecheck / build | Passed; existing large initial/map/PDF chunk warnings remain |
| Vitest | 23 passed, including recovery account isolation, expiry and scoped discard |
| Incremental Prettier | Passed |
| PostGIS browser integration | 5 passed together: brief/settings, catalogue, spatial/history/recovery/local time, both output previews and issued PDFs |
| Responsive foundation | 24 passed across desktop/tablet/phone after fixing map-control overlap on phone |
| Real local Supabase browser | 2 passed: login/refresh/logout/private-photo editing/download/foreign denial; local Mailpit recovery/new-password login/old-password rejection |
| Live provider browser | 2 passed: rendered OpenFreeMap/attribution/Explore 3D and Photon search on desktop/tablet |
| PDF extraction | Latest developer PDF: 3 pages; contractor PDF: 2 pages. Audience/limitation text checks passed; issued files contain no draft watermark, profit or cost-base labels. |
| UI inspection | Inspected actual settings/history and matched comparison/review screenshots plus provider 3D screenshots. Corrected checkbox row layout and phone map selection overlap. |

Coverage added: structured briefs/stakeholders, CAS brief history restore, immutable history updates rejected, settings/profile tenant rules, concurrent last-administrator protection, catalogue category/archive CAS, rectangle projected quantity, private evidence observation/target links and metadata conflict, safe takeoff price redaction, draft preview with no artifact mutation, both-option current budget snapshot selection, workspace restore/recalculation/stale outputs, literal project search/sort/pagination, local-time conversion including DST gaps/ambiguity and account-scoped tab recovery.

The first expanded budget test incorrectly assumed an empty option was a complete zero-priced scope; the backend correctly returned partial. The fixture now supplies a separately identified, rated Option B and the full suite passes. The first responsive run exposed real phone selection-control overlap (23 passed / 1 failed); compact controls fixed it and all 24 passed on rerun. Formatting findings were fixed before final checks.

The live harness uses temporary confirmed local users and a disposable PostGIS schema, real asymmetric JWKS validation and real private Storage bytes. A generated local PNG is sanitised to JPEG; downloaded bytes match stored digest and private/public/foreign access checks pass. Recovery mail stays in local Mailpit and is removed with its owned fixtures. The credential fixture file was absent after teardown. No existing user account or project was used for these tests.

Not accepted: full core completion, retained issued PDF bytes/evidence lifecycle, full undo/form recovery/forced expiry, URL/stage dashboard navigation, object metadata/visibility, estimate revision comparison, request/export/deletion/retention, joint DB+Auth+file restore, load/throttling/operational monitoring, physical-touch/full assistive-technology acceptance, commercial/provider policy approval, field shade accuracy or representative customer pilots. Public provider styles still emit nonfatal missing-sprite/highway-shield warnings. G1-G8 remain open; F13/F16-F20 retain their separate gates. See requirements.md for feature-level status.


### Basic objects and applied-edit undo follow-up (13 October)

Backend Ruff/format and 159 tests passed; frontend lint/typecheck/build/format and 23 unit tests passed. The five real-PostGIS browser workflows passed together after object/undo implementation; the expanded spatial path also exercises tree crown/category persistence, map-only visibility, undo/redo and the unchanged local-time calculation. The subsequent spatial/responsive run completed with Playwright's last-run result `passed` and no failed tests. Earlier live Supabase/provider checks were not repeated for this object-only change.

F15 basic scope now supports grouped object choices, editable category, optional tree crown diameter, persisted visibility and quantity schedules. Hidden objects retain their authoritative quantities and shade contribution; tree crowns remain excluded from shade. Applied workspace edits have a bounded 50-entry undo/redo stack, reset by saving/restoring. Other form recovery and finer invalidation remain open; this is not a full core-completion claim.

## Automatic explorer shadow checkpoint - 14 October 2026

Implemented automatic loaded-tile building extraction, nearest-first bounded sampling, sun/date/time/UTC-offset controls, local flat-ground shadow projection, old-overlay clearing/cancellation, missing-data/night/low-sun states and retry. Fullscreen browser-window explorer has collapsible search/coordinates and a Projects exit. No migration, paid service, push or deployment.

Backend Ruff/format passed; 168 pytest checks passed against local PostGIS, with one Starlette TestClient deprecation warning. Added time-dependent geometry, night, empty coverage, tower height, bounds/size rejection and malformed-fragment omission tests. Frontend lint/typecheck/build passed; 30 unit tests passed. Responsive foundation: 24 passed. Live provider desktop/tablet: two passed, exercising real tiles, 3D, automatic daytime shadows, midnight, afternoon, fullscreen extent, collapsed controls and Photon search. Actual rendered desktop 3D shadows and controls were visually inspected.

The first live tablet run found a malformed tile fragment that blocked the whole request. Invalid fragments now contribute an omitted count while supported buildings continue. The final database browser rerun initially timed out because PostgreSQL had been stopped; local-db start restored the service. Final additional regression results are appended below.

Limits: at most 500 nearby building parts, 10,000 vertices, 128 vertices/part and 1,000 m provider height; omitted parts and incomplete loaded-tile coverage are visible. Courtyards, trees, terrain, remote obstructions and facade/roof occlusion are excluded. Initial/map/PDF bundle warnings, provider sprite/filter warnings and previously recorded router POP warning remain. No field accuracy, complete city coverage or full Shadowmap parity claimed. Live Supabase account/storage tests were not repeated for this stateless map-only change.

Final project regression: all six real-PostGIS browser workflows passed together (53.4 seconds) after starting local PostgreSQL. Latest ESLint, TypeScript and production build passed; existing large-bundle warning remains.

Phone live-provider check reached and passed 3D rendering, automatic shadows, midnight/afternoon changes, fullscreen and collapsed controls; the screenshot was visually inspected. The combined test then FAILED because Photon place search timed out (UI reported signal timed out). This is not a full passing phone provider suite. Earlier desktop/tablet live-provider checks passed. Coordinate fallback remains covered by the 24 responsive checks.

## Explorer phone/search completion - 16 October 2026

Completed the outstanding phone provider workflow from the automatic-shadow request. The real phone-sized browser check passed (41.5 seconds), including loaded buildings/3D, automatic shadows, date/time changes, night state, fullscreen/collapsed controls and live Photon search. Inspected artifacts/live-map-phone.png with actual returned search results and shadow controls. Public provider availability is still not guaranteed.

Place search now preserves timed-out input, explains timeout/network/invalid-response failures, offers explicit Retry place search and Cancel search, and ignores obsolete results after cancelling or editing the query. No automatic provider request loop or paid fallback was added. A new unit test exposed DOMException handling differences; timeout classification now handles DOMException explicitly. All 32 frontend unit tests pass, including timeout/retry and cancellation/late-response checks.

Backend Ruff/format passed (54 files); 168 PostgreSQL/PostGIS tests passed in 10.72 seconds, with the existing Starlette TestClient deprecation warning. Frontend lint, typecheck and production build passed. Existing bundle, router POP and upstream sprite/filter warnings remain. Full database-browser and Supabase suites were not repeated for this search-only change; their previous results remain historical. No push, deployment or paid service. ADR-013 preview limits remain unchanged.

Final responsive browser run: 27 passed across desktop/tablet/phone (1.1 minutes), including controlled provider failure, retained query, explicit retry, recovered result selection and continuation into project creation.


## Organisation access and workspace foundation - 19 October 2026

Branch `build/core-spatial-completion`; prior Explore environment changes preserved. Migration 0011 applied to the local application database without reset. Disposable-schema migration testing additionally verifies existing project names/ownership, explicit legacy member access, legacy administrator capabilities and denied member issuance after backfill.

| Check | Actual result |
|---|---|
| Ruff / format | Passed, 59 files |
| PostgreSQL/PostGIS pytest | 184 passed, zero skipped (15.34 seconds) |
| Frontend lint / typecheck / production build | Passed; existing bundle-size warning remains |
| Frontend Vitest | 36 passed |
| Real local Supabase browser | 3 passed together (21.3 seconds): create/join/recipient invitation, assigned project grants, workspace/URL denial, admin-only Settings, membership revocation, injected API-401 recovery; real Auth refresh/logout, private evidence upload/edit/download/foreign denial; Mailpit password recovery and password/email changes |
| Existing real-PostGIS browser | 6 passed together (48 seconds): brief/history/settings/last-admin, catalogue/archive/recovery, old/new project URLs and unsaved navigation, geometry/analysis, developer brief PDF, contractor proposal PDF |
| Responsive foundation | 26 passed in the initial run; the one desktop Demo default-purpose failure passed on targeted rerun after correction (9.1 seconds). All 27 cases now have passing evidence. |
| Explorer environment | 14/15 passed initially; all six affected reduced-motion/pause scenarios passed on targeted desktop/tablet/phone rerun (1.1 minutes). All 15 cases now have passing evidence, including live OpenFreeMap and Photon on three sizes. |
| Visual inspection | Phone onboarding form and desktop Review shell inspected; test screenshots in artifacts/access-*.png |

The 401 browser check deliberately intercepts an API response to verify UI reauthentication; it is not a natural token-lifetime expiry soak. The separate real Auth test performs actual Supabase refresh, recovery and credential changes. Signed identity integration fixtures prove application/PostGIS contracts, not real Auth; the three live tests use actual local Supabase accounts and private Storage.

New backend evidence includes Studio/Review/Both creator grants, duplicate names creating independent tenants, intended recipient mismatch, expiry/revocation/replay, duplicate pending invitations, concurrent acceptance with one winner, absent automatic project grants, last administrator, no administrative project bypass, cross-tenant/wrong-project denial, grant escalation and revoked membership. Fresh-account checks reject unconfirmed email, wrong account ID and anonymous identity. Invitation plaintext is absent from list/audit responses. Authenticated API responses carry Cache-Control: no-store.

Failures found and resolved during this increment: Docker manually paused (user resumed); isolated Vite launch argument and Node-type configuration; exact organisation label lookup; isolated fixture CORS omitted PATCH/PUT; workspace ordering changed the fresh-login default; onboarding was unmounted by background refresh; Demo default purpose changed inadvertently; malformed saved preferences now fall back safely. Each affected check was rerun rather than reported as passed from its initial run. Local test fixtures clean their own schema/users/files; no existing project/account was reset. No push, deployment, paid resource or external message.

Remaining gates: full assistive-technology/physical-device matrix, prolonged token-expiry and GPU soak, field shade validation, business/pilot/operational policies and wider roadmap acceptance. Existing Starlette TestClient deprecation, bundle-size and router POP warning during identity redirects remain. Public map provider availability is not guaranteed. Cross-organisation exchange, received-submission inbox, scoring and formal approvals are outside this foundation increment; F13 and F16-F20 remain gated.

Reproduce: `.\scripts\api.ps1 test -q`, `.\scripts\api.ps1 lint`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npx playwright test --config playwright.access.config.mjs`, `npx playwright test --config playwright.access-fixture.config.mjs`. Run browser suites sequentially: they intentionally use isolated API port 8001. Live access tests use frontend 5173 for configured local Auth callbacks; fixture tests use 5174. Stop any development frontend occupying 5173 before the live suite. The existing development API on 8000 need not be stopped.

The explorer regression first passed 14 of 15 cases. Its tablet reduced-motion assertion counted all map redraws, including late tile/style updates, rather than animation progress. The renderer now exposes its existing animation clock/state alongside the existing frame counter; the test verifies that the clock freezes. No weather rendering or numerical-analysis logic changed. All six targeted reduced-motion and pause checks passed on desktop/tablet/phone. Final frontend lint/typecheck/build and incremental Prettier checks passed.

Final access-only rerun: 1 passed (12.3 seconds), additionally exercising a malformed/null saved preference and preserving the unfinished onboarding form during focus revalidation. Inspected the settled desktop Review empty state and narrow-screen onboarding screenshot. Temporary live credential fixture was absent after teardown.

## L05 checkpoint ? 27 October 2026

194 backend tests, 38 frontend tests, 6 database fixture browser tests, 4 real local Supabase browser tests and 1 reference-specific fixture browser test passed. Lint, types, build and Ruff passed. Real PDF selected-page upload and saved calibration/trace review were exercised. Representative plans, field dimensions and pilot acceptance remain pending. See [full evidence and limitations](tracking/evidence/l05-2026-10-27.md).

## L06 checkpoint - 27 October 2026

204 backend tests, 42 frontend tests, two reference/terrain browser checks and six existing database browser regressions passed. Lint, types, build and Ruff passed. Desktop and 390px terrain diagrams inspected. Browser tests used signed identity with real disposable PostGIS, not real Supabase Auth/Storage acceptance. Field/pilot validation remains pending. See [checkpoint](tracking/evidence/l06-2026-10-27.md).

## L07 checkpoint - 28 October 2026

222 backend tests, 45 frontend tests, three object/reference/terrain browser tests and six existing database browser regressions passed. Lint, typecheck, build and Ruff passed. 150 mixed instances across twelve presets rendered in local Chromium with 49 calls and 10,380 triangles. These are synthetic checks, not physical-device or field acceptance. The first combined browser run had a Vite preamble failure; the complete rerun passed. See [evidence](tracking/evidence/l07-2026-10-28.md).


## Pricing readiness and retained proposal completion - 31 October 2026

K04/L14-L16/L24 plus F09-F12/S04 connections: source-validity warnings and authorised exception audit, explicit resource costs, pricing explanations, proposal sections/quantity/change appendix, opt-in retained photo copies, and bounded immutable issued PDF bytes. Local migration 0012 applied without reset. See [checkpoint evidence](tracking/evidence/pricing-proposals-2026-10-31.md) for final check counts, failures corrected and limitations. Canonical tracking remains authoritative; no Excel, push, deployment or commercial acceptance.


## L04 spatial editing checkpoint ? 1 November 2026

254 backend tests and 49 frontend tests passed; Ruff, frontend lint/typecheck/build passed. Six real-PostGIS integration browser regressions passed. The spatial tools and cutout browser paths cover undo, locked/fixed-dimension rejection, arrays, private named-selection recall and save/reload. See [detailed evidence](tracking/evidence/l04-spatial-2026-11-01.md) for reference-suite results, initial failures corrected, screenshots, sources and remaining gates. This does not establish full unified-renderer, field/customer or live Supabase acceptance. No Excel export, push, deployment or paid services.


## L03 survey evidence and constraints - 2 November 2026

265 backend tests, 49 frontend tests, nine reference browser tests and six database integration browser regressions passed. Ruff, lint, typecheck and production build passed with documented existing warnings. Desktop and 390 px register inspected; mobile table replaced with cards. The register, source/consent validation, evidence scope, assignment/resolution, save/history and private issued-summary behaviour are covered. These fixture checks do not establish live Supabase, field or customer acceptance. See [full evidence](tracking/evidence/l03-2026-11-02.md). Canonical L03, K05 and F02 tracking updated; no Excel, remote write, deployment or paid services.


## L01 hub and K01 brief checkpoint - 4 November 2026

272 backend tests and 49 frontend tests passed. Seven real-PostGIS integration browser regressions passed, plus one K01 browser test with explicitly simulated Storage. Final targeted K01 tests (4) and L01 tests (3, including terrain/object copy inputs) passed after policy-permission, locking and copy sanitisation changes. Ruff, frontend lint/typecheck/build passed. Local database migrations 0013/0014 applied without reset. Two downloaded four-page PDFs contain the exact-brief status and NOT CONFIRMED disclosure. Hub and checkpoint screenshots were inspected.

Canonical L01/K01 feature/specification/acceptance records and the pilot gate were updated. `python scripts/tracking.py` and `python scripts/tracking.py --check` passed: 128 records, 84 roadmap entries, 986 acceptance rows and 160 preserved requirement names. Scoped whitespace review passed; the full repository check retains the unrelated pre-existing blank-line warning in docs/requirements.md. No Excel generated, no push/deployment/paid services. Live Supabase Auth/Storage and customer/policy acceptance are not claimed. See [detailed evidence](tracking/evidence/l01-k01-2026-11-04.md) and [testing guide](project-hub.md).


## L02 explorer maintenance ? 4 November 2026

KEEP scope verified: 53 frontend tests, 272 backend tests, 10 distinct browser cases passed; frontend lint/typecheck/build and Ruff passed. Includes live OpenFreeMap/Photon, desktop/phone recovery, real PostGIS selected-site transfer and existing geometry preservation. The two phone recovery cases were rerun after the mobile overlay fix. Provider switching remains LATER; field accuracy and pilot acceptance remain open. See [L02 evidence](tracking/evidence/l02-2026-11-04.md) for commands, fixture boundaries and warnings.


## L04 shared canvas - 4 November 2026

274 backend tests, 53 frontend tests and seven distinct relevant browser cases passed. Final Ruff, lint, typecheck and build passed. Shared work-item selection, terrain/preset and ordinary geometry rendering, WebGL failure/retry, numeric save and stale draft retention were checked. L04 remains Partial for full map-embedded context parity. See [commands, corrections and remaining gates](tracking/evidence/l04-canvas-2026-11-04.md).


## L11 ground-site shade studies - 5 November 2026

281 backend tests and 53 frontend tests passed. Final 9 focused study tests passed after polygon-only clipping hardening. Ruff, frontend lint/typecheck/build and two relevant real-PostGIS browser workflows passed. Desktop/phone study UI and rendered site heatmap inspected. See [full commands and remaining acceptance gates](tracking/evidence/l11-2026-11-05.md).


## Ground Studio overhaul - 8 November 2026

Frontend lint/typecheck/build and 53 tests passed. Backend Ruff passed; 282 tests passed initially and the single database-startup setup error passed on focused retry. Offline and live-map studio flows passed; final three editor/terrain/WebGL/conflict browser cases passed. Physical-device, pilot, live Auth/Storage and field accuracy acceptance remain open. [Commands, observations and limits](tracking/evidence/studio-overhaul-2026-11-08.md).


## Geographic editor - 8 November 2026

285 backend tests, Ruff, 57 frontend tests, lint/typecheck/build passed. Four local editor/fallback browser cases and two live-map workflows passed; geographic context-loss restoration and desktop/phone UI inspected. No live Supabase or field acceptance claim. [Detailed results](tracking/evidence/geographic-studio-2026-11-08.md).


## Proposed-product UI - 11 November 2026

64 frontend tests and 287 backend tests passed. Frontend lint and production build (including TypeScript) passed; backend Ruff passed. Full UI browser qualification: five passed across desktop/tablet/phone, four intentionally skipped repeated smoke cases. An additional phone visual follow-up passed after layout refinement. Existing local PostGIS/fixture-identity Studio regression: one passed. All 84 roadmap IDs were traversed, with no domain API writes from preview interactions. Screenshots, initial failures/fixes, exact commands and remaining gates are recorded in [evidence](tracking/evidence/product-ui-2026-11-11.md). Existing bundle-size and Starlette deprecation warnings remain; the isolated UI test intentionally observes API unavailable when no service runs on port 8000. This is not live Supabase, physical-device, field or customer acceptance evidence. Canonical domain statuses were preserved while UI coverage and three UI-only criteria were added. No Excel export or deployment.

## Map/tree inventory extension — 12 November 2026

Frontend lint/typecheck/build passed; 72 unit tests in 24 files passed. Backend Ruff passed; 289 tests passed, including real local PostGIS inventory permissions/revisions/history/restore and locator omission compatibility. Five browser cases passed across final runs: desktop/phone current-view selection, outline transfer/persistence, existing geographic terrain/object editing/context restoration, and new inventory lookup/import/manual/decision/save/conflict/3D/shadow/context restoration/reload. Browser identity is test-signed; map tiles are offline and tree data are synthetic. Desktop/phone and zoomed tree/shadow screenshots were inspected. Actual commands, initial setup failures, generator results and limits are recorded in [evidence](tracking/evidence/tree-management-2026-11-12.md). Live provider/DEM coverage, real Supabase, physical devices, assistive technology and field/pilot/customer acceptance remain open. No deployment or Excel export.

## Subsequent Mapbox replacement — 12 November 2026

Frontend lint/typecheck/build and 76 unit tests passed. Backend Ruff and 296 tests passed; renderer migration required no backend change. Five existing local PostGIS/browser map/editor regressions passed on Mapbox. One new live Standard integration case passed with explicit synthetic satellite tiles, checking source composition, native buildings/tree toggle, day/night, shadows/weather/reduced motion, tree persistence, phone layout and WebGL restoration. No production npm advisories were reported; ten moderate development advisories and bundle-size/Starlette warnings remain. Real Standard and public-token validation succeeded; real satellite tiles returned HTTP 429 with limit -1, and native procedural-building tile coverage has recorded 404 gaps. Live satellite/DEM qualification is not established. Exact commands, failed iterations/fixes, labelled screenshots and separate acceptance gates: [evidence](tracking/evidence/mapbox-migration-2026-11-12.md). No deployment or Excel export.

## MVP completion final regression — 13 November 2026

Local only. Ports 8100–8102 / 5174–5176 used beside the developer's own servers; web runs as the production bundle.
Evidence: `docs/tracking/evidence/mvp-final-regression-2026-11-13.md` (and the dated slice files it lists).

| Check | Result |
|---|---|
| Backend Ruff + format | passed (113 files) |
| Backend pytest (disposable PostGIS; includes restore drills, real local Storage drill) | 362 passed, 0 skipped |
| Frontend lint, typecheck, build | passed (existing large-chunk warning) |
| Frontend unit (Vitest) | 99 passed (34 files) |
| Integration browser (13 specs incl. accessibility + performance) | 12 passed + performance D1 failed once with client `ENOBUFS` (2,136 TIME_WAIT sockets) and passed on immediate rerun |
| Real local Supabase browser (live) | 3 passed earlier in the session; final run 2/3 with the recovery test failing once, passed on immediate rerun |
| Real identity access suite | 1 passed |
| Browser Demo/foundation (desktop/tablet/phone) | 27 passed, 3 failed: mouse polygon drawing in the detailed workspace registers no vertices (open L04 defect; also reproduced against the real API) |
| Tracking generators `--check` (tracking, ui-catalogue, design-studio, feature-checklist) | passed |
