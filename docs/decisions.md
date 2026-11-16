# Decisions

## Controlled free hosted pilot (16 November 2026)

The user explicitly authorised free Render/Supabase deployment. Use manual releases,
one free API worker and a static web site; no paid disk/database/domain/mail plan.
Keep new hosted data separate from local development. Use the actual Supabase
session pooler, private application schema/non-superuser role and server-only Storage
key. Mark the hosted UI as a pilot, not a production acceptance claim. Hosted
infrastructure evidence does not replace real-account workflows, provider limits,
backup/restore or customer acceptance. See
[hosted evidence](tracking/evidence/free-pilot-hosted-2026-11-16.md).

## Contractor-to-owner submissions: explicit conservative defaults (15 November 2026)

The user asked to complete S03/L25/O05. Where the catalogue leaves policy open, these explicit defaults apply until an owner policy feature exists:
- **Invitations:** an opportunity invitation is separate from organisation membership. Acceptance never creates a membership or project grant across tenants.
- **Who acts:**
  - preparing, issuing and revoking invitations needs the `review_project` grant on the owner-decision project;
  - accepting needs the signed-in user's verified email to match the invited email, and Design Studio access in a different organisation;
  - submitting or withdrawing needs `issue_proposal` on the linked contractor project. Reading or editing a project is not commercial authority.
- **Links:** single use, stored only as a SHA-256 hash and shown once to the owner. A link expires at the earlier of the closing time and 14 days. Owners share links themselves; no email is sent.
- **Timing:** submissions and revisions are refused at or after the closing time, with no late-submission exception. Withdrawal is allowed at any time and is recorded; nothing is deleted.
- **Revocation:** stops future acceptance and submissions and keeps everything already received.
- **What can be sent:** only issued contractor proposals with a retained PDF. A revision must use a different issued version and give a reason. The linked project is fixed after the first submission.
- **What the owner receives:** an allowlisted package (schema v1) plus byte copies of the original PDF and package JSON, written atomically with the inbox entry. The contractor's private project, estimate, rates, costs, margin and supplier details are never copied.
- **What the contractor receives:** only the comparison-basis title, scope items, requirements, tax basis, deadline and addendum note, plus the brief fields and files the owner explicitly selects. Budget, reviewers, approval policy, evaluation horizon and rubric are not shared.
- **Review mode:** owners see offers on receipt (controlled review). Sealed bids remain the separate O29 gate.

**Unresolved policy questions:**
- owners may now opt in, per invitation, to share rubric criteria names, weights and scales (never scores); the default stays off;
- whether late changes or withdrawals should require owner approval;
- whether one invitation may admit several people or emails in a contractor organisation.

See [evidence](tracking/evidence/opportunity-submissions-2026-11-15.md).

## Permanent deletion is limited to unissued projects ? 15 November 2026

User requested a Delete project action. Require edit plus creator or project access-management permission, exact typed name and current revision; protect issued outputs and formal review records with Archive. Use existing immutable organisation audit events for transactional private-file cleanup jobs/receipts, with bounded explicit retry; no migration or silent orphaned-file claim. See [evidence](tracking/evidence/project-deletion-2026-11-15.md).

## One issue policy and actionable readiness ? 15 November 2026

The user explicitly requested all proposal blockers before issue. A read-only POST accepts unfinished proposal inputs without putting commercial wording in URLs. Shared rule functions drive readiness, draft warnings and strict issuing; the backend remains authoritative. Keep archive/purpose/revision/permission gates and immutable issued documents. Fix missing brief fields inline to preserve proposal text. A boundary-copy target requires visible review, explicit confirmation, estimated/source labels and the existing geometry save. Keep maintenance rows optional but complete once added. No default commercial text, new pricing policy or schema migration. See [evidence](tracking/evidence/issue-readiness-2026-11-15.md).

## Design Studio is organised as one four-step journey (15 November 2026)

The user asked to simplify Design Studio around three goals (place work on a site; see, price and compare it; issue a proposal) and authorised removing or relocating UI after checking dependencies. Decisions:

