# Simple planted-tree shadow preview — 13 November 2026

Affected IDs: L09 and L11; derived criterion TRK-L11-012. User requested simple shadows under the four planted-tree models, following the displayed sun. This is a visual extension to the existing tree placement workflow; analytical shade remains bounded to its existing supported building/canopy inputs. Existing working-directory changes are preserved.

## Implementation

- `apps/web/src/services/tree-shadow.ts` supplies a shared translucent elliptical crown silhouette. It reuses the established inventory preview's assumptions: crown centre at 65% of model height, vertical half-extent 35%, width from the display model, displacement proportional to height/tan(sun elevation), opposite the sun azimuth. The circle geometry/material are shared and disposed with the scene. This is an illustrative solid crown, not a projected leaf model, measured shaded area, or species-specific transmission model.
- `PlantedTreeLayer.tsx`, `ProposedTrees.tsx`, `GeometryWorkspace.tsx` connect current Sun context to geographic lighting and per-tree shadows, including placement previews. Moving/resizing changes the shadow; switching scenarios or hiding a tree removes its preview. Shadows remain visible when leaving the Trees panel. Null/unavailable solar data, night and elevation below 5 degrees hide the preview; DEM/elevation and saved concept terrain pause it. The Tree panel explains these states and identifies the preview as distinct from calculated shade studies. Existing source rate/count pricing and saved revisions are unchanged.
- `ObjectScene.tsx` uses the same east/north/up silhouette in the local/embedded metric scene, updates it when solar context changes, and suppresses it when terrain is present. This path was typechecked and built; its specific rendered tree-shadow path was not separately browser exercised in this task.
- No backend, API, persistence, analytical quantity, cost, retained issue, permission, package or migration change. No paid service, deployment, external write or Excel export.

## Checks run

- `npm run test --workspace apps/web -- --run src/services/tree-shadow.test.ts src/services/tree-models.test.ts src/domain/trees.test.ts`: **6 passed**. East/west/north/south solar direction, longer shadows for taller trees/lower sun, overhead sun, null/night/low-sun/invalid inputs and existing finite tree geometry/inventory invariants.
- `npm run lint --workspace apps/web`, `npm run typecheck --workspace apps/web`, `npm run build --workspace apps/web`: **passed**. Existing large-chunk build warning remains.
- `npx playwright test --config playwright.reference.config.mjs tests/reference-browser/proposed-trees.spec.mjs`: **1 passed**. Four trees show four daytime shadows, midnight removes them with an explanatory status, afternoon restores them. Existing placement, resize, rotation, dragged move, save/reload, unpriced completeness, explicit sourced rates, Decimal estimate, invalid rate, stale revision and denied grant checks remain passing. Local PostgreSQL/PostGIS API, synthetic fixture identity/rates and offline map canvas; no live-provider acceptance is implied.
- Desktop, four-model and phone artifacts: `artifacts/proposed-trees-desktop.png`, `artifacts/proposed-trees-models.png`, `artifacts/proposed-trees-phone.png`. First capture occurred while camera movement invalidated solar context, correctly hiding shadows. The final visual check waits for fresh solar data before capture.
- Backend Ruff/pytest skipped: no Python/backend changes. Full unrelated browser/frontend suites, live Mapbox/DEM, physical devices and field testing were not run.

## Tracking and limits

Canonical L09/L11 register/spec/UI rows and TRK-L11-012 updated, then generated tracker/UI/Design Studio/checklist views regenerated and checked. Existing implementation labels, Local only deployment and Pending customer acceptance remain unchanged; new criterion acceptance is Not assessed. Shadows are approximate on flat ground, use illustrative model dimensions and do not prove comfortable seating, percentage coverage, field accuracy or analytical tree shade. No stage gate is signed off.
