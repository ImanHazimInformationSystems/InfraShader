# InfraShader: layered N-tier architecture review

**Review draft 1.0 | 21 October 2026 | Current local implementation**

Prepared from the working tree on `build/core-spatial-completion`, based on commit `7effa9c` plus existing uncommitted changes. This is an as-built architecture, not a claim that the whole product roadmap or production release is complete. No application behaviour was changed to produce this review.

Open **[REVIEW.html](REVIEW.html)** for the illustrated review pack. The two SVG files are scalable diagram originals; PNG copies are convenient for sharing.

## 1. Architectural classification

InfraShader is a **three-tier application with five logical responsibility layers and supporting identity/file services**. The frontend is a browser application; the backend is a modular Python monolith; persistent business data and private file services form the data tier. These are runtime boundaries, not necessarily separate computers. Development currently places them on one PC.

The five layers are **presentation, API boundary, application/domain logic, persistence/integration adapters, and persistent data**. Layers 2-4 execute in one FastAPI process. The layer diagram describes responsibilities: there is no fully separated repository/service architecture. Workflow modules contain SQLAlchemy queries and integration calls, and `main.py` contains handlers and some service checks. Do not interpret the diagram as five independent servers, microservices, or strict enforced dependency inversion.

## 2. Layer responsibilities and source mapping

| Logical layer | Responsibility | Actual implementation |
|---|---|---|
| L1 Presentation and client adapters | Studio/Review navigation, forms, maps, drawing, previews, browser PDF generation, sessions and recovery | `apps/web/src/App.tsx`, `components/`, `domain/`, `services/api.ts`, `auth.ts`, `routes.ts`, `pdf.tsx` |
| L2 API/request boundary | `/api/v1` HTTP endpoints; Pydantic validation; body limits, CORS, errors and request IDs; protected-route identity dependency | `apps/api/app/main.py`, `onboarding.py`, `schemas.py`, `auth.py`, `body_limit.py`, `errors.py` |
| L3 Application and domain | Tenant/project policy; transactional project/workspace workflows; rates, estimates, review, issue snapshots; geometry, solar and pricing rules | `access.py`, `projects.py`, `workspace.py`, `calculations.py`, `reviews.py`, `administration.py`, `onboarding.py`, `evidence.py`, `explore.py`, `domain/{geometry,shade,pricing}.py` |
| L4 Persistence/integration adapters | SQLAlchemy sessions/models and Psycopg; private Storage HTTP proxy; image sanitisation; trusted JWKS and verified-account lookup | `db.py`, `models.py`, `evidence.py`, `auth.py`, `onboarding.py`; adapters are partly colocated with workflows |
| L5 Persistent data/file services | Application PostgreSQL/PostGIS records and private evidence bytes | Local application DB on 54322; Supabase private `evidence` bucket through 54331; Alembic migrations 0001-0011 |

React/TypeScript/Vite, React Router, Zod, Tailwind/Radix/CVA and Lucide implement the UI. MapLibre, Terra Draw and custom WebGL2 implement exploration, drawing and visual weather. FastAPI/Uvicorn run on Python 3.12; Pydantic validates server contracts. SQLAlchemy/Psycopg/Alembic manage persistence. Shapely/PyProj/pvlib perform spatial and solar computation; Decimal and PostgreSQL NUMERIC handle money. Exact installed dependency versions are defined by the lockfiles; this diagram does not propose new dependencies.

## 3. Connections and trust boundaries

| Connection | Direction / protocol | Boundary and meaning |
|---|---|---|
| Web assets | Browser requests Vite :5173 during development | Vite serves frontend code; browser executes React. Vite is not the business-logic server. |
| Business API | Browser to FastAPI :8000, JSON plus bearer JWT; multipart for photos | Direct configured API URL or Vite `/api` development proxy. Responses return through the same path. |
| Identity | Browser to Supabase Auth :54331 | Public browser key, login/refresh/recovery. Auth establishes identity, not project authorisation. |
| Server identity trust | API to configured Supabase JWKS and current-user endpoint | JWT signature/issuer/audience/expiry/subject verification; current verified email is checked for organisation creation and invitation acceptance. JWKS is cached; there is not an Auth network call on every request. |
| Business persistence | API to application PostgreSQL :54322 using Psycopg | Browser has no application SQL connection. ORM reads/writes are scoped and authorised in backend code. |
| Private photos | API to Supabase Storage :54331 using server-only secret | Upload/download proxy; browser does not receive the secret or use a direct public bucket path. |
| Public context | Browser directly to OpenFreeMap / Photon over HTTPS | Style/tiles and user-submitted location queries; configurable/offline fallback. These are external dependencies despite local deployment. |

