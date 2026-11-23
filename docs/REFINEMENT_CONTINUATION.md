# Refinement continuation (read first after "continue")

Concise resume record for the customer-ready refinement. Plan and acceptance matrix:
[`REFINEMENT_PLAN.md`](REFINEMENT_PLAN.md). Canonical status: `docs/tracking/*.csv`. No credentials or
confidential documents belong here.

## State — 23 November 2026

- **Branch:** `refine/customer-ready` (created from `build/l07-object-palette` @ 16f19d6). Local commits
  only. Check `git log --oneline -5` for the latest refinement commit.
- **Pre-existing uncommitted change preserved, not part of this work:**
  `docs/tracking/evidence/free-pilot-hosted-2026-11-16.md`. Untracked `outputs/`, `tmp/` are also not ours.
- **Environment:** local PostGIS on 54322 (`.\scripts\local-db.ps1 start`). Ports:
  - integration browser: API 8130 / web 5174;
  - Browser Demo: API 8102 / web 5176;
  - reference: API 8001 / web 5174, cross-origin.
- **Never run two Playwright suites at once.** Each run empties `test-results/` and deletes the other
  suite's built bundle (this caused a spurious 20-failure run). Reference and integration also share
  web port 5174.
- Docker/local Supabase was not running on 23 Nov: live and access suites not run.

## Completed (software criteria; details in plan and evidence)

- WP1 1.1–1.6:
  - readable cross-origin errors with references;
  - pending-migration readiness and errors;
  - client failure classes;
  - studio save states;
  - L04 polygon defect (camera state reset Terra Draw) and object-move defect (scene-tool click also
    selected the map feature) fixed;
  - reference specs current.
- WP1 1.8 partial: local DB + retained-file restore drill passes on 0021.
- WP2 2.3 (road without layers, browser-tested) and the 2.5 states (Needs quantity / Needs rate).
- WP3 3.1 partial: Fairfax pp.9–11 genuine contractor proposal analysed; Surrey 403.
- Evidence: `docs/tracking/evidence/refine-wp1-reliability-2026-11-23.md`,
  `docs/tracking/evidence/refine-wp3-proposal-research-2026-11-23.md`.
- Tracking: S06 (TRK-S06-008/009), L04 (TRK-L04-040/041), L13 (TRK-L13-010).

## Last results

| Suite | Result |
|---|---|
| Backend | 430 passed / 1 skipped |
| Ruff | clean |
| Web | lint, typecheck and build clean; 170 tests |
| Integration | 21/21 |
| Browser Demo | 30/30 |
| Reference | 29 of 30; geographic-editor fixed; `scene-textures` failed once in the `openListView` helper (timeout) and passed when rerun alone, so it's intermittent |

## Next executable actions

1. WP1 1.7: browser-verify expired session, permission denial and stale revision across Pricing,
   Proposal and Submission.
2. WP2 2.1/2.4/2.7: contextual panel completeness per item type, supplier comparison on comparable
   basis, cost versus selling price labelling.
3. WP3: find a replacement owner RFP (Surrey 403) and a Malaysian example; design output template v4
   (new version; old snapshots byte-identical); visual PDF inspection.
4. WP4: token unification (two different `--brand-maroon` values), favicon/metadata, sign-in, and the
   selected-card/caption overlap.

## Decisions / external setup still required

- Commercial plan names, prices, limits, retention/downgrade terms (WP6). Ask at the gate; not yet asked.
- Hosted email delivery for self-service verification (WP5).
- AI provider/model approval and permitted representative documents (WP7).
- Existing gates: REC-010, AC-04, AC-06, AC-07, AC-10; hosted restore drill; pilot acceptance.
