# Explorer site-shape selection

User-requested L02 refinement with a narrow L04 locator handoff, 11 November 2026.

Choose **Select site on map** to open top-down shape controls at the location currently being viewed. A fresh rectangle starts inside the visible map, clear of the selection controls, using the current zoom rather than the original search extent. Opening or resizing the editor does not automatically frame the selection. An already applied outline reopens with its exact geometry. Rectangle and Ellipse use the current draft extent; Custom polygon accepts up to 64 corners followed by Finish polygon. Drag the centre to move, the round-arrow handle to rotate, preset resize handles to scale, or polygon corners to edit. Arrow keys adjust focused handles. Positive numeric rotation is counterclockwise; resizing is a percentage of the current shape. Move to map centre and Frame selection provide explicit placement/view controls.

Undo/Redo retains up to 50 operations. Reset restores the draft created when the editor opened, including its viewed location; Apply accepts the draft; Cancel keeps the previous site. Selection does not save a project. Applying coordinates, a search result or the current map view replaces an outline with a rectangle; the UI warns about this when an outline is present.

`Site.outline` is an optional WGS84 GeoJSON Polygon: one closed exterior ring, 3–64 vertices, no holes or multipart geometry. Ellipses use 48 segments. Existing limits remain: finite longitude/latitude within ±180/±85, no antimeridian crossing, maximum 0.2-degree extent. Backend Shapely validation rejects crossing/degenerate rings and mismatched bounding envelopes. Existing JSONB storage, grants and optimistic revisions are reused; legacy bounds-only projects remain valid. No database migration or new production dependency.

Rotation/scaling use Mercator display coordinates, not surveyed metric quantities. Project creation/reload and the read-only site map retain the outline. Start from selected locator copies it into the workspace draft with estimated/unverified provenance; explicit backend-validated Save is still required. Existing projected-CRS quantity rules and workspace-envelope checks remain authoritative. The locator does not add a new exclusion polygon for all future edits.

Reopening an applied outline exposes it as a polygon: geometry is retained, not preset identity. Physical touch, screen readers, browser matrix, field/pilot accuracy and usability acceptance remain pending. No field-accuracy or global provider-coverage claim.

Resources: existing [MapLibre Marker API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Marker/) for drag handles and [Shapely validity predicates](https://shapely.readthedocs.io/en/stable/reference/shapely.is_valid.html) for server topology. See [verification evidence](tracking/evidence/site-selection-2026-11-11.md).