Protected actions require a valid identity, active organisation membership and relevant capability. Project actions additionally require the explicit project grant and a permitted enabled workspace. Administrative membership alone is not a confidential-project or internal-pricing bypass. Workspace selection, URL, purpose and local preferences are not permission sources.

Public `/api/v1/explore/shadows` and `/api/v1/explore/solar-day` endpoints are bounded and stateless: they do not require project membership and do not persist a project. Health/OpenAPI endpoints also have different access semantics from protected project routes. Do not label every API call as authenticated.

Some application migrations enable RLS and revoke browser-role grants, but the application DB owner can bypass RLS; current tenant security relies on explicit API checks. Migration 0011 does not introduce a complete RLS policy set for its new tables. The architecture must not claim universal database-enforced tenant RLS.

## 4. Persistent data ownership

Application DB tables: `organisations`, `memberships`, `projects`, `project_grants`, `invitations`, `workspaces`, `workspace_revisions`, `catalogue_rates`, `artifacts`, `evidence`, `project_revisions`, `user_profiles`, `administration_events`.

- Site and workspace geometry primarily travel as WGS84 longitude/latitude GeoJSON/JSONB. A generated PostGIS polygon envelope and GiST index support project spatial storage; not every geometry is a native PostGIS column.
- Shapely/PyProj in the API select and apply a suitable projected CRS for metric calculations. The browser does not own accepted quantities.
- Project and workspace revisions are separate. Artifact payloads record their source revisions; changed inputs can make results stale. Versioned rates and explicit pricing policy feed estimates.
- Database triggers reject updates to artifacts and relevant history/audit rows. This is application snapshot/history immutability, not a cryptographically signed PDF, WORM archive or deletion-proof database.
- Supabase Storage holds private photo bytes; the application DB holds object references, metadata, SHA-256 and archive state. Cross-service consistency uses compensation for a failed metadata save, not a distributed database transaction.
- Supabase has a separate internal database on **54332** for its own service state. Do not draw it as the application's business PostGIS database on **54322**.
- Browser Demo uses a separate localStorage namespace. Auth sessions/preferences and scoped recovery drafts are client state, not authoritative business persistence. Real recovery uses existing account/organisation/project scoping; Demo is not evidence of real-service acceptance.

## 5. Representative end-to-end flows

**Sign in and open a project:** browser signs in through Supabase; receives session tokens; sends bearer token to FastAPI; server validates JWT and loads current membership/grants from application DB; authorised project data returns to Studio or Review. Old-tenant state is cleared on switching. Project access is rechecked by protected requests even if the UI has stale preferences.

**Automatic Explore shadows:** browser loads provider tiles, extracts bounded nearby building footprints/heights and sends them with site/time to the public Explore API; pvlib/PyProj/Shapely compute the preview; browser draws the returned overlay. Manual weather clouds/rain, sky/light and animation render in the browser. They do not alter numerical shade or prices. Provider coverage/height assumptions and low-sun/night/unavailable states remain visible; this is distinct from saved, sourced project analysis.

**Saved analysis and estimate:** user saves geometry through the protected API; backend validates it, derives quantities in a suitable CRS and writes a workspace revision; requested calculations use server geometry/rates/policy; result artifacts retain revision provenance and incomplete/stale status. There is no durable worker queue or separate calculation service in the current code.

**Issue and download:** backend validates capability, readiness, purpose and source revisions; creates an audience-filtered immutable snapshot payload with idempotency protection; browser receives that allowed snapshot and `@react-pdf/renderer` creates the PDF. Draft previews do not issue a record. Current PDF files are not generated by a backend PDF worker or retained as a server-side PDF archive. Issued outputs omit numerical shade claims while field validation remains open.

**Private evidence:** authorised upload passes file/pixel limits and Pillow re-encoding to remove embedded metadata; API writes private bytes through Storage and stores metadata/hash in business DB; subsequent downloads pass fresh project-access checks and integrity verification. Archive is reversible; permanent retention/erasure and combined restore remain wider operational gates.

