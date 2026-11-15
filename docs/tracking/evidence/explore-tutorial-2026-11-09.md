# Explore site-selection tutorial ? 9 November 2026

L02 / TRK-L02-009. On-demand tutorial requested for the immersive new-project map. Feature implementation/deployment/acceptance statuses remain unchanged.

## Implementation
- `apps/web/src/components/ExploreTutorial.tsx`: native modal dialog, four illustrated steps, progress, Back/Next/Skip/Close, Escape dismissal, explicit Tab focus wrapping and trigger focus return. Each reopening starts at step one. The guide only holds presentation state and cannot change coordinates or save a project.
- `apps/web/src/components/explore-tutorial.css`: maroon/silver card, soft backdrop, short entrance/step/button transitions, responsive layout and reduced-motion overrides. No new dependency or remote assets.
- `apps/web/src/components/ExploreWorkspace.tsx`: Tips / tutorial in the map toolbar; map/control state remains mounted.
- Guide wording checked against `PlaceSearch.tsx`, `SiteMap.tsx`, `BoundsForm.tsx` and the App continuation callback. Explains unavailable-search fallback, top-down two-corner selection, coordinate Apply, unsurveyed locator limits and separate brief creation. It does not claim verified building coverage or shade accuracy.

## Actual checks
- `npm run typecheck`: passed; final `npm run build` also runs TypeScript.
- `npm run lint`: passed, repeated after focus-loop change.
- `npm test`: 57 passed in 20 files (before the final focused keyboard-loop change; that change verified in browser).
- `npm run build`: passed after final component change; existing large-chunk warning.
- `.\scripts\api.ps1 lint`: passed, 85 files already formatted.
- `.\scripts\api.ps1 test -q`: 285 passed; existing Starlette/httpx deprecation warning.
- `npx playwright test --config playwright.reference.config.mjs explore-tutorial.spec.mjs`: passed. Initial run exposed reverse-Tab focus wrapping, fixed explicitly; a second run reached the brief but its exact-label assertion omitted the required-field marker, corrected before final pass.
- Workflow checks all four steps, back navigation, skip/reopen, Escape, focus return/wrapping, reduced-motion CSS, unchanged coordinates and subsequent project brief. This is Browser Demo UI verification on fixture server, not real-service acceptance.
- Inspected `artifacts/explore-tutorial-desktop.png` (1280x900), `artifacts/explore-tutorial-phone.png` and `artifacts/explore-tutorial-trigger-phone.png` (390x844). Guide and toolbar fit; no horizontal page overflow. Map provider unavailable during fixture capture; coordinate fallback stays usable.

## Limits and history
No new geographic calculations, provider integration, real Supabase verification or survey/field claims. Physical devices, full screen-reader testing, other browser engines and user usability acceptance remain pending. No push, deployment, paid resources or Excel export. Prior explorer evidence: [geographic editor](geographic-studio-2026-11-08.md) and [L02 explorer](l02-2026-11-04.md).
