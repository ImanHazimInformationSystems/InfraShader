# Hosted free pilot — 16 November 2026

User authorised deployment to free Render and Supabase services. This checkpoint
establishes live infrastructure, not customer acceptance or production readiness.

## Deployed resources

- Web: https://infrashader-web.onrender.com — Render static site, manual releases.
- API: https://infrashader-api.onrender.com — Render **free** Python service,
  Singapore, one worker, manual releases; no paid disk or Render database.
- Supabase: new Free pilot project in Tokyo. No local projects, uploads, users or
  credentials were migrated. Existing local development remains separate.
- Initial application release: `85b5244074ad3872151c490cc554e73c2f656ba3`.
  Web label follow-up `0dc490a6b0e6db71fd3e036e1c29938e7ecd52f6` also reached
  live status. API remains on the initial application release with final secret
  settings applied. Documentation commits alone do not change running code.

## Database and confidential configuration

- All migrations applied successfully to `0021` through the dashboard-provided
  IPv4 session pooler. Direct IPv6 connection timed out; it was not used.
- Dedicated `infrashader_app` login, NOSUPERUSER/NOCREATEDB/NOCREATEROLE, owns
  private `infrashader` schema. Default search path: `infrashader,extensions,public`.
- PostGIS enabled in `extensions`; application schema is not granted to
  `anon`, `authenticated` or PUBLIC. Supabase Data API exposure was not expanded.
- Existing asymmetric ES256 JWKS is available. Database and Storage keys live
  in Render's API environment; the browser receives only public settings.
- Existing server key read from the dashboard without publishing its value.
  The user's Render API key and database password were supplied in ignored local
  configuration, never committed. Creating the user's credentials was handed off.

## Actual hosted checks

- API `/api/v1/health`: HTTP 200.
- API `/api/v1/readiness`: HTTP 200; database and Auth both ready.
- Anonymous `/api/v1/session`: HTTP 401, sign-in required.
- Website `/`, `/studio`, `/review`, `/settings`: HTTP 200, same SPA shell.
- Exact web-origin CORS DELETE preflight: HTTP 200, matching allow-origin.
  Untrusted origin: HTTP 400, no allow-origin header.
- Hosted application connection confirms migration head and 25 application tables.
  Anonymous/authenticated database roles have no application-schema USAGE.
- Private `evidence` bucket: PNG/JPEG only, 10 MiB maximum, not public.
  Synthetic one-pixel image uploaded/downloaded with identical bytes; anonymous
  public read denied. Synthetic object removed through Storage API afterward.
  This is service-adapter infrastructure evidence, not app-level tenant isolation.
- Recursively inspected 31 published JS/CSS assets (7,189,928 bytes) for the
  actual server credentials: none found. One filename-like library string was
  not a deployed asset and returned 404. Hosted API/Auth origins found in build.
- Headless Edge rendered the actual hosted sign-in page at 1440 and 390 pixels:
  no page errors, no horizontal overflow. Screenshots inspected locally.
  Default Playwright Chromium was absent; used installed Edge instead.
- Corrected old local-only footer/navigation labels with explicit
  `VITE_DEPLOYMENT_MODE=pilot`; local default and Browser Demo remain distinct.
  After the release went live, both widths showed the hosted-pilot footer with
  no page errors or horizontal overflow.
- Additional **synthetic identity** check: created one temporary Auth user through
  the admin API, with a reserved `.invalid` test email and no email sent. Admin
  confirmation was a fixture setup step, not evidence of real email ownership.
  Password login, refresh and signed API session all returned 200. Headless Edge
  signed in through the hosted UI, reached organisation onboarding, and retained
  the session after reload, with no page errors. No organisation/project was
  created. Test Auth user and its local password fixture were removed afterward.
- After the label change: frontend lint, typecheck and build passed; 41 Vitest
  files / 163 tests passed. Backend code was unchanged; prior local preflight
  remains 425 passed / 1 Storage-dependent skip. Hosted infrastructure checks
  above were additional checks, not a rerun of the local backend suite.
- Tracker regeneration/check and UI coverage validation passed (85 roadmap
  features, 1,085 acceptance records). S06 stays Partial/Pending acceptance;
  its Deployed dimension describes the bounded pilot infrastructure evidence.
  Added the validator-required Deployment evidence column to the canonical
  register; other features' deployment claims were not promoted.

## Pending gates and boundaries

The user has been asked to set hosted Auth site/redirect URLs and personally
create their real pilot login. Account passwords and security-setting UI changes
were handed off under the computer-use skill. Email provider restrictions remain;
do not disable verification or claim email delivery works without checking it.

Real-person account/email verification, project persistence, map provider coverage/token
restrictions, pricing/proposal issue and retained PDF, invitation/submission across
organisations, application-level evidence denial, password recovery, hosted
backup/restore and load limits have **not** passed at this checkpoint. Prior local
tests are recorded separately in free-hosting-preparation-2026-11-16.md.

Free API sleep/cold starts and Supabase limits apply. No paid plan, domain, email
service or overage commitment was selected. This is a controlled pilot; do not
invite important project data before backup/restore and real workflow checks.
