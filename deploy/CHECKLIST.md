# InfraShader go-live and release checklist

Tick each line and write down who checked it and when. A ticked box is only worth what was
actually checked: a fixture run, a demo or a screenshot doesn't count for any line here.

## Before the first go-live

**Approvals**
- [ ] The owner has approved hosting, paid services and the domain.
- [ ] Data retention, export, deletion and support policies are approved.
- [ ] Mapbox account terms and usage limits are reviewed, and the `pk.` token is restricted to the
      production URL.

**Configuration**
- [ ] The API environment comes from [api.env.example](api.env.example) and lives in the host's
      secret store, not in Git.
- [ ] `CORS_ORIGINS` is the exact production web origin, with no wildcard.
- [ ] The web build has only browser-safe values ([web.env.example](web.env.example)). Searching
      `apps/web/dist` for the Storage key and the database password finds nothing.
- [ ] Supabase Auth uses an asymmetric signing key. Its site URL and redirect URLs point at
      production.
- [ ] The private `evidence` bucket exists, is not public and accepts PNG/JPEG only.
- [ ] The reverse proxy enforces HTTPS and allows request bodies of at least 12 MiB.

**Database**
- [ ] PostGIS is installed, and the application role is not a superuser.
- [ ] `alembic upgrade head` succeeded. `alembic current` shows the newest revision in
      `apps/api/migrations/versions`.
- [ ] Automatic provider backups and point-in-time recovery are on, where the provider offers
      them.

**Health**
- [ ] `GET /api/v1/health` returns 200.
- [ ] `GET /api/v1/readiness` returns 200 with `database: ready` and `auth: ready`.
- [ ] The uptime monitor points at `/api/v1/readiness`.

**Backups**
- [ ] `scripts/backup.py` ran on production and its folder has no `.partial` suffix.
- [ ] The daily schedule runs, and copies leave the server encrypted.
- [ ] A restore drill to a separate database passed (see [RUNBOOK.md](RUNBOOK.md#restore-do-a-drill-before-go-live-then-every-quarter)).

**Real-user smoke test** (production accounts, not the fixture)
- [ ] An owner signs in, creates a project, draws the site and saves.
- [ ] A photo uploads and opens again. Another organisation's user can't open it.
- [ ] Prices and an estimate are saved, then a proposal PDF is issued and downloaded.
- [ ] The owner issues an opportunity invitation. The contractor signs in with the invited email,
      accepts, submits a package, and the owner sees it in Review.
- [ ] Project deletion works from the browser (this checks the cross-origin `DELETE` preflight).
- [ ] The map loads real tiles, and the attribution is visible.

## After every release

- [ ] A backup was taken before the release.
- [ ] Migrations ran, and `alembic current` matches the release.
- [ ] Readiness returns 200.
- [ ] Sign in, open an existing project and download an issued PDF.
- [ ] No new 5xx responses in the API logs (search by `X-Request-ID` if a user reports one).
