# Ground Studio map-first overhaul — 8 November 2026

User scope: an immersive town-building-style Ground Studio, selected-site 3D without manually creating buildings, simpler professional controls and interaction motion. This is a presentation/navigation change over existing validated tools, not a replacement calculation engine.

## Implemented

- `apps/web/src/App.tsx`: opening a Studio project enters its workspace; Project details retains the existing unsaved-work confirmation. Organisation Review is not automatically moved into the editor.
- `StudioShell.tsx`, `GeometryWorkspace.tsx`, `styles.css`: fullscreen canvas, compact task dock, collapsible working panel, explicit detailed-workspace fallback, save/status controls, responsive phone header and bottom sheet. Mounted tool panels retain unapplied drafts. Selection/drawing can reveal the layout inspector. Short interaction transitions have a reduced-motion override.
- `DrawingMap.tsx`: contextual MapLibre building extrusions use existing provider `render_height`/`height` values; absent heights remain flat. 3D camera navigation no longer requires modelled project buildings or flat concept terrain. Drawing starts in plan view. Context never enters workspace items, quantities or backend shade calculations. Missing basemap/WebGL remains visibly disclosed.
- `ObjectScene.tsx`: existing metric design scene uses the available viewport height in immersive mode and retains its original 360px detailed-mode viewport. Terrain/object tools remain available; Explore returns to the geographic map.
- Existing tool permissions, server validation, revisions and recovery contracts are retained. No backend/schema or production-data changes were made for this overhaul.

## Checks and observations

- Frontend `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`: passed; 53 tests in 18 files. Existing large-bundle warning remains.
- `scripts/api.ps1 lint`: Ruff passed; 85 files formatted.
- `scripts/api.ps1 test -q`: 282 passed, one setup error because local PostgreSQL had not started. After `scripts/local-db.ps1 start`, reran `tests/test_access_foundation.py::test_creator_has_explicit_grants_and_duplicate_name_is_a_new_tenant[mode0]`: 1 passed. All 283 cases therefore have passing results across the run and focused retry, not a claimed clean single run. Existing Starlette/httpx deprecation warning remains.
- `playwright.reference.config.mjs`: new `studio-shell.spec.mjs` passed with offline basemap, actual local PostGIS and fixture identity. Exercises automatic entry without geometry, enabled 3D, task switching with unapplied inputs, panel collapse, phone width, no implicit database save and rejected dirty navigation.
- `playwright.studio.config.mjs`: same flow passed with live OpenFreeMap Liberty. Asserted rendered provider building count greater than zero while modelled-building count was zero. Provider reported some missing POI sprites/road-shield filter warnings; visible buildings and navigation rendered. This is one location/coverage check, not global completeness.
- Final focused browser run: 3 passed (`editor.spec.mjs` and `unified-canvas.spec.mjs`). Existing `unified-canvas.spec.mjs` covers actual context loss/retry, stale-revision conflict and unavailable-WebGL numeric-save fallback. `editor.spec.mjs` covers terrain strokes, cancellation, undo and persistence. Navigation helpers were adapted for the new automatic entry; unrelated live-service suites were not rerun.
- Desktop 1280×900 and phone 390×844 inspected from actual browser screenshots. Initial phone-header crowding corrected; live screenshots showed building extrusions, readable dock and contained panel. Local screenshots: `artifacts/studio-desktop.png`, `artifacts/studio-phone.png` (subsequent offline runs may overwrite these runtime artifacts).
- Initial browser startup timed out before local DB startup; retry succeeded. An initial new test exposed an unconditional 2D reset, corrected. Later regression checks exposed duplicate save-status text in detailed mode; the floating status was limited to collapsed immersive mode.

## Remaining boundaries

L04 stays **Partial** for the wider interaction contract: geographic map and metric terrain/object scene remain separate renderers. Full map-embedded terrain, target/boundary/reference parity, freeform game-like construction, DEM ingestion and terrain-aware shade are not completed by this shell change. Provider geometry is context, not surveyed data. Pilot/customer acceptance, physical touch-device/assistive-technology testing and field shade validation remain pending. Real Supabase Auth/Storage qualification was not rerun; browser tests use fixture identity and local PostGIS. No remote writes, deployment, paid resources or Excel export.

Tracking: L02/L04/L06/L07 updated without promoting broad implementation/acceptance statuses; new derived criteria TRK-L02-007 and TRK-L04-024–026; corrected stale L06 exclusion through REC-STUDIO-2026-11-08. Canonical CSV remains authoritative.

Earlier feature evidence remains retained: [L02](l02-2026-11-04.md), [L04 canvas](l04-canvas-2026-11-04.md), [terrain/object integration](studio-integration-2026-10-29.md). This checkpoint supplements those records.