- **Navigation.** Present Site, Design, Prices and Proposal as a step bar with plain statuses, and show only the current step's tools. Optional terrain and shade sit under More tools, together with the list view. Keep the existing tool ids for routes and feature links; add `rates` and `shade`.
- **Pricing.** Pricing is the single pricing place. Keep the old per-item rate table as an advanced disclosure rather than delete it, because existing workflows and tests use it.
- **Option selection.** One option picker on the map. The per-panel scenario buttons remain in Layout precision tools and the list view.
- **Option comparison.** Read-only, from saved estimates. It is called comparable only when both options have work and complete, current totals in one currency. No market search or cheapest-supplier claim.
- **Vendors and suppliers.** No new vendor table: the existing L14 rate source fields cover name, source type, reference, exclusions, validity and inclusions.
- **Project page.** Lead with Edit brief and Open design map; group brief agreement, change register, history, access and templates in one disclosure. Organisation Review keeps its layout, flat tools and labels.
- **Sidebar.** Design Studio catalogue preview areas go into a collapsed Feature previews group; routes and readiness are unchanged.
- **Scope.** No data deletion, schema change or permission change. The backend stays authoritative for quantities, completeness, issue readiness and snapshots.

Unresolved product question, recorded and not decided: whether Option A/B comparison should later include a server-side comparable-scope check (same item categories or quantities), beyond complete-and-current totals. See [evidence](tracking/evidence/design-studio-journey-2026-11-15.md).

## User-authorized numerical terrain extension (13 November 2026)

Use existing projected heightfields and a supplied aligned existing-ground reference (otherwise an explicitly declared flat start) for signed clipped TIN integration. Preserve this reference through editing/erase/reset. Automatic cut/fill work records use backend m³ and deliberately selected sourced rates; no soil or machine-price assumptions are inferred. Retain an immutable, revisioned custom surface-water screening study using explicit rain, constant infiltration, roughness and capacity/inlet-based drains, with mass balance, time/grid/limiter disclosure and stale overlays. This is not a validated full shallow-water/pipe-network engine. Actual Mapbox Standard rendering is separately checked over live tiles; source ground/rain/rates in tests remain synthetic. No dependency/migration or staged acceptance change. See [numerical evidence](tracking/evidence/terrain-water-analysis-2026-11-13.md).

## Pricing readiness and retained issue completion (31 October 2026)

The user requested finishing pricing readiness and proposal output. Keep deterministic rate/source checks and reasoned internal-pricing issue exceptions; never override missing prices or silently refresh selected rates. Preserve MYR Decimal and no implicit-tax policy. Retain bounded issued PDFs in private PostgreSQL with the source hash and original bytes, avoiding a non-atomic metadata/object write for this local CORE path. Original photos remain in private Supabase Storage; only explicitly selected, reviewed image copies enter the immutable audience snapshot. This is an implementation decision, not customer approval of commercial policy or backup acceptance. See [pricing and proposals](pricing-and-proposals.md).

## Sourced planting and approved material recipes (30 October 2026)

The user authorised L09/L10 with K02/L13 quantity connections. Use private per-item plant/recipe snapshots in existing workspace revisions and the existing Decimal pricing engine. Project-library reuse copies sourced definitions; it does not introduce a centrally verified species catalogue. Nominal square/line counts are explicit procurement methods. Recipes choose inclusive or component pricing and require user approval; prevent duplicate wastage and included labour/charges. Extend rate units to m3/h in existing text storage. Wider assemblies, horticultural/commercial acceptance and full K02/L13 roadmap remain separate. See [contract](plant-material-schedules.md).

## Studio integration implementation defaults (29 October 2026)

The user's request authorises local L04/L06/L07 integration. Use a synchronized project-coordinate Three scene alongside the geographic editor, with camera retained while mounted. Continuous strokes apply maximum swept-path coverage once per node, independent of pointer-event subdivision; release validates one draft action and Escape cancels. Optional general vertex acquisition uses 12 screen pixels; it is not an accuracy tolerance. These are implementation defaults, not customer acceptance or approval of deferred geometry/engineering scope. See [editor guide](studio-editor.md).

## L04 audit and proposed unified interaction (29 October 2026)

The user requested an L04 audit and definition of unified L02/L04/L06/L07 interaction. This checkpoint changes documentation and tracking only. Preserve limited L06/L07 implementation claims separately from the proposed integrated editor. L04 is Partial: preset-only transforms and grid snapping do not establish general geometry editing. See [interaction proposal](studio-interaction.md) and [audit](tracking/evidence/l04-2026-10-29.md). Selection lifetime, snap tolerances, gestures and render integration remain open decisions, not confirmed product policy.

