# Design Studio projects dashboard — 12 November 2026

Scope: L01 Studio projects page; TRK-L01-013. Visual reference: the user-provided “InfraShader design studio dashboard.png”. The reference is layout guidance; sample project names, locations, imagery and counts are not treated as product data.

## Changes

- `apps/web/src/App.tsx` and `apps/web/src/components/ProjectDashboardCard.tsx`: add the dashboard summary strip, visible workflow-status and project-type filters, grid/list controls, active/archive controls, refresh and clear actions, metadata-led project cards and a create-project callout. Existing project opening, access boundaries and Review workspace page remain connected to their existing flows.
- `apps/web/src/components/ProjectDashboardCard.tsx`: project cards use the saved outline or site extent in a labelled schematic; stakeholder, purpose, workflow stage, available budget, revision and update date come from the permitted project record. Summary totals reflect the active query; stage breakdowns explicitly refer to the loaded page. The reference screenshot's sample imagery and values are not shown as live project facts.
- `apps/web/src/services/api.ts`, `apps/api/app/main.py`, `apps/api/app/projects.py`: add a bounded project-purpose query filter (`developer_decision` or `contractor_proposal`) to the existing permitted-project endpoint. Existing callers retain default behavior when the filter is omitted.
- `apps/web/src/studio.css`: apply the maroon/silver dashboard styling, responsive card grid, visible focus support and reduced-motion behavior.
- `docs/UI_DESIGN.md`, the L01 tracking record, the canonical UI coverage row and this evidence entry record the design and scope.

## Actual checks

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; Vite reported the existing large-chunk warning.
- `.\scripts\api.ps1 lint`: passed; 86 files already formatted.

## Verification and remaining work

No browser tests, automated test suites or visual screenshot review were run. TRK-L01-013 remains Not run / Pending. Desktop/tablet/phone layout, both purpose values against the database endpoint, result pagination, archive/list controls, project opening and existing access regressions remain to be exercised. No feature implementation or user acceptance status is inferred from lint, typecheck or build results.
