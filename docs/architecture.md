# Architecture and API

React/TypeScript/Vite calls FastAPI under `/api/v1`. PostgreSQL/PostGIS is the only business database. SQLAlchemy/Psycopg and Alembic own persistence. Browser Supabase sessions supply signed JWTs; FastAPI validates trusted JWKS, algorithm, issuer, audience, expiry and UUID subject, then reads active membership on every protected operation.

Project brief revisions and workspace revisions are separate. A workspace stores validated WGS84 boundary/targets and three independent scenario documents. The backend selects a suitable UTM CRS, calculates area/length/count and retains source/override provenance. Project-row locks serialize workspace writers and archive/issue operations. Request/body, geometry and site limits are explicit.

Catalogue rows are versioned, with NUMERIC rates. Calculations copy rates and quantity dependencies into append-only artifacts. Freshness compares project/workspace revisions. Missing rates remain incomplete; no implicit tax or charges exist. Internal pricing capabilities are checked independently of project purpose.

Analysis uses pvlib solar position, UTM convergence, Shapely solid sweeps or roof-only translation, union and target clipping. Trees and terrain are excluded. Issued PDFs deliberately omit numerical shade pending field validation.

Separate developer/client issue routes build explicit allowlists from authoritative data, check readiness/capabilities, and deduplicate retries under a project lock. A PostgreSQL trigger rejects artifact updates. React PDF downloads render immutable snapshot content, never the current mutable project. Noto Sans and its OFL are bundled locally.

Private evidence bytes use a server-only Supabase Storage adapter. FastAPI checks membership/project identity, validates image bytes/limits, strips embedded metadata, assigns generated private paths, and stores hashes/metadata in Postgres. Downloads are authorised server proxies with no-store and integrity checks. Failed metadata persistence attempts narrow object compensation. Storage reconciliation/restore remains an operational gate.

`/health` checks process availability; `/readiness` checks PostGIS/schema and usable asymmetric Auth keys. `/api/docs` is the actual OpenAPI contract. Browser business-table access is revoked; RLS has no browser policies. The app backend initially owns tables and therefore must enforce tenant checks. No service key enters Vite.

Browser Demo has a separate local namespace and does not call protected APIs or calculate accepted quantities/prices. The test-only browser identity server exists under `apps/api/tests`, uses a disposable database schema, and is never imported by the production app.

Local application DB uses port 54322. Local Supabase Auth/Storage uses 54331 and its own internal DB on 54332. This keeps private-file access behind the API rather than assuming shared database RLS. Supabase runtime tests await the user-controlled Windows restart.
