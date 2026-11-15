# Catalogue / HTML / contractor-workflow documentation audit

Date: 12 November 2026. Branch observed: `build/l07-object-palette`. The extensive existing modified/untracked application work was preserved. This task changes requirement descriptions, review documentation, readable checklist generation and generated description views. It implements no application feature, performs no remote write and exports no Excel or replacement PDF.

## Sources and review coverage

- Accessible: `C:/Users/User/Desktop/Infrashader_UI_Concept_v0.3.html`, SHA-256 `2aea3178084e850abcbc28e6e26d66fd0fdbb4927a9f62bdcfbe4f08f7093aad`.
- Accessible: `C:/Users/User/Desktop/InfraShader_Full_Feature_Catalogue_2026-11-11.pdf`, SHA-256 `5d05847a8edd47954f30502f9600562cd1e2e4c91057fa44ca59e76e4e190897`; repository `output/pdf/` copy has the same hash. `pdftotext -layout` read all 23 pages (77,648 extracted characters). The separately named suffix `(1)` Desktop file does not exist.
- Read the HTML main application logic, dynamic render functions, decoded original reference gallery, all 120 screen models and five journey definitions. Playwright/Edge rendered 17 of 18 attempted main page destinations; Overview throws `Cannot set properties of null (setting 'onclick')` in the supplied concept's `bindPage`. This is a source concept defect, not an application regression. Screenshots of Estimate and Terrain were inspected at 1440x1000. External requests were blocked; no live geographic-data accuracy was assessed.
- A temporary in-memory unpriced chair was added to the HTML demo (no Save/storage write). `estimate()` retained one unpriced item; `proposalHTML()` showed **Priced work subtotal**, RM 12,024 and the explicit partial-cost warning. This verifies the concept's presentation safeguard only, not production persistence/issuance.
- The [reconciliation](../../UI_CONCEPT_RECONCILIATION.md) was created before canonical edits and compares all 84 unique roadmap IDs. L/F/D/E/K aliases and proposals do not inflate that count.
- Source UI inspection artifacts: `artifacts/concept-reconciliation/concept-estimate.png`, `concept-terrain.png`, `concept-rendered.json`, `gallery-model.json` and `unpriced-example.json` (paths relative to that artifact directory after the first filename).
- Editable sources found: feature-register.csv and feature-specifications.csv. Existing tracking, UI manifest and checklist generators were inspected. No retained authoring generator for the source catalogue PDF was found in searched source/scratch locations. Original attachments/source snapshots were preserved.

## Bounded implementation inspection

Read relevant quantity/workspace validation, recipe calculation, pricing/readiness, tree inventory, terrain and issue source paths: `apps/api/app/workspace.py`, `domain/geometry.py`, `schedules.py`, `domain/pricing.py`, `pricing_readiness.py`, `calculations.py`, `tree_inventory.py`, `terrain.py`, `shade_studies.py` and `issued_files.py`. Reviewed the existing planting/material, pricing/proposal, tree-management and feature contracts and focused existing test cases.

Evidence supports separate base path length and derived recipe surface/volume, plant counts/spacing, missing-rate partial results, unit/currency/basis validation, explicit charge/waste guards, current selected rate versions, terrain/analytical-shade limits and bounded retained-file handling. It does not establish full road construction, surveyed earthworks, real supplier pricing, all Organisation Review features or field/customer acceptance. Generic retained-file code exists; older O17 absence statements need feature-specific follow-up rather than automatic promotion to Implemented.

## Changes and unchanged dimensions

- Clarified 34 existing feature/refinement summaries and 20 overlapping baseline summaries, plus their detailed output/exclusion fields. Original detailed alias summaries and verbatim source contracts remain.
- Affected roadmap/refinement IDs: L01-L16, L18, L20, L23, L24, L26; O02, O07, O08, O13, O17; S03, S04; K01-K06. Baseline cross-references: F01-F12, F14, F15, F17-F20, E01, E05. Other feature rows and all acceptance result fields retain their prior values.
- Recorded REC-017 through REC-022. Roadwork (`PROP-ROAD-01`) and earthworks/pond costing (`PROP-EARTH-01`) remain unapproved proposals. L06 stays LATER despite its bounded implemented concept.
- Added the ten-step [contractor workflow](../../contractor-workflow.md) and [measurement/rate contract](../../measurement-and-estimating.md), with separate Organisation Review journey. Updated the checklist generator to expose approved/staged scope and check freshness.
- Protected dimensions are IDs, names, record type/count flag, priorities, reported and audited implementation, verification, deployment and acceptance. No acceptance result is promoted by the documentation review. Feature-register evidence references and existing technical gates remain separately authoritative.

