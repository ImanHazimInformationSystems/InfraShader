# Requirement implementation map

SRS v0.3 IDs are stable. Status distinguishes code from accepted verification. See [validation.md](validation.md) for executed checks and blockers.

| Requirement IDs / features | Code or planned module | Evidence / current status |
|---|---|---|
| IF-02, APP-19/20, QLT-06/07; D10 | API main/config/errors; web API status; locks/CI/docs | Implemented locally; lint/typecheck/build and health checks pass; hosted CI not run |
| FR-01–03/57; F01 | Project schemas/repository/routes; web brief | Real PostGIS brief/site/reload and both-purpose browser paths pass; real Supabase Auth pending |
| FR-58–60, UI-04, IF-03/05/06; F03 | Explore/MapLibre/numeric extent; project site | Rendered extent and numeric selection browser-tested; provider D2 pending |
| APP-01–05, IF-01, SEC-01/02; D01/D02 | Supabase web session + JWT/membership backend | JWT/current-membership tenant tests pass; real Supabase and management UI pending |
| APP-06–08/13/14/16, UI-01/02/05; D03/D04/D06/D07 | Dashboard/project editing/archive/conflict | Save/archive/conflict and responsive browser evidence recorded; full session recovery pending |
| DATA-01/02, SEC-03/07 | Tenant FKs, atomic revision updates, no browser privileged keys | Real DB tenant/revision/revocation tests pass; deployment and live Storage security unverified |
| FR-08–12, IF-03, QLT-03; F04 | Geometry domain kernel (M2) | Canonical area/length/count, CRS rejection, drawing/save/reload implemented and tested; full field/capacity checks pending |
| FR-04–07/13–14/61–63; F02/F05/F15 | Workspace and private evidence modules | Targets/opaque buildings/canopies/work items and photo validation implemented; live Storage and evidence links pending |
| FR-15–25/27, APP-15; F06/F07 | Analysis module | pvlib solar, supported ground projection, union/clip, night/low-sun and stale states tested; field validation and map overlay pending; numerical claims omitted from issued PDFs |
| FR-26/28/29; F08 | Workspace Baseline/Option A/Option B | Independent saved scenarios and comparison calculations tested; full comparison usability pending |
| FR-30–48; F09–F11 | Catalogue/estimate/pricing | Dated rates, Decimal estimates, explicit charge editor, duplicate guards and selling methods tested; commercial policy and catalogue management pending |
| FR-49–56/64–68, IF-07, SEC-06; F12/F14 | Snapshot/output modules | Distinct immutable allowlisted outputs and two-page PDF downloads tested for both purposes; independent review history and full layout/restore matrix pending |
| APP-09–12/17–18, DATA-03/04, SEC-04/05/08; D05/D09 | Settings/file/lifecycle modules | Private photo proxy/metadata implemented; live Storage, profile/settings, lifecycle and privacy controls incomplete |
| PERF-01/02, REL-01/02, QLT-01–05; D08 | Browser/limit/load/recovery checks | 18 responsive foundation tests and two real-DB browser workflows pass; physical touch/accessibility/load/recovery acceptance pending |
| BLD-01–14; F13 | Separate building stages | G9 gated |
| AI-01–04, PLN-01–04; F16/F17 | Optional narrative/reference adapters | G10 gated |
| TER-01–06, OBJ-01–04, AST-01–05; F18–F20 | Separate terrain/assets modules | G11 gated independently |

No row implies completion of a whole requirement from a placeholder, demo, proposed test, or source reference. Maintain the map as each saved workflow is implemented.
