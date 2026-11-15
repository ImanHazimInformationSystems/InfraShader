# Organisation access and workspaces

19 October 2026. Local increment on `build/core-spatial-completion`.

## Policy

Supabase authenticates accounts. The API looks up active membership on every protected operation. Organisation enabled workspaces, membership capabilities, project grants and project purpose are separate concepts. A workspace selector, URL, saved preference or purpose is never an authorisation grant.

Role templates can be combined and adjusted explicitly:

| Template | Capabilities |
|---|---|
| Administrator | Manage members/invitations/settings only |
| Designer | Studio, read/create/edit briefs, geometry, evidence, analysis |
| Estimator | Studio, read projects, estimate, catalogue management, internal pricing |
| Reviewer | Review workspace, read projects, save review notes |
| Approver | Review workspace, read projects, issue developer brief |

Approver is a capability template for the existing brief issuance action; a formal approval workflow is not implemented. Proposal issuance and project-access management are additional explicit permissions. Project actions require both membership capability and project grant, active membership and an enabled permitted workspace. Administrative status never bypasses this intersection. An administrator can explicitly change membership capabilities, with audit, but still needs a project grant to read confidential records.

Creators receive explicit working and administrative capabilities appropriate to the selected Studio/Review/Both mode. A new project's creator gets project grants, constrained by their membership. New invitees receive no existing project grants. Project managers can delegate only their own effective project capabilities. Empty grants revoke access. Catalogue change is organisation-level; internal price amounts and supplier source notes are redacted without the explicit pricing capability.

## Invitations and account setup

Accounts still use local Supabase Auth. Public signup is disabled in this installation; provision a confirmed test account through local Supabase Studio (http://127.0.0.1:54333) or the existing operator workflow before signing in. Never put the server service key in a browser environment file.

Verified-email users can create a separate organisation or accept an invitation addressed to their current verified account email. Names do not prove corporate affiliation. The API fetches the current Supabase account rather than trusting editable metadata. Invitations use random single-use tokens stored only as SHA-256 hashes. Creation returns the link once; pending lists and audit records omit it. Expiry is 1-14 days (default 7); revocation, replay and concurrent acceptance are guarded transactionally. Rejoining an inactive membership removes old project grants. Share invitation links manually with the intended recipient; no external mail delivery service was added. Links put the token in the fragment, which the UI removes after capture.

## Migration and routing

Migration `0011_access_foundation.py` adds organisation workspace configuration, invitations and project grants. For existing organisations it enables both shells with a setup-confirmation flag. It converts prior effective member/admin privileges into explicit membership capabilities and backfills grants only for existing member/project pairs. This preserves prior access without granting future invitees all projects. Existing records and issued snapshots are retained. Inactive members remain unable to access records. Downgrade deliberately does not strip capability backfill.

Canonical shells are `/studio` and `/review`, with project routes under each prefix. Existing project routes remain readable. Preferences are scoped by authenticated user and validated against fresh membership. Account/organisation/workspace changes clear the current project context; unsaved-change confirmation and existing scoped recovery remain in use. Membership is rechecked on focus and every 30 seconds; protected API calls enforce changes immediately. Administration-only members can reach Settings without a working workspace.

## Local run

From the repository in PowerShell:

```powershell
.\scripts\local-db.ps1 start
.\scripts\supabase.ps1 start
.\scripts\supabase.ps1 configure
.\scripts\api.ps1 migrate
.\scripts\api.ps1 dev
```

In another terminal run `npm run dev`, then open http://127.0.0.1:5173. Docker Desktop must be running and unpaused. Existing dependencies must be installed (`npm ci` and `.\scripts\api.ps1 sync` for a new checkout). Stop development terminals with Ctrl+C. Full setup and service shutdown instructions remain in DEVELOPMENT_MANUAL.txt.

## Walkthrough

1. Studio: sign in, select Create or join organisation, create Design Studio, select the new organisation, create a project, then use the existing geometry, analysis, estimate and permitted output workflows.
2. Review: create a Review organisation or invite a reviewer into an enabled organisation. In Settings and members create a reviewer invitation and manually deliver the one-time link. The recipient signs in with that verified email and accepts. A project manager opens Project access and grants read project + review project. The reviewer sees assigned records and Open project review; geometry/financial/issuance controls require separate capabilities.
3. Both: create with Both workspaces or explicitly enable both and assign both membership capabilities. Use the Workspace selector to move between the two shells. Project purpose does not change with shell selection. Reload preserves a still-permitted selection.
4. Legacy installation: an administrator reviews enabled workspaces in Settings, saves the intended configuration, then reviews explicit team and project permissions.

## Limits and next increment

Organisation Review currently exposes assigned projects and existing review notes/brief functionality. Submission inboxes, scoring, approval workflow, procurement/compliance and cross-organisation live sharing are not implemented. Secure external disclosure packages need a separate audience/retention contract. F13 and F16-F20 remain gated. No deployment, remote write, email service or paid resource was added.

See validation.md for actual checks and outstanding acceptance. Next increment: a separately specified retained submission/disclosure package with recipient-visible immutable records, before any review inbox or approval UI.