## ADR-014 Explorer environment (18 October 2026)

E06/E07 extend the bounded explorer, not the authoritative project solver. One
explicit-offset clock drives pvlib daily minute samples and existing exact-time
shadow requests. Civil twilight is -6..0 geometric degrees; shadow cutoff stays
5 degrees. Approximate rise/set uses -0.833 degrees, with absent events explicit.
Native MapLibre sky/light and a procedural WebGL2 custom layer implement manual
cloud/rain scenarios without Three.js or a weather provider. Effects are visual,
ephemeral and never analytical corrections. No lightning/audio or live-weather UI.
New-project brief text receives reviewable explorer time context; existing saved
analysis is not overwritten. See explorer-environment.md for axes/lifecycle/limits.

## ADR-001 Source precedence and gate names (11 October 2026)

SRS v0.3 is authoritative. Its G1 scope, G2 security/data, G3 ground shade including field validation, G4 quantities/pricing, G5 two outputs, G6 quality, G7 operations, G8 users, G9 buildings, G10 conditional extensions and G11 terrain/assets are the repository gate namespace. Stack v0.5 and master M3 use incompatible numbering (drawing/building/canopy/coverage/field). Use named subchecks within SRS G3 rather than silently equating numbers. Affects FR-08–FR-25, SEC-01–08, BLD/TER/OBJ/AST and all release reports/tests.

## ADR-002 Local implementation, no publication

Use the requested existing modular monolith (`apps/web`, `apps/api`), npm and uv. Do not import the concept monolith or its embedded fonts/reference images. No Sites registration, remote write, PR or deployment. The user's prohibition overrides any document or skill publishing default.

## ADR-003 Real service and demo boundaries

Real API uses PostgreSQL/PostGIS only, validates Supabase asymmetric JWTs and looks up active membership per protected operation. No production memory/SQLite fallback. When configuration/services are missing, return actionable unavailable responses. Browser Demo uses its own storage namespace and no protected API calls; it is never evidence for SEC-02 or persistence acceptance. Affects APP-01/02/06/13, DATA-01/02, SEC-01/02, FR-01/57–60.

## ADR-004 Provisional access/onboarding policy (D1)

Admin/member follows the SRS proposed role matrix: administrators have all listed capabilities within their own organisation; members need explicit grants for catalogue, internal pricing and either output issuance. Purpose selects labels/output, never permissions. Initial organisations/memberships are provisioned by an operator command using a known Supabase user UUID; no public self-grant endpoint. Invitation, last-admin safeguards and member-management UI remain pending before pilot. Tests must deny foreign IDs even to another tenant's admin. This is an implementation default, not team approval of G1.

## ADR-005 Map provider (D2) pending

Start with MapLibre's provider-free style and numeric WGS84 bounds. Show no-basemap/source status; preserve selected bounds in the project. Do not silently use public OSM tiles/Nominatim or a paid provider. A configurable style URL is opt-in; its terms, attribution/export rights, quota and Malaysian coverage need review before D2 acceptance. Geographic extent is a locator, not a surveyed boundary.

## ADR-006 Dependencies and staged UI

Resolve compatible stable packages and verify engine requirements before locking. Node 22.15 satisfies Vite's 22.12+ requirement. The initial semantic forms now coexist with Tailwind utilities and an editable shadcn-style Radix/CVA button. Terra Draw and its MapLibre adapter are integrated and browser-tested. No Three.js/GLB/AI controls become active before their gates. Affects QLT-01–07 and staged requirement families.

