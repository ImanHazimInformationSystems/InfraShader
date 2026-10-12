# Validation evidence

11 October 2026. Development checkpoint, not MVP release approval.

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
