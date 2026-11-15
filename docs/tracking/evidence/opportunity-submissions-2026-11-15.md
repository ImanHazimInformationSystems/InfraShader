# Contractor-to-owner proposal submission (S03, L25, O05) — 15 November 2026

Primary features: **S03** (separate private designs from published submission packages), **L25** (invited opportunity and submission workspace) and **O05** (proposal inbox and controlled receipt). Dependencies touched narrowly:
- **L24:** the submission source is an issued proposal with a retained PDF.
- **O03/O07:** native submissions use the existing owner inbox, confirmation and staleness rules.
- **S06:** the deletion guard.

Sealed bids (O29), email delivery, currency conversion, automatic scope equivalence and new ranking policy are out of scope and were not built.

## What was inspected first

- **Owner side:** owner review already had an append-only inbox (`review_entries` kind `submission`), received files stored as bytes in Postgres (`review_files`), per-offer confirmation (`confirmed_package_version`) and staleness for revised packages. Native offers were limited to an owner-uploaded JSON snapshot.
- **Issued proposals:** stored as immutable `artifacts` with original PDF bytes in `issued_files`.
- **Organisation invitations** (`onboarding.py`): opaque tokens, SHA-256 storage, verified email and expiry. These patterns were reused, but kept in a separate table because an opportunity is not membership.
- **Deletion guard** (`project_deletion.py`, added earlier the same day by another session): protects issued and review records. Extended here.

## What was built

**Migration `0021_opportunity_submissions.py`** adds three tables:
- **`opportunity_invitations`:**
  - states: draft → pending (issued) → accepted | revoked; "expired" is derived;
  - a frozen brief snapshot plus basis and project revisions;
  - `token_hash` only (the plaintext token is never stored);
  - the bound contractor organisation, linked contractor project and owner inbox key.
  - Check constraints require issued rows to be frozen and accepted rows to be bound.
- **`opportunity_files`:** files the owner deliberately attaches to a draft; frozen at issue.
- **`submission_packages`:** immutable package or withdrawal records, with per-invitation version and idempotency-key uniqueness, an opaque receipt id, the allowlisted package JSON and its SHA-256, and the copied file ids. The source artifact is stored without a foreign key, so sender changes never cascade.

**Backend `apps/api/app/opportunities.py`** (router under `/api/v1`):

| Area | Endpoints | Permission |
|---|---|---|
| Owner | draft, brief preview (frozen or live), attach/detach files (draft only), issue (token returned once), revoke (a draft is discarded), list, package view | `review_project` grant on an active owner-decision project; reading needs owner-review read capabilities |
| Recipient | preview and accept by token | Signed-in user whose verified email equals the invited email; chosen organisation must have Design Studio access and differ from the owner organisation; row lock against concurrent acceptance; idempotent replay by the same user and organisation; expired, revoked or unknown links refused |
| Contractor | list and detail, shared-file download, link existing project, create project from brief, eligible issued proposals, package preview, submit, withdraw, own package and file download | Design Studio membership of the bound organisation. Linking needs `edit_project` on that organisation's project. Submit and withdraw need `issue_proposal` on the linked project. Package detail and receipts need read access to the linked project |

**How a submission is built and stored:**
- The package is allowlisted (`infrashader.submission-package.v1`). It contains:
  - contractor and owner names, and the opportunity reference with brief SHA-256;
  - the proposal title, issued version and date, and selected option;
  - client narrative, client-facing selling total, validity, programme and maintenance (with plan), assumptions, exclusions, change summary and shade statement;
  - selected scope (id, name, kind, status, pricing status, quantity, unit, provenance, geometry) and the public quantity schedule;
  - site boundary and targets, issued evidence descriptions and hashes, PDF hash and size, renderer and manifest hash;
  - a statement that values are contractor declarations, not verified.
- It never copies the estimate, rates, costs, profit or margin, supplier or quotation details, item source notes, reviewer or pricing-review data, or unselected options.
- Submission runs in **one database transaction** that:
  - locks the invitation;
  - checks idempotency, the sender's authority, that the source is an issued proposal of the linked project, the retained PDF and its SHA-256, the closing time, revocation, an active owner project, the proposal's validity date, and duplicate-version and revision-reason rules;
  - writes the package row;
  - appends to the owner's existing inbox entry (first submission creates a `native_infrashader` offer; revisions bump `package_version` and append history, so existing confirmation and score staleness applies);
  - copies the original PDF bytes and package JSON into `review_files`;
  - records audit events in both organisations.

  Any failure rolls everything back. A retry with the same key returns the same receipt.
