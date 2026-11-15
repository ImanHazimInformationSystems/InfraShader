# MVP completion plan (execution view)

Derived execution view, **not** a status database. Canonical status, criteria and evidence: `docs/tracking/*.csv`
(generated into `FEATURE_STATUS.md` / `features/<ID>.md`) and dated files in `docs/tracking/evidence/`.
Controlling scope: catalogue 00.4 (Studio), 00.5 (Owner), 00.6 (transactions), 00.7 (K01–K06), 10 (D0/D1A/D1B);
per-ID CORE slice = the "Documentation clarification (12 November 2026)" / "Refined slice" text in
`feature-specifications.csv`. CORE/NEXT labels do not require the NEXT portion.

Denominator for counts below: the 48 IDs named in the MVP mission (L01–L05, L09–L16, L22–L24, L26; O02, O04–O10,
O12–O18; S01–S04, S06–S10, S12; K01–K06). L02/L11 are dependencies of the Studio journey.

## Requirement map (13 Nov 2026, after checkpoint 3)

`Reg` = audited implementation / verification in `feature-register.csv`. "Ext" = external gate that software cannot close.

| IDs | MVP behaviour (CORE) | Reg | Evidence | Actual remaining software gap | Verification / next | Ext |
|---|---|---|---|---|---|---|
| L01 L03 L05 L09 L10 L15 L16 L24 K01 K04 | Brief/site/plan reference/plants/objects/charges/pricing/proposal/brief checkpoint/rate gate | Implemented / Passed | per-feature evidence | none known in CORE | final regression | pilots, commercial review |
| L02 | Explore selected extent → new project | Implemented / Blocked (live Mapbox) | explorer-transfer spec | none (provider live check external) | integration spec passes | Mapbox live |
| L11 | Flat-ground shade studies, labelled | Implemented / Passed | — | none in CORE | — | field accuracy |
| L04 | Numeric dimensions, selection, duplicate, undo, snapping; baseline separate | Partial / Passed | spatial/workflow specs | audit precision controls vs spec | slice 6 | device matrix |
| L12 | Baseline/A/B + revision impact, earlier issues unchanged | Not audited | change register (K02/L26) | **audit** and record | slice 5 | — |
| L13 | Visual → quantity → rate → estimate; BOQ export | Partial / Not run | schedules, BOQ CSV | **audit export contract (CSV injection, units, workbook)** | slice 6 | commercial |
| L14 | Versioned rate source/effective/expiry/inclusions | Partial / Passed | K04 | supplier/quotation provenance fields audit | slice 6 | supplier |
| L22 | Maintenance responsibility/frequency checklist | Partial / Passed | outputs-v3 evidence | whole-life cost is NEXT | done (CORE) | commercial |
| L23 | Scaled plan/schedule sheet, legends, uncertainty | Partial / Passed | outputs-v3 evidence | photo sheet/named views NEXT | done (CORE) | export rights |
| L26 K03 K02 | Change register, frozen impact, revised issue link; dependency invalidation | Partial / Passed | change-register evidence | **K02 per-input dependency graph test** (rate/spec/brief changes) | slice 6 | client ack evidence |
| K05 | Verify-on-site queue, measurement source labels | Partial / Not run | L03 queue | **audit quantity-impact of measured override** | slice 6 | field |
| O02 O04 O05 O07 O09 O10 O12–O15 O18 K06 | Owner D1B core | Partial / Passed | owner-review-d1b evidence | policy REC-010 only | done | REC-010, AC-04, AC-10 |
| O06 | Viewer + manual source-linked entry (CORE); OCR/AI NEXT | Partial / Passed | D1B | optional bounded text-layer suggestions (beyond CORE; requested) | slice 7 | AC-04 |
| O08 | Admitted spatial comparison + document-only fallback | Partial / Passed | D1B | **side-by-side document view; spatial only for admitted geometry** | slice 7 | — |
| O16 | One reviewer→approver transition | Partial / Passed | D1B | multi-stage is NEXT (not MVP) | done | policy |
| O17 | Retained pack + memorandum | Partial / Passed | outputs-v3 evidence | none in CORE | done | AC-10 |
| S01 S02 | Workspaces, membership, permissions | Partial / Not run | — | **real local Supabase Auth paths** | slice 4 | — |
| S03 | Recipient-safe immutable outputs | Partial / Not run | output tests | audit + record | slice 5 | — |
| S04 S06 | Retention, recovery, restore | Partial / Not run | restore-drill evidence | **Supabase Storage photo bytes in joint restore** | slice 4 | off-machine backup, RPO/RTO |
| S07 | Measured pilot table/map performance | Not audited | — | **measure and record** | slice 5 | device matrix |
| S08 | Metric/MYR/time zone, accessible controls | Not audited | inert fix | **automated a11y scan + keyboard checks** | slice 5 | assistive-tech users |
| S09 | Small JSON/CSV/XLSX/PDF contracts | Not audited | — | **audit CSV formula-injection, import duplicates** | slice 5 | — |
| S10 | Audit trail, retention/recovery records | Not audited | append-only tables | audit + record | slice 5 | — |
| S12 | Help/feedback, acceptance evidence capture | Not audited | — | pilot procedure + fixtures | slice 8 | AC-10 pilots |

## Progress log

