# Shared MVP audit: S03, S07, S08, S09, S10, L12 — 13 November 2026

Local only; integration suite on the production bundle with the test-signed identity on disposable PostGIS.
Machine: AMD Ryzen 5 5600G (12 threads), 32 GB, Windows 11 (10.0.26200), headless Microsoft Edge (Playwright 1.64).

## S09 import/export contracts — defect found and fixed

- Before: the two backend CSV exports (`change_register.py` change register, `owner_review.py` decision appendix)
  wrote user-supplied text without formula/DDE protection; the browser BOQ CSV guarded `= + @ -` but not tab/CR and
  would have prefixed legitimate negative numbers.
- After: `apps/api/app/csv_safety.py` (`writer`/`cell`) and `apps/web/src/services/csv.ts` (`csvCell`) apply one rule:
  text starting with `= + - @ TAB CR` gets a leading apostrophe; plain decimals such as `-120.50` stay numeric.
- Checks: `pytest tests/test_csv_safety.py tests/test_change_register.py tests/test_owner_review.py` 8 passed (export
  of `=HYPERLINK(...)` and `+2 working days` neutralised); `vitest src/services/csv.test.ts` passed.
- Admitted import paths remain: owner intake PDF/XLSX/JSON content-sniffed ≤10 MiB; private photos sanitised
  JPEG/PNG; plan references. No arbitrary URL fetch. Rate/BOQ CSV import and ERP/API adapters are NEXT/LATER.

## S08 accessibility — automated scan added, defects fixed

New dev dependency `@axe-core/playwright` 4.14.0 (MPL-2.0; see `docs/dependency-source-register.md`).
`tests/integration-browser/accessibility.spec.mjs` scans sign-in, Home, Studio projects, Studio project, detailed
workspace, all six owner-review steps and the Review dashboard (WCAG 2.0/2.1 A and AA tags; map canvas excluded) and
checks the skip link and focus move by keyboard. Baseline run found (all serious): text contrast 3.87–4.29:1 (footer,
project tabs, save badge), accessible names not containing visible text (brand button; project cards), scrollable
tables not keyboard-reachable. Fixed: `#76717a→#6b6570` (5.09:1) and `#68815e→#56704c` (4.96:1) in `styles.css`;
brand label/space in `WorkspaceNavigation.tsx`; card name from visible content (`ProjectDashboardCard.tsx`);
`.table-scroll` focusable named groups with visible focus. Result: **0 violations of any impact** on all scanned
screens; keyboard skip link passes. Earlier in this checkpoint: immersive studio makes the page behind it `inert`;
scenario switcher is a named group; long names wrap at 390 px.
Not done: screen-reader/assistive-technology sessions with users, physical devices, full bilingual UI (NEXT).

## S07 performance — measured against section 10 *proposed* goals

`tests/integration-browser/performance.spec.mjs` (results JSON in `test-results/performance/`):

| Measurement | Result | Proposed goal |
|---|---|---|
| Project list, 10 concurrent clients × 20 GET (200+ projects, limit 24) | p50 567 ms, p95 686 ms, max 747 ms | p95 ≤ 1 s |
| Owner D1 fixture save (500 confirmed lines per offer) | p50 67 ms, max 169 ms | — |
| Official evaluation, 10 offers × 500 lines | 62–73 ms (8 KiB) | — |
| Owner review state, same fixture | 205–339 ms (2.0 MiB JSON) | — |
| Open Evaluation table (browser) | 88 ms | ≤ 300 ms interactive |
| Open Offers step with a 500-line offer | **7,952 ms → 661 ms** after fix | ≤ 300 ms |
| Switch to another 500-line offer | **10,761 ms → 591 ms** after fix | ≤ 300 ms |
| Jump to last line page | 395 ms | ≤ 300 ms |
| Map, 100 extruded buildings + 50 proposed areas (150-item option cap), idle 3D view | 100 rendered; mean/p95 frame 5.6 ms (~180 fps) | ≥ 30 FPS |

Defect fixed: the offer editor rendered all 500 lines × 13 controls (6,500 inputs) at once. It is now paginated 50
lines per page with an all-pages "not yet mapping-confirmed" count, and line edits use functional updates. Offer
expansion is driven from the summary click (a controlled `<details>` toggled by the asynchronous `toggle` event lost
clicks during re-renders). Remaining: interactive timings are still ~2× the proposed 300 ms goal; the 2 MiB state
payload carries every line of every offer; map measured idle, not with an animated camera; the 1,000-instanced-object
scene is not reachable with the 150-item cap and was not measured; Playwright timings include automation overhead.
Measurements are one local machine, not an SLA.

## S03 recipient-safe outputs — audited

Issued proposal/brief payloads exclude rate, cost, margin and profit (`test_workflow_integration.py`,
`test_pricing_readiness.py` restricted views, `test_output_v3.py` plan sheet/checklist, change register CSV header);
owner review is 409/404 for Studio-only or contractor-purpose projects; decision memoranda are bound to the retained
pack digest. Cross-tenant publication/received-package exchange is NEXT (D2).

## S10 audit/retention — audited

Append-only with database triggers: artifacts, project_revisions, administration_events, workspace_revisions,
issued_files, hub_record_revisions, brief_checkpoints, change_requests, review_entries/review_files (owner). History
and restore exist for briefs, workspaces and evidence (archive/restore); administration events are shown in Settings.
Not cryptographic tamper-proofing; elevated database administrators remain in the threat model; no retention-policy
administration UI.

## L12 Baseline/A/B and controlled revisions — audited

Evidence: spatial spec (shared Baseline objects, independent proposed options, workspace restore makes artifacts
stale), change register (impact vs last issue, revised issue link, v1 payload byte-identical), output v3/v2
renderer preservation. CORE satisfied in software; unlimited scenario library is LATER.
