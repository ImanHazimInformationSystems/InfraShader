# InfraShader — Project Summary

*Snapshot: 15 November 2026. This is an overview, not a status source. Current feature status lives in `docs/FEATURE_STATUS.md` and the CSV registers in `docs/tracking/`; decisions live in `docs/decisions.md`; verified results live in `docs/validation.md`.*

## What it does

InfraShader is a local-first web application for planning, pricing and comparing outdoor work, such as landscaping, paving, planting, site furniture and small roads. It serves two audiences in two workspaces:

- **Design Studio** (contractors and landscapers): choose a site on a map, place work on it, price it from your own dated rates, and issue a clear client proposal as a locked PDF.
- **Organisation Review** (owners and clients): set a comparison basis, invite contractors to submit, receive their proposals, compare offers fairly, score them and record a decision.

The two workspaces now connect. An owner invites a contractor organisation. The contractor prepares a proposal privately and submits a recipient-safe package. The owner receives it in their review inbox alongside other offers.

The product supports a trustworthy **preliminary** estimate and proposal. It does not claim survey-grade dimensions, certified engineering, field-validated shade or automatic market pricing.

## Core user journeys

### Design Studio: four steps, shown in a step bar at the top of every project map

1. **Site:** the estimated site area (never called a survey), the boundary source, the metric grid used for measurements, facts still to check, existing-site items, and the proposal area (target zone).
2. **Design:** Layout (roads, paths, planting beds, ground), Trees, Objects and Materials. One "Option being edited" picker switches between Existing site, Option A and Option B.
3. **Prices:** Pricing is the single place to give items a rate. It offers only rates in the item's unit, with source, validity and reuse shown. Saved rates is the organisation's dated, versioned price list.
4. **Proposal:** Review (what needs attention, with direct fixes, and an honest Option A/B comparison), then Total (markup and charges), then Proposal (draft PDF preview, issue a locked version, retained PDF, submit to an owner).

Optional tools (Terrain, Shade study, List view) sit under **More tools**.

### Organisation Review

Steps: Basis → Rubric → Offers → Scores → Clarifications → Evaluation & decision. Invitations to contractors are managed on the review project. Received offers must be confirmed by a reviewer before scoring. Receipt is never acceptance.

### Contractor-to-owner submission

1. The owner drafts an invitation, previews exactly what will be shared, and issues a single-use link.
2. The contractor accepts it for their own organisation, links or creates a private project, issues a proposal, previews the outgoing package and submits.
3. The owner sees the offer with a receipt. Revisions keep history and make confirmations and scores stale. Withdrawals are recorded, never deleted.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite; npm workspace in `apps/web` |
| Maps / 3D | Mapbox GL JS (Standard and Satellite), Terra Draw for drawing, Three.js for custom 3D layers |
| Validation (web) | zod schemas for every API response |
| PDF | `@react-pdf/renderer`; the issued PDF bytes are retained by the backend |
| Backend | Python 3.12, FastAPI, Pydantic contracts; `uv` with committed locks in `apps/api` |
| Data | PostgreSQL + PostGIS via SQLAlchemy; Alembic migrations (currently 0001–0021) |
| Geometry | Shapely and PyProj (projected metric CRS for quantities); pvlib for sun position |
| Auth / files | Supabase Auth (local) and Supabase private Storage for evidence |
| Tests | vitest (frontend), pytest on disposable PostGIS schemas (backend), Playwright browser suites (integration, reference, product UI, access/live) |

## Repository structure

```
apps/
  web/                 React app
    src/App.tsx        Routing, session, organisation/workspace context, project pages
    src/components/    Feature UI (StudioShell, GeometryWorkspace, PricingBoard, CalculationsPanel,
                       OwnerEvaluation, Opportunity*, SubmitToOwner, StartPage, ...)
    src/domain/        Typed schemas and pure logic (workspace, pricing, studies-guide, opportunities...)
    src/services/      API client, map, PDF, downloads
    src/product/       Workspace navigation and feature-catalogue preview pages
  api/                 FastAPI service
    app/main.py        App and core routes
    app/access.py      Membership and project-grant capability policy
    app/calculations.py  Estimates, issue snapshots, draft previews
    app/schedules.py   Quantities, price rows and pricing preview
    app/owner_review.py  Owner inbox, basis, rubric, scores, decision pack
    app/opportunities.py Invitations and submission packages (S03/L25/O05)
    migrations/        Alembic versions
    tests/             pytest suites and test-only fixture servers
docs/                  Plans, decisions, validation, UI design, feature specs, tracking registers
tests/                 Playwright suites (integration-browser, reference-browser, product-ui-browser, ...)
scripts/               API/DB helpers and tracking/catalogue generators
```

## Software architecture

**Shape.** A single-page React client talks to a FastAPI JSON API over HTTPS with a bearer token from Supabase Auth. The API is stateless per request and owns all business rules. PostgreSQL/PostGIS is the system of record.

```
Browser (React)  ──JWT──▶  FastAPI  ──SQLAlchemy──▶  PostgreSQL + PostGIS
   │  Mapbox / Three.js                │  Supabase JWKS (verify tokens)
   │  draft state, previews            └─ Supabase Storage (private evidence files)
   └─ zod-validated responses
```

**The backend is authoritative.** The backend, not the browser, decides:
- authorisation (organisation membership, workspace capabilities and per-project grants, deny by default; administrator is not a bypass);
- geometry validation;
- metric quantities (in a declared projected CRS; transfer is WGS84 lon/lat);
- prices (Decimal money);
- readiness and issue checks;
- issued snapshots.