- Checkpoint 1 — D1B owner review core ([evidence](tracking/evidence/owner-review-d1b-2026-11-13.md)).
- Checkpoint 2 — K03/L26/K02 change register ([evidence](tracking/evidence/change-register-2026-11-13.md)); joint DB + retained-file restore drill ([evidence](tracking/evidence/restore-drill-2026-11-13.md)).
- Checkpoint 3 — browser regression repair (10/10 integration specs), output template v3 (L23/L22), O17 memorandum,
  stale-closure and immersive-inert defects ([evidence](tracking/evidence/outputs-v3-memo-regressions-2026-11-13.md)).
- Checkpoint 4 — real local Supabase Auth/Storage (live 3/3, access 1/1) and joint DB + private-photo restore drill
  ([evidence](tracking/evidence/live-auth-storage-restore-2026-11-13.md)).
- Checkpoint 5 — shared audit: S09 CSV formula safety, S08 axe scan 0 violations, S07 measurements + 500-line editor
  pagination, S03/S10/L12 audited ([evidence](tracking/evidence/shared-audit-2026-11-13.md)).
- Checkpoint 6 — K02 superseded-rate review + dependency-graph test, K05 quantity verification list, L13/L14/L04
  audit ([evidence](tracking/evidence/studio-dependencies-2026-11-13.md)).
- Checkpoint 7 — O06 bounded suggestions, O08 side-by-side, idempotent read retry
  ([evidence](tracking/evidence/owner-extraction-compare-2026-11-13.md)).
- Checkpoint 8 — Browser Demo suite repaired (27/30), pilot procedures, final regression
  ([evidence](tracking/evidence/mvp-final-regression-2026-11-13.md); [procedures](PILOT_ACCEPTANCE_PROCEDURES.md)).
- 14 Nov 2026 — Onboarding aid (S01): built-in Design Studio example (Shah Alam park upgrade, real workflows, fictional parties) and Organisation Review example (three offers incl. the Studio example), Review guide, tips and preferences; migration 0018. Evidence: `docs/tracking/evidence/example-projects-2026-11-14.md`.
- 14 Nov 2026 (v2) — Three flat-ground Studio examples A–C feed the review example; shared plan previews from native design files; Organisation Review overview-first overhaul; migration 0019. Same evidence file.

## Continuation state (read this first after "continue")

- **Objective:** complete MVP software + local pre-deployment verification; external gates stay open.
- **Environment:** local Postgres/PostGIS on 54322 (`.local/database.json`; dev DB `infrashader` at Alembic **0017**,
  tests use disposable `infrashader_test` schemas). Local Supabase in Docker (`supabase/config.toml`: API/Kong 54331,
  DB 54332, Studio 54333, Inbucket 54334). User's own dev servers may hold 8000/5173 — do not kill them.
- **Commands:** backend tests `.\scripts\api.ps1 test` (or set `TEST_DATABASE_URL` to `infrashader_test` and
  `uv run --frozen pytest`); Ruff `uv run --frozen ruff check app tests` + `ruff format --check`; frontend
  `npm run lint|typecheck|test|build -w apps/web`; integration browser
  `INFRA_IT_API_PORT=8100 INFRA_IT_WEB_PORT=5174 npx playwright test --config playwright.integration.config.mjs`
  (production bundle); tracking `python scripts/tracking.py` (+ ui-catalogue, design-studio-catalogue,
  feature-checklist, each with `--check`).
- **Last results (13 Nov, final):** backend 362 passed, Ruff/format clean; web lint/typecheck/build clean, 99 unit
  tests; integration 13/13 (one ENOBUFS rerun); live 3/3 (one intermittent rerun); access 1/1; Browser Demo 27/30;
  tracking checks clean. Details: `docs/validation.md` final section.
- **Commands:** integration `INFRA_IT_API_PORT=8100 INFRA_IT_WEB_PORT=5174 npx playwright test --config
  playwright.integration.config.mjs`; live `INFRA_LIVE_API_PORT=8100 INFRA_LIVE_WEB_PORT=5174
  INFRA_TEST_API_URL=http://127.0.0.1:8100 npx playwright test --config playwright.live.config.mjs`; access
  `INFRA_ACCESS_API_PORT=8101 INFRA_ACCESS_WEB_PORT=5175 npx playwright test --config playwright.access.config.mjs
  access-browser`; Browser Demo `INFRA_BROWSER_API_PORT=8102 INFRA_BROWSER_WEB_PORT=5176 npx playwright test`.
  Note: Playwright empties `test-results/` at the start of each run.
- **Remaining software work (next concrete action first):**
  1. Fix L04 mouse polygon drawing in the detailed workspace (Terra Draw bound to which map instance when two
     `DrawingMap`s/canvases are visible; `apps/web/src/components/DrawingMap.tsx` `start()`, GeometryWorkspace
     embed toggle). Failing check: `tests/browser/foundation.spec.mjs` "Terra Draw polygon…".
  2. Optional hardening: owner state payload size (2 MiB at D1 fixture), interactive timings vs 300 ms goal,
     Immersive-mode overlap of "Draw and snap" with "Map layers" chip.
- **External decisions:** REC-010 owner policy; AC-04 representative documents; AC-10 pilots; device/assistive
  testing; human review of pricing/quantity/shade wording.
