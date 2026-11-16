# Free pilot deployment

The owner authorised a free hosted pilot on 16 November 2026. The web and API are
live; real-account workflow and operational acceptance remain pending. See the
[hosted evidence](../docs/tracking/evidence/free-pilot-hosted-2026-11-16.md).

- Website: https://infrashader-web.onrender.com
- API readiness: https://infrashader-api.onrender.com/api/v1/readiness
- This hosted project starts fresh; local accounts and project data were not copied.
- First access: create your own pilot Auth user in Supabase, sign in on the website,
  then use **Create an organisation** and choose the intended workspace(s).
  Do not use Browser Demo to validate hosted persistence.

## Services

`render.yaml` defines a free Python API in Singapore and a free static website.
It creates **no Render database**, paid service, disk or domain. Automatic releases
are off: release intentionally after checking migrations and backups. The website
rewrites client routes to `index.html`.

The API installs committed locks using uv 0.13.0 and production dependencies only.
`pypdf` is a runtime dependency because received-offer PDF text extraction uses it.
The startup script applies migrations then starts one worker on Render's `$PORT`.
The free plan has 512 MB RAM; measure terrain/shade workloads before admitting
larger projects. Do not promise those workloads fit before measuring them.

Supabase Free supplies Postgres/PostGIS, Auth and a private `evidence` bucket.
Use a **new** hosted project; local development databases and users are not copied.
Never expose the database or Storage service key in a `VITE_` variable or Git.

## Database setup

Before migrations, enable PostGIS in the `extensions` schema as the database
administrator. Use a separate non-superuser application role and a private
application schema. Set that role's search path to the application schema,
`extensions`, then `public`. Do not add the application schema to Supabase's
exposed Data API schemas or grant `anon`/`authenticated` access to it.

Use the connection information from Supabase's Connect dialog, not a guessed
host. For IPv4 hosts, the shared **session** pooler is available on the free plan.
Its custom-role username is `APP_ROLE.PROJECT_REF`; require TLS. Configure the
API's SQLAlchemy URL with `postgresql+psycopg://` as required by `Settings`.

Verify migration head and all project isolation/permissions with the actual host.
Use migrations from the committed repository; do not edit historical migrations.

## Required environment

API secret settings:
- `DATABASE_URL`: dedicated application-role connection, including TLS.
- `SUPABASE_URL`: new hosted Supabase project URL.
- `STORAGE_SERVICE_KEY`: server-only key for that project.
- `CORS_ORIGINS`: JSON array containing the exact HTTPS web origin.

Web public build settings:
- `VITE_API_BASE_URL`: actual HTTPS API URL.
- `VITE_SUPABASE_URL`: the same hosted Supabase project.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: browser-safe publishable key.
- `VITE_MAPBOX_ACCESS_TOKEN`: public Mapbox token, restricted to the actual site.
- `VITE_API_TIMEOUT_MS=90000`: permits the sleeping free API to wake up.
- `VITE_DEPLOYMENT_MODE=pilot`: labels this deployment honestly; local builds keep
  their existing local labels unless this setting is explicitly supplied.

The timeout is bounded to 15–120 seconds; invalid values use 15 seconds. Existing
caller-provided abort signals still win. Writes are not automatically retried.
Set Auth site/redirect URLs to the actual frontend origin; use asymmetric signing
keys. The private evidence bucket permits PNG/JPEG and at most 10 MiB per file.

## Accounts and verification

Use controlled accounts whose email ownership is verified. Do not disable email
verification to get around hosted email restrictions: opportunity invitations
depend on a verified recipient. Configure a suitable SMTP provider before public
registration/password-recovery usage. No paid mail service is authorised.

Read `CHECKLIST.md`. Test actual hosted login, project/geometry persistence,
private evidence, estimates, retained PDF, owner invitation, separate contractor
acceptance/submission, owner receipt and cross-organisation denial. Run a backup
and restore drill before using important project data.

Free limits remain real: Render sleeps, Supabase can pause, and Mapbox usage can
incur charges above its allowance. Do not add paid services or accept overages
without the owner's explicit approval. The deployment is a pilot, not a claim of
production availability, field accuracy or customer acceptance.

## References reviewed on 16 November 2026

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [FastAPI hosting and port binding](https://render.com/docs/deploy-fastapi)
- [Render free limits](https://render.com/docs/free)
- [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp)

No hosted success is implied by validating the Blueprint or passing local tests.
