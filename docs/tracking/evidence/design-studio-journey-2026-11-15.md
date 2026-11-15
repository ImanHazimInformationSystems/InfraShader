# Design Studio journey simplification (15 November 2026)

Affected features: L01, L03, L04, L11, L13, L14, L24, K04. Statuses are unchanged; this is a navigation and presentation checkpoint over existing connected workflows. Organisation Review (O-series) is unchanged except that it shares the Studio shell code. Its flat tool list, labels and project layout are preserved.

## What was observed before the change

A disposable fixture project (one existing tree; Option A with a bench, a tree and a layered driveway) was walked through in Edge at 1440×900, against the test-only `tests.browser_server` API and local PostGIS:
- **Project page.** About 3,040 px tall. In order: organisation/workspace selectors (already shown in the header and sidebar), the brief checkpoint, duplicate/template, site plan, brief history, project access, brief readiness and the change register. The only route into the map, **Open geometry workspace**, was the last element.
- **Studio dock.** Nine tools of equal weight: Explore, Layout, Trees, Objects, Terrain, Materials, Pricing, Studies, Site records. There was no order or progress.
- **Repeated controls.** The Baseline/Option A/Option B buttons and "Workspace history and restore" appeared at the top of every panel, because they sat outside any tool section. Pricing had its own second option switch.
- **Pricing in four places.** Pricing; Studies → 1. Prices (a second per-item rate table); Trees; Terrain. Materials told users to "price in Studies".
- **"Studies"** mixed an optional shade study with the estimate and proposal.
- **Sidebar.** Six Design Studio feature-catalogue areas, mostly labelled previews, sat beside Projects.
- **Wording.** "Ground Studio", "Workspace revision 1", "geometry workspace", "Detailed workspace", "Analyze, price and review saved scope".

## What changed (frontend only)

- `StudioShell.tsx` (+ `journey.css`, `studio-context.ts`):
  - A **Proposal steps** bar: 1 Site, 2 Design, 3 Prices, 4 Proposal. Each step has a status and state (done, needs attention, to do), and every step stays reachable.
  - The dock shows the current step's tools; Terrain, Shade study and List view are under **More tools**. Escape closes the menu and returns focus.
  - New tool ids `rates` and `shade`; existing ids are kept for routes and feature links.
  - Review audience: original flat dock, labels and toggle.
  - "Save design" replaces "Save workspace" in Studio.
- `GeometryWorkspace.tsx`:
  - Step statuses are computed from the draft, saved site area and the Review panel status.
  - A single **Option being edited** picker on the map (accessible names "Edit Option A" and so on).
  - The per-panel scenario group moved to Layout precision tools and the list view.
  - New `SiteSummary.tsx` in step 1.
  - Workspace history moved below the Review panel.
  - One `CalculationsPanel` instance serves Review & issue, Saved rates and Shade study.
- `CalculationsPanel.tsx`, `StudiesGuide.tsx`, `domain/studies-guide.ts`:
  - Review / Total / Proposal sub-steps in the map view; all steps remain in the list view.
  - `attentionList()` and `compareOptions()` (read-only); the Review "Needs attention" list has direct fixes.
  - The Option A/B comparison is only "Comparable" when both options have work and complete, current saved totals in one currency.
  - The old rate table moved behind "Assign rates in a table (advanced)".
- Locked edits: while a tool has an open, unapplied edit (road sketch, ground paint, tree design, object or terrain form), other tools stay locked as before, but `blockedBy` keeps that tool and its step reachable. The roads reference spec exposed a case where a user could be stranded in Review with an unfinished road.
- Responsive header: one row on wide screens. Below 900 px it becomes a two-row grid (back, title and Save, then the four steps), and map toolbars and the Sun toggle move clear of it and the open panel. At 390 px there is no horizontal overflow.
- `PricingBoard.tsx`: duplicate option switch removed; "Next: review and total"; plain save wording.
- `App.tsx`, `ReviewLayout.tsx`:
  - The project heading carries **Edit brief** and **Open design map**.
  - Design Studio project records sit in one `ProjectRecords` disclosure.
  - The organisation/workspace card shows only on the projects list or when missing.
- `WorkspaceNavigation.tsx`: Design Studio catalogue areas sit in a collapsed **Feature previews** group. Organisation Review is unchanged.
- Wording fixes: `PlantMaterialPanel.tsx`, `TerrainBuilder.tsx`, `docs/user-guide.md`.

**No backend, schema or API change.** L14 source fields from migration 0020 (`source_type`, `supplier_name`, `quote_reference`, `exclusions`, plus validity, inclusions and source note) were judged sufficient for the vendor/source requirement, so no vendor table was added. Permissions, Decimal pricing, the projected-CRS quantity rules, immutable snapshots and retained PDF bytes are untouched.

## Draft PDF preview fix (user report, same day)

