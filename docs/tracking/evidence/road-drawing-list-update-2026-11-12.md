# L31 road drawing documentation reconciliation

Date: 12 November 2026. This checkpoint updates requirements and generated lists only. It does not implement a new application tool.

## Source and code inspected

- The user's [road drawing clarification](../sources/user-road-drawing-clarification-2026-11-12.md) confirms that a town-building-style road placement interaction should be listed as proposed.
- `apps/web/src/components/PlantMaterialPanel.tsx` currently selects a road assembly only for an existing drawn area item and asks the user to define layers and thicknesses.
- `apps/api/app/schedules.py` accepts a road assembly for an area polygon and derives uniform material volume. `apps/web/src/components/DrawingMap.tsx` has generic polygon/line editing; the inspected paths do not contain a road-specific pointer route, width-to-footprint or curved-route tool.
- The earlier [L31 implementation evidence](roadwork-feature-addition-2026-11-12.md) records passing focused API/frontend/browser checks for the connected polygon/layer takeoff. Those checks do not verify the proposed road placement interaction.

## Tracking decisions

- Keep L31 as one user-requested roadmap addendum beyond the original PDF; the project roadmap stays at 85 entries.
- Preserve L31 implementation **Partial**, verification **Passed for the existing bounded takeoff**, deployment **Unknown** and acceptance **Not assessed**.
- Add proposed road drawing acceptance IDs `TRK-L31-011` through `TRK-L31-013`, all **Not run** and **Not assessed**. Cursor preview, width, curve, commit and invalid-geometry behavior are derived interaction details requiring review before implementation.
- Keep road drawing separate from engineered alignment, pavement design, field accuracy or road approval.

## Checks at this documentation checkpoint

- `python scripts/tracking.py` and `python scripts/tracking.py --check` passed: 129 feature/reference records, 85 roadmap features, 1,034 acceptance records and 160 preserved SRS names; source hashes, links and status values validated.
- `python scripts/ui-catalogue.py` and `--check` passed: 85 UI coverage rows; F/D/E aliases and K refinements remain outside the roadmap total.
- `python scripts/design-studio-catalogue.py` and `--check` passed: 31 Design Studio features.
- `python scripts/feature-checklist.py` and `--check` passed: 85 roadmap checklist rows.
- Focused `git diff --check` passed for the tracked documentation files edited in this checkpoint. It reported only Windows line-ending conversion notices.

No application tests were rerun because application code was not edited. The earlier L31 software checks remain in the linked implementation evidence; they do not verify the proposed road tool.

## Remaining decisions

Confirm the first release's supported road width/curve/junction interactions, overlap and takeoff policy, keyboard/touch alternatives, road class/local standard and qualified review. The proposed tool is not yet in the working UI.
