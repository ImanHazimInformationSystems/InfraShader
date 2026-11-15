# D1B owner proposal review core — 13 November 2026

Scope: catalogue 00.5 CORE OWNER BOUNDARY and section 10 D1B. Features O02, O04, O05, O06, O07, O08 (document-only fallback), O09, O10, O12, O13, O14, O15, O16, O17, O18, K06, with S04/S10 retention and history. Before this slice every owner screen was a UI-only preview; O08–O10/O17 only reused the contractor option-preference record (`apps/api/app/reviews.py`), which is not owner procurement.

## Implementation

- `apps/api/migrations/versions/0015_owner_review.py`: `review_entries` (append-only revisions; kinds basis/rubric/submission/score/clarification/decision; UPDATE blocked by the existing `prevent_artifact_update` trigger; RLS enabled, PUBLIC/anon/authenticated revoked) and `review_files` (private retained bytes with SHA-256, same protections).
- `apps/api/app/owner_review.py` (router under `/api/v1/organisations/{org}/projects/{project}/owner-review` plus `/owner-review/dashboard`):
  - Access: requires a project grant with `review_project` (prepare, intake, confirm, score, recommend) or `issue_developer_brief` (approve/return/reject). Studio-only grants and foreign tenants receive the standard 404. Only active `developer_decision` projects.
  - Basis (O02/O04/O13): versioned common scope items, units, reference quantities, eligibility/technical requirements with expiry flags, MYR currency, comparison tax basis, budget, horizon, deadline/timezone, assigned reviewers (must hold a review grant), and an explicit self-approval policy with **no default**. Any later change is an addendum requiring a note; offers confirmed against an older basis revert to “needs clarification”.
  - Intake (O05/S04): receipt record (bidder, channel, supplier registration flag, sender, receipt time, receipt evidence, recorder). Originals admitted by content sniffing only — PDF (header + EOF), XLSX (OOXML zip with `xl/`), native JSON object — ≤10 MiB, stored unchanged with SHA-256; download re-verifies the hash and sends `no-store`/`nosniff`. No supplier account needed.
  - Confirmation (O06/O07/O14): each field (quoted total, tax basis, validity, duration, warranty, exclusions, annual maintenance) is unconfirmed/confirmed/not-provided; confirmed requires a source document of that same offer and page/sheet/cell. Lines keep original text/unit/qty/rate/amount, map to a basis scope item, and are included/excluded/optional/missing/provisional/unpriced; unpriced/missing lines cannot carry a quoted amount. Comparison-only adjustments require reason + source and are shown separately from quoted totals. Requirement responses: answered (claim), absent, unclear, not applicable, reviewer-accepted, reviewer-rejected (sourced).
  - Revised package (O15): increments package version, keeps history; offer needs re-confirmation and earlier score sheets become stale.
  - Rubric (O09): criteria with Decimal weights that must total exactly 100, direction, integer scale, optional mandatory gate with pass mark, evidence requirement. Missing-score rule (`not_ranked` | `scale_minimum`) and reviewer aggregation (`mean` | `median`) must be chosen explicitly. Tie policy is `report_only` — ties are flagged, never broken. Lock creates an immutable locked revision; editing a locked rubric requires a change reason.
  - Scores (O10): one sheet per assigned reviewer per offer against the current locked rubric revision; draft/submitted; submitted scores need rationale; optional source reference; declared conflict recuses (no scores accepted). No peer-score separation policy adopted (visible after submission).
  - Evaluation (O12/O13/K06): pure deterministic function; per-criterion aggregate → normalised to scale → weight × normalised, Decimal quantised HALF_UP to 0.0001, total to 0.01. Readiness priority ineligible > unpriced > needs clarification > comparable, with every reason listed; document-only shown separately. Ranking only for comparable, fully scored offers under a locked rubric. Quoted total, adjustments, comparison total, budget gap, undiscounted lifecycle (capital + confirmed annual maintenance × horizon). SHA-256 hash over input revisions and results. What-if weights return a labelled non-official result.
  - Signoff (O16): one reviewer → approver transition. Submission requires the current official evaluation hash; recommending an offer not ranked first requires an exception reason. Approval is blocked when inputs changed since submission (return/reject still allowed), and when self-approval is prohibited and approver = recommender.
  - Decision pack (O17): on approval the server retains `decision-pack.json` (basis, rubric, all current offers, score sheets with rationale, clarifications, evaluation and hash, decision history, source file manifest with hashes, no-AI disclosure) and `decision-appendix.csv`, immutable with SHA-256.
  - Dashboard (O18): per accessible owner project — offers, document-only count, readiness counts, budget, comparison range with priced count, submitted/expected score sheets, rubric lock, decision state and approval waiting days; definitions and computation time included; projects hidden by grants counted, not shown.
