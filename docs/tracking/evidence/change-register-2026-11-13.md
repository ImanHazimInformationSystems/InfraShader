# K03/L26 change register and K02 changed-since-issue impact — 13 November 2026

Scope: catalogue 00.4 "change-impact/revision ledger … preserving issued records" and D1A exit "revise a work area/spec, review quantity/price impacts and issue a complete consistent proposal with the previous issue unchanged". Before this slice, revised proposals already required a change summary and stored `previous_issue` and item-level `scope_changes` (`apps/api/app/calculations.py`), but there was no change-request record, state/evidence trail, quantity/price impact against the last issue, or link to the revised issue.

## Implementation

- `apps/api/migrations/versions/0016_change_requests.py`: append-only `change_requests` (immutable rows via `prevent_artifact_update`, RLS, revoked public roles).
- `apps/api/app/change_register.py`:
  - `GET …/change-requests`: register, available issued proposals, and **impact**: last issued proposal's selected scope vs the current saved design for the same option (added/removed/changed items, issued vs current quantity, delta only when units match, unit-change flag) and selling totals — difference shown only when a **complete current** estimate exists for that option; partial or missing estimates say so and show no difference. No internal cost, rate or margin is returned.
  - `POST …/change-requests` (edit_project): requester, role, date, reason, original scope, additions/removals, time effect (stated assumption), affected items validated against the saved design; base issue recorded.
  - `POST …/{key}/transition`: prepared → reviewed (requires `issue_proposal`; freezes the impact snapshot) → sent (method required) → acknowledged/rejected (external person, date and existing project evidence required; outcome labelled "not a contract variation or payment approval"); withdraw from open states; reviewed → prepared reopens and clears the snapshot. Expected-revision conflicts return 409.
  - `POST …/{key}/revised-issue` (issue_proposal): links a proposal issued after the base issue; once only.
  - `GET …/change-requests/export.csv`: standalone register download (selling totals only).
- `apps/web/src/components/ChangeRegister.tsx`, mounted on Design Studio contractor project screens.

## Verification (actual)

| Check | Result |
|---|---|
| `pytest tests/test_change_register.py` (disposable PostGIS) | 2 passed: issue v1 → enlarge the same item's polygon → impact `changed` with exact quantity delta and no price delta before re-estimating; Studio read-only grant denied; cannot skip review; reviewed snapshot price delta = current − issued and stays frozen through later states; stale revision 409; outcome with unknown evidence denied; acknowledged with evidence; revised v2 issued and linked (linking v1 rejected); v1 payload byte-identical; impact `unchanged` after v2; CSV export; foreign tenant 404; SQL UPDATE rejected by trigger |
| Browser `tests/integration-browser/change-register.spec.mjs` (Edge, disposable PostGIS, test-signed identity, ports 8100/5174) | passed: API-seeded issued v1 then doubled area and recalculated; UI shows changed item and price difference, records a request, internal review freezes impact, sent, acknowledgement without evidence refused with a visible alert, CSV downloaded, v1 unchanged, 390 px no page overflow |
| Hand check of on-screen values | 123.0839 m² × MYR 100 × 1.20 = MYR 14,770.07 (issued); 246.1678 m² × 120 = MYR 29,540.14 (current); difference MYR 14,770.07 — matches |
| Backend full suite | 348 passed; Ruff/format passed |
| Frontend lint, typecheck, 93 unit tests, build | passed |

Screens inspected (`test-results/change-register/register-desktop.png`, `register-narrow.png`); inspection led to rounding displayed quantities to 2 dp (exact values remain in the API), keeping a row open after a state change, resetting the create form, and fixing description-list layout.

## Remaining gaps

- No automatic proposal of a revised issue from a change request; issuing remains the existing deliberate output flow, then linking.
- Time/programme impact is a stated assumption only; no schedule model.
- Impact compares the issued option's scope only; Baseline/option switching and per-line cost explanations are not shown to keep internal cost private.
- K02 full dependency graph (object → schedule → rate selection → estimate → proposal per input) remains partial; this adds the project-level "changed since last issue" view.
- Client acknowledgement is evidence-backed record keeping, not a signature service; no client portal (L25/D2).
