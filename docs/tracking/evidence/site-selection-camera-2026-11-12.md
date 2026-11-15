# Site selection follows the viewed location — 12 November 2026

L02 maintenance, TRK-L02-013. Existing L02 implementation and acceptance statuses remain Implemented / Pending. The L04 outline handoff is regression coverage, not a broader L04 completion claim. Previous [site-selection implementation evidence](site-selection-2026-11-11.md) remains applicable.

## Change and cause

`apps/web/src/components/SiteSelectionEditor.tsx` previously seeded a bounds-only draft from the original accepted/search extent and automatically framed it on mount and resize. Panning elsewhere before choosing Select site on map therefore returned to the old location.

Fresh drafts now use MapLibre unprojection of an inset rectangle inside the current visible map, accounting for desktop/phone selection panels and current zoom. Opening and resizing do not frame automatically; Frame selection remains explicit. Reset restores the draft captured at opening. Existing applied outlines retain their exact geometry. Accepted coordinates change only on Apply; Cancel preserves them. Oversized/unsupported geometry remains subject to the existing validation.

`apps/web/src/components/SiteMap.tsx` stops any camera animation and enters top-down mode at the current location before mounting the editor. No domain persistence, quantity calculation, provider configuration or API change.

`tests/reference-browser/site-selection-camera.spec.mjs` adds desktop/phone checks with a controlled George Town, Penang Photon response and an offline coordinate map. The checks navigate away with keyboard and mouse camera panning, confirm the original extent is offscreen, open the selector with visible handles, exercise Reset/resize/Cancel, apply a disjoint extent and reopen an applied outline without geometry changes.

`tests/reference-browser/site-selection.spec.mjs` now enters the existing connected workflow using Active organisation and Open Design Studio, matching the current home screen.

## Actual verification

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`: passed; 64 frontend tests in 22 files. Existing large-chunk build warning remains.
- `.\scripts\api.ps1 lint`: passed; 86 files already formatted.
- `.\scripts\api.ps1 test -q`: 287 passed; existing Starlette/httpx deprecation warning remains.
- `npx playwright test --config playwright.reference.config.mjs site-selection-camera.spec.mjs`: 2 passed, desktop and phone.
- `npx playwright test --config playwright.reference.config.mjs site-selection.spec.mjs`: 1 passed, including fixture identity, real local PostGIS project creation/reload, exact outline handoff, explicit workspace save and invalid envelope rejection.
- Inspected `artifacts/site-selection-camera-desktop.png` and `artifacts/site-selection-camera-phone.png`: draft and handles are visible clear of the selection panel.

Initial combined browser run: phone passed; desktop failed because rapid keyboard pans interrupted one another before leaving the old extent. The regression now lets each key pan finish and also exercises mouse dragging. The existing persistence test initially timed out on the obsolete Change workspace navigation; updated to current controls and reran successfully. No product failure was inferred from those test setup failures.

Canonical L02 register/specification, TRK-L02-013 and UI connection note updated in place. `python scripts/tracking.py`, `python scripts/tracking.py --check`, `python scripts/ui-catalogue.py`, `python scripts/ui-catalogue.py --check` and `python scripts/feature-checklist.py` passed. Tracker validation reports 128 feature/reference records, 84 roadmap features, 1016 acceptance records and 160 original requirement names. The first tracking check rejected multiple evidence paths in its single-link field; corrected to this record, which links prior evidence. No Excel export.

## Limits

The new camera regression uses Browser Demo, simulated search and an offline map. The separate persistence regression uses fixture identity and real local PostGIS. Neither establishes live Photon/OpenFreeMap availability, real Supabase Auth/Storage acceptance, physical touch, assistive technology, surveyed accuracy or customer acceptance. Those gates remain pending. No remote write, deployment or paid service.
