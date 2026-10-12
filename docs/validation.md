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
