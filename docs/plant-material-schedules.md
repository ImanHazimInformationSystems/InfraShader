# Planting, materials and quantity schedules

Description clarification (12 November 2026): the [measurement and estimating contract](measurement-and-estimating.md) explains how supported paths, paving, fences and plant schedules reach the estimate. A base path uses length; an approved width/height recipe derives surface units. Generic layer volume arithmetic is not a full vehicle-road or terrain-earthworks costing model. Existing tree context, proposed planting counts and analytical shade remain distinct. Follow the [contractor workflow](contractor-workflow.md) for the end-to-end sequence.

Local checkpoint: 30 October 2026. Covers the limited L09 planting workflow and L10 basic approved recipes, connected to K02 change review and the L13 preliminary BOQ. No new production dependency or hosted service is required.

## Use it

Open a saved Studio project, choose a scenario in Geometry workspace and expand **Planting, materials and quantities**. Draw the source area/path or add a tree/manual count first. Select it in **Schedule item**.

For planting, enter the scientific/common names, source, nursery size and relevant assumptions. Current and mature crowns are independent descriptive values, not validated tree shade. Choose explicit count, nominal square spacing on an area, or line spacing on a path. Availability date and substitution notes are optional. Existing sourced records in this project's current scenario can be copied through **Reuse project library record**. There is no supplied authoritative species database: suitability, water/sun and maintenance information must come from the user's sources and local horticultural review.

For hardscape, select paving, edging, deck or fence; record material, finish, source, width and height. Add up to twenty components with stable codes. Choose either an inclusive parent rate or component rates. Review the recipe and check its approval box. **Validate and apply source record** prepares a backend-validated draft; **Validate & save workspace** persists it. Unapplied record edits block saving. Shared objects must be edited in Baseline.

Use the existing rate catalogue to create dated versions. Component rate lookup supports search and shows up to 100 matches; narrow the query for other records. The rate unit must match its component. Supported rate units now include cubic metres (`m3`) and hours (`h`) alongside area, length and items. The database already stores rate units as text, so no migration is required. Assigned versions outside a search remain selected; they are not silently replaced.

After saving, inspect the saved preliminary BOQ and change-impact list. **Locate** selects the source work item, even for an expanded recipe line. Export the revision-labelled CSV; it contains stable IDs, parent IDs, quantity, formula, source, specification, rate-version reference, readiness and permitted base amount. If the draft is dirty, the saved table is explicitly stale and export is disabled. Recalculate through the existing estimate panel before issuing anything.

## Calculation contract

- Explicit plants use the declared count. Square-spacing count is `ceil(plan area / spacing²)`. Line-spacing count is `ceil(length / spacing) + 1`, representing both endpoints. Counts are nominal procurement quantities, not generated collision-free plant locations. Maximum one million plants.
- Source area/length comes from the existing projected-CRS geometry kernel. A plant spacing method changes the active billable quantity to items while retaining the original source quantity in its schedule. Quantity overrides must be removed before attaching a source record.
- Polygon hardscape surface equals plan area. A path surface equals length × width, or length × height for a fence. This is not terrain-draped area. Inclusive parent rates remain per original footprint/length unit; component rates use each derived material/labour unit.
- Volume is surface × thickness in millimetres / 1000. Length components require a path; an area polygon's perimeter is not inferred. `per_surface` factors declare component units per m²; fixed factors declare units per source item. Material wastage applies once. Whole component items round up; other quantities retain four decimals.
- Money uses Decimal and line HALF_UP rounding to two decimals. Component quantities already include recipe wastage; the global estimate wastage percentage is not applied a second time to them.
- A recipe is either parent-inclusive or component-priced. Both simultaneously are rejected. A component duplicating another selected rate's included labour/transport/overhead is rejected; equivalent additional estimate charges are also rejected. Missing/invalid rates and unapproved recipes cannot yield a complete estimate.

## Revisions, confidentiality and change impact

Plant/recipe definitions are private per-item snapshots in workspace JSON. The backend increments their version on a saved definition change; workspace history retains earlier definitions. Reusing a library record copies it, so modifying the copy never silently changes other items. These are instance-scoped versions, not an organisation-wide master catalogue.

The report compares saved source items with the latest issued workspace revision, or the previous save when no issue exists. It shows added/changed/removed items, changed input fields, before/after quantities and permitted base-cost differences. It does not predict profit or a new selling price. Geometry, count, plant/assembly, rate selection, status, override and source changes are compared. Existing conservative revision checks invalidate calculations; issued artifacts are not rewritten.

Project read grants protect schedule access. Internal costs and cost differences require the existing internal-pricing capability. Unpriced and restricted values are explicit; they are never displayed as zero. Hidden items remain in quantities. Declared sources are not independently verified merely because they are saved.

## Remaining gates and wider scope

Supplier/field verification, local horticultural suitability, commercial recipe/rate acceptance and pilot usability remain pending. No survival, native-species, drainage, engineering or tree-shade claim is made. Real Supabase Auth/Storage was not rerun for this checkpoint; the browser tests use signed identity and real disposable PostGIS.

Extensive manufacturer assemblies, an organisation-wide species/material master catalogue, generated planting layouts, growth simulation and sophisticated optimisation remain outside the limited CORE scope. L13's broader nested work hierarchy, dedicated inclusions/exclusions and allowance-review workflow remain unfinished. K02's complete all-input dependency/review lifecycle remains Partial; the plant/material quantity connection is implemented. Original feature priorities and staged roadmap remain unchanged.
