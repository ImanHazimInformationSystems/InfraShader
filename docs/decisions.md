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
