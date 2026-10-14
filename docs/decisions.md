# Decisions

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
