# Terrain control visibility — 13 November 2026

The user reported seeing “Build hills. Carve hollows.” and brushing instructions without controls. Code inspection found that all brush cards were hidden while the selected scenario had no terrain; after setup, Explore was selected and settings stayed hidden. The inspector also retained its lower scroll position when reopening the same Terrain tool. These are first-use/discoverability issues; the user's exact browser state was not directly inspected.

`TerrainBuilder.tsx` now keeps the seven brush cards visible before setup, disabled with an explicit setup explanation. Instructions reflect setup, Explore or active brushing. Successful preparation selects Raise hills with a +3 m target and returns the brush tray to view, showing circle/square, size, speed and target controls. Site-map mode offers an explicit terrain-view action. Read-only, archived and pending-update states receive explanations from `GeometryWorkspace.tsx`. `StudioShell.tsx` returns the inspector to the top when Terrain is clicked, including reopening the same tool. Numerical/source/permission/revision behavior is retained; source assumptions still require confirmation.

Actual checks:

- `npm run lint --workspace apps/web`: passed.
- `npm run build --workspace apps/web`: passed, including TypeScript. Existing large-chunk warning.
- `npx playwright test --config playwright.reference.config.mjs tests/reference-browser/terrain-builder.spec.mjs`: **1 passed, 55.5 s**. Now asserts visible-but-disabled initial brushes/setup explanation; Raise hills selected and in viewport after preparation; enabled shape/size controls; inspector scroll reset. Existing held sculpt/cancel/undo/pond/manual-cost/save/stale/reload workflow remains passing.
- Inspected updated desktop and phone `artifacts/terrain-builder-desktop.png` / `terrain-builder-phone.png`. Fixture map only; numerical and live-provider checks from [the prior numerical checkpoint](terrain-water-analysis-2026-11-13.md) were not rerun for this UI fix. Backend suites skipped because backend behavior did not change.

L06 UI coverage/specification and TRK-L06-012 evidence updated; status dimensions and release/customer gates unchanged. No deployment, external write, paid resource or Excel export.
