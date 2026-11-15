# Signed-in workspace start page — 12 November 2026

Scope: S01 shared workspace shells and capability-driven navigation; TRK-S01-011. The user asked for a clear start page because sign-in currently opens Design Studio or Organisation Review directly. Existing working-tree changes were preserved.

## Changes

- `apps/web/src/components/StartPage.tsx`: adds a welcoming page with plain-language descriptions of Design Studio and Organisation Review, task examples, and buttons limited to workspaces granted by the active organisation. Users without a workspace see guidance to create/join an organisation or ask an administrator for access.
- `apps/web/src/services/routes.ts`: maps `/` and `/home` to the home screen and preserves workspace/project route parsing. Home navigation stays at `/home`; explicit `/studio` and `/review` entry routes continue to open their project workspaces.
- `apps/web/src/App.tsx`: renders the new page for the site-root entry, changes signed-out return to `/home`, and adds a contextual route breadcrumb while preserving existing sign-in, onboarding, organisation, project and unsaved-draft workflows.
- `apps/web/src/product/WorkspaceNavigation.tsx`: brand and a new Home item return to the start page.
- `apps/web/src/studio.css`: adds responsive workspace cards, keyboard-visible focus inherited from global styles, and reduced-motion handling.

## Verification and remaining work

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; Vite reported the existing large-chunk warning.
- `python scripts/tracking.py`: passed (128 feature records, 84 roadmap features, 1012 acceptance records and 160 original requirement names).
- `python scripts/tracking.py --check`: passed.
- `python scripts/ui-catalogue.py`: passed (84 roadmap features).
- `python scripts/ui-catalogue.py --check`: passed.

No browser or automated test suite was run for this change. TRK-S01-011 remains Not run / Pending. Responsive rendering, workspace-permission visibility, post-sign-in navigation, direct workspace/project routes and customer usability remain to be checked. The home page does not grant access; API and organisation membership checks remain authoritative.
