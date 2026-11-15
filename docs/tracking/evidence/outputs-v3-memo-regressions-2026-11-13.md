# Output template v3 (L23/L22), O17 decision memorandum and browser regression repair — 13 November 2026

Branch `build/l07-object-palette` (HEAD `7effa9c`, dirty worktree preserved). Local only; disposable PostGIS `_test`
schemas and the test-signed identity (`tests/browser_server.py`), **not** Supabase Auth acceptance.

## 1. Browser regression repair (integration suite)

Reproduced on the previous alternate-port setup: 5 failing specs (brief-settings, explorer-transfer, spatial,
workflow ×2) plus intermittent project-hub. Classification and actual fix:

| Spec | Original failure | Class | Fix |
|---|---|---|---|
| all signed-in specs | waited for project list after sign-in | stale test assumption (Home start page added deliberately) | `tests/studio-helpers.mjs` `signInFixture`/`openWorkspaceProjects` |
| brief-settings | search/sort hidden; `Project stage` label | stale assumption (filters moved under "More filters and options"; label "Status") | open the disclosure; use current label |
| brief-settings, project-hub | map canvas intercepts clicks | stale assumption (a project card opens the immersive studio) | leave via **Project details** |
| explorer-transfer | two headings with the project name | **product defect (a11y)**: page behind the fixed full-screen studio stayed focusable/announced | `StudioShell.tsx` marks everything outside the studio `inert` while immersive, restoring exactly what it changed; test asserts the h1 is inert |
| explorer-transfer | GET workspace ≠ POST response | stale assumption (GET adds derived `site_area_m2`) | compare GET before vs GET after |
| spatial | two canvases in drawing region | stale selector (hidden ground-paint texture canvas) | target `canvas.mapboxgl-canvas` |
| spatial | tree saved to Option A | stale assumption (Studio defaults to proposed Option A) | choose Baseline explicitly; scenario switcher given `role="group"` |
| workflow ×2 | "Ready to draw" hidden; ambiguous "Option A" | stale (status inside "Draw and snap"; two switchers) | open disclosure; scope to the Scenario selection group |
| spatial / others (intermittent) | `Failed to fetch dynamically imported module`, Edge `ERR_NO_BUFFER_SPACE`, blank page | environment (dev server serves hundreds of modules per page; dependency re-optimisation reload) **plus product defect**: a failed lazy chunk showed React Router's raw developer error | `components/RouteError.tsx` recovery screen as route `errorElement`; `vite.config.ts` `optimizeDeps.entries`; `playwright.integration.config.mjs` now runs the **production bundle** (`vite build` + `vite preview`) with configurable ports `INFRA_IT_API_PORT`/`INFRA_IT_WEB_PORT` |
| owner-review (intermittent) | "Retain original" stayed disabled | **product defect**: stale-closure state updates (`setUpload({...upload, …})`) overwrote the chosen file | functional updates for all 20 single-field setters in `OwnerEvaluation.tsx` and 8 in `ChangeRegister.tsx` |

No test was deleted or skipped, no assertion weakened, no sleep or retry added.
Result: `INFRA_IT_API_PORT=8100 INFRA_IT_WEB_PORT=5174 npx playwright test --config playwright.integration.config.mjs` → **10/10 passed**;
owner-review + change-register `--repeat-each 3` → 6/6 passed.
Observed once and not reproduced in 4 later runs: workflow (contractor) did not show the duplicate-labour alert
(`workflow.spec.mjs:92`). Recorded as unexplained nondeterminism, still open.

## 2. Output template v3 (L23 CORE, L22 CORE)

- `apps/api/app/output_sheet.py`: `plan_sheet()` projects the saved WGS84 boundary, targets and scope rows into the
  workspace's UTM metre CRS (same `project_wgs84_geometry` kernel as quantities) and emits local metres; boundary edge
  lengths (≤16 edges), extent, area, perimeter, date/time zone, north basis, sources, provenance tally and uncertainty
  statements. Projection failure → explicit `not_to_scale` record with reason (no dimensions). `MaintenanceTask`
  contract (task, responsibility ∈ contractor/client/third_party/to_be_agreed, frequency, included_in_price,
  assumptions) and `maintenance_plan()` labelled *supplied by the issuer; no generated recommendations*.
