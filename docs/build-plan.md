# InfraShader earlier build checkpoint

Current work is maintained in [completion-plan.md](completion-plan.md); feature status is in [requirements.md](requirements.md).

Updated 11 October 2026. Branch: `build/ground-site-foundation`.

User requests authorise local implementation and testing. References are requirements/design inputs, not permission to publish, spend or claim approval. SRS v0.3 governs acceptance; the HTML is a visual reference only. No push, PR, deployment, paid service or external message is authorised. The user chose local PostgreSQL/PostGIS and subsequently approved local Docker/WSL installation with any restart left to them.

| Milestone | Implemented and runnable | Remaining acceptance |
|---|---|---|
| M0 Foundation | React/TS/Vite, Python 3.12/FastAPI, locks, scripts, health/readiness, CI definition; local checks pass | Hosted CI not run; no deployment |
| M1 Identity/project/site | Supabase adapter, signed JWT verification, current membership, real PostGIS project save/reload, briefs, archive, numeric Explore Map, rendered extent | Real Supabase login/recovery after restart; member/admin/profile/settings UI and policy completion |
| M2 Geometry/options/evidence | Terra Draw plus numeric edit, boundary/targets, Baseline/A/B, area/length/count, provenance/overrides, transactional saves/conflicts; private-photo adapter and metadata | Live Storage upload/download/foreign-file tests, editing/session recovery hardening, evidence-to-target links and restore drill |
| M3 Restricted shade | pvlib/PyProj/Shapely, building sweep vs roof translation, union/target clip, solar reference, night/low sun, saved revisions/stale detection | Field measurements/tolerance, larger capacity benchmarks, map shadow overlay and full comparison usability |
| M4 Pricing | Versioned dated rates, NUMERIC/Decimal, quantity binding, missing-rate partial state, markup/margin/fixed total, charge editing/duplicate guards, capability checks | Approved D5 commercial policy, catalogue paging/management and takeoff review |
| M5 Two outputs | Distinct allowlisted developer/client snapshots, readiness, idempotency, immutable DB trigger, two PDF templates, two-page browser downloads | Full audience/device/font/layout matrix, separate saved reviewer history, PDF/file restore and operational storage checks |
| M6 Release quality | 18 responsive foundation/drawing tests; two browser-to-real-DB calculation/PDF paths with test identity; 142 backend checks | Real Supabase sessions/storage, administration/settings/privacy lifecycle, backup/restore, accessibility/touch/load matrix, pilot participants/support |
| M7 Extensions | Explicitly gated; no fake active controls | F13 G9, F16/F17 G10, F18/F19/F20 G11 approval and evidence separately |

No partial milestone is a full requirement or release acceptance claim. Browser Demo is local draft storage and never real-service evidence. Test identity fixtures are not evidence that Supabase Auth works.

## Next checkpoint

1. Completed 12 October: Linux Docker engine running; local Supabase started, Auth JWKS/private bucket/Studio checks passed, ignored environment files configured. Signing-key bootstrap error corrected.
2. Provision local test users and organisation memberships; exercise real login/recovery/refresh/sign-out and private Storage access without hosted services.
3. Complete membership/settings/profile and independently saved review history; finish evidence linking and pricing review. Preserve backend capability boundaries.
4. Run database-plus-private-file restore, security/limits and full two-purpose browser regression; update requirement evidence.
5. Obtain remaining scope/map/pricing/retention/field/user decisions before any release claim. Keep staged extensions gated.

## Environment

Local PostgreSQL 17.11/PostGIS 3.6.2 runs from ignored `.local/tools` on 127.0.0.1:54322. Application role is not a database superuser. Application and disposable `_test` databases are separate. Credentials stay in ignored `.local/database.json`.

Docker Desktop 4.94 and WSL 2.7.13 were installed with approval. Following the user restart/setup, the Linux engine and local Supabase were verified running on 12 October. Supabase is configured for separate local ports 54331-54334. No remote project is linked.

See [validation.md](validation.md), [requirements.md](requirements.md), [decisions.md](decisions.md) and [technology-stack.md](technology-stack.md).
