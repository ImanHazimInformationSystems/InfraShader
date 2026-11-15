# InfraShader production runbook

Short operating guide for one production environment. It describes how to run InfraShader, not
an approved deployment: hosting, paid services and go-live each need the owner's approval
first. Use it together with [CHECKLIST.md](CHECKLIST.md).

## What runs where

| Part | What it is | Holds |
| --- | --- | --- |
| Web app | Static files from `npm run build` (`apps/web/dist`) on any HTTPS static host or CDN | Nothing private. Built with [web.env.example](web.env.example) values |
| API | FastAPI (`apps/api`), run by uvicorn behind an HTTPS reverse proxy | Configured from [api.env.example](api.env.example) |
| Application database | PostgreSQL 15+ with PostGIS 3 | Projects, workspaces, rates, estimates, issued snapshots, **issued PDFs, review files, opportunity packages and attachments** |
| Supabase Auth | Sign-in, tokens (ES256/RS256 signing key) | User identities |
| Supabase Storage | Private `evidence` bucket (PNG/JPEG, 10 MiB) | Site photos |
| Mapbox | Basemap, terrain and building tiles | Nothing of ours; public `pk.` token restricted to the production URL |

The browser never talks to the database or Storage directly. Every private call goes through the
API, which checks the token and organisation membership.

## First-time setup

1. **Database.** Create the database and a non-superuser application role. Enable PostGIS as an
   administrator: `CREATE EXTENSION IF NOT EXISTS postgis;`.
2. **Supabase.** Create the project. In Auth, switch to an asymmetric signing key, disable public
   sign-up if accounts are invited, and set the site URL and redirect URLs to the web domain.
   Create a private bucket named `evidence` (PNG/JPEG only, 10 MiB). Do not make it public.
3. **API environment.** Fill [api.env.example](api.env.example) in the host's secret store.
   `CORS_ORIGINS` must list the exact web origin.
4. **Migrate.** From `apps/api`: `uv sync --frozen` then `uv run --frozen alembic upgrade head`.
5. **Start the API.** From `apps/api`:
   `uv run --frozen uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --workers 2`.
   Put an HTTPS reverse proxy in front (body size at least 12 MiB for uploads).
6. **Build the web app.** Set the [web.env.example](web.env.example) values, run `npm ci` then
   `npm run build`, and publish `apps/web/dist`. Serve `index.html` for unknown paths (single-page
   app).
7. **First organisation.** Create the first user in Supabase Auth, then from `apps/api`:
   `uv run --frozen python -m app.bootstrap --organisation "<name>" --user-id "<auth-user-uuid>"`.
   Further members are invited from inside the app.
8. Run every check in [CHECKLIST.md](CHECKLIST.md) before telling anyone the address.

## Releasing a new version

1. Take a backup (below) and confirm it finished without `.partial` in the folder name.
2. Check the release on a staging copy first if it contains a new migration
   (`apps/api/migrations/versions`).
3. Run `uv run --frozen alembic upgrade head`, then restart the API.
4. Publish the new web build. Old browser tabs keep working until they reload.
5. Run the health checks in [CHECKLIST.md](CHECKLIST.md#after-every-release).

Migrations only move forward. To undo a bad release, restore the backup taken in step 1 to a new
database and point the API at it. Don't run `alembic downgrade` on live data.

## Health checks

- `GET /api/v1/health`: process is up. It needs no database or secret.
- `GET /api/v1/readiness`: `200 {"status":"ready"}` only when the database answers, PostGIS
  is present, migrations have run and the Auth signing keys load. `503` names the failing check.
  Point the load balancer or uptime monitor at this endpoint.
- Every response carries `X-Request-ID`. Quote it when you look up a user's problem in the logs.

## Backups

Back up the application database and the private Storage files **together**. A database
without its photos, or photos without the records that point to them, can't be restored
consistently.

```bash
# From the repository root, with the API environment loaded (or --env-file):
uv run --project apps/api python scripts/backup.py --out /srv/backups/infrashader --keep 14
```

On the development machine, `.\scripts\api.ps1 backup --out <folder> --keep 14` does the same
thing with the local credentials.

- Each run writes `infrashader-<UTC time>/` with `app.dump` (pg_dump custom format),
  `storage/evidence/...` and `manifest.json` (sizes, SHA-256 digests, migration revision and
  anything skipped).
- The folder only loses its `.partial` suffix once every step has succeeded. `--keep` removes
  only older complete backups that this script made.
- Hosted Supabase backs up identities itself. If you run Auth yourself, set `AUTH_DATABASE_URL` and
  the `auth` schema is dumped too.
- Schedule it daily (cron or Task Scheduler). Copy the backup folder off the server, encrypted.
  The folder contains customer data.

### Restore (do a drill before go-live, then every quarter)

1. Create an empty database with PostGIS on a **separate** server or database.
2. `pg_restore --no-owner --dbname=<new database> app.dump`.
3. Upload `storage/evidence/*` into the new environment's private `evidence` bucket, keeping the
   same object paths.
4. Point a test API at the restored database and Storage and run the readiness check. Then open a
   project and check its site, rates, estimate, an evidence photo and an issued PDF.
5. Record the date, backup name and the time it took. No recovery target counts as met until a
   drill has passed.

## Common problems

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Readiness `database: unavailable_or_unmigrated` | Database down, wrong URL or migrations not run | Check the connection, then run `alembic upgrade head` |
| Readiness `auth: unsupported_keys` | Supabase still on the legacy shared secret | Switch Auth to an asymmetric signing key |
| Browser shows CORS errors | `CORS_ORIGINS` doesn't match the web origin exactly | Fix the list (scheme and host, no trailing slash) and restart |
| Photos fail to upload | Missing `STORAGE_SERVICE_KEY`, no `evidence` bucket, or proxy body limit under 12 MiB | Fix the config; the API reports Storage as unavailable |
| Map says Mapbox is busy | Mapbox rate limit (HTTP 429) | Project data is unaffected. The next map load checks again. If it keeps happening, check Mapbox usage and limits |
| Map is blank | Token missing, or not allowed for this URL | Check `VITE_MAPBOX_ACCESS_TOKEN` and its URL restrictions, then rebuild |

## Secrets

- Only the API host holds `DATABASE_URL`, `STORAGE_SERVICE_KEY` and any `AUTH_DATABASE_URL`.
  The web build only ever contains the publishable Supabase key and the public Mapbox token.
- Rotate a secret straight away if it appears in a log, chat, ticket or commit.
- Never copy `.env` files, `.local/` or `supabase/signing_keys.json` from a development machine to
  a server. Production uses its own keys.
