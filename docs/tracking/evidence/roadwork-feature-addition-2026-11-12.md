# L31 road and driveway takeoff implementation evidence

Date: 12 November 2026. Scope: the user-requested roadmap addendum L31 and its first connected, limited slice. The original 11 November PDF still describes 84 baseline features; L31 is a separately traceable project roadmap addendum.

## Connected behaviour found and verified

- The Design Studio material schedule can attach a `road` assembly to a deliberately drawn area work item; path geometry is rejected for road takeoff.
- Each road component is constrained to material / volume / m3 and a positive explicit thickness. The API derives layer volume from saved projected area using `area_m2 × thickness_mm / 1000`, applies component material waste once, and does not apply the estimator's global waste a second time to that derived component.
- Component rates are selected deliberately. The estimate uses a compatible selected m3 rate; absent/unapproved rates remain unpriced through the existing schedule and pricing readiness contract.
- The assembly persists with normal workspace revisions and shares existing schedule/estimate export. The reference browser fixture selects a road assembly, checks the saved m3 quantity, calculates a synthetic-rate estimate and exports the saved schedule.
- UI describes the formula and explicitly says it is not a road design or certification system. No road defaults or demo market rates are inserted. The rendered screenshot `artifacts/l09-l10-schedule.png` was inspected; it shows the saved road-layer form, formula note, explicitly synthetic fixture rate/source and BOQ quantities. This is not customer acceptance or market-rate evidence.

## Files in this implementation slice

- `apps/api/app/schedules.py`
- `apps/api/tests/test_schedules.py`
- `apps/web/src/domain/workspace.ts`
- `apps/web/src/components/PlantMaterialPanel.tsx`
- `apps/web/src/product/model.test.ts`
- `tests/reference-browser/schedules.spec.mjs`
- `apps/api/app/calculations.py` and `apps/web/src/components/IssuedPdf.tsx` are not extended with a dedicated road-layer proposal disclosure in this slice; general estimate scope/assumptions and quantity schedule remain the current proposal output.

## Checks

- `scripts/api.ps1 test tests/test_schedules.py tests/test_pricing_readiness.py -q` ? **22 passed**, one Starlette/httpx deprecation warning.
- `npm run test --workspace apps/web -- --run src/product/model.test.ts` ? **3 passed**.
- `npm run typecheck --workspace apps/web` ? **passed**.
- `npm run lint --workspace apps/web` ? **passed**.
- `npm run build --workspace apps/web` ? **passed**; Vite reported large chunk-size warnings.
- `scripts/api.ps1 lint` ? **passed** after formatting the touched schedule test (Ruff checks and format check).
- `npx playwright test --config playwright.reference.config.mjs tests/reference-browser/schedules.spec.mjs` ? **1 passed**. The local browser workflow saved a synthetic project/rate, selected Road / driveway layered pavement, checked the saved m3 formula, calculated the estimate, exported the schedule and rendered the inspected panel screenshot. This is local integration evidence only.
- `python scripts/tracking.py`, `python scripts/ui-catalogue.py --check`, `python scripts/design-studio-catalogue.py --check`, and `python scripts/feature-checklist.py --check` ? **passed** after status regeneration.

## Not established

This is **partial implementation**, not completed road engineering. The repository checks do not verify field accuracy, a jurisdiction's section standard, material suitability, survey control, vertical profile, cut/fill, mass conversion, drainage, subgrade design, traffic loading, permits, safety, code compliance, a certified design, commercial accuracy, or user acceptance. Proposal output does not yet provide a dedicated road-layer/source disclosure block; no customer-facing supplier-rate provenance is exposed. The first-release road class/region and the proposed CORE (LIMITED) / NEXT split await user/product confirmation.

## Release gates

1. Broader browser coverage for stale conflicts, permission boundaries and proposal output remains open; the focused road schedule browser path and rendered panel were checked.
2. Review dimension/CRS calculation against independent metric fixtures and representative known road-area takeoffs.
3. Decide whether customer proposals need an explicit layer schedule and shareable rate-source fields without leaking internal commercial data.
4. Supply applicable local road class/specification and qualified civil/quantity-surveyor review before any design or field-accuracy claim.
5. Obtain contractor/customer acceptance for clarity, estimating workflow, commercial assumptions and exclusions.

None of these external engineering or pilot gates is represented as complete.
