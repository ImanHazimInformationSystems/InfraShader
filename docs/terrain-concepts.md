# L06 / F18: terrain sculpting and concept ponds

## Numerical extension — later 13 November 2026 request

The user asked to overcome the earlier numerical/live-rendering limits. **Terrain → Ground quantities & rain test** now saves clipped TIN cut/fill and pond storage plus a surface-water routing study. Enter rain, duration, infiltration, roughness, sources and optional capacity/inlet-based drains; no drains means a closed site. Review the balance and play saved depth/direction frames. Screening results depend on ground, grid/time step and model assumptions; they are not pipe-network or certified flood design.

**Use supplied existing ground** imports an aligned elevation matrix with source and frame/datum/orientation confirmation. Otherwise quantities reference the declared flat start. Original ground survives edits; erase/reset restore it. In **Site work & preliminary costs**, choose automatic excavation/fill m³ or supplied quantities, then select a compatible sourced rate. The backend calculates volumes; stale changes require review. Soil conversion, productivity and prices are not inferred.

Actual live Mapbox Standard terrain/water rendering was exercised over real tiles, with synthetic ground/storm/rates. Provider tree-model warnings and broader satellite/DEM/device/field gates remain. Exact methods/checks: [ground and water evidence](tracking/evidence/terrain-water-analysis-2026-11-13.md). Sections below describe the initial visual/manual slice and its former exclusions.

## Current town-builder workflow — 13 November 2026

Open **Terrain** in Design Studio. Confirm a sourced or explicitly assumed flat start. Choose Raise hills, Dig, Smooth, Level, Erase or Pond water, with a circular/square brush. Hold and sweep over the site; release stops the stroke and creates one undo action. Raise and Dig stop at the chosen offset from the starting surface. Escape cancels. Explore restores map navigation. Brush size is metres and speed is graphical metres per second, never construction productivity. The site-centre button is a keyboard alternative. Undo/redo, reset and pond removal reuse saved workspace history.

Water is an illustrative horizontal surface inside a lowered round/square area and within the site boundary; dig its bed first, then place water. It does not flow or simulate hydrology. Terrain source remains a bounded 33×33 concept grid in the existing projected frame. Rendering follows the selected site outline; native map/provider elevation is not rewritten. Existing precision/grid controls remain expandable.

**Site work & preliminary costs** records deliberately entered labour, equipment, material or transport quantities, tools and assumptions. Select a compatible sourced rate explicitly; save to refresh backend schedule totals and review the estimate in Studies. Volumes/hours are supplied quantities, not inferred from the sculpture. Changed terrain or ponds makes old work quantities stale until reviewed. Missing work, missing rates and stale records remain visible; no complete estimate is claimed for them. Detailed checks and limits: [current evidence](tracking/evidence/terrain-builder-2026-11-13.md).

The October instructions below retain the precision workflow and its historical limitations. This later request authorizes manual resource costing, while automatic terrain-derived earthworks/pond costing remains unsupported.

The user explicitly requested L06 development on 27 October 2026. This authorises the concept terrain slice; F19/F20 and terrain-aware shade remain separate. No field, drainage or engineering acceptance is implied.

## Use it

The synchronized 3D object scene now also supports continuous terrain strokes with one undo action per release and Escape cancellation. See the [editor guide](studio-editor.md). The numeric/grid route below remains available.

1. Open a saved Studio project and **Geometry workspace**. Select Baseline, Option A or Option B. Each holds its own terrain; sharing Baseline objects does not copy its terrain.
2. Expand **Terrain sculpting and concept ponds · L06**. Declare a vertical datum (an explicitly assumed local datum is allowed), source/assumption and starting elevation. Choose 9, 17 or 33 nodes per side and create the flat surface. The backend derives the projected frame from the site boundary. The panel shows the CRS and actual metre spacing. Browser Demo is excluded.
3. Use Raise, Lower, Smooth or Flatten. Click a grid node or enter a row/column and apply. Radius is in metres; raise/lower strength is metres per stroke. Smooth uses the previous grid's 3-by-3 neighbourhood mean. Flatten uses the numeric elevation. Linear falloff blends toward the brush target. Region operations apply uniformly inside the selected inclusive row/column rectangle.
4. Read elevation colours or switch to slope colours. Contours interpolate triangles from the grid, capped to 20 levels for bounded rendering. These are concept contours. The isometric diagram displays a labelled vertical exaggeration and object contact dots. It is a separate local-frame diagram, not a survey or a terrain-aware MapLibre scene.
5. To add a concept pond, select a non-empty rectangular region, enter its bed elevation, name and horizontal water elevation, then create it. The selected bed is flattened to the entered level; choose a lower level to excavate the concept. Water must remain above every bed node. Remove/recreate a pond to change its outline or water level. At most eight ponds are allowed. Nominal node depths are displayed; they are not volume, drainage or water-retention predictions.
6. **Show original flat surface** provides the before view and disables sculpting. Reset returns the scenario to its declared flat surface and removes ponds. Workspace Undo/Redo retains up to 50 draft actions; **Validate & save workspace** persists the result as a new revision. Existing workspace history restores earlier terrain as a new revision, with the usual stale-write protection. Undo/redo is draft navigation, not an independent remote transaction for every click.
7. Save to calculate ground anchors for new/moved objects. Saved item anchor coordinates are interpolated on the current draft surface during further sculpting. The backend recomputes the saved contact elevations using bilinear interpolation. Contacts use a representative point, not a foundation/footprint-fit model. Height above ground stays unchanged.

## Boundaries and limits

- Grid frames span 1–2000 m per side, at most 33×33 nodes. The backend accepts 5–33 nodes per side and checks the exact projected boundary frame; the UI offers three practical resolutions. Elevations are bounded to -500–9000 m in the declared datum. These are software resource limits, not certified operating ranges.
- The rectangular frame encloses the project boundary. It is not clipped to an irregular legal boundary and does not authorise works outside it. Changing the boundary requires removing/recreating its terrain frame. No external elevation ingestion is included; the explicit flat-start route is supported.
- Heightfields and ponds are private revisioned workspace JSON. Existing project membership plus geometry-edit grants control writes; the backend rejects malformed grids, nonfinite values, mismatched frames and invalid pond regions/levels. The backend owns saved frame validation, anchors and analysis eligibility. Client brushes only prepare drafts.
- Any scenario edited away from its flat start, or containing a pond, blocks all three-scenario flat-ground shade comparisons. Existing shadow overlays are suppressed; MapLibre's flat-ground 3D buildings are disabled for edited terrain. Use the concept diagram to inspect terrain instead. Reset/remove all edited terrain before flat-ground analysis can resume. An unmodified constant-elevation plane remains flat.
- Quantities remain planimetric; terrain edits do not change measured area/length/count or invent a cost. No cut/fill, pond volume, hydrology, water flow, flood, drainage, soil stability, perspective survey conversion or terrain-aware shade is provided.

## Technology and acceptance

React/TypeScript renders the bounded SVG grid, interpolated contours and isometric diagram without adding production dependencies. Python/Pydantic validates inputs; PyProj/Shapely establish the metric frame and contact locations; PostgreSQL/PostGIS persists the existing workspace revision records. This follows the catalogue's permitted synchronized-view approach. Three.js/GDAL are candidate technologies, not evidence of an installed requirement or a reason to introduce unused dependencies.

Synthetic automated checks verify software behaviour. Representative terrain/source rights, independent elevation checks, broader physical-device/accessibility/performance trials, user usability and engineering acceptance remain pending. The feature does not certify a real landscape design. See [checkpoint evidence](tracking/evidence/l06-2026-10-27.md).
