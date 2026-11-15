# Mapbox map integration

Authorized replacement of OpenFreeMap/MapLibre, 12 November 2026. Affects L02, L04, L06/L07 display compatibility and L11 visualization boundaries. Existing project, workspace, quantities, estimates, permissions and revision APIs remain authoritative.

## Renderer and content

The application uses pinned Mapbox GL JS 3.34.2, its bundled CSP worker/CSS and Terra Draw's Mapbox adapter 1.5.0. All application map types and custom Three.js layers use Mapbox. Custom layers consume Mapbox's Mercator matrix argument directly; they no longer assume MapLibre's projection-data object. The map explicitly uses Mercator projection so the existing validated geographic display frame and editing rays remain compatible. Quantity coordinates retain their backend-declared projected CRS.

`services/map.ts` loads Mapbox Standard as a style import named `basemap`, enabling native buildings, trees, landmarks and facades. The live Standard Satellite schema checked during development did not expose the same `show3dTrees`/`show3dBuildings` properties, despite the overview documentation describing broader parity. Satellite mode therefore retains Standard's 3D import and adds Mapbox Satellite raster imagery in its `middle` slot, below the tree/building models and labels. This mode supplies satellite imagery, labels and 3D context together. It does not replace the map instance or root project sources. Source attribution and the Mapbox logo remain visible.

Explore and Ground Studio expose Map layers: Standard/Satellite, independent basemap-tree visibility and optional Mapbox elevation terrain. The style preference lasts for the current browser tab. Switching imagery preserves the camera, site locator, authored geometry, tree decisions, custom 3D renderer and editor history. Import reload is used for retry rather than replacing the root style and losing project layers.

`MapTerrainContext` defaults to the configured Mapbox account's Terrain DEM when explicitly enabled. A separately licensed operator DEM remains configurable. Elevation is visual context: resolution, vertical datum and coverage require review. Concept terrain and L11 analytical terrain exclusions remain separate.

Standard's inherited zoom-dependent terrain is explicitly disabled at initialization. Enabling elevation pauses the flat-ground explorer and tree shadow polygons; Mapbox's illustrative lighting remains available. Entering concept-object/terrain editing temporarily pauses elevation context so unknown vertical datums cannot shift the authored scene. Project-tree models resample elevation after DEM tiles arrive.

## Environment and project overlays

Solar position, explicit UTC offset, timeline playback and day events continue through the existing stateless API. `MapEnvironment` sets Mapbox ambient/directional lights and fog from available solar position and simulated cloud cover. Direct visual shadows are disabled when solar position is unavailable, disabled or below the supported daylight threshold. Native light direction uses north-clockwise azimuth and polar angle from zenith. Imported basemap internals and project geometry colours are not rewritten.

The custom weather shader remains a Mapbox custom layer sharing the WebGL context, with preserved state, reduced-motion behavior, pause/visibility handling and context restoration. Rain/cloud effects remain simulated scenarios, not observations or forecasts. Native 3D lighting/shadows and satellite imagery are visual context; none becomes an analytical measurement.

Explorer building-shadow previews query the supported Standard `buildings` featureset. Only exposed visible polygon geometry and supplied heights enter the existing bounded preview service. There is no inspection of private imported source IDs or layers. Missing/unsupported heights and geometry, low sun, unavailable/stale results and coverage limits remain disclosed. The saved-project L11 solver remains unchanged and excludes tree crowns/terrain. Tree status edits still use explicit project saves and stable inventory IDs; Mapbox-rendered trees are independently switchable scenery and cannot silently become those records.

Application-owned site, tree, reference, workspace, scenario and object layers remain root sources/layers. The numeric editor and neutral coordinate canvas remain usable when provider content is disabled, unavailable or unauthorized. Transient style reads are guarded while imports load or maps are disposed; marker roles preserve keyboard access to selection handles.

## Configuration

Set `VITE_MAPBOX_ACCESS_TOKEN` to an authorized public `pk.` token in ignored `apps/web/.env.local`. Never put secret `sk.` or service-role credentials into browser configuration. The provided public token was configured locally; its value is not recorded in source, docs or evidence. For deployment, configure the same public variable through the deployment environment and restrict the token to intended URLs/scopes. No provider account, token creation or deployment is performed by this migration.

`VITE_MAPBOX_OFFLINE=true` explicitly uses the neutral coordinate canvas. Legacy test configurations using `VITE_MAP_STYLE_URL=offline` still select that same fallback; arbitrary legacy map URLs no longer select a different provider. There is no automatic OpenFreeMap fallback. Missing/invalid public tokens and failed style access yield an explanatory fallback. Content errors preserve project drafts and disclose partial context. Mapbox usage follows the user's account and pricing; no cost or capacity guarantee is implied.

Photon remains the separately configured place-search service (`VITE_GEOCODER_URL`); Overpass/manual/GeoJSON tree sources remain separate project-inventory inputs. Replacing the basemap does not invent a complete tree census or make basemap imagery a permitted extraction source. WGS84 remains the transfer format; no money or backend quantity behavior is changed.

## Provider contracts

- [Mapbox Standard and configurations](https://docs.mapbox.com/map-styles/guides/standard-styles/)
- [Standard feature sets](https://docs.mapbox.com/map-styles/reference/standard/)
- [Layer ordering and slots](https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/)
- [Custom Three.js layer matrix](https://docs.mapbox.com/mapbox-gl-js/example/add-3d-model/)
- [3D lighting APIs](https://docs.mapbox.com/mapbox-gl-js/guides/migrate/)

Exact checks, screenshots and remaining acceptance gates are maintained in `docs/tracking/evidence/mapbox-migration-2026-11-12.md`.