## Files changed

- New review/workflow contracts: `docs/UI_CONCEPT_RECONCILIATION.md`, `docs/contractor-workflow.md`, `docs/measurement-and-estimating.md` and this evidence record.
- Canonical data: `docs/tracking/feature-register.csv`, `feature-specifications.csv` and `reconciliation.csv`. No acceptance-checklist, release-gate, resource or UI-placement CSV edit.
- Related guides: `docs/FEATURE_SPEC.md`, `docs/tracking/README.md`, `docs/plant-material-schedules.md`, `docs/pricing-and-proposals.md`, `docs/UI_DESIGN.md`, `docs/decisions.md` and `docs/validation.md`.
- Generators: `scripts/feature-checklist.py` (scope column/freshness check) and `scripts/ui-catalogue.py` (current source provenance wording).
- Regenerated views: the 54 affected `docs/features/<ID>.md` pages, `docs/FEATURE_CHECKLIST.md`, `docs/UI_COVERAGE.md`, `docs/tracking/reconciliation.md`, `docs/tracking/workbook-data.json` and description strings in `apps/web/src/product/catalogue.json`. `docs/FEATURE_STATUS.md` was regenerated with unchanged statuses/counts.

## Actual checks

- `.\scripts\api.ps1 test tests/test_pricing.py tests/test_schedules.py tests/test_pricing_readiness.py -q`: **32 passed**, one existing Starlette/httpx deprecation warning, 12.68 seconds. Includes the local disposable PostGIS fixture where used; no production/customer data or real Auth/Storage qualification.
- `npm run test --workspace apps/web -- --run src/product/model.test.ts`: **3 passed**, one file, 2.01 seconds. npm warned about the forwarded `--run` flag; Vitest ran the intended generated-catalogue/model invariant file successfully.
- `python scripts/tracking.py` and `--check`: **passed**, 128 feature/reference records, 84 roadmap entries, 1,021 existing acceptance rows and 160 preserved original requirement names. Source hashes/status references valid.
- `python scripts/ui-catalogue.py` and `--check`: **passed**, 84 UI placements; alias/refinement counts excluded from roadmap.
- `python scripts/feature-checklist.py` and `--check`: **passed**, readable scope-inclusive checklist matches its canonical inputs.
- Protected-field comparison against the pre-edit snapshot: **passed** for all 128 records (IDs/names/type/count/priorities/reported/audited/verification/deployment/acceptance). PDF/register/matrix/checklist IDs/names and manifest scope parity: **passed**, 84 unique roadmap rows. HTML representation is **3 Represented / 51 Partial / 30 Absent**, strictly about the supplied concept, not implementation completion.
- New-document relative links and scoped whitespace review: **passed**; Git emitted only its existing LF-to-CRLF normalisation notice. Original Desktop HTML/PDF hashes are unchanged. Reconciliation source and approval boundaries are explicit; the PDF is not overwritten.

## Remaining gates and skipped work

This is not a whole-feature re-audit. Full application frontend/backend suites, live provider geography, real Supabase Auth/Storage, physical devices, assistive technology, field measurements, commercial review and customer acceptance were not rerun. No user-facing component, route, calculation or permission implementation was edited; generated application catalogue scope strings only reflect the canonical descriptions. Relevant existing pricing tests and documentation/generation checks are the qualification for this documentation task.

Source filename `(1)` ambiguity, road/earthworks approval decisions, generic retained-file versus complete O17 mapping, and the concept Overview defect remain explicit. See the canonical reconciliation for exact dispositions. Source catalogue PDF is intentionally unchanged because its authoring generator is unavailable; CSV-derived Markdown and JSON are regenerated through the existing scripts.
