# Geographic terrain and objects

The Ground Studio design scene can now render **inside the geographic map**, using MapLibre's camera and WebGL depth buffer. Terrain strokes, preset objects and supported general work geometry retain the existing backend validation, undo and save paths. A separate local metric view remains available as a fallback, not the required normal workflow.

## Use it

1. Open a Studio project. Prepare and verify its design boundary if it has no workspace yet.
2. Keep **Embed design on map** checked. Choose **Terrain** or **Objects** in the dock, or **3D design scene** above the canvas.
3. Terrain still requires an explicit starting elevation, datum and source/assumption. Create the concept surface in the Terrain panel. It is not an automatically surveyed DEM.
4. Use **Scene tool** to navigate/select, raise, lower, smooth, flatten, or move the selected supported object onto the ground. Release commits one draft operation. Escape cancels an active stroke. Use the existing undo/redo and save controls.
5. **Explore** returns to ordinary map navigation. Turning off **Embed design on map** retains the local metric renderer when geographic alignment or WebGL is unavailable.

## Building coverage fallback

Open **Building coverage & sources** on the site map. Import a local WGS84 GeoJSON FeatureCollection and supply its source/licence attribution. The local extract replaces the provider building overlay while loaded, avoiding duplicate extrusions. It does not alter site boundaries, design objects, quantities, analysis or issued records. Clear it with **Use provider buildings**. This overlay is tab-local and must be reimported after reload.

An open-data source is [Overture Explorer](https://explore.overturemaps.org/), which supports downloading the visible data as GeoJSON. Alternatively, the official [Overture Python client](https://docs.overturemaps.org/getting-data/overturemaps-py/) supports a bounded extract:

```powershell
uvx overturemaps download --bbox=WEST,SOUTH,EAST,NORTH -f geojson --type=building -o buildings.geojson
```

Replace those four values with the selected site's longitude/latitude extent. This is an optional local download command, not a command run automatically by the app. No account, paid provider or production credential is configured here.

Imports are limited to 8 MB, 2,000 features/polygon parts, 100,000 vertices, closed rings and finite WGS84 coordinates. Only nearby polygons are admitted. Numeric heights above zero and no more than 1,000 m render as extrusions; absent/invalid heights stay flat. The file is visual context, not a validated engineering model. Overture's schema makes height optional: an additional dataset cannot guarantee complete real-world heights.

## Resources and implementation choices

| Resource | Use in this implementation |
|---|---|
| [MapLibre CustomLayerInterface](https://maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/) | A `renderingMode: '3d'` layer shares the map's WebGL context and depth buffer. |
| [MapLibre CustomRenderMethodInput](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/CustomRenderMethodInput/) | `defaultProjectionData.mainMatrix` drives the existing Three.js scene. This adapter supports Mercator, not globe projection. |
| [MapLibre Three.js example](https://maplibre.org/maplibre-gl-js/docs/examples/add-3d-tiles-3d-objects-and-models-using-threejs/) | Reference for placing Three content within a map; no additional wrapper or tiles renderer was installed. |
| [Overture buildings guide](https://docs.overturemaps.org/guides/buildings/) | Supplemental footprints combine several sources; building parts and coverage remain conditional. Preserve attribution and source distinctions. |
| [Overture building schema](https://docs.overturemaps.org/schema/reference/buildings/building/) | Optional height/source fields. Missing heights are not guessed. |
| [Overture access quickstart](https://docs.overturemaps.org/getting-data/) | Site-bounded GeoJSON extraction rather than downloading an entire global dataset. |

Existing Three.js, MapLibre, PyProj and PostGIS dependencies are reused. No new application dependencies or hosted services were added.

## Accuracy and supported boundaries

The server validates the workspace and returns a local UTM-to-Mercator display frame. A 17×17 sample of the site envelope checks the tangent-frame approximation against exact PyProj conversions; geographic rendering is refused if the maximum sampled horizontal residual exceeds 0.05 m. This is a display-alignment check, not a survey or guaranteed field accuracy. Quantities continue to use the original projected geometry, never the display approximation.

Scene heights are relative to the terrain's declared starting surface. No vertical-datum conversion or real-world ground-elevation import is implied. Terrain remains a bounded concept heightfield; object contact is representative-point based. The map retains provider context, boundaries, targets and plan overlays, but those 2D overlays are not terrain-draped engineering surfaces. Edited-terrain shade remains blocked. Cut/fill, drainage, terrain-aware shade, complete city coverage, and pilot/physical-device acceptance remain separate work.