Official references checked during implementation: [Vite](https://vite.dev/guide/), [FastAPI](https://fastapi.tiangolo.com/tutorial/), [Supabase JWT validation](https://supabase.com/docs/guides/auth/jwts), [Terra Draw](https://github.com/JamesLMilner/terra-draw). Locked builds/tests determine actual compatibility, not these recommendations alone.

## ADR-007 Local services and identity evidence

User selected local PostgreSQL/PostGIS and approved Docker/WSL installation, leaving any restart to them. Application data uses portable PostgreSQL 17.11/PostGIS 3.6.2 on 54322; local Supabase is configured separately for Auth/private Storage on 54331. No hosted project is linked. Browser integration fixtures use real PostGIS with a signed test identity provider; they cannot satisfy real Supabase acceptance. Service keys remain server-only and ignored.

## ADR-008 Explicit provisional pricing policy

Quantities/rates retain four decimals; MYR line totals round HALF_UP to two decimals. Wastage applies only to area/length. Each explicit charge category occurs once and cannot duplicate a component included in any selected rate. The UI collects amount and source/scope; the backend remains authoritative. Incomplete scope has no profit claim. Markup, target margin and fixed selling total are mutually exclusive. This executable policy still requires D5 commercial approval.

## ADR-009 Field validation and issued outputs

Supported numerical results are modelled ground shade, with source/height uncertainty, night/low-sun states and stale revision checks. Until field validation passes, issued briefs/proposals omit numerical shade claims and explain that omission. Geometry schematics and saved scope remain available. PDF download always uses the immutable snapshot; changing live inputs cannot silently change an issued price.

## ADR-010 Core map and local provider baseline (12 October 2026)

Basic sourced building extrusions are core F03/F05, not dependent on F13 or Three.js. Only entered buildings with known heights are extruded; estimated heights are labelled, unknown heights remain 2D and block affected shade comparison.

The local prototype uses OpenFreeMap Bright vector context, preserving built-in attribution, and explicit-submit Photon place search (five results, timeout, no autocomplete/bulk requests or geolocation). Both endpoints can be replaced or disabled with VITE_MAP_STYLE_URL / VITE_GEOCODER_URL=`offline`. No paid key, account or hosted deployment is created. Photon public service is a demo with reasonable-use limits and no availability promise; production search capacity/provider approval remains open. Project/private data is not sent to search; the entered query and map viewport go to their respective providers. PDF visuals remain original geometry schematics, not provider map captures.

Sources reviewed: https://openfreemap.org/quick_start/ ; https://github.com/hyperknot/openfreemap ; https://github.com/komoot/photon ; https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/ . OpenFreeMap tile-derived render heights may contain defaults, so provider extrusion layers are removed. They are never imported as authoritative building inputs.


## ADR-011 Explore context, administration and recovery (13 October 2026)

Supersedes ADR-010's prohibition on provider extrusion for Explore only: explicitly labelled provider heights may be shown for navigation. They never enter project geometry, quantities or shade analysis. Authoritative project-building extrusions still require entered heights with sources. PDFs remain original schematics, with no third-party map captures.

Administrators manage existing memberships under an organisation row lock, with a concurrent last-active-administrator guard and immutable change audit. Profile edits are self-only. Organisation defaults apply to new inputs; existing saved prices/times do not change silently. Initial/new-user provisioning remains an operator task, without external invitations.

Project and workspace restore append new revisions and revalidate against current project bounds. Tab-local workspace recovery is scoped by user, organisation and project and expires after eight hours; automatic recovery cannot overwrite a changed server revision. No credentials are placed in the recovery record. This limited recovery does not constitute a full lifecycle/backup or forced-expiry acceptance claim.

Draft PDF preview shares issuance permission/readiness checks but does not save an Artifact or consume an issue version. Both-budget developer snapshots use the selected preferred estimate and latest same-revision other-option estimate, explicitly labelling incomplete or unavailable budgets. Issuance remains separate and requires confirmation.

## ADR-012 Shared baseline, comparison provenance and reversible evidence removal

Baseline objects now participate automatically in both options; shared IDs take their authoritative values from Baseline. Existing option-only data is retained. Save/delete propagation is tested. Model v2 applies this rule even to old saved workspaces, and v1 analysis records are marked stale. Comparisons require current revisions and the selected target/time. Conservative whole-workspace invalidation remains intentional.

Evidence removal is reversible and blocks content access/new issue selection while retaining private bytes and audit provenance. This is an interim recovery rule, not approval of permanent deletion or backup retention. Migration 0010 adds archive/update provenance without deleting existing data.

Manual scope can explicitly use a fixed-price basis with quantity one; its canonical rate unit remains item. Count scope accepts whole nonnegative values. The backend rejects fixed scope with a different quantity/override.

## ADR-013 Automatic explorer shadows (14 October 2026)

The user's new request authorises automatic provider-building shadows and fullscreen exploration. This supersedes earlier restrictions on provider heights for previews, while preserving separate authoritative project analysis.

Explore reads loaded tiles, prioritises nearby footprints, and sends at most 500 parts/10,000 vertices to a stateless local endpoint. pvlib supplies sun position; solid-building shadows use local UTM coordinates. Preview heights support 1,000 m; saved project inputs retain the 100 m limit. Invalid fragments are omitted and counted. Loaded tiles, seams and sample bounds can leave gaps. Terrain, trees, courtyard holes and facade/roof occlusion are excluded; no complete-coverage percentage is claimed.

The bounded public endpoint fetches no remote URL and writes no records. Explicit UTC offset defaults to Malaysia +8; no automatic timezone inference. Moving the map or changing inputs clears prior overlays and cancels obsolete browser requests. Provider preview never enters issued project analysis.

References: [Shadowmap interaction](https://shadowmap.org/) and [MapLibre source features](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#querysourcefeatures). No paid Shadowmap API, deployment or remote write.


## ADR-015 Explicit organisation and project access (19 October 2026)

Supersedes ADR-004 and ADR-011 operator-only onboarding and implicit administrator access. Verified users may create independent tenants and join recipient-bound expiring invitations. Administration is an explicit capability, not confidential-data access. Project actions require membership and project-grant intersection. Workspace mode is explicitly configured; purpose never grants authority. Legacy migration 0011 materialises previous effective access and requests workspace confirmation. See [organisation-access.md](organisation-access.md) for templates, migration, routing, account prerequisites and limits. No external organisation sharing or approval workflow is implied by the Review shell.
# Tracking authority — 26 October 2026

The current reconciliation request establishes `docs/tracking/*.csv` as canonical tracking data, with generated workbook/Markdown views. Earlier implementation decisions below remain historical policy evidence; current status is in `FEATURE_STATUS.md`. Requirements express intended scope, while code inspection establishes implementation. Contradictions remain visible in `tracking/reconciliation.md`.

The supplied catalogue's section 00 refinements and section 10 staged roadmap control the focused pilot. CORE priority does not release F13/F16–F20 gates. In particular L05/F17's limited calibrated-reference priority is retained alongside its sample/privacy/calibration gate. Exact multi-time shade scheduling and owner evaluation policy remain unresolved. Source: catalogue sections 00, 10, 13 and existing AGENTS.md; no new business rule is selected here.

The 84 S/L/O/A roadmap entries are the feature-count denominator. F/D/E baseline IDs overlap; K refinements, resource identifiers and acceptance requirements are not additional modules. Source: catalogue and original workbook. No completion percentage or deployment/customer acceptance is inferred.


## ADR-016 Limited calibrated plan reference (27 October 2026)

The user explicitly requested completion of L05. This authorises the overlapping limited F17 reference workflow, not the broader gated expansions. Store only sanitised images or locally rendered selected PDF pages in private evidence; retain source/hash/page metadata. Use a backend-calculated two-point similarity transform in the site metric CRS. Preserve traced geometry on replacement, flag it for explicit review and block issuance until review. Declared uncertainty is not a measured residual. Representative-plan and field/pilot acceptance remain open. See [plan-reference.md](plan-reference.md) and [checkpoint evidence](tracking/evidence/l05-2026-10-27.md).

## ADR-017 Concept terrain and ponds (27 October 2026)

The user explicitly requested L06 development, authorising its limited F18 overlap despite historical LATER priority. Use independent scenario heightfields in the existing revisioned workspace, explicit flat start/datum/source, metric frame validation and a synchronized local SVG concept diagram. Pond regions are rectangular and horizontal-water/depth-only; no hydrology or quantities are inferred. Recalculate object representative-point contacts and block unsupported flat-ground shade on edited terrain. No new production dependency or migration is necessary. Field/pilot gates and F19/F20 remain open. See [terrain guide](terrain-concepts.md).

## ADR-018 Bounded original object palette (28 October 2026)

The explicit L07 request authorises the limited F19 overlap. Use twelve original project primitive presets under the existing repository MIT licence, with stable IDs/versions, source hashes, nominal metre dimensions and ground-centre pivots. Backend reconstructs footprints and quantities; Three.js provides lazy instanced concept rendering with a 2D/numeric fallback. Existing private workspace revisions, rate links and per-scenario terrain remain authoritative. Do not replace admitted asset definitions in place. Large libraries, external imports, engineering/energy claims and G11 user/field acceptance remain excluded or gated. See [object-palette.md](object-palette.md).


## L04 bounded spatial operations ? 1 November 2026

The user explicitly requested complete L04 development. This checkpoint adds its bounded general CORE/NEXT toolset using existing pinned MapLibre/Terra Draw, PyProj and Shapely. Operations validate a complete draft before replacing it, use the existing save/revision path and preserve sources/rates. Work-area cutouts are supported; unsupported courtyard shade is rejected. Split/merge/cutout cannot guess allocation of overrides or bound plant/material schedules.

Named selections use browser/account/project/scenario storage as a technical implementation choice; this is not a confirmed preference for collaborative storage. Fixed grid dimensions use a 1 mm software tolerance, not a field accuracy assertion. The wider single map-embedded terrain/object interaction remains unfinished and L04 stays Partial. See [toolkit contract](spatial-editing.md) and canonical tracking for evidence and gates. No additional backlog scope, remote write or deployment is authorised by this decision.

### L04 connected editing continuation — 12 November 2026

Reuse the existing project editor from the L04 product entry rather than maintaining a second editing form. Keep viewing controls outside mutation fieldsets; enforce geometry writes and restore permissions independently on the backend. Extend the existing read-only scene response with boundary/target geometry in the authoritative quantity UTM frame. Render terrain-sampled outlines, not inferred engineering surfaces. Baseline topology operations consume inherited IDs before preview validation, matching normal save semantics. Broader calibrated-reference/constraint 3D parity and field/device/customer acceptance remain open. See [evidence](tracking/evidence/l04-connected-2026-11-12.md).


## L03 private survey register - 2 November 2026

The explicit L03 request authorises the CORE source/evidence/unknowns register and simple K05 site-check queue. Reuse workspace revisions, project grants, private evidence and existing GeoJSON validation rather than a parallel storage service. Record manual consent, source uncertainty, responsibility and supplied verification; map labels cannot certify utilities or setbacks. Constraint geometry is contextual and never changes quantities. Preserve private notes/locations/person names; issued outputs receive only frozen counts and limitations. Unresolved counts are visible, but no new automatic issue veto or authority policy is invented. See [implementation contract](site-constraints.md) and [evidence](tracking/evidence/l03-2026-11-02.md).


## L01 hub and K01 acknowledgement - 4 November 2026

The user requested complete L01 development. Its controlling scope explicitly includes K01, so the hub reuses existing briefs/grants and adds reusable contacts/templates, work-queue fields, permitted duplication and an exact-brief acknowledgement record. See [implementation contract](project-hub.md) and [evidence](tracking/evidence/l01-k01-2026-11-04.md).

Implementation choices, not confirmed user preferences: reusable libraries are private per account/organisation; project contact snapshots follow project read grants; owner is a label, never a grant; sales stage is independent of saved output progress. Copies start active with creator-only grants and no inherited acknowledgements or outputs. These defaults minimise unintended cross-project disclosure; shared organisation CRM policy remains a possible future refinement.

K01 records external acknowledgement evidence rather than treating an internal tick as acceptance. Draft-only policy blocks unconfirmed issue; qualified issue requires the applicable issuer capability to record. For compatibility, projects without a checkpoint retain qualified issuance with an explicit NOT CONFIRMED disclosure. Pilot/company approval of this default is pending. Later brief revisions invalidate acknowledgement, while historical checkpoints and issued payloads remain immutable. No signature service, automatic client acceptance or external message was added.


## L11 bounded multi-time studies - 5 November 2026

The explicit L11 implementation request authorises its bounded NEXT study slice without claiming D2/pilot acceptance. Reuse existing geometric shade and immutable artifacts; use explicit-offset non-overlapping bands, duration-weighted midpoints and a clipped 10x10 grid. Night/unsupported low sun are separate duration categories, never successful zero shade. Baseline then additional building then canopy attribution avoids overlap double counting; standalone source values remain non-additive. Limits and attribution are implementation choices, not field or company policy acceptance. Studies stay separate from issued-output analysis contracts. See [method and boundaries](shade-studies.md).


## Geographic Studio display adapter - 8 November 2026

User authorised resolving the separate map/metric scene. Reuse the existing Three scene as a MapLibre custom 3D layer and preserve backend UTM editing/calculation authority. The display-only tangent frame is sampled against exact PyProj conversion and refuses residual above 0.05 m; this threshold is an implementation choice, not field acceptance. Elevations remain relative to the declared concept starting surface. Overture-style GeoJSON is an explicit tab-local visual supplement; no inferred heights, silent work-item import or promised global coverage. [Resources and limitations](geographic-studio.md).


## Proposed-product interface before remaining domain work - 11 November 2026

The explicit request authorises UI surfaces for all 84 roadmap IDs while preserving existing connected behaviour. Use the local PDF catalogue generated in the prior task because the supplied Linux-style attachment path is unavailable on this Windows host. UI placement/readiness is canonical in docs/tracking/ui-coverage.csv; scripts/ui-catalogue.py generates the app manifest and coverage Markdown. Existing domain status registers remain independent. Ten reusable workbench families provide honest preview interactions; no new service endpoint, persistence, calculation or AI generation is implied. The route commits workspace switching before activation to avoid the previous URL overriding the choice. Preview discard never clears a real workspace recovery draft. See [design decisions](UI_DESIGN.md), [coverage](UI_COVERAGE.md) and [evidence](tracking/evidence/product-ui-2026-11-11.md). No remote/paid action was authorised.

## Separate site inventories from provider graphics — 12 November 2026

Retain MapLibre/OpenFreeMap/Photon. Existing provider buildings and the custom-layer API support the requested display without a paid renderer migration. OSM tree-node lookup is an explicit bounded read; sourced GeoJSON and manual records provide the fallback where coverage is unsuitable. Included trees persist in the existing revisioned project site contract, independently of workspace quantities. Source/licence attribution and unknown dimensions survive retain/remove decisions. A legacy locator-only save preserves inventory records. Optional DEM configuration has no default provider. Illustrative crowns/shadows never enter L11 tree-excluded analytical shade or issued quantities. No provider account, credential, deployment or new paid source was created. See [full contract and limitations](tree-management.md).

### Subsequent explicit Mapbox replacement

The later user instruction explicitly replaces the renderer/provider and supplies an existing public token. That supersedes the renderer choice above: use Mapbox GL JS/Standard with a separate Satellite raster layer in its middle slot, retain authored root layers and project APIs, port Terra Draw and custom Three.js matrices, and integrate existing solar/weather with Mapbox lighting/fog. Keep native scenery distinct from editable tree records and L11 numerical inputs. Disable inherited terrain until explicitly selected; pause concept/elevation and flat-ground preview combinations that lack a shared vertical/analytical contract. Real satellite Raster Tiles API requests return 429 with a -1 limit header despite valid token/style access; do not interpret a synthetic tile test or zero dashboard usage as provider qualification. No new account, payment change, remote write or deployment. [Contract](mapbox-migration.md), [observed checks and gate](tracking/evidence/mapbox-migration-2026-11-12.md).

## Catalogue authority and contractor workflow clarification - 12 November 2026

The user explicitly identifies the current full catalogue as the approved roadmap and HTML v0.3 as a proposed interface concept. The accessible Desktop PDF matches the repository copy; the separately named suffix (1) file is absent. Correct editable CSV descriptions and generated views without changing approved IDs, names, priorities, status dimensions or the 84-roadmap denominator. Visual object placement, quantity derivation, sourced rate linkage and partial/complete estimate readiness are separate stages. Keep the existing documented warning/issue policy; this review does not introduce a new price or measurement rule. Full vehicle-road construction and verified terrain/pond costing are proposals for team review, not adopted scope. The separate Organisation Review procurement journey is not fulfilled by F14's internal option brief. See [reconciliation](UI_CONCEPT_RECONCILIATION.md) for source hashes, differences and open decisions.

## Design Studio product framing - 12 November 2026

The user wants Design Studio presented as a town-builder-like site-planning workspace for contractors and landscapers, connected to construction quantity takeoff and preliminary estimating. Interpret the town-builder comparison as an approachable, map-centred way to explore a selected site and arrange proposed landscape work; do not imply game-engine simulation, surveyed accuracy, automatic pricing, full vehicle-road engineering, terrain earthworks, or complete contractor quotation. Keep the five explicit stages from visual design through quantity, sourced rate, preliminary subtotal and readiness. Retain the catalogue's feature IDs, priorities and implementation statuses. See [Design Studio feature list](DESIGN_STUDIO_FEATURES.md), [contractor workflow](contractor-workflow.md) and [measurement and estimating](measurement-and-estimating.md). This is product framing and description cleanup, not approval of PROP-ROAD-01 or PROP-EARTH-01.


## L31 roadwork roadmap addendum - 12 November 2026

The user subsequently asked to add road building to Design Studio. This explicitly adds L31 to the editable project roadmap; the original 11 November PDF remains an 84-feature historical baseline, so the current project register contains 85 roadmap features (84 baseline + L31). Initial limited scope: deliberately drawn/sourced site-road or driveway paved surface, explicit user-defined pavement layers, dimensional takeoff and compatible sourced preliminary rates. Recommended priority split is CORE (LIMITED) for that bounded takeoff and NEXT for expanded profiles/engineering coordination; this split still needs user/product confirmation. At initial roadmap entry L31 had no implementation. The 12 November repository audit now records a partial connected area-to-layer-volume/rate slice with focused checks; it is not a complete road-design feature or accepted for field use. Engineering standards, region/class, measurement inputs, conversion policies, qualified review and pilot acceptance remain open. QGIS/GRASS/GDAL are optional review/data tools, not certified road-design solvers. L06 terrain earthworks/pond cost remains a separate unapproved proposal. See [L31 specification](features/L31.md), [addendum source](tracking/sources/user-roadwork-addendum-2026-11-12.md) and [roadwork evidence](tracking/evidence/roadwork-feature-addition-2026-11-12.md).

## L31 proposed map road placement clarification - 12 November 2026

The user asked whether L31 permits dragging roads on the map like a town-building game, then confirmed that this interaction is proposed. Record cursor-following route preview, adjustable width and editable curves under the existing L31 ID as proposed NEXT interaction details for review. The connected L31 implementation still requires a manually drawn area polygon before layer takeoff. This clarification does not promote the drag tool to implemented, approve a priority, add a second roadmap feature or establish engineered alignment. Route representation, joins/intersections, overlap quantities and keyboard/touch alternatives need design decisions. See the [source messages](tracking/sources/user-road-drawing-clarification-2026-11-12.md), [new acceptance criteria](features/L31.md) and [documentation audit](tracking/evidence/road-drawing-list-update-2026-11-12.md).


## D1B owner review storage and policy (13 November 2026)

Owner review records are append-only revisions in `review_entries` (immutable rows, highest revision current) so history and audit (S10) need no separate log. Received originals and decision packs are stored as private bytes in PostgreSQL (`review_files`), matching the existing issued-PDF retention, so one database backup restores records and files consistently; photo evidence remains in private Supabase Storage. Files are admitted by content (PDF, OOXML XLSX, JSON object), never by filename, and are not parsed. Because REC-010 is unresolved, the software adopts no procurement policy: each project's owner must explicitly choose self-approval, missing-score rule and reviewer aggregation; weights must total exactly 100; ties are reported and never broken; price is scored by reviewers rather than by an invented formula. Ranking is review support; only a recorded human approval decides.

## MVP completion decisions (13 November 2026)

- **Output template versioning.** Issued payloads carry `template` (3) and manifest `infrashader-output-v3`; the
  retained PDF records `infrashader-react-pdf-v{template}`. v2 payloads keep the v2 rendering path. Plan sheets are
  computed by the API in the workspace's metre CRS; a failed projection yields an explicit not-to-scale record.
- **Maintenance checklist.** Issuer-supplied rows only (responsibility, frequency, in-price, assumptions); no
  generated recommendations; whole-life costing stays NEXT.
- **Decision memorandum.** Rendered in the browser from the retained, hash-verified decision-pack.json, retained
  once per approved decision revision (migration 0017); the JSON pack and CSV appendix remain authoritative.
- **Offer text suggestions.** Deterministic PDF text layer / XLSX cells only (no OCR/AI), bounded, never persisted
  and never official until mapped and confirmed. OCR/AI extraction remains NEXT pending representative documents.
- **CSV safety.** All CSV exports neutralise formula prefixes while keeping plain numbers numeric.
- **Superseded rates.** A newer rate version triggers a readiness review warning; estimates never rebind.
- **Client read retry.** Idempotent GET/HEAD requests retry once after a network failure; writes never retry.
- **Test infrastructure.** Integration, live, access and Browser Demo Playwright configs accept alternate ports
  and run the production bundle there (Edge `ERR_NO_BUFFER_SPACE` and dev-server reloads made the dev server an
  unreliable test target on Windows).
- **New dev dependency.** `@axe-core/playwright` 4.14.0 (MPL-2.0) for automated accessibility scans only.
