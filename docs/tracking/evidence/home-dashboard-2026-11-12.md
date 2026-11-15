# Signed-in home dashboard — 12 November 2026

Scope: S01 shared workspace shells and capability-driven navigation; TRK-S01-012. Visual reference: user-provided signed-in homepage screenshot. The screenshot's name, project rows and notification indicator are illustrative and are not treated as account data or implemented features.

## Changes

- `apps/web/src/components/StartPage.tsx`: replaces the two-choice-only landing with a time- and profile-aware greeting/date, decorative Design Studio and Organisation Review cards, a recent-project section, and a short quick-start guide. Workspace cards follow the active organisation's server-provided workspace grants. Recent projects come from the existing permitted project list and open through the existing project path.
- `apps/web/src/product/WorkspaceNavigation.tsx`: provides a simpler home rail with Home, only granted workspaces, Projects, Settings and members, and existing Help & feedback; workspace task navigation stays available after entering a workspace.
- `apps/web/src/App.tsx`: connects the home cards, accessible recent project rows and help actions to existing routes. Returning home clears list filters so the recent section shows current unarchived results. Adds an account-settings shortcut while retaining organisation selection, service health/retry, and sign-out controls.
- `apps/web/src/studio.css`: adds the responsive dashboard layout and decorative workspace illustrations. No notification data or fake recent project rows were added.

## Actual checks

- Initial `npm run typecheck` found unreachable `screen === 'home'` checks inside branches that already excluded Home; the branch logic was corrected.
- Final `npm run lint`: passed.
- Final `npm run typecheck`: passed.
- Final `npm run build`: passed; Vite reported the existing large-chunk warning.

## Verification and remaining work

No browser tests, automated test suites or visual screenshot review were run. TRK-S01-012 remains Not run / Pending. Single/dual/no-workspace account behavior, recent-project permission boundaries, account settings, organisation switching, sign-out and desktop/mobile usability remain to be exercised. Existing permission checks remain authoritative; the home UI does not grant access.
