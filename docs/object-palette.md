# L07 / F19: bounded licensed object palette

## 13 November landscape Objects continuation

The current Objects section has simple category cards and click-to-place controls, with the original workflow below retained under **Precision object controls**. Sixteen original MIT primitives now include a shade canopy, garden gazebo, small path lamp and ground lamp in addition to the original twelve definitions. New IDs preserve older asset versions/hashes. Details and actual verification are in [the landscape Objects evidence](tracking/evidence/object-builder-lighting-2026-11-13.md).

Instances save optional per-axis multipliers (0.25–4), tilt/lean (±80°), enabled-light flag and visual brightness (0–2), with backwards-compatible defaults. Uniform size (0.5–2), yaw and lift remain. The backend validates conservative tilted eight-corner footprints and lowest-bound ground contact. These are nominal concept bounds, not foundation/collision or construction fit. A selected transform previews visually; **Apply object changes** runs backend validation, and the workspace still requires saving.

Choose fencing and drag or click two ends for a proposed straight run of 0.6–100 m. The backend derives length in the declared projected CRS and creates one atomic chain of ordinary grouped fence modules, with exact summed nominal metre quantities. Runs start with standard modules; select segments for resize/tilt, or use Precision for whole-group move/rotation. No curved fencing or engineered installation design is supplied. Items and fence segments remain unpriced until compatible source rates are explicitly selected through the existing pricing workflow.

Shared Sun context controls illustrative solid part-bound shadows and warm night lighting. Shadows stop below 5° or with terrain; warm light fades in between sun elevation +6° and -6°. Enabled bulbs glow and show radial flat-ground pools; at most the first eight fixture instances add Three PointLights to objects. Unknown solar data disables illumination. These effects never establish lux, electrical load/safety, solar output, field coverage or analytical shade. Terrain-aware shadow/light-pool projection is excluded.

The following 28 October instructions describe the original bounded palette and its retained precision workflow.

L07 was explicitly requested by the user and continued on 28 October 2026. The implemented slice is twelve original, low-poly concept presets under the repository's existing MIT licence. It is not a manufacturer catalogue or a large detailed model library. F20 imports and other expansions remain separate.

## Use the palette

1. Open a saved Studio project, its Geometry workspace, and Baseline or an option. Expand **Object palette · L07**. Browser Demo does not offer the authenticated palette workflow.
2. Search or filter benches, bins, lighting, toilets, pergolas, solar modules, play equipment, bike racks, planters, paths, fencing or planting. Each card has a thumbnail; the selected preset shows nominal width/height/depth, metre units, ground-centre pivot, permitted uniform scale, licence, source and triangle count.
3. Enter the object name, WGS84 longitude/latitude, clockwise rotation from projected grid north, uniform scale (0.5–2), conceptual elevation offset (-10–10 m), optional metre snapping (0 disables, up to 10 m) and group name. **Place object** validates a draft through the backend. The full rotated footprint must fit inside the site boundary.
4. Select an instance from the palette list or 3D layout to edit it. Use **Apply object changes**. Duplicate, hide/show, lock/unlock and delete are available. Locks prevent accidental editor transforms/deletion and group operations; they are not security permissions. Project grants remain the authority. Shared Baseline objects must be edited in Baseline.
5. Give instances the same group name to translate them in projected metres, rotate about their mean anchor or align their eastings/northings. With no group name, operations affect only the selected instance. Locked or inherited group members reject the operation. Snapping can quantise the result; turn snapping off for exact rigid transforms.
6. **Show 3D object preview and layout** loads the Three.js renderer. Orbit, pan and zoom the nominal preset or scenario layout; click objects to select. Category-layer checkboxes affect the map and 3D view only. Instance visibility is saved but never removes an object from quantities. If WebGL fails or loses context, numeric editing, the instance list and 2D map footprints remain available. Reload to recreate a lost context.
7. Apply operations, then **Validate & save workspace** to persist them. Existing workspace Undo/Redo and revision restoration retain the instance metadata, source, count/unit and rate links. Rates remain assigned through the existing pricing controls. Separate instances represent separate count items; count overrides are rejected. Paths/fences use their transformed nominal centreline length. Other presets count as one item each.

## Frame, terrain and calculation boundary

The backend reconstructs geometry from the admitted preset/version and submitted transform; submitted meshes, geometry or calculated poses are not authoritative. The saved pose includes the preset hash, licence, dimensions, projected CRS, footprint and ground elevation. Snapping uses the projected CRS origin. Flat-ground contact is zero when no terrain grid is present. With L06 terrain, the backend samples the scenario's grid at the anchor and adds the explicit elevation offset. The renderer follows the current terrain draft, while saved anchors are recomputed on save/read/restore.

These are concept contacts, not foundation fitting or terrain collision avoidance. Negative offsets may bury an object and positive offsets may float it. Existing proposed terrain still blocks unsupported flat-ground shade comparisons. Decorative object meshes, including pergolas, trees and solar modules, are excluded from the restricted numerical shade engine. Solar objects have no energy-output claim; play items and toilet modules have no safety, accessibility, sanitary or construction certification. Real dimensions and specifications must be independently verified.

## Sources, licence and reproducibility

`scripts/object-assets.py` authors and regenerates the twelve original primitive definitions and schematic SVG thumbnails. The repository `LICENSE` is MIT; its notice is copied beside the publicly served catalogue. No third-party model pack or remote asset download is required. `apps/api/app/data/catalogue.json` is the admitted canonical data; `apps/web/public/objects/catalogue.json` is its generated identical frontend copy. Mesh parts use X east, Y up, Z south in metres, with the horizontal bounding-box centre at ground zero. Thumbnail boxes illustrate part bounds; the live renderer uses the admitted box, eight-segment cylinder and bounded sphere meshes.

Regenerate with `python scripts/object-assets.py`. Run the Python admission tests and frontend Three mesh-bound tests before admitting changes. Preset IDs/versions and hashes identify source geometry; do not replace an admitted preset in place. Add a new immutable preset ID/version and retain old definitions so saved work remains reproducible. New assets require their own rights, dimensions, pivot and resource review.

Three.js and its types are pinned in the workspace lockfile; the renderer uses the official [WebGLRenderer](https://threejs.org/docs/#api/en/renderers/WebGLRenderer) and [OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls) APIs. Meshes are instanced by preset part; resources and controls are disposed on teardown and frames render only on view/resize changes. The existing 150-work-item scenario cap also bounds this palette. The twelve unique presets total 832 triangles; no individual preset exceeds 256 triangles. Textures, external URLs and uploaded mesh execution are not supported.

## Verification and remaining gates

See [L07 evidence](tracking/evidence/l07-2026-10-28.md) for actual checks and capacity measurements. Automated synthetic checks and desktop/mobile-emulated captures do not establish physical-device/GPU performance, field accuracy, customer usability or engineering acceptance. The source catalogue's large-library deferral remains; L07/F19 here refers to the documented bounded concept preset workflow.
