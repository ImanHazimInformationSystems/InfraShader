# Unified Design Studio interaction specification

Defined 29 October 2026 for the user's L04 audit request. This is a proposed interaction contract, not implemented behaviour or permission to build the entire backlog. Existing catalogue scope/IDs remain controlling. Tracking IDs below are new, derived requirements requiring review.

## Current state

1 November update: [spatial toolkit](spatial-editing.md) adds the bounded general editing operations. The historical audit below is not a current missing-tools inventory. The single map-embedded renderer and wider integration acceptance remain open.

29 October integration update: [editor guide](studio-editor.md) and [checkpoint evidence](tracking/evidence/studio-integration-2026-10-29.md) describe implemented scene strokes, object ground movement, shared selection and basic editing refinements. The original proposal below remains the wider target; do not read its full scope as implemented.

Explore uses `ExploreWorkspace` / `SiteMap`; continuing opens project creation with selected bounds. It does not import a complete editable city model. `GeometryWorkspace` owns workspace drafts and revisions. `DrawingMap` handles single geometry selection and Terra Draw edits. `TerrainPanel` edits a bounded height grid in a separate SVG diagram. `ObjectPalette` / `ObjectScene` provide preset placement and a separate Three.js view. These are useful foundations, not one integrated editing surface.

L04 is Partial. See [audit evidence](tracking/evidence/l04-2026-10-29.md). L06/L07 retain their previously implemented limited scopes; that status does not cover this proposed interaction. L02's wider feature remains Not audited; only its transition was inspected here.

## Intended user journey and ownership

1. **Locate (L02):** search or enter coordinates, inspect context and select an extent. Continue into a new project's brief with that extent. Returning to an existing project must not replace its boundary or geometry without an explicit edit. Provider buildings remain labelled context, not quantities or verified building inputs.
2. **Design (L04):** one primary canvas, collapsible layers/library on the left and selected-object properties on the right. Keep scenario, save state, undo/redo and 2D/3D controls available. Returning from a tool must preserve selection and view. The selected extent is a locator until the user confirms a sourced design boundary.
3. **Terrain (L06):** enter a terrain mode in the same canvas. Display source, datum and resolution before editing. Show brush footprint; pointer drag raises/lowers/smooths/flattens the ground with immediate feedback. Numeric controls remain available. One completed drag is one undo action; Escape cancels the uncommitted stroke. Rotation/panning must not sculpt accidentally. Retain the current bounded grid and rectangular concept-pond scope initially; freeform ponds and external elevation import are separate refinements.
4. **Objects (L07):** choose an admitted preset, preview placement on the ground, click to confirm, and move/rotate using scene controls or precise numeric fields. Invalid placement must show why and leave the last valid draft intact. Recompute authoritative footprints and terrain contacts through existing backend validation. Category visibility is a view setting; hiding does not delete or remove quantities.
5. **Review and save (L04/K02):** review affected geometry, schedules and stale analyses; validate and save a new workspace revision. Preview actions are drafts. A server conflict must preserve the local draft and offer reload/reconciliation, never silently overwrite the server.

## State, coordinates and permissions

Use one workspace draft, active scenario and stable selected entity ID across map, terrain, palette and inspector. Keep view state (camera, panel expansion, visible layers) separate from billable/project state. Saved selection means restoring a valid selection for the same project/scenario; the persistence lifetime is unresolved below. Clear selection if its entity is deleted or unavailable.

Transfer geometry as WGS84 longitude/latitude. Use the declared suitable projected CRS for metre-based offsets, snapping and quantities. Align the 3D scene's origin/axes to that same metric frame, with explicit grid-north rotation and terrain datum. The render mesh is not the source of procurement quantities. Do not substitute basemap heights for declared project heights.

Backend project grants remain authoritative. Read-only users can navigate and inspect authorised content but cannot mutate terrain, objects or geometry. Editor locks prevent accidents, not security access. Shared Baseline objects must be edited in Baseline; scenario terrain remains independent. Hide/lock actions must not bypass permissions or exclude costs. No confidential pricing appears merely because a 3D object is selected.

## Acceptance contract (derived — review needed)

