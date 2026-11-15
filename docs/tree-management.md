# Site tree inventory and map context

Scope: L02 explorer, L04 project editing, and the L11 boundary between visualization and analytical shade. User-authorized extension, 12 November 2026. Existing feature IDs and broader acceptance gates remain unchanged.

## Architecture decision

The initial tree-inventory checkpoint retained MapLibre/OpenFreeMap/Photon. The user's subsequent explicit Mapbox replacement request supersedes that renderer decision: the map now uses Mapbox GL JS/Standard with satellite imagery, native 3D context, solar lighting and the same project inventory. Photon remains the separate search service. See [Mapbox contract](mapbox-migration.md) for configuration, provider limits and evidence. This renderer change does not establish reliable individual tree records from basemap scenery.

The implementation separates four things:

1. Provider buildings/land cover and optional elevation terrain are visual context, with existing source/coverage labels.
2. Explicitly loaded OSM tree nodes or imported tree GeoJSON are temporary source context. Context can be switched off independently of project trees. The same identity is suppressed in context after inclusion, so proposed removal cannot reappear underneath as a contextual tree.
3. Included or manually entered trees become project records only through Apply to the new-project draft / Create project, or Save project tree decisions for an existing project. They are not workspace planting quantities, licensed Object Palette instances or surveyed boundaries.
4. Tree models and shadows are illustrative. Site inventories do not enter the L11 analytical solver, estimates or issued quantities.

Relevant inspected flows: `SiteMap`, `SiteSelectionEditor`, `ExploreWorkspace`, `ExploreSun`, `MapEnvironment`, `DrawingMap`, `GeometryWorkspace`, `StudioShell`, `ObjectScene`, `ObjectPalette`, frontend project schemas/API/DemoStore and backend schemas/projects/workspace/shade studies. Feature specifications and validation contracts take precedence over visual appearance.

## Workflow and persistence

Explore → Review site trees exposes source lookup/import, inclusion, manual record entry or map placement. The accepted site outline (otherwise its bounds) determines the review subset. Panning remains available; clicking Select site on map keeps the current view. Locator Apply/Cancel and explicit workspace-boundary initialization retain their existing meaning.

In saved projects, Ground Studio → Site trees provides the same inventory with explicit project save/reload. Retain/remove changes preserve identity, attributes and provenance. Bulk actions affect only trees inside the locator; records outside a changed site remain in the inventory and are listed separately. Undo/redo applies to the current tree draft, not backend revision history. Saving creates a project revision; project history/restore includes tree records. Tree saves are separate from Save workspace.

The `Site.trees` contract lives in existing project JSONB and project revision payloads; no database migration or new write endpoint is needed. The existing `edit_project` authorization and atomic expected-revision predicate remain authoritative. Legacy locator-only updates preserve trees when the field is omitted. Explicit empty arrays remain valid. Stale/conflicting/network saves leave the current draft intact. Reload requires confirmation before discarding a dirty tree draft. Pending tree edits participate in existing unsaved-navigation warnings; they are held in memory, not the geometry editor's session draft recovery store. Explicitly applied explorer trees are scoped to the active user/organisation/demo identity.

Records have stable IDs, name, WGS84 longitude/latitude, retained/proposed-removal status, origin, source, attribution, optional source identity, species, form, height, crown diameter, dimension basis, uncertainty and removal reason. Unknown dimensions remain null. Any supplied dimension requires a source or explicit assumption. Maximum 500 records; finite coordinates and bounded dimensions are validated in frontend and backend. Changed source records are not refreshed silently on reimport: existing IDs and decisions are preserved.

## Tree data

Manual lookup reads only `natural=tree` nodes from Overpass inside the site envelope, then filters the review by the locator polygon. It is never an automatic global inventory. The UI discloses that the site's bounds are sent to the configured service. No account, project name or project text is sent. Default public endpoint: `https://overpass-api.de/api/interpreter`; optional browser-safe `VITE_TREE_OVERPASS_URL=offline` disables it. A self-hosted/approved compatible endpoint can be configured without changing the renderer.

