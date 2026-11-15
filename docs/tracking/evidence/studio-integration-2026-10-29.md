# Studio integration checkpoint — 29 October 2026

User request: finish editor and terrain/object integration following the L04 audit. Branch: `build/l07-object-palette`. Changes are local; no push, deployment, paid service, new production dependency or Excel export.

## Implemented subset

- `apps/web/src/components/ObjectScene.tsx`: terrain-framed 3D scene, mode-separated navigation/sculpting, visible brush ring, cancellation, one commit per stroke, camera retention while mounted, selected-instance tint and click-to-ground movement callback. Terrain and admitted presets share projected coordinates and live contact updates.
- `apps/web/src/domain/terrain.ts`: deterministic swept-path maximum-coverage stroke. Repeated stationary samples do not accumulate height; smoothing reads the original stroke grid. Existing limits retained.
- `apps/web/src/components/ObjectPalette.tsx`: backend-validated terrain commits through existing object-preview route, backend group movement through object-transform, selection shared with the map, and inspector refresh following workspace changes. Failed validation preserves the prior valid draft. Existing locked/inherited restrictions retained.
- `apps/web/src/components/GeometryWorkspace.tsx`: map-to-palette selection, basic non-preset work-item duplication, category view layers and item search. Preset-derived footprints remain protected from generic map vertex editing.
- `apps/web/src/components/DrawingMap.tsx`: optional 12-screen-pixel vertex snapping of transferred coordinate drafts to other visible geometries. This is not edge snapping/topological validation; normal backend validation remains required.

No backend ownership was moved to the browser. Existing authenticated routes validate metric frames, geometry, terrain, pond beds and saved quantities. Existing project revision conflicts, rate bindings and history remain in use. No provider geometry is promoted to authoritative project data.

## Actual checks

- `npm run lint`, `npm run typecheck`, `npm run build`: passed. Existing bundle-size warning remains.
- `npm test`: 47 passed, including two new stroke tests for event subdivision, repeated samples, modes and invalid radius.
- `.\scripts\api.ps1 lint`: Ruff checks/format passed, 66 files.
- `.\scripts\api.ps1 test -q`: 222 passed; existing Starlette/httpx deprecation warning.
- `npx playwright test --config playwright.reference.config.mjs`: four passed (new integrated scene plus existing object, plan-reference and terrain checks). New scene test covers drag, undo/redo, cancellation, ground movement, canonical object contact/quantity and save/reload. Existing checks cover grouping, locks, hidden quantities and independent terrain options.
- `npx playwright test --config playwright.access-fixture.config.mjs tests/integration-browser/spatial.spec.mjs`: one passed; existing geometry editing, sourced building 3D, saved history/layers and flat-ground shade path.
- Inspected `artifacts/l04-integrated-terrain.png`: site-scale perspective surface, brush ring and small preset at correct relative scale. This is a synthetic fixture, not field acceptance.
- Final focused `npx playwright test --config playwright.reference.config.mjs tests/reference-browser/editor.spec.mjs`: one passed after adding assertions for navigation without mutation, general item duplication with unique IDs, item search and category visibility preserving saved quantities. This is a rerun of the integrated test, not a sixth distinct browser test.
- `python scripts/tracking.py` and `python scripts/tracking.py --check`: passed for 128 records and 971 acceptance requirements. No Excel regenerated.

Failures and corrections: initial frontend lint rejected an effect that synchronously copied selection state; changed to guarded state adjustment. Initial browser run was affected by live source reload and duplicate fixture project names. A fresh run exposed an exact label locator mismatch for the scene select; using its accessible combobox role resolved it. Subsequent complete four-test suite passed. No failed run is counted as acceptance.

Browser checks use signed test identity and disposable local PostGIS with fixture storage. Real Supabase Auth/Storage was not rerun. Physical-device/touch, assistive-technology, extended GPU/performance, field and pilot acceptance remain unperformed. No claim of full geographic provider coverage or terrain-aware shade.

## Remaining scope and tracking

L04 remains **Partial**, overall verification **Not run** because the full compound catalogue criteria include unsupported operations. The tested continuous-stroke requirement TRK-L04-009 is Passed / acceptance Pending. L06/L07 retain their earlier limited implementation statuses and gain this integration evidence; cross-feature criteria are not automatically marked passed from subset checks.

General multi-selection, edge snapping, general geometry locks, arbitrary dimension constraints, persistent named selections, single map-embedded rendering, 3D pond-water authoring and advanced split/merge/arrays remain incomplete/deferred. Vertex snapping has code inspection and build coverage, not a dedicated numerical/browser acquisition test. See [usage and limitations](../../studio-editor.md). L10 is still unfinished and was not implemented here.
