# Real local Supabase Auth/Storage and joint DB + private-photo restore — 13 November 2026

LOCAL ONLY. Local Supabase CLI stack in Docker (`supabase/config.toml`: Kong/API 127.0.0.1:54331, Inbucket 54334);
disposable PostGIS schemas in `infrashader_test`. Temporary users are created through the local Auth admin API by
`apps/api/tests/live_server.py` and deleted at teardown. No external email: recovery/change mail is captured by the
local Inbucket. No credential or service key was printed.

## Live browser suite (`playwright.live.config.mjs`)

Config made port-configurable (`INFRA_LIVE_API_PORT`, `INFRA_LIVE_WEB_PORT`) and switched to the production bundle,
because the user's own dev servers hold 8000/5173. Original failures (all three specs) were the stale assumption
that sign-in shows an Organisation selector; the Home start page is intentional. Fixed by deep-linking to the
project (organisation from the URL) or asserting the Home greeting. Added: recovery must return to the app under
test (redirect allow-list check).

Command: `INFRA_LIVE_API_PORT=8100 INFRA_LIVE_WEB_PORT=5174 INFRA_TEST_API_URL=http://127.0.0.1:8100 npx playwright test --config playwright.live.config.mjs`
Result: **3/3 passed** —
- real Auth password sign-in, API session, refresh-token renewal, sign-out;
- private photo upload through the UI → Storage, EXIF-free JPEG, SHA-256 match on download, no object path exposed,
  unauthenticated 401, foreign user 404, direct Storage access without service role refused, archive/restore;
- recovery email (Inbucket) → set new password in the browser, old password rejected, password change and email
  change through the identity provider with the same user id;
- L05 private plan reference calibration/overlay/persistence with a second real user and organisation.

## Joint restore drill (`apps/api/tests/test_restore_drill_storage.py`)

Destination: disposable `infrashader_test_*` schema plus test-only object paths `{org}/{project}/{evidence}.jpg`
(fresh UUIDs) in the local `evidence` bucket. Steps: upload 2 photos via `evidence.upload` → `pg_dump` schema and
download object bytes with a SHA-256 manifest → drop schema and delete objects (verified missing) → `pg_restore` →
verify backup bytes against the manifest, re-put objects → verify rows/paths and download each photo through the
authorised `evidence.download` path (hash equals the recorded SHA-256, JPEG), foreign user still denied.
Result: **1 passed** (not skipped). The earlier drill (`test_restore_drill.py`) covers retained proposal PDFs, owner
originals and decision packs in Postgres.

## Not covered (remaining gates)

Off-machine backup, scheduled backups, RPO/RTO, Supabase Auth user export/restore (users are not part of these
drills), hosted Supabase, physical devices. A restore into a separate Supabase instance was not performed.

## Organisation access boundaries with real identities (`playwright.access.config.mjs`)

Config made port-configurable (`INFRA_ACCESS_API_PORT`, `INFRA_ACCESS_WEB_PORT`), production bundle, cross-origin
API with explicit CORS origin. `tests/access-browser/organisation.spec.mjs` updated for the Home start page, the
"Change workspace" disclosure and the 390 px mobile navigation dialog; it now waits for the visible save
confirmation before the other user refreshes (previous race).

Command: `INFRA_ACCESS_API_PORT=8101 INFRA_ACCESS_WEB_PORT=5175 npx playwright test --config playwright.access.config.mjs access-browser`
Result: **1 passed** — user without membership sees onboarding (draft survives focus); owner creates a dual-workspace
organisation without mutating another tenant; review workspace hides Explore Map; invitation link accepted by a
second real identity; granted Review-only Home shows no Design Studio; project invisible until an explicit project
grant; grant gives read/review without edit; `/studio` denied for a review-only membership; workspace choice
persists across reload; administration-only membership keeps Settings without project visibility; deactivation
returns the user to onboarding on reload; a server-rejected session shows sign-in and no private project content;
no page errors.

Product defects found and fixed: long account names overflowed the Home greeting at 390 px (`studio.css`,
`overflow-wrap: anywhere`); project-access checkboxes rendered one row above their labels, making grants look
attached to the wrong capability (`ProjectAccess.tsx` + scoped CSS); saving access gave no confirmation (now a
`role=status` message).
