# Studio UI refinement ? 9 November 2026

Affected IDs: S01, L01, L04; visual acceptance requirement TRK-S01-007. Existing functional statuses and gates are retained.

## Reference and implementation
Inspected https://app.shadowmap.org/ in Edge (welcome dismissed and optional analytics opted out); reference capture `artifacts/shadowmap-reference.png`. Official overview: https://shadowmap.org/. Adopted the map-first presentation, floating rounded controls and clear active states with InfraShader maroon/silver. No Shadowmap code, assets or service integrated; no feature parity claim.

- `apps/web/src/studio.css`: scoped Studio presentation, rounded project controls/cards, compact search grid, system variable-font typography, dimensional gradient/bevel buttons, floating header, icon dock, softened inspector, responsive offsets and reduced-motion rules. Uses installed Segoe UI Variable with system fallbacks; no remote font dependency.
- `apps/web/src/components/StudioShell.tsx`: existing Lucide icons, expanded-state semantics, unchanged tool callbacks and mounted draft content. Header task identities remain text-labelled.
- `apps/web/src/App.tsx`: scoped Studio page class/data-screen and project-filter classes/placeholder. No backend or authorisation changes.
- `apps/web/src/main.tsx`: loads presentation stylesheet after existing styles.
- `tests/reference-browser/studio-shell.spec.mjs`: desktop/mobile dashboard screenshots, horizontal-overflow, keyboard activation, expanded state and reduced-motion checks alongside existing import/reset, draft retention and persistence checks.

## Actual checks
- Initial lint/typecheck/build and browser attempt failed on a JSX map closure introduced during editing; fixed before successful reruns. Initial unit run: 56 passed / 1 failed from the same parse error. No unresolved test failure.
- `npm run lint`, `npm run typecheck`: passed after correction.
- `npm test`: 57 passed / 20 files.
- `npm run build`: passed; final CSS contrast/offset correction followed by final build. Existing large-chunk warning remains.
- `.\scripts\api.ps1 lint`: Ruff passed / 85 files already formatted.
- `.\scripts\api.ps1 test -q`: 285 passed, existing Starlette/httpx deprecation warning.
- `npx playwright test --config playwright.reference.config.mjs studio-shell.spec.mjs`: one workflow passed against disposable PostGIS and fixture auth, offline basemap.
- `npx playwright test --config playwright.studio.config.mjs studio-shell.spec.mjs`: same workflow passed with live OpenFreeMap 3D buildings after final CSS corrections. Provider missing-sprite and null-filter warnings remain external limitations.
- Inspected rendered `artifacts/theme-dashboard.png`, `artifacts/theme-dashboard-phone.png`, `artifacts/studio-desktop.png`, `artifacts/studio-phone.png`. Desktop 1280x900, phone 390x844. Corrected selected-outline white-on-light contrast and mobile map-control overlap after first render; final live-provider captures inspected.
- `git diff --check` on affected code passed (line-ending conversion notice only).

## Remaining gates
User visual acceptance, physical devices, other browsers and complete assistive-technology validation remain pending. This does not close L04 terrain/reference parity, field accuracy or wider S01 audience workflow gaps. No real Supabase login check this turn; test authentication is a fixture. No push, deployment, paid resource or Excel export. Existing unrelated working-tree changes retained.

## Prior functional/visual evidence
- L01: [docs/tracking/evidence/l01-k01-2026-11-04.md](../../../docs/tracking/evidence/l01-k01-2026-11-04.md)
- L04: [docs/tracking/evidence/geographic-studio-2026-11-08.md](../../../docs/tracking/evidence/geographic-studio-2026-11-08.md)
- S01: [docs/tracking/evidence/maroon-silver-ui-2026-11-09.md](../../../docs/tracking/evidence/maroon-silver-ui-2026-11-09.md)