| Tracking ID | Related IDs | Observable requirement / proposed check |
|---|---|---|
| TRK-L04-006 | L02; L04 | Continue from a selected extent into a project with the same bounds; switching views preserves project geometry and never imports provider objects silently. Browser test selected bounds and existing-project protection. |
| TRK-L04-007 | L04; L06; L07 | Select an entity in either canvas or list; the same stable ID and scenario appear in the inspector when switching 2D/3D. Test deletion, inherited objects and unavailable WebGL. |
| TRK-L04-008 | L04; L07 | Apply a declared metre-based grid snap or numeric transform; preview and saved backend geometry agree within a specified tolerance. Test negative coordinates, boundary rejection, disabled snap and locked objects. General vertex/edge snapping remains a separate implementation slice. |
| TRK-L04-009 | L04; L06 | A pointer drag is one terrain edit: undo restores all affected nodes, redo restores the stroke, and cancellation leaves nodes unchanged. Pointer navigation cannot alter terrain. |
| TRK-L04-010 | L04; L06; L07 | Changing terrain updates supported object contacts in the same scene and on save/reload; retain visible warnings for representative-point contact and unsupported terrain shade. Test terrain reset and independent options. |
| TRK-L04-011 | L04; L07 | Hidden items remain in saved quantities; locked entities reject editor transforms; read-only users cannot save. Test view toggles separately from deletion and server grants. |
| TRK-L04-012 | L02; L04; L06; L07 | A provider or WebGL failure leaves a usable 2D/numeric path and preserves the draft. Show context unavailable rather than a misleading empty successful scene. |
| TRK-L04-013 | L04; K02 | Saving creates a new revision; stale conflicts retain the draft; restoring history creates another revision and marks dependent results stale. Test concurrent changes and undo before/after save. |

These rows were initially Not run / Not assessed. Current results are maintained in the canonical acceptance register: TRK-L04-009 now has passed synthetic checks with acceptance pending; the remaining cross-feature rows retain their wider unverified scope. They do not replace the original TRK-L04-001 through 005, which bundle broader CORE/NEXT scope. Passing a limited preset test cannot close a general geometry requirement.

## Implementation sequence and boundaries

First complete L04's core selection, numeric editing, basic duplication, undo and supported snapping, documenting exactly which entity types each operation supports. Next share selection/view state and the scene coordinate frame across L02/L04/L06/L07. Then add direct terrain strokes and supported object placement/transform interactions. Finally exercise the combined save/reload/conflict/fallback path.

Advanced polygon holes/split/merge, arbitrary batch arrays, a large asset library, GLB imports, DEM ingestion, freeform pond outlines, cut/fill, hydrology and terrain-aware shade are not implied by this interaction definition. They remain separately scoped/gated. L10 materials remains an unfinished separate request; no L10 application work is performed by this audit.

## Decisions still required before implementation acceptance

- Selection/view persistence: session only, per-user saved preference, or shared project view? Recommend per-user state; not yet confirmed.
- Specify supported snap targets, screen-space acquisition radius and metric numerical tolerance using representative sites. Grid snapping and vertex snapping are distinct.
- Agree desktop/touch navigation gestures, keyboard equivalents, device matrix and a measured interaction-performance target; no invented frame-rate guarantee.
- Choose a map-aligned Three.js layer versus a synchronized scene after a bounded alignment/performance experiment. Existing separate scenes do not settle this choice.
- Continuous terrain strokes need interpolation and event-rate-independent strength; current strength-per-click must not be silently multiplied by browser event frequency.
- Representative site/user acceptance and field accuracy remain separate from synthetic software checks.


## 4 November 2026 implementation update

The primary canvas now switches between the existing MapLibre plan and the Three.js metric design scene, with shared work-item selection, general geometry, terrain/presets and preserved view. This advances the proposed interaction without resolving the full map-embedded/context-layer parity requirement. Existing 2D-only reference, boundary, target and constraint layers are not silently described as 3D implementations. L02 KEEP scope was audited on 4 November; its historical Not audited statement above is superseded by the canonical register. See [L04 evidence](tracking/evidence/l04-canvas-2026-11-04.md).