**Join a team:** authorised administrator creates a recipient-bound expiring token; only its hash is stored; the one-time link is copied manually. Verified recipient accepts under transaction locks; membership is created/reactivated with explicit capabilities and audit. Existing projects are not automatically granted. Local recovery mail is handled by the Supabase mail tool; team invitation delivery is not an external email service.

## 6. Local runtime versus future production

| Runtime | Local configuration | Status |
|---|---|---|
| Web development server | 127.0.0.1:5173 | Implemented, Vite |
| Python application | 127.0.0.1:8000 | Implemented, Uvicorn/FastAPI |
| Application PostgreSQL/PostGIS | 127.0.0.1:54322 | Separate local business DB; disposable `_test` DB used by tests |
| Supabase gateway | 127.0.0.1:54331 | Local Docker/WSL2 Auth and private Storage |
| Supabase internal PostgreSQL | 127.0.0.1:54332 | Service-owned state, separate from business DB |
| Supabase Studio / local mail UI | :54333 / :54334 | Local administration/recovery tools, not end-user tiers |

These are configured ports, not a live process inventory. No production topology has been deployed. A future hosted design must decide frontend asset hosting, HTTPS ingress, API hosting, database/file backup and restore, secrets, monitoring, capacity and network isolation. A reverse proxy, CDN, managed database, distributed cache and queue must not be drawn as already implemented.

## 7. Explicit exclusions and extension points

Not implemented in this foundation: recipient-bound cross-organisation disclosure packages, submission inboxes, scoring, formal approvals, a durable job queue, distributed cache, live weather integration or a retained-PDF archive. Supabase Realtime, edge runtime and analytics are disabled in local configuration. Gated BIM/terrain/AI extensions (F13, F16-F20) are not active components. Native MapLibre 3D does not imply Three.js/BIM implementation.

The recommended next architectural extension is an explicit immutable disclosure-package workflow. It must project approved data into a recipient-bound record, rather than granting a recipient live access to the sender's private project. A worker tier would be a separate future decision if measured workloads justify asynchronous jobs.

## 8. Review decisions

1. Confirm the distinction between three runtime tiers and five logical layers.
2. Confirm that current separate business DB and Supabase service DB ownership is shown correctly.
3. Confirm the browser-rendered PDF model; decide separately whether retained server PDF bytes are a future requirement.
4. Confirm recipient-bound disclosure as the next boundary before an exchange/review portal.
5. Treat hosting, field accuracy, full assistive-technology/physical-device testing and operational recovery as open release gates.

## 9. Evidence and verification

Source inspection for this document: `App.tsx`, client API/Auth/map/PDF/Demo/recovery modules; API routes, JWT verifier, access/onboarding, persistence/models, evidence adapter and calculation modules; Alembic migrations; `supabase/config.toml`; development scripts; package manifests; existing architecture/decision/validation documents.

The 19 October validation record reports 184 backend tests, 36 frontend tests, real Supabase/project flows and responsive/map checks, including targeted reruns. Those results are historical evidence, **not tests newly executed for this architecture-only review on 21 October**. Diagram files are rendered and visually inspected for this review; application test suites and service health are not rerun.

The older `docs/architecture.md` sentence saying Supabase verification awaits a restart is superseded by the later validation and organisation-access records. Its geometry description should also be read with ADR-012's shared Baseline policy, rather than implying Baseline objects are independent of options.

## 10. Source index

- [API entry points](../../apps/api/app/main.py), [identity verification](../../apps/api/app/auth.py), [access policy](../../apps/api/app/access.py), [onboarding](../../apps/api/app/onboarding.py)
- [Models](../../apps/api/app/models.py), [database sessions](../../apps/api/app/db.py), [migrations](../../apps/api/migrations/versions/), [private evidence](../../apps/api/app/evidence.py)
- [Calculations/issuance](../../apps/api/app/calculations.py), [spatial/pricing domain](../../apps/api/app/domain/), [workspace](../../apps/api/app/workspace.py)
- [Web app](../../apps/web/src/App.tsx), [client PDF renderer](../../apps/web/src/services/pdf.tsx), [map providers](../../apps/web/src/services/map.ts)
- [Local Supabase configuration](../../supabase/config.toml), [API script](../../scripts/api.ps1), [database script](../../scripts/local-db.ps1)
- [Organisation policy](../organisation-access.md), [decisions](../decisions.md), [validation](../validation.md), [requirements](../requirements.md), [technology stack](../technology-stack.md)
