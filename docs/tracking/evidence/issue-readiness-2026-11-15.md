# Design Studio: one actionable issue checklist ? 15 November 2026

Scope: L24, L13, L01, L03, K01 and K04. Existing dirty branch `build/l07-object-palette` at `7effa9c` was preserved. No migration, data deletion, Excel export, remote write, paid service or deployment.

## Behaviour and policy

- `POST /api/v1/organisations/{organisation_id}/projects/{project_id}/issue-readiness?kind=proposal|developer_brief` accepts current draft wording and selected estimate. POST avoids commercial text in query strings; it is read-only. The estimate may be absent and maintenance rows unfinished.
- `apps/api/app/issue_readiness.py` owns the rule functions used by readiness, draft `draft_issues`, and strict issuing in `calculations.py`. Existing issue capabilities, project lock, idempotency, revision checks, immutable snapshots and retained PDF paths remain. Existing HTTP classifications are retained for unavailable evidence and established issue errors.
- Each response row contains stable `code`, everyday `message`, `severity`, `group`, `fix`, `why`, nullable `field` and `item_id`. No rate amount, margin, supplier or private exception text is returned. A reader may inspect the checklist but cannot thereby issue or approve pricing exceptions.
- Checks cover output purpose, archive, unavailable workspace, replaced-reference review, proposal area, current brief revision, draft-only brief agreement, each of four brief fields, chosen option, missing/wrong-option/stale/incomplete estimate, missing priced work, validity, client scope/programme/maintenance, authorised pricing exception, revision summary, added maintenance rows, criteria/notes/assumptions/exclusions, permission, selected evidence and confirmation.
- Review and Proposal display all rows without the old ten-item truncation, grouped as Site / Brief / Prices / Proposal wording / Approvals. The step bar reports a server blocker count or Checking / Ready. Issue is disabled while checking or blocked; the reason is visible next to it.
- Fix actions open Site, focused proposal fields, the selected unpriced item in Pricing, Total, precision reference review, or inline brief/agreement/permission dialogs. Archive restoration requires explicit confirmation and existing edit permission. A restricted user is told which authorised colleague is needed; access is never silently escalated.
- The inline brief editor highlights missing fields, saves with expected revision, preserves proposal text, and refreshes saved calculations. Brief changes make estimates stale. When stale/missing totals are the only blockers, Recalculate total uses the current Total controls and existing calculation endpoint; it does not invent rates or charges.
- Site explicitly offers Mark the area this proposal covers. The boundary-copy action reveals the site outline, displays its source/area and estimated/not-a-survey limitation, requires user confirmation, and creates a draft target. Save still runs existing PostGIS/CRS/containment/revision validation. Custom target drawing opens precision tools directly.
- Known refusal codes have safe fallback messages/fixes. On an API refusal, the UI rereads readiness so broad legacy errors such as `issue_not_ready` resolve to the precise current rule. Raw server exception text is not printed as issue feedback. Saved-snapshot/PDF-retention failure is separately described, with retry in Issued outputs.
- Draft PDF messages are exactly the readiness messages. Unfinished maintenance text is visibly marked not provided in the draft, never silently supplied for a real issue. Issuing still rejects unfinished inputs.
- The issue explanation states: locked version, PDF storage, no automatic sending, and later changes require a new version.

## Actual checks

Final runs completed successfully; logs remain local under `tmp/issue-complete-*.log` and `tmp/issue-verified-*.log`.

- Frontend: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. **all passed; 39 Vitest files / 147 tests**.
- Backend: `.\scripts\api.ps1 lint`, `.\scripts\api.ps1 test -q`, using disposable local PostGIS test schemas. **395 passed**, one existing Starlette/httpx deprecation warning. Ruff and format check passed (124 Python files).
- Browser: `INFRA_IT_API_PORT=8101`, `INFRA_IT_WEB_PORT=5174`, `npx playwright test --config playwright.integration.config.mjs issue-readiness workflow pricing-home studies-guide change-register project-hub`: **7 passed**. This uses a production-built web bundle, test-only identity and real local PostGIS, with provider map content offline.
- Final race-feedback follow-up: newcomer and both workflow specs rerun after the last frontend change; **3 passed**, including the deliberate concurrent-brief refusal and repair.
- New backend tests include individual rule/fix/real-refusal parity, combinations, preview message parity, ready-then-issue, missing inputs, tenant isolation, reader confidentiality, no ORM mutations and endpoint SQL containing no writes or row locks. The all-problems fixture simultaneously checks every applicable independent rule; mutually exclusive missing-vs-existing-estimate cases are tested separately.
- Vitest checks all mapped refusal codes, grouping without truncation and disabled/enabled/pending issue state.
- New browser flow begins with saved/priced work but incomplete brief, no target and no proposal wording. It resolves blockers through Fix it, confirms/saves the proposal area, edits the brief, fills the linked fields, handles a stale total after a second brief edit, and asserts exactly one initial proposal POST plus retained PDF success. A subsequent deliberate concurrent brief edit tests the race refusal and direct repair path.
- Inspected rendered screenshots at **1440?900**, **820?1100**, **390?844**. No document horizontal overflow; readable grouped checklist and scrollable working panel. Reduced-motion emulation enabled. Keyboard Enter activates a Fix button; inline brief and proposal field focus is asserted. Screenshots copied to the sibling `issue-readiness-2026-11-15/` folder.

### Failures found and resolved during development

- Existing pricing-policy assertions matched superseded prose; changed those assertions to stable error codes. Photo-integrity fixture now supplies its required revision summary so the test actually reaches its intended photo-integrity failure.
- The first full backend run found two changed 404 responses for unavailable evidence. Restored the original 404 classification; subsequent full suite passed.
- The first newcomer browser test assumed the map opened automatically after deep-link sign-in. Corrected its setup to click Open design map.
- Existing workflow/pricing-home tests used the old client-only checklist selector/text. Updated them to the server checklist and verified the Palm item Fix opens its pricing dialog.
- Existing build chunk-size and Starlette/httpx deprecation warnings remain; no new production dependency was introduced.

## Limits and decisions

No real-user acceptance, physical touch-device/screen-reader qualification, live Mapbox qualification, real Supabase login/Storage run or deployment is claimed. Browser identity and rates are explicitly fixtures. Automated success does not establish a releasable MVP or pricing/field acceptance.

Readiness evaluates current saved project/workspace/estimate plus submitted proposal wording; unsaved geometry remains a separate visible Save design blocker. Readiness cannot guarantee that a later network request or external photo fetch succeeds. Issue rechecks under the existing lock, and failed PDF retention leaves the locked snapshot retryable. No commercial wording, date, rate, acknowledgement or approval is automatically supplied.

The maintenance checklist itself remains optional under the existing contract; if a user adds a row, task and frequency must be complete. No mandatory maintenance-task count or new approval policy was invented. Existing qualified-issue versus draft-only brief policy is unchanged.

## Earlier evidence retained

- L01: [project-dashboard-2026-11-12.md](project-dashboard-2026-11-12.md)
- L03: [l03-2026-11-02.md](l03-2026-11-02.md)
- L13: [pricing-home-2026-11-15.md](pricing-home-2026-11-15.md)
- L24: [pricing-proposals-2026-10-31.md](pricing-proposals-2026-10-31.md)
- K01: [l01-k01-2026-11-04.md](l01-k01-2026-11-04.md)
- K04: [pricing-home-2026-11-15.md](pricing-home-2026-11-15.md)
