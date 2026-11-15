# Maroon and silver shared UI ? 9 November 2026

Scope: user-requested application-wide colour update. S01 / TRK-S01-006. No backend or business-rule changes. S01 remains Partial; its overall workflow verification and acceptance are not promoted by this visual subset.

## Changes
- `apps/web/src/styles.css`: shared maroon primary (#701f36), deep maroon (#431322), silver (#d5d7dd), neutral surfaces, borders and labels; login, sidebar, forms, workspace switcher, map controls and Studio header/dock/inspector. Native form accent follows primary. Existing animations/reduced-motion rules retained.
- `apps/web/src/components/ui/button.tsx`: replace emerald utility colours with shared palette tokens.
- Semantic warnings/errors/success, map illustrations, geographic buildings/vegetation and solar data colours are retained.
- `tests/reference-browser/studio-shell.spec.mjs`: added login and loaded dashboard screenshots to existing workflow; retained desktop/mobile Studio screenshots.
- `docs/PREFERENCES.md`: records the explicitly requested palette.

## Checks
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 57 passed across 20 files.
- `npm run build`: passed; existing large-chunk warning remains.
- `.\scripts\api.ps1 lint`: Ruff passed; 85 files formatted.
- `.\scripts\api.ps1 test -q`: 285 passed; existing Starlette/httpx deprecation warning.
- `npx playwright test --config playwright.reference.config.mjs studio-shell.spec.mjs`: passed (one workflow), local PostGIS with fixture authentication and offline map. Checks selected-site 3D control availability, context import/reset, draft preservation, mobile overflow and absence of unintended workspace persistence.
- Rendered screenshots inspected: `artifacts/theme-login.png`, `artifacts/theme-dashboard.png`, `artifacts/studio-desktop.png`, `artifacts/studio-phone.png`. Desktop 1280x900; phone 390x844. Small labels on maroon brightened to silver after initial inspection.

## Limits and previous evidence
Local checks only; no deployment, real Supabase authentication verification, field accuracy or customer acceptance claimed. Review uses the same shared styles, but a separate Organisation Review screenshot was not inspected. Not every dialog/device/state was visually audited. Original S01 evidence and outstanding role/workspace scope remain in [original audit](audit-2026-10-26.md#s01). No Excel export, push, deployment or paid resources.
