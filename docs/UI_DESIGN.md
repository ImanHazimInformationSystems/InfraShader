# InfraShader product interface

## Source, inspection and scope

The user requested a complete navigable interface for the proposed product before implementing remaining domain functionality. All 23 pages of `output/pdf/InfraShader_Full_Feature_Catalogue_2026-11-11.pdf` were read. The supplied `/workspace/scratch/9c706016fef3/upload/...` path is unavailable on this Windows host; the local catalogue generated in the preceding task is the input. Its priority, name, scope, audience and status fields agree with the canonical feature register. UI placements in the PDF are explicitly planning guidance, not proof of existing routes.

Repository inspection covered App/session/navigation/dirty-state handling; route parsing; StudioShell; GeometryWorkspace; SiteMap; project hub, brief, evidence, history, settings and permission components; CalculationsPanel links to CatalogueBrowser, ReviewPanel, OutputPreview and retained outputs; styling, dependencies and browser configurations. The existing React/TypeScript/Vite, MapLibre/Terra Draw/Three.js and FastAPI/PostGIS stack is retained. No production dependency was added.

The [coverage map](UI_COVERAGE.md) contains exactly 84 S/L/O/A roadmap records. F/D/E aliases and K01-K06 refine their existing parent workflows. UI scaffolds never imply domain implementation, accepted calculations, live AI, deployment or customer acceptance.

## References actually opened

Reviewed 11 November 2026 using public official product/documentation pages. Authenticated commercial product sessions were not opened; the observations below are from the accessible public material.