- Frontend: `apps/web/src/components/OwnerEvaluation.tsx`, `apps/web/src/domain/owner-review.ts`, styles in `apps/web/src/styles.css`; mounted in `apps/web/src/App.tsx` on Review project screens (owner-decision projects, review/approve grants) and dashboard on the Review home. Six steps: Basis, Rubric, Offers (intake, retained originals, PDF viewed beside the confirmation table, tab-local unsaved draft recovery), Scores, Clarifications, Evaluation & decision.

## Verification (actual, 13 November 2026)

| Check | Result |
|---|---|
| `uv run pytest -q tests/test_owner_review.py` (disposable PostGIS `_test` schema) | 4 passed |
| Hand-worked: median/lower-better/minimum substitution/tie (A=B=63.50 tied rank 1; C=30.00) | passed |
| Hand-worked integration: A PRICE mean(8,6)=7→35, TECH 9.5→28.5, SAFE 7→14 = **77.50**; B 45+19.5+10 = **74.50**; B comparison 65,000+8,000 allowance = 73,000 vs quoted 65,000; cheapest offer C (50,000, external, unregistered) **unpriced, not ranked** | passed |
| Negative: Studio-only and foreign-tenant 404; approver cannot prepare (403); unassigned reviewer (403); out-of-scale score; source from another offer's document; stale expected revision 409; locked-rubric edit without reason; scoring an unlocked rubric; self-approval 403; reviewer cannot approve; stale-package approval 409; not-first recommendation without exception; malformed files (truncated PDF, plain zip, EXE header, JSON array, >10 MiB); raw SQL UPDATE of both tables rejected by trigger | passed |
| Backend full `pytest -q` | 346 passed (baseline 342) |
| `ruff check .`, `ruff format --check .` | passed |
| Frontend `npm run lint`, `typecheck`, `npm test` (93 passed, baseline 91), `npm run build` | passed |
| Browser `tests/integration-browser/owner-review.spec.mjs` (Edge, disposable PostGIS + test-signed identity, alternate ports 8100/5174 because the user's dev servers occupied 8000/5173) | passed. UI-driven basis (policy select required), rubric (100.00 total, lock), external offer receipt, real PDF upload, side-by-side viewer, field/line/requirement confirmation, UI scoring; evaluation shows 78.00 rank 1 / 72.00 / external offer “Needs clarification, Not ranked, INS absent”; recommendation + approval through UI; downloaded pack JSON parsed (3-file manifest, 78.00, submit→approve history); external original byte-identical; dashboard row; 390 px no page overflow |

Screens inspected: `test-results/owner-review/evaluation-desktop.png` and `evaluation-narrow.png`. Inspection found and fixed: text fields sent `null` when “not provided” (422), ambiguous score labels across offers, sideways flex notices, pack buttons overflowing at 390 px, and decision-relevant columns hidden behind horizontal scroll (reordered).

Environment notes: the first browser attempts intermittently failed with Edge `net::ERR_NO_BUFFER_SPACE` before sign-in (environmental; later runs passed without code changes for that symptom).

## Not established / remaining gaps

- Owner policy decisions REC-010 remain open: the software requires the owner to choose weights, missing-score rule, aggregation and self-approval per project; no organisation policy is adopted. Ties are reported only.
- No OCR/table extraction or bounding boxes (O06 manual entry only); no automatic native-snapshot prefill; XLSX/PDF content is not parsed.
- O16 is a single reviewer→approver stage; no configurable multi-stage routing, delegation, time limits or committee (O11).
- O10 peer-score separation and financial-envelope visibility are not implemented (no policy adopted).
- O12 sensitivity is a what-if table, not charts. O13 discounted lifecycle is not implemented.
- O15 records clarifications manually; nothing is sent; common addenda acknowledgement list is stored but has no UI.
- O17 pack is JSON + CSV; no PDF memorandum rendering yet. O18 has no portfolio/department/date filters.
- O08 synchronised spatial comparison of submitted maps not implemented; document-only fallback is.
- Retained bytes live in PostgreSQL; a joint database restore drill including these files has not been run.
- Fixture identity is not Supabase Auth acceptance; three synthetic offers are not representative documents (AC-04) or a customer pilot (AC-10).
