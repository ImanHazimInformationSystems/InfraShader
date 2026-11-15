# Pricing home: simpler Design Studio pricing and estimating (15 November 2026)

Affected features: L13 (primary), L14, L16, L09, L10, L31, L04, K04, S01. K02 and K05 behaviour is unchanged: stale terrain work and change impact remain visible as before. L24 issue readiness is unchanged and is reached through Studies. L06 terrain quantities are unchanged; terrain site-work items appear in Pricing under "Site work" with their existing stale state.

## What was observed before the change

The code was traced before editing:

- **Trees** were priced in Trees → *Tree specification & cost* (`ProposedTrees.tsx`). That panel saves through `POST /spatial-edit` with `operation: tree`, which requires a per-item rate of the project basis, plus `internal_pricing` when a cost rate changes. `WorkItem` validation rejects a tree with a rate but no `stock_spec` or `rate_reviewed`.
- **Other items** were priced in Studies → Prices as a long list of `<select>`s. Trees were disabled there, with a pointer to Trees. Component-priced recipes were left out, and their layer rates were set in Materials (`PlantMaterialPanel`).
- **Why the split existed:** the tree path carries the stock and review requirement and its own endpoint guard. Generic items only set `rate_id` in the draft.
- **Quantities and line totals** already came from the backend (`schedules.derive`, `price_rows`), but were only visible in the Materials BOQ and the Trees list.
- **Rates** recorded supplier and source only as free-text `source_note`.

## What changed

**Backend**

- `apps/api/app/schedules.py`:
  - `price_rows()` is now shared with `schedule_report`. Each row gains `state` (`priced`, `needs_price`, `unit_mismatch`, `wrong_basis`, `recipe_not_approved`, `stale`, `restricted` or `existing`), `review` (expired, unknown validity, not yet effective or archived rate) and `unit_price`. The existing `status` strings are unchanged.
  - `item_subtotals()` sums an item's lines with Decimal. It returns null while any line is unpriced or hidden.
  - `row_summary()` reports `complete` only when every proposed line is priced. Its `priced_subtotal` is null for roles that cannot see costs.
- `POST /projects/{id}/pricing-preview?scenario=` (`main.py`, `schedules.pricing_preview`) prices an **unsaved draft**:
  - it runs the same `validate_workspace` as a save;
  - it reads saved rate versions for the organisation only;
  - it is open to project readers, while costs stay behind `internal_pricing`;
  - it returns validated quantities and layer schedules, so explanations match the priced numbers;
  - it never persists anything.
- Migration `0020_rate_supplier.py` and `CatalogueRate` add:
  - `source_type`: `user_entered`, `supplier_quote`, `price_list` or `past_project`;
  - `supplier_name`, `quote_reference` and `exclusions`;
  - database check constraints, and matching `RateInput` validation (a quotation or price list needs a supplier; a quotation needs a reference).
  Existing versions default to `user_entered` and nothing is inferred from old notes. `visible_rate` hides the supplier name (shown as "Restricted supplier") and the quotation reference from roles without internal pricing. New versions never rewrite earlier ones.
- Issued proposals still contain no rate dictionaries; their contract is unchanged. Estimate payloads store the new rate keys for new estimates only. Earlier artifacts are untouched.

**Frontend**

- A new **Pricing** dock tool (`StudioShell.tsx`, `PricingBoard.tsx`, `pricing.css`, `domain/pricing.ts`):
  - an Option A/B switch;
  - a summary of items priced, the direct cost so far and how many need review. An incomplete figure is labelled "Incomplete: N lines not priced. This is not a total.";
  - item cards grouped by category, each with a status chip, quantity, rate source and API subtotal;
  - a Map action that selects and frames the item;
  - filters, and undo of the last draft change.
- **Price this item** (native modal `<dialog>`):
  - **Trees:** a stock specification plus an explicit "I checked that this rate is for the stock described above" confirmation, which resets whenever the rate or the stock changes.
  - **Rates:** only compatible saved rates are offered (same unit and project basis, not archived). Each shows its source type, supplier, quotation reference, validity, inclusions and exclusions, and "Already used for …" for reuse.
  - **Planting:** the count method is described in plain words, with a note that it is not a planting layout or horticultural advice.
  - **Layered paths and roads:** each layer shows "Area × thickness = m³" with its own rate and API subtotal. An unapproved recipe links to Materials.
  - **New rates:** a new-rate form records the supplier details.
  - **Subtotal:** shown for the *pending* choice from the server preview.
  - **Apply to draft** goes through the existing `change()` draft, undo and expected-revision save.
- **Bulk apply:** a Carbon-style batch bar ("N selected · Apply one rate… · Clear selection"), then a review dialog of items that will change and items skipped, with reasons:
  - existing site item;
  - locked;
  - priced layer by layer;
  - unit mismatch;
  - no measured quantity;
  - tree without, or with different, purchased stock.
  Trees need explicit confirmation naming the stock.
