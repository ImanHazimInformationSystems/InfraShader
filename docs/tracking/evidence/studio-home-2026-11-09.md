# Studio project home simplification ? 9 November 2026

Scope: S01 / L01, TRK-S01-008. The user found the project-selection page confusing. Existing feature statuses and acceptance gates remain unchanged.

## Changes
- `apps/web/src/App.tsx`: clear new/open project instructions and Your projects section; organisation/workspace selectors collapse behind a labelled disclosure on Studio home (automatically expanded when organisation/workspace is missing). Sorting, stage/opportunity filters, card/table switch and reusable contacts are grouped under Filters and view options. Search remains immediately available; active filters remain visible when the controls are collapsed. No-match states offer clear/reset instead of suggesting the user has no projects. Cards explicitly say Open project. Setup detail remains available in a separate disclosure.
- `apps/web/src/studio.css`: compact home controls, responsive search, smaller card illustrations and clearer hierarchy. Maroon/silver and existing motion retained. Project-specific and review workspace controls remain available; no permission/backend change.
- `tests/reference-browser/studio-shell.spec.mjs`: updated disclosure interaction and checks for stage/search no-match, reset, project access, overflow and screenshots. Screenshots scroll to page start for reliable framing.

## Checks
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 57 passed, 20 files.
- `npm run build`: passed; existing large-chunk warning.
- `.\scripts\api.ps1 lint`: passed; 85 files already formatted.
- `.\scripts\api.ps1 test -q`: 285 passed, existing Starlette/httpx deprecation warning.
- `npx playwright test --config playwright.reference.config.mjs studio-shell.spec.mjs`: passed; final repeat refreshes screenshot framing. Disposable local PostGIS, fixture auth and offline map. Existing draft preservation, import/reset, reduced motion and keyboard assertions still pass.
- Desktop 1280x900 and phone 390x844 project-home screenshots inspected: `artifacts/theme-dashboard.png`, `artifacts/theme-dashboard-phone.png`. Primary actions, disclosures, card and no-horizontal-overflow checked.

## Limits and prior evidence
Not an exhaustive browser suite or real Supabase run. Physical-device, assistive-technology and user usability acceptance remain pending. No business feature completeness promotion, Excel export, push or deployment. Existing unrelated changes retained. Prior functional and visual evidence: [Studio refinement](studio-ui-polish-2026-11-09.md), including its linked L01/S01 history.