| Reference | Accessibility observed | Lesson applied |
|---|---|---|
| [Autodesk Forma Site Design overview](https://www.autodesk.com/products/forma-site-design/overview) | Opened; original Forma URL redirects here. Site context, geolocation, terrain and model interfaces described/illustrated on the public page. | Central site context; tools grouped around the site rather than a long sequential form. Existing geographic editor remains the actual map workspace. |
| [Mapbox Studio interface](https://docs.mapbox.com/console-tools/studio/studio-interface/) | Opened through the documentation interface-guide link. | Separate canvas, layer/context controls and task toolbar; contextual property panels and readable layers. MapLibre remains the renderer. |
| [Linear custom views](https://linear.app/docs/custom-views) | Opened. The earlier `/docs/views` URL was inaccessible; it is not cited as reviewed. The public features page was also opened. | Grouped navigation, contextual views, adjacent filters and right-side details. No copied assets, branding or exact layout. |
| [Apple HIG motion](https://developer.apple.com/design/human-interface-guidelines/motion.md) | Opened the official Markdown link after the HTML page required JavaScript. | Brief, purposeful feedback; no constant motion; reduced-motion removes new animations/transitions. Native dialogs preserve predictable keyboard/focus behaviour. |
| [Apple accessibility](https://www.apple.com/accessibility/) | Public page opened. | Labelled controls, keyboard paths, visible focus and non-colour readiness text. This research is not a claim of complete assistive-technology acceptance. |

## Navigation and surface architecture

- Existing project, explorer, creation, editing and settings routes retain their functions and server authorization.
- New workflow routes: `/{studio|review}/workspace/{group}/{featureID}`. Group-only routes select that group's first feature; unsupported group/feature pairs show an unavailable screen.
- Studio tasks: site/evidence, design, studies/checks, quantities/pricing, proposals/delivery and opportunities.
- Review tasks: portfolio/outcomes, briefs/submissions, evaluation/comparison and decisions/reports.
- Shared tasks: inbox, files/history, organisation/access, preferences, jobs/recovery, privacy and feedback. Assistance is discoverable in both workspaces; AI remains labelled planned/not connected.
- Available workspaces follow the existing membership grants. Browser Demo can switch between both presentation shells. Public feature metadata does not grant project access.
- Desktop rail and mobile native-dialog navigation share the same definitions. Contextual feature navigation is filterable by text and delivery stage; mobile uses a horizontal feature strip. The current workspace, group, feature and project context remain visible.

`WorkspaceNavigation` owns task navigation; `ProductWorkspace` owns context and selection; a keyed feature panel owns ephemeral preview inputs. Ten reusable surface families cover registers, briefs, canvases, comparisons, scorecards, documents, dashboards, assistance, settings and sequences. These are deliberately UI scaffolds, not parallel implementations of existing project services.

## Honest state and data boundaries

Every new workbench declares its readiness. Preview inputs and rows are kept only in component state; the action says **Apply to preview**, never Saved. Leaving a feature discards this state; unapplied inputs use the existing navigation/before-unload warning. Project-context changes also confirm discard. Discarding a UI preview does not clear a genuine project workspace recovery draft.

Illustrative rows are off initially and can be explicitly enabled. They say Demo data; added rows say Tab-only preview. Row counts are labelled preview counts, not portfolio totals. Comparisons display Not connected/Not calculated/Not assessed instead of invented budgets, scores or winners. Scorecard percentages are labelled illustrative configuration, and must total 100 before a preview can be applied; no scores or ranking are calculated.

File preview reads file names only, never file content or uploads. Document screens preview structure and section selection; they never issue a report. Assistant availability returns an explicit not-connected explanation without sending prompts or producing generated text. Dashboard placeholders wait for authorised source aggregation. Existing workflow links explain their supported subset and require appropriate saved project context. Browser Demo remains separate from real services.

## Design system and technical tradeoffs

Maroon `#72233d` is the action/selection accent; deep maroon `#381724` anchors navigation. Silver `#d9dce2`, neutral backgrounds and white surfaces support dense work. Semantic success/error colours and geographic data colours remain distinct. `product.css` defines shared colour, typography, spacing, border/radius, shadow, focus and motion tokens. Segoe UI/system fonts avoid a new font service.

Navigation and small panel transitions last 160 ms; no constant motion is introduced. `prefers-reduced-motion` removes the new animation, transition and transform effects. Native dialogs provide focus trapping, Escape dismissal and focus return. Hidden mobile/desktop surfaces are removed from keyboard navigation.

The new screens use DOM/SVG for forms, tables, source-labelled schematic context and layouts. A saved site preview lazy-loads the existing read-only MapLibre component; no duplicate map renderer or data pipeline is introduced. Only the active feature panel mounts; project context is drawn from the already permitted loaded project page. Existing Projects remains the route for more records. Schematic layers carry an explicit non-geographic label and never create quantities. Existing Studio links can open the relevant tool panel on the central map.

## Maintenance

L04 now uses a **Connected subset** entry at `/studio/workspace/design/L04`: choose a permitted saved project and open its existing Ground Studio Layout editor. The entry does not offer ephemeral preview inputs. It explains Browser Demo limits and project grants. Read-only members can switch scenarios, inspect properties and use canvas/layer controls; mutation and restore controls retain explicit permission guards. Boundary/target outlines share the validated metric frame in both 3D renderers; calibrated image and constraint overlays remain in 2D. The canonical UI state describes this entry, separately from L04's wider Partial implementation and Pending acceptance. See [current evidence](tracking/evidence/l04-connected-2026-11-12.md).

Studio `/studio/create` now offers a plain-language getting-started guide after site selection,
with native disclosures for a fictional courtyard brief and optional enquiry-field definitions.
The example follows the existing form labels, explains scope terms and uncertainty, and never
fills or replaces user input. Guidance is shown for new Studio briefs; existing edit and Review
flows retain their entry behaviour. See [checks and limits](tracking/evidence/brief-guide-2026-11-12.md).

Canonical UI placement/state data: `docs/tracking/ui-coverage.csv`. Generate `apps/web/src/product/catalogue.json` and `docs/UI_COVERAGE.md` with `python scripts/ui-catalogue.py`; validate with `--check`. Stable feature and acceptance IDs remain in their existing registers. When a feature becomes connected, inspect its real code, update its UI row and functional evidence separately, and run both UI and tracking generators. Do not replace an existing connected workflow with a preview.

Actual check results and remaining gates are recorded in [the evidence record](tracking/evidence/product-ui-2026-11-11.md).

## Studio projects dashboard refresh — 12 November 2026

The user-provided Design Studio dashboard screenshot was reviewed as a visual reference. The projects page now follows its hierarchy: title and primary create action, project summary strip, compact search/status/type controls, active/archive and grid/list actions, project cards, and a getting-started callout. The existing connected project query remains authoritative. Project-purpose filtering is performed server-side; summary counts describe current query matches and the loaded page rather than inventing global stage totals. Card site art is a clearly labelled schematic from the saved outline or extent, not generated satellite imagery. Browser/responsive review remains pending; see [the implementation evidence](tracking/evidence/project-dashboard-2026-11-12.md).

## Signed-in home dashboard — 12 November 2026

The user-provided homepage screenshot was used as the visual reference for greeting, workspace cards, recent projects and quick-start guidance. Account name/date come from the active signed-in session and organisation timezone; recent projects come from the existing permitted project query. Workspace entry cards are filtered by active organisation grants. Existing organisation selection, service status/retry and sign-out remain in the application header; Account opens the existing settings/profile page. The reference's notification indicator and sample project content are not represented as live product data. Mobile/browser and account permission review remain pending; see [implementation evidence](tracking/evidence/home-dashboard-2026-11-12.md).

## Site trees — 12 November 2026

Explore's Review site trees opens a responsive inventory panel. Saved Ground Studio projects have a Site trees dock tool with the same source/import/manual workflow and an explicit project save. Context, included records and removal markers have independent visibility controls. Native labelled selects support per-tree retain/remove decisions; bulk actions, numeric editing, unknown attributes, source details and bounded undo/redo remain available without map tiles. Closing a panel cancels pending map placement while retaining edited records. Tree project saves are separate from workspace saves; the header reports unsaved tree decisions. Sun context is collapsible so it does not occupy the map by default. This connected workflow supplements the existing L02/L04 workbenches; the generic product routes retain their labelled previews. See [contract](tree-management.md) and [evidence](tracking/evidence/tree-management-2026-11-12.md). Physical-touch/assistive-technology/user acceptance remains pending.

### Mapbox context replacement

The shared map is now Mapbox. A compact Map layers disclosure offers Standard/Satellite, native tree-context visibility and elevation controls. These sit alongside the existing current-view locator and retained project/tree/object controls; native source attribution/logo remains visible. Satellite is a root raster layer beneath Standard's 3D models, preserving authored sources and the camera. Sun context remains available in the embedded 3D editor; the independent local scene keeps its separate view behavior. Numeric and neutral-map fallbacks retain edits without provider content. Provider 429 is labelled rate limiting, not spent allowance or complete map failure; absent provider tiles remain partial context. Synthetic imagery is used only in explicitly labelled tests. L02 live-provider verification remains Blocked until successful real image tiles are observed. [Contract](mapbox-migration.md), [evidence](tracking/evidence/mapbox-migration-2026-11-12.md).

## Concept reconciliation - 12 November 2026

The user's current brief makes the 84-feature catalogue the approved roadmap baseline and the Desktop HTML a proposed concept. See [the 84-row reconciliation](UI_CONCEPT_RECONCILIATION.md), [contractor workflow](contractor-workflow.md) and [measurement/rate contract](measurement-and-estimating.md). The green/Meranti concept does not replace the confirmed maroon/silver design or promote Later terrain/assets. Preserve explicit partial costs, fictional-rate labels, tree-excluded numerical shade and distinct contractor/owner journeys. Road construction and earthworks costing remain unapproved proposed additions; no navigation or functional status is changed by this documentation checkpoint.

## Pricing home — 15 November 2026

Design Studio now has one **Pricing** dock tool between Materials and Studies. It lists the proposed billable work of Option A or B as item cards grouped into trees, planting, objects, paths, roads, site work and other work. Each card shows the API quantity and unit, the selected rate and source, the API item subtotal and a status chip. Selecting an item (Layout list, map card, Trees, or a Pricing card) opens **Price this item**: a native modal dialog with compatible saved rates only, visible reuse ("Already used for Bench 1"), source/validity/inclusions/exclusions, plain quantity explanations and a server-calculated subtotal for the unsaved choice. Bulk apply follows a reviewed plan of items that will change and items skipped, with reasons. Studies keeps the estimate, shade and proposal steps; tree stock specification still also lives in Trees. See [evidence](tracking/evidence/pricing-home-2026-11-15.md).

### References actually opened (15 November 2026)

| Reference | Accessibility observed | Lesson | How InfraShader adapts it |
|---|---|---|---|
| [Cities: Skylines II road tools (Paradox, dev diary)](https://paradoxinteractive.com/games/cities-skylines-ii/features/road-tools) | Opened | Road types are grouped by size; upgrades and decorations are applied to an existing road through a Replace tool, rather than as separate road types. | Roads keep one drawn footprint. Their layers are priced in place, layer by layer, from the selected road. There is no separate "priced road" object. |
| [The Sims 4 official page (EA)](https://www.ea.com/games/the-sims/the-sims-4) | Opened. It only describes Build Mode in general terms ("planning its layout, choosing furnishings, and altering the landscape"). Build/Buy articles were listed by headline only and were not read. | Limitation: no official interaction detail was reviewed. The catalogue-card and selected-object ideas are general patterns, not claims about the game's UI. | Recognisable category icons and item cards; a selected-object card with one clear action. No game assets, branding or layout copied. |
| [Procore Cost Catalog](https://support.procore.com/products/online/user-guide/company-level/cost-catalog) | Opened | A company-level store of material information "from individual parts to assembled items", grouped hierarchically. | The organisation's versioned rate list stays the single price store. Assemblies stay recipes of rated components. |
| [Procore Estimating overview](https://en-gb.support.procore.com/products/online/user-guide/project-level/estimating/overview) | Opened | Takeoff quantities flow into estimates; prices, labour and margins are adjusted in the estimate. | Quantities come from the saved or draft geometry via the API. Pricing shows direct cost. Markup and charges stay in Studies → Estimate. |
| [Carbon data table usage](https://carbondesignsystem.com/components/data-table/usage/) | Opened | A batch action bar appears once rows are selected; it is exited by cancel or by clearing the selection. | A "N selected · Apply one rate… · Clear selection" bar. The apply step is reviewed in a dialog listing changes and skips. |
| [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Opened (2006 article) | Show the few important options first, reveal advanced ones on request, and avoid more than two disclosure levels. | Cards show status and subtotal. Source notes, exclusions and the new-rate form sit one level down. |
| [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) | Opened | Detects a user request to minimise non-essential motion. | The 160 ms rise animations and card transitions are removed under `reduce`. |
| [WAI-ARIA APG modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Opened | Focus moves into the dialog, Tab is contained, Escape closes, focus returns, and there is a visible close button and an accessible name. | The native `<dialog>` with `showModal()`, `aria-label`, a visible close button and Escape handling. |

**Game price versus professional estimate.** A game's price tag is a fixed in-game cost owned by the game. An InfraShader rate is an organisation-entered, dated, versioned record with a unit, source, validity and inclusions. A line only counts when its measured unit matches the rate. Nothing is priced from the look of a model. Unpriced or invalid work keeps the figure visibly incomplete. None of the reviewed sources shows a game doing supplier-sourced construction estimating, and no such claim is made.


## Design Studio journey simplification — 15 November 2026

The user asked to simplify Design Studio around three goals: select a site and place work on it; see, price and compare it; and create and download a clear proposal. They authorised removal or relocation of UI after inspecting purpose and dependencies. The walkthrough used a disposable fixture project in a local browser. It found these problems:
- The project page put its main action last, after about 3,000 px of other content.
- The Studio dock had nine equal tools with no order.
- Pricing lived in four places.
- Option and history controls repeated in every panel.
- "Studies" mixed shade, estimate and proposal.
- The sidebar listed six planned-feature preview areas beside real work.

### The journey

The Studio header has one step bar: **1 Site → 2 Design → 3 Prices → 4 Proposal**. Each step shows a plain status from saved and draft records, for example "49,234 m² est. · 2 to check", "3 items in Option A", "2 need a price", "Total incomplete" or "Version 2 issued". The dock shows only the current step's tools. Users can move back to any step, and edits still make quantities, totals and issues stale through the existing backend revision rules.

| Step | Tools in the dock | What changed |
|---|---|---|
| 1 Site | Site records | New site summary showing:<ul><li>the estimated area and its provenance (never called a survey);</li><li>the boundary source;</li><li>the metric grid (declared projected CRS);</li><li>open and important facts to check;</li><li>existing-site items.</li></ul>Actions: Show existing site, Record existing trees, Next: design the work. |
| 2 Design | Layout, Trees, Objects, Materials | Unchanged tools. One **Option being edited** picker on the map (Existing site / Option A / Option B) replaces the scenario buttons that repeated in every panel. The full scenario group and Reset remain under Layout → Precision tools and in the list view. |
| 3 Prices | Pricing, Saved rates | Pricing is the single place to price trees, objects, planting and road/path layers. Saved rates is the organisation price list: browse, add or revise dated versions. The old rate-assignment table moved behind "Assign rates in a table (advanced)". Pricing's duplicate option switch was removed. |
| 4 Proposal | Review & issue | Three sub-steps:<ul><li>**Review:** next step, facts, a "Needs attention" list where each row links to its fix, and an honest Option A/B comparison.</li><li>**Total:** the existing estimate, markup and charges.</li><li>**Proposal:** the existing preview, issue and retained PDF.</li></ul>Workspace history moved below. |
| More tools | Terrain, Shade study, List view | Optional or advanced tools. The shade study is the same bounded, field-unvalidated study. |

The project page now leads with the project heading, **Edit brief** and **Open design map**, followed by the site plan. These Design Studio sections moved into one closed disclosure, **Brief agreement, changes, history and access**: brief checkpoint, duplicate/template, brief history, project access, brief readiness and change register. The organisation/workspace selector card now appears only on the projects list, or when an organisation or workspace is missing. The header and sidebar already provide both.

The six Design Studio catalogue areas and Assistance now sit in a collapsed **Feature previews** group in the sidebar. Their routes, readiness labels and connected subset links are unchanged. Organisation Review navigation is unchanged.

### Option and price comparison: what it means

The Review comparison shows proposed item counts, items without a rate, and each option's latest saved total and state (none, out of date, incomplete, or complete and current). It says **Comparable** only when both options have proposed work and complete, current totals in the same currency. Otherwise it explains why not. Line-by-line differences stay in Total → Compare saved estimates.

In the Price this item dialog, only same-unit, same-basis saved rates are listed side by side, each with its source, validity, inclusions and reuse. The UI states that InfraShader does not search the market or find the cheapest supplier.

### Classification of affected UI

| Class | UI |
|---|---|
| Essential | Step bar, option picker, Layout/Trees/Objects/Materials, Pricing, Review, Total, Proposal, Save design |
| Required in context | Site facts and provenance, tree stock confirmation, layer m³ method, rate source/validity, stale and incomplete states, permissions notices, readiness checks |
| Useful advanced | Precision tools, list view, rate-assignment table, firm/optional/provisional scope, workspace history, Terrain, Shade study |
| Duplicate or confusing (removed from the main path) | Per-panel scenario buttons, Pricing option switch, "Studies" name, the duplicate "1. Prices" path, organisation/workspace card on project pages, bottom-of-page open button |
| Planned or unrelated (moved) | Studio feature-catalogue preview areas and Assistance → Feature previews |

Nothing was deleted from the database or API. Existing tool ids are kept for routes and feature links; `rates` and `shade` were added.

### References opened (15 November 2026)

| Reference | Observed | Lesson applied |
|---|---|---|
| [GOV.UK: map a user's whole problem](https://www.gov.uk/service-manual/design/map-a-users-whole-problem) | Opened. Look for "dead ends in the user journey"; for linear journeys consider "step-by-step navigation". | One end-to-end step bar from site to issued proposal. The bottom-of-page dead end on the project page was removed. |
| [GOV.UK Design System: complete multiple tasks](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/) | Opened. Show task status with "the smallest number of different statuses"; "allow users to complete tasks in any order". | Three step states (done, needs attention, to do) with short text. Every step stays reachable. |
| [GOV.UK Design System: check answers](https://design-system.service.gov.uk/patterns/check-answers/) | Opened. Use before confirmation; give a change link per section. | The Review step lists outstanding items, each with a direct fix link, before Total and Proposal. |
| [GOV.UK Design System: error summary](https://design-system.service.gov.uk/components/error-summary/) | Opened. Summarise problems and "link to each" one. | "Needs attention (N)" links each problem to the tool that fixes it. Field-level messages stay in place. |
| [W3C WAI: labelling controls](https://www.w3.org/WAI/tutorials/forms/labels/) | Opened. Label all controls; the title attribute is "not recommended" as a label. | Step and tool buttons have visible text. Hints in `title` are supplementary. Picker buttons' accessible names contain their visible text. |
| [W3C WAI: clear visible labels](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p06-clear-labels/) | Opened. Use common words; avoid hidden labels. | "Open design map", "Save design", "Existing site", "Saved rates" and "Review & issue" replace "geometry workspace", "Ground Studio", "workspace revision" and "Studies". |
| [NN/g progressive disclosure (video page)](https://www.nngroup.com/videos/progressive-disclosure/) | Page summary opened; the video itself was not watched. "Defer secondary options to a subsidiary screen." | Optional tools are under More tools, and project records are in one disclosure. The advanced rate table is collapsed. |
| [Cities: Skylines II road tools](https://paradoxinteractive.com/games/cities-skylines-ii/features/road-tools) | Opened. Roads in familiar size categories, placed with a few clicks; each step can be cancelled. The page shows no item price display. | Category-first tools with cancel and undo. No claim is made that a game demonstrates cost estimating. |
| [Mapbox Studio interface](https://docs.mapbox.com/console-tools/studio/studio-interface/) | Opened (long page; the last part was read via summary). Separate canvas and panels; inspect selected features' properties. | The map stays central, with one working panel and a selected-item card. |
| [Procore Estimating overview](https://en-gb.support.procore.com/products/online/user-guide/project-level/estimating/overview) | Opened. Takeoff from a database of parts and assemblies; adjust prices and margins; create a customer-facing proposal. Totals display was not shown. | Takeoff → price → total → proposal order. Quantities stay backend-calculated. |

The Sims 4 was not re-reviewed. The earlier pricing-home record notes that its official page gives no interaction detail. Card and selected-item patterns remain general patterns, and no game assets, branding or layouts were copied.

## Signed-in home refresh — 15 November 2026

The user asked for a more polished, robust home page. It is now a launcher rather than a data dashboard. It focuses on the next action and existing work:
- **Hero band:** maroon, with decorative contour lines. It shows the date, greeting, one plain sentence, **Start a new site** (Design Studio) and **All projects**.
- **"Pick up where you left off":** the most recently updated permitted project, with its saved site outline as a labelled schematic, client, status and updated date.
- **Workspace cards:** Design Studio and Organisation Review, shown only when granted.
- **Recent projects:** the next three projects as cards. Each project appears once on the page.
- **How it works:** the same four steps users see in every project (Site, Design, Prices, Proposal; Brief, Offers, Compare, Decision for review-only users).

**Robustness:**
- Skeleton cards while projects load.
- Empty states that offer a next action, and a no-organisation state.
- Long names clamp to two lines with a full-name tooltip.
- Layout tested at 1440, 820 and 390 px with no horizontal overflow; keyboard focus outlines; reduced-motion support removes lift and shimmer.
- Obsolete home rules were removed from `studio.css`; styles live in `components/home.css`.
- No new data or API: everything shown comes from the existing permitted project list.

**References opened:**
- [NN/g on dashboards](https://www.nngroup.com/articles/dashboards-preattentive/): a dashboard communicates at-a-glance data and differs from a portal. Lesson: this page is a portal/launcher, so it shows the next action and recent work rather than charts or invented metrics.
- [Carbon loading pattern](https://carbondesignsystem.com/patterns/loading-pattern/): skeletons on container components such as tiles, shown only briefly, with the basic structure first. Lesson: skeleton cards in the spotlight and recent grid while the project list loads.

Material 3 card guidance and the Atlassian empty-state pages returned no readable content to the fetch tool, so they are not cited as reviewed.

## Ready to issue is a server-checked state ? 15 November 2026

This supersedes the client-only readiness summary in the journey checkpoint above. Review and Proposal use one full grouped checklist with reasons and direct fixes; the step bar displays the number of blockers and never infers readiness from the total alone. While checks run, issuing is unavailable. Brief repair stays in an inline dialog so proposal wording is preserved. Site now exposes proposal-area creation, including reviewed/confirmed boundary reuse with source and estimated/not-a-survey wording. Only when missing/stale totals are the remaining problem is the quick Recalculate total action shown, using the current Total controls. The issue explanation describes locked versions, retained PDF, no automatic sending and later revisions. See [evidence and limits](tracking/evidence/issue-readiness-2026-11-15.md).