The browser only previews. Draft pricing is calculated by a non-persisting server endpoint.

**Revisioned and immutable records.**
- Workspaces carry a revision; saves use expected-revision checks.
- Owner review data is append-only (`review_entries`).
- Issued proposals and briefs are immutable snapshots, with their PDF bytes retained (`issued_files`).
- Later edits never mutate them: a change means a new version.

**Staleness is explicit.** Edits mark dependent quantities, estimates, studies and issued versions out of date. Incomplete or unpriced work stays visible and never becomes a silent zero.

**Cross-tenant exchange.**
- Invitations use opaque, hash-stored, single-use tokens bound to a verified recipient email.
- A submission builds an **allowlisted** package from an issued proposal. In one database transaction it writes the package, byte copies of the PDF, the manifest and any attachments into the owner project, plus an inbox entry.
- No membership or grant crosses organisations.

**Browser Demo** is a separate, browser-only mode with no real persistence or authorisation. It is never used as evidence.

## Key features (implemented subsets)

- **Site and evidence:** site selection, site summary, constraints register, plan references, private evidence photos.
- **Design:** spatial editor and town-builder-style layout, trees (proposed and existing inventory), landscape objects, ground paint, bounded roads/paths (L31), concept terrain.
- **Pricing:** versioned organisation rates with source type, supplier, quote reference, validity, inclusions and exclusions; compatible-rate pricing dialog; reviewed bulk apply; per-layer m³ pricing for roads and paths.
- **Estimating and proposals:** markup or margin with explicit charges, readiness checks, draft PDF preview with a "not ready to issue" list, locked issued versions with retained PDFs, and a change register.
- **Owner review:** comparison basis, locked rubric, confirmed offers, scoring, clarifications, evaluation and a decision pack.
- **Submissions:** invitations, acceptance, linking, supporting documents, package preview, receipts, revisions and withdrawal.
- **Shade:** bounded, modelled shade studies, excluded from issued numerical claims until field validation.

The roadmap has 85 features. Many are labelled previews in the feature catalogue (sidebar → Feature previews) and are not connected. See `docs/FEATURE_STATUS.md` for the honest per-feature status.

## Main decisions made along the way

**UI and journey (15 Nov 2026)**
- Design Studio is organised as one four-step journey with plain labels. Optional tools moved under More tools, and catalogue preview pages were collapsed in the sidebar.
- Pricing is the single pricing place. The old rate table is kept only as an advanced disclosure.
- The project page leads with "Open design map"; records sit in one disclosure.
- The home page was redesigned as a launcher (next action, latest project, workspaces, recent projects), not a data dashboard.
- Draft PDF preview no longer requires every issue field; it lists what still blocks issue. Issuing stays strict.
- Issue feedback appears beside the Issue button, not at the top of the panel.

**Submissions (15 Nov 2026), with conservative defaults**
- Inviting needs the owner's review grant. Accepting needs a matching verified email and a different organisation with Design Studio. Submitting needs the issue-proposal grant: reading a project is not commercial authority.
- No late submissions. Links expire at the earlier of the closing time and 14 days. Revocation stops future actions but keeps receipts. Withdrawal is allowed and recorded.
- Owners see offers on receipt (controlled review). Sealed bids remain a separate gate (O29).
- Evaluation criteria are shared only by explicit owner opt-in (names and weights, never scores).
- InfraShader sends no email; owners share links themselves.

**Long-standing principles** (`AGENTS.md`, `docs/decisions.md`)
- Real persistence is PostgreSQL/PostGIS; no hidden mock services.
- Money is Decimal. Metric quantities need a declared projected CRS. Provenance (measured, sourced, estimated, unknown) is kept.
- No price from appearance, no silent zero prices, no duplicate charges. Existing-site items are never billable. Hidden map layers still count.
- Mapbox replaced MapLibre (12 Nov 2026). Provider data stays context, never priced work.
- CSV registers in `docs/tracking/` are the canonical tracker. Markdown views are generated; Excel only on request.
- No pushes, deployments, paid services or external messages without explicit authorisation.

## Running and checking

```powershell
npm ci; .\scripts\api.ps1 sync; .\scripts\local-db.ps1 start; .\scripts\api.ps1 migrate
.\scripts\api.ps1 dev        # API on :8000
npm run dev                  # web on :5173
```

- Frontend checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Backend checks: `.\scripts\api.ps1 lint`, `.\scripts\api.ps1 test -q`.
- Browser suites: `npx playwright test --config playwright.integration.config.mjs`. Use `INFRA_IT_API_PORT` and `INFRA_IT_WEB_PORT` to avoid clashing with running servers.

## Known gaps and open gates

- **External gates:** real Supabase Auth/Storage acceptance for the newest flows; live Mapbox provider qualification; field shade validation; customer and pilot acceptance.
- **Open policy decisions:** late-change approval policy, sealed bids, a separate quantities (BOQ) template file, and automatic email.
- **Test suites:**
  - Some reference-browser specs fail for older, unrelated reasons (sign-in landing changes, renamed controls).
  - The committed reference Playwright config cannot start its dev server from `apps/web`.
  - Vitest's default pool needs the Vite dependency cache present.
- **Not a full product:** many catalogue features are previews only. This is not a complete MVP or a production deployment.