- **Withdrawal** is a recorded package kind. It marks the owner offer withdrawn, with the contractor's reason, and keeps all receipts.

**Other backend changes:**
- `project_deletion.protection`: owner projects with an issued invitation, and contractor projects linked to one, are archived rather than deleted.
- `owner_review` reuse: no change to scoring or approval policy.

**Frontend:**
- **`OpportunityInvitations.tsx`** (Organisation Review project, below the evaluation): new draft, exact shared-brief preview, attachments, single-display invitation link with copy, revoke or discard, the received and superseded list, a package viewer and PDF download.
- **`OpportunityAccept.tsx`:** the `#opportunity=` link is captured and removed from the URL, then shown after sign-in. It shows the owner, project, closing time, instructions, frozen brief, files, what accepting means, and an organisation chooser.
- **`StudioOpportunities.tsx`** (Design Studio projects page): accepted opportunities, shared brief and files, link or create project, receipts.
- **`SubmitToOwner.tsx`** (project Proposal step, under Issued outputs): choose an issued proposal, preview the outgoing package with blockers and warnings, a revision reason, explicit authority confirmation, "Submit to organisation", the server receipt with focus on it, history, and withdrawal.
- **Supporting changes:** owner-review schema and label for `native_infrashader`, `domain/opportunities.ts` and `services/download.ts`.

**Test fixture server:** `tests/browser_server.py` (test only) adds a second signed identity, `contractor@example.invalid`, with its own organisation, a fixed verified-email override and per-token `/auth/v1/user`. `DELETE` is added to the test server's CORS methods.

## Checks actually run

| Check | Result |
|---|---|
| `apps/api/tests/test_opportunities.py` (4 tests, disposable PostGIS) | 4 passed. Covers the full flow, two-contractor separation, expiry/revocation/deadline/concurrent acceptance, and mid-submission failure with retry. |
| `.\scripts\api.ps1 lint` | All checks passed |
| `.\scripts\api.ps1 test -q` | 409 passed |
| `npm run lint`, `npm run typecheck`, `npm run build` | Clean |
| vitest | 40 files / 150 tests passed (2 new in `domain/opportunities.test.ts`) |
| Integration browser, full suite (ports 8101/5174) | 19 of 19 passed, including the new `opportunities.spec.mjs`, owner-review and workflow |
| Product UI | 5 passed, 4 skipped by design |
| Reference: `proposal.spec`, `brief-checkpoint.spec` | 2 passed |
| Access and live suites (`playwright.access.config.mjs`) | **Not run.** They need local Supabase Auth; only the Postgres port (54322) was listening. |

**What the browser test does.** Owner and contractor sign in as separate identities in separate browser contexts:
- the owner drafts the invitation, previews the brief (budget not shown) and issues the link;
- the contractor opens the link (the token is removed from the URL), signs in, accepts and links a private project;
- cross-reads are forbidden through the API (404 both ways);
- the contractor issues privately, previews the outgoing package (no internal rate or supplier note) and submits;
- the owner sees "Received · current" and the offer in step 3 Offers, and the raw package API contains none of the secrets;
- the contractor issues and submits revision v2 with a reason;
- the owner sees superseded and current versions;
- the phone width (390 px) has no horizontal overflow.

**Screens inspected:** owner invitation and received list, contractor acceptance, contractor receipt in the Proposal step. Two fixes were made from inspection: a stray icon above "Submit as", and spacing before the receipt download links.

## Policy defaults chosen (see `docs/decisions.md`)

Conservative and explicit. Late submissions are refused. The invitation link expires at the earlier of the closing time and 14 days. One invitation is for one recipient email. Revocation stops future actions and keeps receipts. Withdrawal is allowed at any time and is recorded, never deleted. Owners see offers on receipt (controlled review; O29 sealed bids remain a separate gate). Only contractor proposals, not decision briefs, can be submitted. The linked project is fixed after the first submission.

## Remaining gaps and gates

