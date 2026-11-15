# Geographic Studio integration — 8 November 2026

Follow-up to the [map-first shell checkpoint](studio-overhaul-2026-11-08.md). User explicitly requested resolving the separate map/metric scene and finding resources for building coverage. Scope is L02/L04/L06/L07 and their necessary rendering/preview dependencies.

## Delivered behaviour

- `DrawingMap.tsx`, `GeometryWorkspace.tsx`, `ObjectPalette.tsx`, `ObjectScene.tsx`: map-embedded design view is the default. Existing terrain/preset/general-work scene uses MapLibre's WebGL context, camera matrix and depth buffer. Geographic pointer rays drive existing stroke/move callbacks, with map drag disabled during sculpting and restored afterward. Local scene remains an explicit fallback. Context restoration re-adds the custom layer; map context is never forcibly destroyed when disposing the Three renderer.
- `spatial_editor.py`, `main.py`, `map-frame.ts`: optional project-authorised, read-only georeferenced scene response. Existing response remains backwards-compatible. UTM quantities are unchanged; geographic display uses a local tangent frame with sampled maximum horizontal residual and a 0.05 m refusal threshold. Backend projection/datum/geometry constraints remain authoritative.
- `building-context.ts`, `DrawingMap.tsx`: sourced local Polygon/MultiPolygon GeoJSON imports, bounded file/features/vertices, WGS84/ring checks, local extent filtering, unknown-height flat rendering, explicit provider-layer replacement and clear/revert. No implicit saving, project-object creation or shade input. Dataset attribution remains displayed. The overlay is tab-local, not a persisted database feature.
- [Usage and primary resources](../../geographic-studio.md): MapLibre custom layers/projection API, Three.js map example, Overture buildings/schema/download documentation. Existing dependencies reused; no paid service, new application dependency, hosted import service or global download.

## Actual checks

- Frontend unit suite: **57 passed in 20 files**. New tests cover coordinate axes/grid convergence, inverse projection rays, source/CRS/size/extent rejection and unknown heights.
- Frontend lint, TypeScript and production build passed after fixing a render-time ref assignment. Existing >500 kB bundle warnings remain.
- Backend focused spatial suite: **15 passed**. Exact projection comparison, excessive-distortion rejection, unchanged quantity geometry, immutable inputs, project isolation and no saved revision verified.
- Backend Ruff check/format passed after adding explicit strict zip parameters. Full backend suite: **285 passed**, with the existing Starlette/httpx deprecation warning.
- Offline/local PostGIS geographic browser case passed: actual map canvas terrain stroke, object ground movement, undo/redo, save/reload, independent options, stroke cancellation, navigation without editing and stable quantities.
- Live OpenFreeMap run: **2 passed** (geographic editor and studio shell). Inspected actual map canvas showing design terrain over streets/context buildings. Supplemental file import reports known/unknown heights, reverts to provider, and leaves the real workspace unsaved. Provider POI sprite/road-shield warnings remain external limitations, not scene failure.
- Final combined local browser run: **4 passed** (local terrain editor, geographic editor, shared-canvas conflict/context-loss, unavailable-WebGL numeric-save fallback). A subsequent focused geographic run passed after ensuring the render marker is cleared on context loss; restoration therefore waits for an actual new custom-layer render. MapLibre reports that custom layers require manual restoration, which the adapter performs.
- Browser fixtures use local PostGIS and fixture authentication. Real Supabase Auth/Storage, physical devices, assistive technology and customer acceptance were not rerun or claimed.

## Limits retained honestly

This resolves the separate-scene requirement for supported site frames. It does not promise complete building coverage or surveyed heights. Additional Overture data can still lack buildings/heights; neither footprints nor missing heights are fabricated. Geographic rendering supports Mercator, not globe projection. Terrain elevation is relative to the declared starting surface, without vertical-datum conversion or DEM import. The 0.05 m display check is sampled, not a survey-accuracy guarantee.

L04 remains Partial for broader terrain-draped boundary/target/reference/context parity and unaccepted interaction requirements. Provider buildings are not fitted to proposed terrain. Terrain-aware shade, hydrology, cut/fill and full engineering acceptance remain excluded. Existing flat-ground analysis gates remain active.

Canonical updates: L02/L04/L06/L07; TRK-L04-010/012/021 reviewed; new derived TRK-L04-027–029 and TRK-L02-008. No Excel export, push or deployment.
