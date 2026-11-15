# L09/L10 → K02/L13 checkpoint — 30 October 2026

User requested completing L09/L10 and connecting quantities through K02/L13. Work remains on local branch `build/l07-object-palette`; no remote write, deployment, paid resource, new production dependency or Excel export.

## Implementation and evidence

- `apps/api/app/schedules.py`: strict planting/recipe/component inputs, source-aware deterministic quantities, unit conversion and approval/duplication guards, pricing expansion, permission-filtered saved schedules and item-level change reports.
- `apps/api/app/workspace.py`: private definition snapshots, backend definition versions, derived schedules, historical restore cleanup and canonical quantity integration.
- `apps/api/app/domain/pricing.py` and `apps/api/app/calculations.py`: component expansion uses existing Decimal estimates, avoids duplicate wastage/included charges and accepts volume/hour rates; no competing price total is persisted.
- `apps/api/app/main.py`: project-protected read schedule endpoint and additional valid catalogue units.
- `apps/web/src/components/PlantMaterialPanel.tsx`: sourced project record library, planting metadata/count methods, approved recipe editor, rate search, schedule/impact display, linked item selection and CSV export. Unapplied source-record edits block save; preview operations lock concurrent editing.
- `apps/web/src/components/GeometryWorkspace.tsx`: source records survive geometry edits; plant labels and new panel integrate with existing undo/revision flow. CalculationsPanel/CatalogueBrowser/domain schemas support component IDs and new units.

## Checks actually run

- Frontend lint, typecheck and build passed; 47 frontend tests passed. Existing bundle-size warning remains.
- Ruff checks/format passed (68 files). Full backend suite: **232 passed**. Ten focused schedule checks cover nominal area/line/individual plant counts, source preservation, invalid values/dimensions, volume/wastage, approval, parent/component duplicates, included labour, real database estimate agreement, versions, change differences, stale rejection, foreign-user denial and read-only cost redaction.
- Five reference browser checks passed: integrated editor, objects, calibrated reference, planting/material schedules and terrain. The new test uses the real UI to save planting count 31, replace it with an approved volume recipe, obtain identical schedule/estimate base amounts, export CSV, reload and locate the source geometry.
- Six existing fixture integration tests passed, including both immutable downloadable output workflows, catalogue paging/units, navigation/privacy, spatial edits and history/recovery.
- Inspected `artifacts/l09-l10-schedule.png` and the exported CSV. Source quantity precision was subsequently formatted for readability; CSV now includes explicit formulas and rate-version references. The focused backend/browser paths were rerun after that final export refinement (see final result below).

Initial failures: frontend syntax/import/format checks during implementation were corrected. The first full backend run had five failures because derived empty schedules were emitted for old ordinary items and restore did not strip the new derived field. Derived rows are now emitted only for source-record items, and restore removes them before recalculation; the complete suite then passed. An effect dependency warning was corrected by destructuring its callback. No failed check is counted as passing evidence.

Tests use local disposable PostgreSQL/PostGIS and signed identity/fixture storage. Real Supabase, physical devices, field/horticultural verification, supplier pricing acceptance and customer pilot acceptance were not rerun/performed. Synthetic checks do not establish those gates.

## Coverage and remaining limits

Final follow-up: ten focused backend checks and the one schedule browser check passed after formula/rate-reference export changes. The browser initially needed a separate status text element when rate metadata was added to the same cell; this was corrected and rerun. Additional backend assertions confirmed availability/substitution retention and restoring an earlier recipe as workspace revision 3 / definition version 3. Canonical tracking regeneration/validation passed (128 records, 971 acceptance requirements). No Excel was generated.

L09 limited CORE workflow and L10 basic approved-recipe CORE workflow are implemented. Their original reported status and priorities remain preserved. L10 extensive assemblies remain NEXT. L09's supplier/local-horticulture criterion remains Not run / Pending; its software metadata and explicit assumptions are not horticultural approval.

K02 and L13 remain Partial overall: this checkpoint connects plant/material schedules, quantities, prices and changed-input explanations, but does not complete every roadmap activity. No full spreadsheet engine, all-input dependency graph, nested BOQ work hierarchy or allowance approval is claimed. See [usage and exact scope](../../plant-material-schedules.md).
