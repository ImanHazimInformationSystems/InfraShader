# Editing terrain and objects together

**Current geographic integration (8 November 2026):** terrain, presets and supported ordinary work geometry can now render/edit directly on the site map. The instructions below retain the earlier local-scene workflow as a fallback. See [geographic Studio usage and resources](geographic-studio.md) for the default map-embedded workflow. Historical limitations below are superseded only where explicitly covered by that checkpoint.

Terrain integration checkpoint: 29 October 2026. General spatial tools were extended on 1 November 2026; see [current spatial toolkit guide](spatial-editing.md). A synchronized 2D map and project-coordinate 3D scene are used; this is not an imported editable city model.

## Use the editor

1. Open a saved Studio project, then Geometry workspace and the required scenario. Use the 2D map for boundaries and general geometry. Numeric coordinates and the rectangle builder remain available.
2. Enable **Snap drafted coordinates to visible vertices (12 px)** to snap transferred draft coordinates to other visible geometry vertices. Review/apply the coordinate draft, then validate/save. This is vertex acquisition at the current zoom, not edge snapping, surveyed accuracy or a topology constraint. Invalid collapsed/outside geometry is rejected on validation.
3. Use **Duplicate [item]** for ordinary work items; the copy starts at the same coordinates with a new ID. Use the palette's Duplicate object for presets. Quantities and prices are not considered current until validation/calculation. Filter the item list with **Search work items**. Categories provide named view layers; hiding a category never deletes or excludes quantities.
4. In the terrain panel, declare the datum/source and create the bounded surface. Enable **Show 3D object preview and layout** in the object palette. The scenario scene frames the terrain even when no presets exist.
5. Choose **Raise terrain**, **Lower terrain**, **Smooth terrain** or **Flatten terrain** in Scene tool. Set the metre radius, stroke strength and flatten elevation. Move the pointer to see the brush ring, drag to sculpt, release to validate the draft. One release is one workspace undo action. Escape, pointer cancellation or WebGL loss cancels an in-progress stroke. Switch to Navigate / select to orbit and pan. Numeric terrain tools remain the keyboard/fallback route.
6. Place a preset using the existing palette. Select it in the map, scenario scene or palette list; its properties appear in the palette. Selected instances are tinted. To move it on terrain, choose **Move selected object to ground** and click the destination. If the item has a named group, the existing group translation applies; all members must be eligible. Rotation and precise offsets remain numeric. Backend validation rejects out-of-bounds moves; the prior valid draft remains. Inherited Baseline objects must be edited in Baseline. Locks disable transformations.
7. Terrain preview updates visible preset contact heights during a stroke. On release the backend revalidates the entire draft, including pond beds, frames and contacts. Invalid terrain (for example, lifting a pond bed above water) is rejected without replacing the valid draft. Use **Validate & save workspace** to persist a revision; preview is not a save.

## Interaction rules and limits

The stroke applies maximum brush coverage along its path once per node. Repeated stationary pointer events do not repeatedly raise terrain; two separate strokes can accumulate. Splitting a straight stroke into more events produces the same result. Height limits remain -500 to 9000 m in the declared datum.

The scene preserves its camera across tool changes and draft updates while mounted. Camera/selection are not saved collaborative project views. Switching scenarios remounts the palette. The underlying terrain grid remains bounded and rectangular. Existing ponds are still defined in the numeric terrain panel; this checkpoint does not add a pond-water rendering/authoring tool to the 3D scene.

Object contacts use representative points, not a foundation fitted to every corner. Only admitted presets render in this scene; ordinary project building geometry remains on the separate map. Provider imagery/buildings are not converted to verified terrain or quantities. Edited terrain still blocks unsupported flat-ground shade. No cut/fill, hydrology or terrain-aware shade is introduced.

The 1 November toolkit adds general multi-selection, edge snapping, fixed grid dimensions, geometry locks, browser-private named selections and bounded split/merge/cutout/arrays. A single map-embedded 3D renderer, arbitrary CAD constraints and freeform ponds remain outside the implemented subset. L04 remains Partial for the wider interaction contract. See [interaction contract](studio-interaction.md) and canonical feature/acceptance registers for individual coverage.
