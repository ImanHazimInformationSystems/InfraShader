# Studies and Materials simplification — 15 November 2026

Branch `build/l07-object-palette`, working tree (no commits). Local only. Presentation change under S01
(onboarding clarity) with cross-reference to L09/L10 (materials), L13 (BOQ), L14/L15 (rates) and L16 (pricing). No
calculation, pricing or issue rule changed; the backend still owns every number.

## Studies ("Analyze, price and review saved scope")

The panel was one long page. It now shows one step at a time, with every step kept mounted so unsaved inputs survive
switching: Overview, 1. Prices, 2. Shade (optional), 3. Estimate, 4. Proposal (4. Decision brief for owner projects).
The Overview states in plain words what to do next (save first, price N items, calculate, review and issue, nothing
left), items priced N of M, the estimate total and whether it is current, and the issued version and whether the
design changed since. `apps/web/src/domain/studies-guide.ts` derives this read-only from saved records; it never
picks records by list order (records created together can share a timestamp). "Review estimate" buttons in the
studio open the Estimate step. The review record form (ReviewPanel) now sits at the top of step 4.

## Materials ("Planting and materials")

Plain-language lede and a three-step help strip; code labels removed from the visible title; rate search folded into
"Find other component rates"; quantity list (BOQ) styled, rounded for display only (saved values unchanged), first 15
lines with "Show all N lines", and "what changed" kept with it. The `Planting and materials` group name and all field
labels are unchanged.

## Bug found and fixed

Issued snapshots with fixed-price or count-only lines have `geometry: null`; the web schema rejected it, so the whole
Studies panel failed to load ("The API returned an unexpected response") for any project with such a proposal. Fixed
in `apps/web/src/domain/calculations.ts` (nullish geometry) with a regression test.

## Checks

| Check | Result |
| --- | --- |
| Web unit tests (upper-case `C:` cwd) | 37 files, 110 passed (new: studies-guide, calculations scope row) |
| Web lint / typecheck / build | clean |
| Integration browser, full suite | 14/15, project-hub intermittent passed on immediate rerun; new `studies-guide.spec.mjs` passed |
| Reference specs (proposal, schedules, proposed-trees) | passed, using a temporary corrected config; the stored reference config's web-server command is invalid from its working directory (existing issue, not fixed) |
| Reference roads spec | Studies/estimate part passed; fails later at a phone-viewport "Layout" button (stale selector, existing) |

Specs updated for the new step navigation (no assertion weakened): workflow, spatial, catalogue, proposal; scenario
"A" selector disambiguated in proposal, roads, schedules.

## Not claimed

Presentation only; no user testing of the new Studies/Materials layout; Browser Demo unchanged.
