# Local role accounts — 12 November 2026

Scope: S02 account provisioning, using existing S01/S02 capabilities. User requested accounts for Admins, contractor/landscapist and large organisations. This was a local operational action, not a new account-type implementation or database reset.

## Provisioned

- `admin@infrashader.local`: administrator membership in both newly created organisations; explicit existing capabilities, constrained by each organisation's enabled workspace and existing project grants.
- `contractor@infrashader.local`: member of InfraShader Contractor / Landscaping; Studio designer/estimator capabilities plus proposal issuance and project-access management. No member/settings administration.
- `organisation@infrashader.local`: member of InfraShader Large Organisation; Review/reviewer/developer-brief issuance capabilities plus project creation, brief/evidence editing and project-access management. No Studio, internal pricing or member/settings administration.

New organisations enable Studio and Review respectively, with setup completed. Admin can manage both through explicit memberships; no global administrator bypass was introduced. No grants to existing projects or organisations were added.

Passwords were generated separately, confirmed accounts created through the local Supabase Admin API, and organisation/membership/profile/audit records written transactionally to local PostgreSQL through the existing SQLAlchemy models. Service keys remained server-side. No emails were sent.

## Commands and actual checks

- Read-only inspection using `uv run --frozen python -` from `apps/api`: confirmed loopback Supabase `127.0.0.1:54331`, application database `infrashader`, migration `0014`, one existing Auth user, four organisations, four memberships and nine projects. No requested-email collisions.
- Operator command: set process-local `PYTHONPATH` to `apps/api`, then `uv run --frozen python ../../.local/provision-role-accounts-2026-11-12.py`. Passed. The ignored operator script refuses remote endpoints, existing-account replacement and rerunning over its provisioning record.
- All three real password logins, API `/api/v1/session` calls and expected workspace memberships passed. New-organisation project lists returned zero records. Contractor and organisation cross-tenant project requests returned 404.
- `/api/v1/organisations/{id}/members`: Admin returned 200 in both organisations; each worker returned 403 for its own organisation and 404 for the other. Sessions signed out after checks.
- Existing Auth user IDs, organisation IDs, membership IDs and all nine project IDs/revisions/update timestamps were preserved.
- Headless Edge through Playwright, against the already running local frontend: all three real browser sign-ins/sign-outs passed. Contractor showed Open Design Studio; organisation showed Open Organisation Review. Admin selected each new organisation and showed its matching workspace entry plus enabled Settings and members. An initial browser script assumed immediate Admin workspace selection; another tried a hidden collapsed selector. Final checks used fresh browser contexts and the visible initial organisation chooser and passed for both organisations. Application code was unchanged.

Local credentials are in ignored `.local/ACCOUNT_LOGINS.txt` and `.local/accounts-2026-11-12.json`; sanitized browser verification is in `.local/account-browser-verification-2026-11-12.json`. Do not copy passwords, tokens or service keys into tracked evidence.

## Tracking and limits

S02 evidence reference and local provisioning criterion TRK-S02-007 updated; canonical tracking regenerated and checked. Existing implementation, deployment and broad acceptance fields remain unchanged. Previous feature evidence remains [the repository audit](audit-2026-10-26.md#s02) and [access implementation checks](../../validation.md#organisation-access-and-workspace-foundation---19-october-2026).

No source application change, migration, reset, user deletion, password replacement, project creation, remote write, deployment or Excel export. Frontend/backend regression suites were not rerun for this operational data action. These checks verify the three local accounts and bounded permission paths; invitation lifecycle, private Storage, full project workflows, physical-device and customer acceptance were not rerun or promoted.
