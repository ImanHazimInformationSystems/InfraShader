# Pricing readiness and proposal checkpoint - 31 October 2026

Branch: `build/l07-object-palette`. The user's request was to finish pricing readiness and proposal output, following L09/L10 quantities. Existing unrelated editor/access/map work was preserved. No push, deployment, paid resource or external message. No Excel export.

## Implementation and scope

K04: deterministic priced-line counts, unknown/expired/future/archive validity, proposal-period checks, zero/optional/provisional warnings, unpriced hard gate, permissioned reasoned exceptions. L14: immutable source/date/validity references and equipment inclusions; broader supplier operations deferred. L15: explicit equipment and contingency plus existing sourced recipes/charges. L16: persisted formula, rounding/charge explanation, markup/margin independent examples, fixed-price loss review and private payload boundaries.

L24: required scope/programme/maintenance/validity, audience preview/confirmation, immutable snapshot and source manifest, optional explicit evidence-photo copies, quantity schedule, previous issue and scope-change appendix, retained PDF completion/retry and exact-byte download. Shared S04 file retention is now implemented for bounded issued PDFs, but S04 as a whole remains partial.

Paths: `apps/api/app/pricing_readiness.py`, `calculations.py`, `administration.py`, `domain/pricing.py`, `schedules.py`, `workspace.py`, `issued_files.py`, `output_images.py`, `models.py`, `main.py`, `body_limit.py`; `apps/api/migrations/versions/0012_pricing_issue.py`; `apps/web/src/components/CalculationsPanel.tsx`, `PricingIssueReadiness.tsx`, `IssuedOutputFile.tsx`, `IssuedPdf.tsx`, `CatalogueBrowser.tsx`, `PlantMaterialPanel.tsx`; `apps/web/src/domain/calculations.ts`, `workspace.ts`; `apps/web/src/services/retained-output.ts`.

## Checks performed

- `./scripts/api.ps1 lint`: passed, 73 Python files formatted at the final backend checkpoint.
- `./scripts/api.ps1 test -q`: 243 passed, zero skipped (20.13 seconds), including eleven new pricing/retention/photo tests. Real disposable PostgreSQL/PostGIS schemas and migrations.
- New tests: expiry date boundary, future/unknown/archive/zero/provisional flags, denominator and missing-value coverage; equipment duplication; private override audit; explicit rate references; denied internal/foreign access; missing-price hard block; below-cost privacy; pending file, manifest mismatch, invalid envelope, fresh-session bytes, immutable update, integrity failure, revoked member and simultaneous retention; previous issue preservation; opt-in photo copy, unavailable storage, immutable copy after archive and corrupt source rejection.
- Frontend lint/typecheck/build passed; 47 tests in 15 files passed. The final lint/build (including TypeScript) follow-up also passed after PDF layout fixes.
- Six existing PostGIS fixture browser workflows passed (1.2 minutes). Covers both output previews, form recovery, issuance, simulated first-retention outage and recovery, byte-identical repeat download. Two output workflows subsequently passed together after manifest changes (26.9 seconds).
- Explicit photo browser passed (10.4 seconds): private fixture upload, selected photo opt-in, preview, manifest/font digest, retained bytes and PDF image presence. This uses the in-memory Storage double and test identity, not live Supabase acceptance.
- Local application migration `0011 -> 0012` applied successfully, without reset or changes to existing projects.
- Rendered long-form contractor/developer PDFs and photo proposal with installed PDF.js/native canvas; inspected page images and extracted text with pypdf. Found absent dynamic footers caused by inherited line-height during repeated layout; removed inherited line-height and added mandatory per-page footer checks. Final per-page footer assertions passed for all three four-page synthetic outputs. See final results below.

## Failures resolved and limits

Initial lint/format and form-recovery boolean typing findings corrected. First contractor browser run timed out on an accessible label that included help text; an explicit label fixed it. Two new test-fixture mistakes (intentional corruption triggering ORM autoflush, membership key lookup) were corrected; assertions still check both database immutability and separate integrity handling. None of these initial failures was counted as a pass.

Large frontend bundle warnings and Starlette/httpx test-client deprecation persist. Photo rendering emits a nonfatal upstream `Buffer is not defined` warning; the emitted PDF includes the approved JPEG and was visually checked. No live Supabase Auth/Storage, restore drill, prolonged load, physical-device/assistive-technology, supplier/commercial pilot or field validation was performed in this increment. Fixture photo is a synthetic green image, not field evidence.

The retained PDF envelope is supplied by the authorised browser renderer and bound to a source hash; it is not independently content-certified or digitally signed. Database PDF retention is bounded to 10 MiB per file; original gallery file/identity coordinated backup remains a separate S04 gate. Existing historical snapshots cannot recover bytes that were never retained.


## Final review and verification

- `npx playwright test --config playwright.reference.config.mjs`: six passed (51.0 seconds): editor, objects, calibrated plan, photo proposal, plant/material schedules and terrain. The run now checks a page number on every PDF page and actual embedded image presence. First attempt could not start because local PostgreSQL was stopped after the session interruption; `./scripts/local-db.ps1 start` restored it and the full rerun passed.
- `npx playwright test --config playwright.access-fixture.config.mjs`: six passed (57.3 seconds), including both numbered PDF outputs, explicit form recovery and interrupted first-retention recovery followed by byte-identical repeat downloads.
- Final photo-specific rerun after layout adjustment passed; JPEG, manifest, retained bytes and all page numbers verified. All twelve pages across the final contractor/developer/photo fixture outputs were rendered and visually inspected using PDF.js/native canvas. Photo evidence title is kept with its first image/caption. No clipped or overlapping content found. The retained-file UI was also visually inspected.
- Late security review found the general organisation audit listing needed an additional project/internal-pricing filter for pricing exceptions. `administration.events` now applies the full project access check to those entries. Regression proves a permitted estimator-administrator sees the reason, while an administrator without that project's internal-pricing permission cannot. Final full backend rerun: 243 passed.
- Canonical tracking regeneration/validation passed: 128 records, 84 roadmap features, 971 acceptance rows, 160 original requirement names. A temporary combined evidence-link value failed validation and was corrected to a single primary checkpoint link. Scoped diff whitespace check passed; LF/CRLF advisory only. Source snapshots and stable IDs are unchanged. Excel not generated.

L10's underlying planting/material evidence remains in [30 October schedules checkpoint](schedules-2026-10-30.md); this increment adds explicit equipment handling and confirms its existing browser path still passes. Historical test results remain historical rather than being relabelled as current live Supabase or field acceptance.
