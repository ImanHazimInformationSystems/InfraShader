# Customer-ready refinement plan (execution view)

Derived execution view for the 23 November 2026 refinement brief ("Refine InfraShader into a cohesive,
reliable, customer-ready product"). **Not** a status database: canonical status, criteria and evidence
stay in `docs/tracking/*.csv` and dated files under `docs/tracking/evidence/`. Session continuation:
[`REFINEMENT_CONTINUATION.md`](REFINEMENT_CONTINUATION.md).

Branch: `refine/customer-ready` (from `build/l07-object-palette` at 16f19d6). Local commits only; no push,
PR, deployment, live payment, paid resource, external message or external AI upload without explicit
approval. The brief is not permission to implement the whole historical roadmap.

## Baseline (23 Nov 2026, before refinement changes)

| Check | Result |
|---|---|
| `npm run lint`, `npm run typecheck` | clean |
| `npm test` (Vitest) | 163 passed |
| `.\scripts\api.ps1 test -q` (disposable PostGIS schemas) | 425 passed, 1 skipped |
| `.\scripts\api.ps1 lint` (Ruff check + format) | clean |
| Alembic head in code | 0021 (hosted pilot recorded at 0021 on 16 Nov) |
| Known recorded failures (not re-run yet) | L04 mouse polygon drawing (`tests/browser/foundation.spec.mjs` "Terra Draw polygon…"); reference `studio-shell` spec ("Change workspace" control); reference roads phone "Layout" selector |

## Scope mapping and new-scope identification

Existing IDs are preserved. F/D/E aliases and K refinements are not extra roadmap features.

| WP | Existing IDs (verify exact contract before work) | New scope? |
|---|---|---|
| 1 Reliability & release | S06, S07, S11, S04, L04, S12 | No |
| 2 Unified pricing | L09, L10, L13–L16, L31, K02, K04, K05 | No |
| 3 Proposal output | L13, L22, L23, L24, L26, S03 | No (new template **version**, not new feature) |
| 4 Identity & polish | S08, S01 (UI) | No |
| 5 Public website & onboarding | S01, S02, S12 | **Yes**: public website. Proposed refinement record **K07** (not counted in the 85 roadmap features) — added to the register only when its slice starts |
| 6 Plans & billing | none | **Yes**: proposed refinement record **K08**; commercial decisions (prices, limits, terms) are owner gates |
| 7 Review AI | O06, O07, O14, O15, O17, O19; A01, A02, A03, A07, A08, A11 | No; staged A-features stay gated until A11 safeguards ship with the first capability |
| 8 Studio assistance & data quality | L27, A04, A06, K02, K04, K05 | No |
| 9 Maintainability & performance | S07, S11 | No |

## Work packages, acceptance criteria and status

Status values: **Done** (software criteria met with recorded checks), **In progress**, **Not started**,
**Gated** (external/business decision). "Done" never means customer or pilot acceptance.

### WP1 — Reliability and release foundations

| # | Observable acceptance criterion | Status | Evidence / files |
|---|---|---|---|
| 1.1 | A server error on a cross-origin deployment reaches the browser as a readable JSON error with CORS headers and a request reference (previously read as "API could not be reached") | Done | `apps/api/app/error_middleware.py`; `tests/test_reliability.py`; [evidence](tracking/evidence/refine-wp1-reliability-2026-11-23.md) |
| 1.2 | Pending migrations are reported by readiness (`checks.schema`, `database: migrations_pending`) and by request failures (`migrations_pending`, 503) instead of generic failures; no SQL text exposed | Done | `app/schema_status.py`, `app/db.py`, `app/main.py` readiness |
| 1.3 | The client distinguishes timeout (slow/starting server), offline, cancelled, unreachable and gateway failures; server failures show a short reference | Done | `apps/web/src/services/api.ts`; `api.test.ts` |
| 1.4 | Studio header distinguishes saved / never saved / unsaved / saving / save failed / revision conflict; the draft is kept on failure; a later save clears the failure | Done | `domain/save-status.ts`; `GeometryWorkspace.tsx`; `tests/integration-browser/reliability.spec.mjs` |
| 1.5 | L04 mouse polygon drawing and object-manipulation browser failures classified (app/test/provider/environment) and the cause fixed without weakened assertions | Done | Both were **app defects**: (a) camera state reset Terra Draw mode; (b) an embedded scene-tool click also selected the map feature underneath. `DrawingMap.tsx`, `ObjectScene.tsx`; Browser Demo 30/30; reference geographic-editor passes |
| 1.6 | Outdated reference specs repaired against current UI | Done | studio-shell and roads already passed (fixed 16 Nov; baseline note was stale). geographic-editor had one outdated "Map view" step, now conditional |
| 1.7 | Expired session, stale revision and permission denial states verified in browser across Studio, Pricing, Proposal and Submission | Not started | |
| 1.8 | Isolated backup/restore drill re-run on current head incl. private files and retained issued PDFs; hosted drill remains a separate gate | Partial | `test_restore_drill.py` passed on 0021 (DB + retained issued/review files by SHA-256). Supabase Storage photo bytes need the live suite (Docker not running 23 Nov). Hosted drill: gate |
| 1.9 | Critical browser journeys run in CI with isolated fixtures; manual deployment controls preserved | Not started | `.github/workflows/` |
| 1.10 | Expensive paths (shade, terrain, extraction, PDF) benchmarked; bounds/timeouts added; background jobs only if measurements justify (RQ/SlowAPI/OpenTelemetry are candidates, not commitments) | Not started | |
| 1.11 | Observability without passwords, tokens, document text, supplier costs or customer content | Partial | request log already records only id/method/status/duration; unexpected errors log type only |

### WP2 — Unified item pricing and estimating

Existing (verified 15 Nov, [evidence](tracking/evidence/pricing-home-2026-11-15.md)): one Pricing tool,
server draft preview, supplier/source fields, reviewed bulk apply, per-layer road pricing, states.

| # | Criterion | Status |
|---|---|---|
| 2.1 | Contextual panel for a selected item shows identity, specification, quantity + basis, compatible rates, inclusions/exclusions, contribution, missing info + direct fix | Partial (selected-item card + Price dialog exist; verify each item type) |
| 2.2 | Same interaction for trees, shrubs/planting, objects, paths/paving/roads, terrain work records, manual items | Partial; terrain and manual items to verify |
| 2.3 | Road with no layers explains and links to Materials (browser-tested) | Done (`pricing-road.spec.mjs`) |
| 2.4 | Supplier comparison on comparable spec/unit/tax basis/inclusions | Not started |
| 2.5 | Persistent estimate summary; explicit partial/unpriced totals; states Needs quantity / Needs rate / Needs review / Priced | Partial: states done 23 Nov; persistent summary outside the Pricing panel to verify |
| 2.6 | m³ inputs labelled with dimensions and visible calculation | Partial (layer method text) |
| 2.7 | Supplier cost vs client selling price clearly distinguished | To verify |
| 2.8 | Safeguards: no inferred prices, silent zero, invented charges, incompatible conversions; preview never presented as saved | Verified for preview; re-verify after changes |

### WP3 — Professional proposal and report output

| # | Criterion | Status |
|---|---|---|
| 3.1 | Research recorded: Fairfax County 2017 board package (contractor proposal pp. ~9–11) and Surrey RFP 1220-030-2016-027 (pp. ~43–45), plus a Malaysian example where accessible; sources actually opened listed | Partial: Fairfax pp.9–11 confirmed as a genuine completed proposal and analysed ([research](tracking/evidence/refine-wp3-proposal-research-2026-11-23.md)); Surrey returned HTTP 403 — replacement owner RFP and Malaysian example still needed |
| 3.2 | New output template version (v4) with the specified structure; earlier issued snapshots/PDF bytes unchanged (byte-compare test) | Not started |
| 3.3 | Modes from the same approved data: concise client proposal, technical/pricing appendix, owner decision output | Not started |
| 3.4 | Visual PDF inspection: pagination, long tables, no clipping, no private-cost leakage, map attribution | Not started |

### WP4 — Typography, identity and interaction polish

| # | Criterion | Status |
|---|---|---|
| 4.1 | One colour/spacing token set (baseline finding: `--brand-maroon` differs between `styles.css` #701f36 and `product/product.css` #72233d; no warning/danger tokens) | Not started |
| 4.2 | Font evaluated in real tables/forms/panels/PDF (Manrope vs Inter); bundled WOFF2, licence notices, tabular numerals | Not started |
| 4.3 | Favicon SVG + fallbacks, Apple touch icon, theme colour, social metadata, consistent titles | Done ([evidence](tracking/evidence/refine-wp4-brand-assets-2026-11-23.md)); absolute og:image waits for an approved domain |
| 4.4 | Sign-in: password visibility, real progress, cold-start explanation, error/retry/recovery, keyboard + password-manager compatible, reduced motion | Not started |
| 4.5 | Baseline UI defect: selected-item map card overlaps a map caption at bottom-left (seen in `test-results/reliability/save-failed.png`) | Not started |

### WP5 — Public website and onboarding (new scope, proposed K07)

Not started. Requires: public routes without eager map/editor load; honest availability labels; sample
proposal clearly labelled; self-service signup/verification through Supabase Auth (hosted email
delivery is an external gate); onboarding: organisation → workspace → project → first action → help.

### WP6 — Plans and billing readiness (new scope, proposed K08)

Not started. Commercial decisions (plan names, prices, limits, retention/downgrade terms) are **owner
gates**; configuration stays visibly unapproved and checkout unavailable until decided. Software that does
not depend on those decisions (entitlement model, idempotent signature-verified webhook processing with a
sandbox/mock contract) may proceed.

### WP7 — Source-grounded Organisation Review AI

Not started. A11 safeguards ship with the first capability. No external model calls with customer
documents without approval; if no permitted model/hardware is available, the adapter and review workflow
are finished and real-model verification is recorded as blocked — never presented as active AI.

### WP8 — Design Studio assistance and data quality

Not started. Data-quality summary must reuse server provenance/dependency/readiness logic.

### WP9 — Maintainability and performance

Not started. Baseline observations: `vite build` warns about chunks > 500 kB; large components
(`GeometryWorkspace.tsx`, `CalculationsPanel.tsx`, `App.tsx`) and `owner_review.py`.

## Decision and external gates (cannot be closed by software)

- Commercial plans/prices/limits/terms (WP6); live payments and provider account.
- Hosted email delivery provider for self-service verification (WP5).
- Model/provider choice and approval for any external AI processing; representative permitted documents (WP7, AC-04).
- Hosted backup/restore drill, monitoring/alerting provider (WP1).
- Existing gates: REC-010, AC-04, AC-06, AC-07, AC-10, field/pilot/customer acceptance.
