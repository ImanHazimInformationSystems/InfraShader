# Site-shape editor — 11 November 2026

L02 / narrow L04 dependency; TRK-L02-010–012. [Contract](../../site-selection.md). Existing functional statuses and acceptance gates retained.

## Implementation

- `apps/web/src/components/SiteSelectionEditor.tsx`, `site-selection.css`, `apps/web/src/domain/site-selection.ts`: visual presets/custom polygons, drag/keyboard handles, numeric rotation/scale, undo/redo, framing, reset and Apply/Cancel.
- `SiteMap.tsx`, `ExploreWorkspace.tsx`, `ExploreTutorial.tsx`: integrate editor, hide obstructing controls, retain saved outlines and explain the revised workflow.
- `apps/web/src/App.tsx`, `apps/web/src/domain/projects.ts`: transfer shape to project/brief, including a matching unsaved brief.
- `apps/api/app/schemas.py`: optional outline, bounded ring/topology/envelope validation; existing project JSONB persistence and permission/revision paths reused.
- `GeometryWorkspace.tsx`: display locator and initialise exact outline as an unverified boundary draft.

## Actual checks

- Frontend lint/typecheck/build passed; existing large-chunk warning.
- `npm test`: 61 passed in 21 files, including four new transformation/validation cases. Final framing/CSS refinements checked in browser.
- `.\scripts\api.ps1 test tests/test_site_outline.py -q`: 2 passed, including PostGIS persistence, foreign-access denial and stale revision rejection.
- `.\scripts\api.ps1 lint`: passed, 86 files formatted. Initial import-order issue corrected.
- `.\scripts\api.ps1 test -q`: 287 passed; existing Starlette/httpx deprecation warning. Broad checks preceded the user request to perform necessary tests only; subsequent checks were focused.
- `npx playwright test --config playwright.reference.config.mjs site-selection.spec.mjs explore-tutorial.spec.mjs`: 2 passed. Initial selection run timed out because the test assumed reload auto-opened Studio; corrected to use the existing Open geometry workspace entry. Product persistence had succeeded.
- Final focused `site-selection.spec.mjs`: passed after mobile visibility/sticky-Apply refinements. Covers ellipse, drag, keyboard focus, rotation, scaling, undo/redo, cancel without coordinate changes, custom polygon, phone layout, project creation/reload, explicit workspace save and HTTP 422 envelope rejection.
- Inspected `artifacts/site-selection-desktop.png` and `artifacts/site-selection-phone.png`. Phone framing improved after initial inspection. Final capture shows unobstructed handles and visible Apply action.
- Legacy two-corner assertion in `tests/environment-browser/environment.spec.mjs` updated for explicit Apply. That external-provider suite was not rerun.

Browser checks used fixture authentication, real local PostGIS and an offline coordinate map. No real Supabase or live-provider qualification this checkpoint. Physical devices, full screen-reader/browser matrix, field and pilot acceptance remain pending. No new dependency, Excel export, push or deployment. Unrelated changes retained. Previous evidence: [tutorial](explore-tutorial-2026-11-09.md), [geographic integration](geographic-studio-2026-11-08.md).