- `calculations.py`: `IssueInput.maintenance_plan` (≤30); new issues carry `template: 3`, `plan_sheet`,
  `maintenance_plan` (proposal) and manifest `infrashader-output-v3` / `template v3`.
- `issued_files.py`: retained renderer recorded from the payload (`infrashader-react-pdf-v3`; payloads without
  `template` stay `-v2`). Older issues keep the v2 rendering path; nothing re-renders an old issue with v3.
- Web: `PlanSheetPdf.tsx` (uniform scale from API metres → true graphical scale bar and "approx. 1:N at 100% A4",
  north arrow, edge dimensions, numbered item key with recorded source, legend), `MaintenanceChecklist.tsx` editor
  in the issue form (draft-recoverable), `services/plan-sheet.ts` helpers, react-pdf hyphenation disabled so hashes,
  codes and product names are not split with inserted hyphens.

Hand checks: south edge 0.002° at 3.131° N: 0.002·π/180·cos φ·N(6,378,200.7 m) = 222.31 m geodesic × UTM point
scale k≈1.00069 = **222.46 m** (API and PDF show 222.46 m). Print ratio: plotted 222 m edge measured ≈82 mm on the
rendered A4 page; 222 m / 2,700 = 82 mm (label "approx. 1:2,700"). Grid convergence (~0.15°) makes the north-up
extent 223.03 m, slightly wider than the edge — correct, test adjusted to assert it.

Checks: `pytest tests/test_output_v3.py tests/test_pricing_readiness.py` 15 passed (geodesic×k edge, geodesic area×k²,
not-to-scale, contract rejection, v3 issue payload, no rate/cost/margin in sheet/checklist, v3 vs legacy v2 renderer);
`vitest src/services/plan-sheet.test.ts` 4 passed; browser `workflow.spec.mjs` both purposes passed with PDF text
assertions (plan heading, scale ratio, EPSG:32647, survey disclaimer, dimensions, checklist rows and basis).
Rendered pages inspected (`artifacts/v3-contractor.pdf`, `artifacts/v3-developer.pdf` → `test-results/pdf-inspect`):
fixed an orphaned table header (`minPresenceAhead`), an empty baseline plan (now omitted when nothing is drawable),
duplicated north wording and the item number covering a small item.

## 3. O17 decision memorandum PDF

- Migration `0017_decision_memo.py`: review-file purpose `decision_memo`; unique partial index (one memorandum per
  approved decision revision). Applied to the local dev database (additive).
- `owner_review.py` `POST …/owner-review/decision/memo/file`: decision capability required; decision must be
  approved; `pack_sha256` must equal the retained `decision-pack.json` digest; PDF sniffed; first bytes kept (repeat
  returns the same record); download through the existing authorised, integrity-checked file route.
- Web: `DecisionMemoPdf.tsx` (decision, ranking position/exception, human rationale, approver reason, signoff history,
  evaluation basis with explicit per-project policy note, rubric, official results incl. document-only flags, reviewer
  rationale per sheet with conflict, unresolved qualifications/open clarifications, disclosures, source document
  manifest with SHA-256, input versions) rendered only after the browser re-verifies the pack hash
  (`services/decision-memo.tsx`); "Create retained decision memorandum (PDF)" control in Evaluation & decision.

Checks: `pytest tests/test_owner_review.py tests/test_restore_drill.py` 5 passed (wrong digest 409, non-PDF 422,
Studio-only member denied, first bytes kept, download equals retained bytes); browser owner-review spec creates,
downloads and text-checks the memorandum; rendered 2-page memo inspected.

## Remaining gaps (not claimed)

- Plan sheet is a schematic of recorded geometry: no basemap/photo sheet (export rights unreviewed), no
  walkthrough (NEXT), no field-verified dimensions. Lifecycle costing for L22 (discount, replacement) remains NEXT.
- Memorandum shows user IDs, not names; no signature service. JSON/CSV pack remains authoritative.
- Supabase Auth/Storage, representative documents (AC-04) and pilots (AC-10) remain external gates.