Public-service protection: explicit request, maximum 0.02° envelope per axis, 15-second server/20-second client timeout, 501-node sentinel (500 displayed, partial status), 2 MB streamed response limit, cancellation on site change/unmount, 30-second client cooldown and eight-entry/five-minute in-memory cache. These browser limits are not an organisation-wide quota. High-volume use requires a suitable service arrangement; no new one is provisioned here. Provider errors/timeouts retain the preceding context and local draft.

OSM attribution is retained on each included record and escaped before display in the map attribution control. ODbL obligations remain applicable to source/derived databases; loading OSM does not make it a surveyed inventory. See [OSM tree mapping](https://wiki.openstreetmap.org/wiki/Tree), [Overpass public-instance information](https://wiki.openstreetmap.org/wiki/Overpass_API), [shared-resource guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) and [OSM copyright/licence](https://www.openstreetmap.org/copyright). Coverage, dimensions and species are often incomplete. Zero results means no records returned, not no real trees.

GeoJSON import requires a user-entered dataset source and permission/licence attribution. Supported input is a WGS84 Point FeatureCollection, up to 500 features / 2 MB; no projected coordinates or arbitrary geometry are inferred. Optional properties: `name`, `species`, `height_m`/`height`, `crown_diameter_m`/`diameter_crown`, `form`, `dimensions_source`, `uncertainty`. Forms: broadleaf/conifer/palm/unknown. Explicit feature IDs combined with the dataset name generate stable hashed project IDs; without an ID, coordinates form the identity. Duplicate identities reject the import. Changing an ID-less feature's coordinates creates a new identity. Unreadable dimensions remain unknown. The import does not detect trees from imagery or verify the supplied licence.

## Rendering and analysis limits

Trees with both height and crown diameter render as instanced, simplified Three.js trunks/crowns sharing the MapLibre camera. Unknown trees stay point markers; removed trees stay red markers without crowns. Context trees and project trees have separate visibility switches. No inferred species/height is persisted. Terrain elevation is sampled only for display, never survey or quantities. The geographic transfer CRS is EPSG:4326; display offsets use MapLibre's local Mercator metre scale. This is not a metric survey or analytical quantity calculation; existing backend quantities retain their declared projected CRS.

Sun context reuses the existing stateless solar service and explicit local clock/offset. The optional tree shadow overlay is a solid ellipsoid silhouette on flat ground using declared height/crown diameter and documented approximate proportions. It stops below 5° solar elevation, with unavailable solar data, or with elevation terrain enabled. No porosity, seasonality, species calibration, terrain occlusion or field accuracy is modeled. L11 tree-crown exclusions remain in force. Tree edits increment project revision and thus leave prior analytical results subject to existing stale checks; this does not imply that those analyses included the trees.

Map layers now offers opt-in Mapbox Terrain DEM using the configured public token, plus optional operator DEM overrides: `VITE_TERRAIN_TILE_URL`, `VITE_TERRAIN_ATTRIBUTION`, and `VITE_TERRAIN_ENCODING` (`mapbox` or `terrarium`). Mapbox's inherited default terrain is explicitly disabled until elevation is selected. Resolution/datum/coverage require review. Concept editing pauses elevation context to preserve the declared local concept frame. Satellite imagery is supplied by Mapbox alongside Standard's native 3D context; it does not create inventory records. Provider availability remains separate from software checks.

Keyboard/native controls, source lists, numeric edits and explicit saves remain available without basemap tiles. Reduced-motion tree location changes have zero camera duration. WebGL interruption reports a limitation and retains draft records; restoration reattaches overlays. Context rendering is not acceptance evidence for real-world coverage or shade.

Verification and remaining gates: [12 November evidence](tracking/evidence/tree-management-2026-11-12.md).