- **Entry points:**
  - a floating selected-item card on the map ("Price this item");
  - a **Price** button in the Layout item list;
  - **Open in Pricing** in Trees;
  - **Open Pricing** in Studies → Prices.

  Existing detailed controls (Trees specification, Studies rate list, Materials recipes) remain.
- Studies' rate form gains the same supplier fields. The product catalogue entries for L13 and L14 now open the Pricing tool.

## Checks actually run (15 November 2026, local Windows host)

| Check | Result |
|---|---|
| `npm run lint` and `npm run typecheck` | Clean |
| `npm test` (Vitest) | 38 files, 115 tests passed. Includes the new `src/domain/pricing.test.ts` (5 tests): compatibility, reuse, bulk skips (existing, locked, layered, unit, stock), tree confirmation, Option B isolation, states and explanations |
| `npm run build` | Built; only the existing chunk-size warning |
| `.\scripts\api.ps1 lint` (Ruff check and format) | Clean |
| `.\scripts\api.ps1 test -q` | 370 passed. Includes the new `tests/test_pricing_home.py` (4 tests): supplier validation, restricted supplier details and versioning, draft preview not persisted, Option B isolation, subtotals and measures, unit mismatch, expired rate review, unapproved recipe, restricted totals, foreign user rejected |
| Integration browser, full suite (`playwright.integration.config.mjs`, ports 8130/5174, disposable PostGIS schema migrated to head including 0020) | 16 of 16 passed, including the new `pricing-home.spec.mjs` |
| `pricing-home.spec.mjs` and `studies-guide.spec.mjs`, rerun after the final rate-loading fix | 2 of 2 passed |
| Reference browser (temporary wrapper config, deleted): proposed-trees, town-layout, proposal, schedules | 4 passed |
| Reference browser: studio-shell | **Failed twice, unrelated.** The spec waits for a home-page "Change workspace" control that the current home page no longer has (screenshot shows the breadcrumb organisation menu). Not changed here |
| `python scripts/ui-catalogue.py` and `--check` | Validated |

The browser spec creates its own project through the API. It uses fictional rates (bench supplier quotation, tree, premix m³) and a site with one existing tree, two benches, two same-stock trees, a palm with different stock, a shrub bed (square spacing) and a two-layer driveway. In the browser it:

1. selects Bench 1 in Layout, then uses the map card's "Price this item";
2. checks the m³ rate is not offered for a bench;
3. checks the supplier-quotation source line and the server subtotal "RM 850.00 = 1 each × RM 850.00";
4. reuses the bench rate ("Already used for Bench 1");
5. bulk-applies the tree rate: Palm is skipped for different stock, and the apply button stays disabled until confirmed;
6. prices both road layers, creating a new supplier price-list m³ rate in the dialog;
7. reads the plain planting count explanation;
8. checks "Incomplete: 2 lines not priced. This is not a total.";
9. saves (revision 2) and verifies the saved items through the API (tree stock and review, palm unpriced, benches share a rate, existing tree unpriced);
10. calculates the estimate through Studies → Estimate. The estimate is incomplete, with Palm and Shrub bed missing, and the saved schedule's priced subtotal equals the estimate's line totals;
11. at 390 px, finds no horizontal overflow, and Escape closes the dialog.

Screenshots in `test-results/pricing-home/` were inspected: board (desktop and narrow), bench dialog, bulk dialog, road-layer dialog (desktop and narrow).

Problems found and fixed during verification:

- the selected card first rendered under the tool dock;
- the preview schema rejected `surface_m2: null`;
- the bulk-confirm checkbox was mis-laid by the global label style;
- the misleading "not in this list" text showed while rates were loading;
- an unavailable assigned rate could be refetched in a loop.

## Not verified and remaining gaps

- **People:** no user, contractor, physical-device, screen-reader or customer acceptance.
- **Demo:** Browser Demo does not show Pricing (it needs the API).
- **Permissions on save:** saving a workspace still does not itself require `internal_pricing` to assign a cost rate. This is existing behaviour. The Pricing UI requires it, and the tree spatial-edit endpoint enforces it.
- **Edit lock:** Pricing is disabled while another tool has an open, unapplied edit. This is coarse but safe.
- **Narrow screens:** "Map" frames the item, but the working panel stays open, so the map is covered.
- **Scope not built:** BOQ export from Pricing, a work-section hierarchy and item codes. The rate list shows up to 100 matches; search narrows it.
- **Supplier records:** user-entered only. There is no contact, quotation file, region, minimum order, lead time, comparison or CSV import, and no live supplier feed or supplier verification.
- **Engineering:** road layer thickness and waste come from the saved recipe. No road standards, densities, compaction or conversion factors were added. Planting counts are nominal spacing estimates.
- **Existing failures and not run:**
  - The reference-browser studio-shell spec fails on the outdated home-page control described above.
  - The roads reference spec was not rerun here. Its phone "Layout" selector failure was recorded on 15 November in the Studies and Materials evidence.
  - The live Mapbox path was not exercised; the browser tests use the offline map style.