- **Not shared:** the owner rubric or criteria are not shared with contractors (policy question recorded). There is no common BOQ template file beyond the basis scope items, and no per-requirement document attachments from the contractor beyond the issued PDF.
- **Same-name organisations:** the owner sees two contractor organisations with the same name as separate offers, but nothing disambiguates them beyond the invitation email.
- **Linking:** the link dropdown lists only the currently loaded page of projects.
- **Data loss and tamper-evidence:** retention is a database byte copy; there is no off-site object storage or signature. Real Supabase Auth and Storage acceptance, sealed-bid security (O29), email delivery and customer pilot acceptance remain open.

## Follow-up: limitations closed (same day)

The user asked to remove the partial-implementation limits where possible. Changes:

- **Contractor supporting documents.** New `submission_attachments` table (in migration 0021, which was not yet applied anywhere persistent). Senders with `issue_proposal` stage up to 5 PDF/XLSX/JSON documents (content-sniffed, 10 MiB each) while the invitation is open. They are listed in the package (`documents.attachments`) and copied into the owner inbox in the same transaction as the package. A submitted document cannot be removed. Another invitation's document is refused.
- **Evaluation criteria sharing.** The owner can opt in per invitation ("criteria"). The shared brief then carries criteria code, name, weight, direction and scale, with the rubric status (draft or locked). Scores, reviewers and aggregation are never shared. The default stays off.
- **Same-name contractor organisations.** The second offer is named "Organisation (invited email)". The sender line also names the invited account.
- **Owner suggestions.** "Suggest values" on the package JSON now offers the declared quoted total as an unverified line, citing `package proposal.selling_total`. Previously this returned "unsupported".
- **Linking.** `GET …/opportunities/{id}/linkable-projects` lists every active contractor project the user may edit, instead of only the loaded page.
- **Sending the link.** The owner gets "Open in my email app" (a `mailto:` link to their own email client; InfraShader still sends nothing).
- **Navigation.** "Go to Submit" opens the linked project's map directly at Proposal. Each open opportunity shows three plain next steps with ticks. Dates show the time-zone name.
- **Development database.** Migration 0021 applied to the local development database (additive tables only). The running API (port 8000) answers health with 200 and the new routes with 401 when signed out.

**Checks after these changes:**
- Backend: Ruff clean; 410 passed (5 opportunity tests, one new).
- Frontend: lint, typecheck and build clean; vitest 150 passed.
- Integration: full suite 19 of 19. The opportunity spec now also covers criteria opt-in, the mailto link, a staged attachment received as a third file, and "Go to Submit" for the revision.
- Product UI: 5 passed, 4 skipped by design.

**Still open:** real Supabase Auth/Storage (access and live suites not run because local Supabase Auth was not running), sealed bids (O29), automatic email (not authorised), owner approval of late changes, and customer acceptance.

## Follow-up 2: lost link and invisible invitation (user report, 16 Nov 2026)

**Report.** After "Issue invitation link" the owner saw no link, and the contractor saw nothing.

**Cause (checked in the development database).** Issuing succeeded on the server: the invitation was `pending` with a stored token hash. The link box was drawn at the top of the invitations panel, above the card whose button was clicked, so it could be out of view. The link is only stored as a hash, so a link that was missed could not be recovered, and the first invitation was revoked. Separately, the contractor had no way to see an invitation except by opening that link (nothing is sent automatically).

**Changes.**
- The link box scrolls into view and takes focus when it appears.
- `POST …/opportunities/{id}/reissue` ("Issue a new link"): replaces a lost link for an unaccepted, open invitation. The old token stops working, the frozen brief is unchanged, and an audit event is recorded.
- `GET /api/v1/opportunities/pending`: lists open invitations addressed to the signed-in user's verified email. Preview and accept also take an `invitation_id`, allowed only for that verified recipient; any other account gets "unavailable" and learns nothing.
- Design Studio projects page shows "You have N invitation(s) waiting" with **Review invitation**, which opens the same acceptance panel.

**Checks.**
- Backend: 411 passed, including a new test for pending visibility, wrong-email privacy, reissue invalidating the old link and refusal after acceptance.
- Frontend: 150 unit tests, lint, typecheck and build clean.
- Browser: the opportunity spec now asserts the link is in the viewport, reissues it, checks the old link is refused, and accepts from the waiting banner without any link. Full integration suite 18 of 19 on the first run; the miss was an intermittent duplicate-text assertion in `project-hub.spec.mjs` (passes alone). That assertion now accepts either match.

