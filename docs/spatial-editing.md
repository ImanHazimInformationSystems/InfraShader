# L04 spatial editing toolkit

## Connected workflow checkpoint — 12 November 2026

Open **Design workspace → L04**, choose an authorised saved project and select **Open spatial editor**. This entry opens the existing Ground Studio Layout tools; it has no illustrative preview form. Browser Demo explicitly offers limited local drawing, while backend spatial validation and persistence require sign-in. Existing project routes remain available.

Project readers can switch Baseline/A/B, inspect item properties, toggle view layers and switch between the map and concept 3D canvas. Mutation fields, spatial operations, save and restore remain disabled without the geometry grant; the backend independently denies those writes. Inspection is not an edit or a new revision.

The project-authorised read-only spatial-scene response now includes validated metric boundary and stable-ID target geometry. Both geographic and local 3D scenes show selectable target outlines and a maroon site outline. Outlines sample the scenario's concept terrain and participate in camera fitting; layer visibility remains view-only. Work/building/canopy and category visibility also apply to the 3D scene. Calibrated reference images and constraint overlays still require the 2D plan; this is not full 3D layer or terrain-surface parity.

Baseline delete, split, merge and cutout now remove consumed inherited IDs from both option preview results before validation, preserving independent proposed work. Existing workspace saves, quantity methods/CRS, sourced rates, revision conflicts, retained history and issued output paths are reused. No new endpoint, database migration, quantity method or export schema is introduced.

See [current checks and remaining gates](tracking/evidence/l04-connected-2026-11-12.md). L04 remains Partial for the wider integration contract; customer acceptance is Pending. Earlier dated checkpoints below are historical.

Implementation checkpoint: 1 November 2026. Local branch `build/l07-object-palette`.

## Using the tools

Open a real local Studio project, open **Geometry workspace**, choose the owning scenario, then expand **Spatial editing tools**. Browser Demo does not simulate server geometry validation.

- Select work items using checkboxes or Shift-click on the map. Selected lines are thicker and selected point markers have a gold border. Search matches name, category and group; Select matching selects the filtered list. Inspect opens the existing item inspector. Inherited items must be changed in Baseline.
- Move by east/north metres, rotate clockwise about the selection bounding-box centre, or resize one ordinary geometry to grid-aligned width/depth. Presets retain their asset-specific scale limits and inspector. A linear array creates 1–30 additional copies at multiples of the entered offset. Total scenario capacity remains 150 items, including inherited items.
- Align to the westmost/southmost selected centroid or distribute centroids evenly while preserving the extreme centres. Operations move geometry; they do not establish non-overlap or constructability.
- Snap centres to an explicit metric grid (UTM origin, spacing greater than zero and up to 100 m). Drawing has independent optional 12-pixel vertex and edge acquisition. Screen snapping is not survey precision or a persistent topology constraint.
- Fix current grid dimensions records width/depth and rejects later geometry exceeding a 1 mm software tolerance. Translation remains possible; rotations/resizing that change grid dimensions require releasing the constraint. It is not a general CAD constraint solver.
- Assign a named group or category layer; select a named group to operate on its members. A group label does not silently add other objects to the selection. Hide/show keeps quantities and prices. Lock/unlock prevents accidental toolkit edits; locks are not security permissions.
- Remember a named selection in the current browser, scoped to account/project/scenario. Recall ignores deleted IDs. These are private browser preferences, not collaborative project views; browser data clearing removes them. Storage failure retains the current in-memory selection and displays an error.
- Split an ordinary area/path with a straight line through its bounding centre plus offsets. At zero degrees the line runs east–west; positive angles rotate clockwise. Parts receive new IDs. Merge compatible connected areas/paths into the first selected ID. Disconnected results are rejected, never silently repaired.
- Cut out: select an outer work area first, then an inner area. The inner item is consumed; the first retains its ID/rate. At most eight holes and 128 aggregate vertices are supported. Cutouts render on the map and use even-odd paths in proposal schematics. Numeric polygon rings are separated by a blank line. Hole geometry uses the numeric editor rather than Terra Draw, to avoid silently dropping rings.
- Split/merge/cutout reject quantity overrides and bound plant/material schedules: these business bindings need deliberate reassignment. Merge additionally requires matching kind, rate, source, provenance, layer, status, pricing status, group and visibility. Review source suitability after a design change.
- **Apply spatial operation** validates the complete input and output through the backend and applies one workspace undo step. Failure retains the previous draft. The expandable quantity-impact table records before/after values at that operation; later edits or undo may supersede it. Save a revision and rerun estimates/analysis before issue. Existing revision conflicts, history restore and stale-result safeguards remain in effect.

## Technology and sources

No new production dependency. Existing pinned MapLibre/Terra Draw supplies the 2D editing surface, React/TypeScript the controls, and PyProj/Shapely the authoritative geometry operations. FastAPI project grants protect the endpoint; normal workspace saves persist PostgreSQL/PostGIS revisions.

- [MapLibre projection and rendered feature APIs](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/): screen-space snap acquisition and selection.
- [Shapely manual](https://shapely.readthedocs.io/en/stable/manual.html): affine transforms, validated polygons, union, difference and split. No automatic geometry repair.
- [PyProj Transformer](https://pyproj4.github.io/pyproj/stable/api/transformer.html): explicit longitude/latitude axis order (`always_xy`) and the site's validated UTM frame. Geographic degrees are never treated as metres.
- Existing resource references R04/R05/R06/R11 remain in the canonical resource register. References do not authorise paid services or dependency upgrades.

## Scope and acceptance boundaries

The toolkit implements a bounded CORE/NEXT editing slice. General CAD constraints, arbitrary multipart geometry, curved cutting tools, courtyard building shade and unlimited arrays are not provided. Site boundaries and shade targets still use one exterior; holes are allowed for ordinary work areas only. Flat-ground shade limitations remain unchanged.

The wider proposed L02/L04/L06/L07 **single map-embedded terrain/object renderer** is still unfinished. The current synchronized map and Three.js terrain/preset scene remain separate. This checkpoint does not close that integration contract or claim physical-device, field, accessibility, customer or production acceptance. L04 remains Partial while that wider tracked interaction and verification remain open.

See [evidence](tracking/evidence/l04-spatial-2026-11-01.md), [feature status](features/L04.md), and [canonical tracker maintenance](tracking/README.md). No Excel export was generated.


## Shared canvas checkpoint - 4 November 2026

Use **2D site plan** / **3D design scene** above the primary canvas. Work-item selection stays connected to the inspector; the 3D scene includes validated metric ordinary geometry, terrain and admitted presets. **Fit / retry 3D scene** resets the view and retries context creation. Numeric editing remains usable without WebGL. Inspector coordinates follow validated edits/undo, and deletion clears its selection. General point symbols are geometry markers; unknown polygon heights stay flat.

The canvas switches renderers; it is not a simultaneous basemap/terrain overlay. Boundary/target/reference/constraint parity in 3D remains unfinished, so L04 remains Partial for the wider integration. See [current evidence](tracking/evidence/l04-canvas-2026-11-04.md).