**Cause.** "Preview draft PDF" was disabled until every issue requirement was met, with no explanation. The backend `output-preview` endpoint ran the full issue validation: criteria, notes, assumptions, exclusions, validity, scope, programme and maintenance text, plus a complete, current total. The total picker also listed only complete, current estimates. A draft could not be seen until it was already issuable.

**Change.**
- `PreviewInput` (`apps/api/app/calculations.py`, used only by `POST …/output-preview`) accepts unfinished text. `issue_snapshot(preview=True)` now collects blockers instead of raising:
  - missing text fields, validity, scope, programme and maintenance;
  - an incomplete or out-of-date total;
  - no target zone;
  - a draft-only brief checkpoint or incomplete brief;
  - pricing warnings without an override;
  - a missing change summary.
- The snapshot returns them as `draft_issues`. Missing text prints as "Not provided yet - required before issue."
- The preview still requires edit and issue permissions, a saved design, the current brief revision and a saved total for the chosen option. It still never persists anything, and the client output still has no rate, cost, margin or profit.
- Issuing is unchanged and strict. The same unfinished input is refused (tested).
- Frontend: Preview needs only a saved design, Option A/B and a selected saved total. The total picker lists incomplete or out-of-date totals labelled "(draft preview only)". A "Before you can issue" list names every missing item, and Issue additionally requires a complete, current total. The draft PDF prints "Not ready to issue yet" with the list under its DRAFT heading.
- Tests: `apps/api/tests/test_output_preview.py` (two cases); `workflow.spec.mjs` previews before any issue field is filled and checks `draft_issues`; the total-picker selection in `workflow.spec.mjs` and `proposal.spec.mjs` now picks the complete, current total explicitly.

## How each item type is priced now

- **Bench or object:** select it on the map (selected-item card → Price this item), or open step 3 → Pricing → card → Price this item. Only same-unit, same-basis saved rates are offered, with their source, validity, inclusions and reuse. The server previews the subtotal; Apply to draft, then Save design.
- **Tree:** the same dialog adds "What stock is being bought?" and a confirmation that the rate matches that stock. Trees → Tree specification & cost still works.
- **Road or paved path:** the dialog prices each layer. The method reads "Area … m² × 50 mm thick = … m³", using the backend's projected-CRS quantities. A road with no layers links to Materials.
- **Everything unpriced:** Pricing → Needs attention filter, or step 4 → Review → Needs attention.

## Checks actually run

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint`, `npm run build` | Clean (existing large-chunk warning only) |
| `npm test` (vitest) | 38 files, 119 tests passed (4 new for the Review list and option comparison). See the tooling note below. |
| `.\scriptspi.ps1 lint` | All checks passed |
| `.\scriptspi.ps1 test -q` | 372 passed (2 new, `test_output_preview.py`) |
| Integration browser, full suite (ports 8101/5174) | 16 of 16 passed in one clean final run. Earlier runs found 2 helper races and 1 duplicate accessible name, all fixed. The workflow, pricing-home and studies-guide specs were rerun after the draft-preview fix: 4 passed. |
| Product UI browser | 5 passed, 4 skipped by design |
| Reference browser, full suite (local override config) | 22 passed, 8 failed. The 8 failures predate this change: editor, plan-reference, shade-studies, site-constraints and terrain wait for an `Organisation` combobox after sign-in, which the Home page does not have; geographic-editor needs the closed "Precision terrain controls" disclosure; spatial-tools uses labels from an earlier SpatialEditor rewording; studio-shell clicks "Change workspace" on Home. `proposal.spec` passed again after the draft-preview change. |
| Manual browser inspection (fixture data, offline map) | Desktop 1440×900, tablet 820×1100 and phone 390×844 with reduced motion: step bar, dock, More tools, Site summary, Pricing, the price dialogs, Saved rates, Review and project page. Escape closes More tools and returns focus; no horizontal overflow at 390 px. Fixed during inspection: hover outranking the current-step highlight, a see-through sticky heading, map controls under the panel or header, and the phone header layout. |

**Tooling note.** In this checkout, Vitest's default pool fails to register suites in files that `import { describe } from 'vitest'` when `apps/web/node_modules/.vite/deps` is absent. All 119 tests pass once the Vite dependency cache exists (for example after `npm run dev` has run once); single files always pass. No test file or Vitest configuration was changed for this.

## Limits and open gates

- A **comparable** Option A/B case is covered by unit tests only, not by a browser test.
- The Review list is a client-side summary. The backend's readiness and issue checks remain authoritative and unchanged.
- No real-user usability test with contractors, landscapers or clients; tablet touch and screen-reader passes remain pending.
- The committed `playwright.reference.config.mjs` cannot start its Vite server: it runs `--workspace apps/web` from inside `apps/web`. This predates this change. An untracked local override (`artifacts/journey/reference.local.config.mjs`) was used and the committed config was not edited.
- Provider maps were offline (neutral canvas) in all browser checks; no live Mapbox qualification.
- A disposable `browser_test_*` schema from the stopped walkthrough fixture server (port 8100) may remain in the local `infrashader_test` database. It holds fixture data only.
