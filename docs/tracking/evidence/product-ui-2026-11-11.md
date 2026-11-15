# Proposed-product UI checkpoint - 11 November 2026

## Outcome and scope

The requested UI foundation covers all 84 S/L/O/A roadmap IDs in both workspaces and shared/AI areas. Ten reusable workbench families provide fields, contextual navigation, panels, registers, comparisons, illustrative rubric setup, document structures and readiness states. This is interface coverage, not completion of all roadmap domain behaviour. Functional implementation, verification, deployment and acceptance statuses are unchanged.

Source: all 23 pages of the locally generated PDF catalogue were read. The supplied `/workspace/scratch/...` path is not accessible on this Windows host. Source hash and the complete 84-row placement/state map are in [UI_COVERAGE.md](../../UI_COVERAGE.md); research references and component decisions are in [UI_DESIGN.md](../../UI_DESIGN.md).

Work continued on existing branch `build/l07-object-palette`. The repository already contained extensive modified/untracked implementation and documentation. No reset, branch replacement, remote write, push, deployment, new production dependency, paid resource or external message was used. No application API/domain/schema/migration implementation was added by this checkpoint.

## Implementation inspected and preserved

- Existing `App.tsx`, route parser, Supabase/session/membership boundaries, unsaved-state guards and project loading.
- Existing project hub, brief, map selection, settings/members, evidence/constraints, history/recovery and retained-output paths.
- `GeometryWorkspace`, `StudioShell`, geographic rendering, terrain/preset tools and existing `CalculationsPanel` connections to catalogue, estimates, review, proposals and retained files.
- Current npm scripts, TypeScript/Vite settings and browser fixture configurations; Python/FastAPI project checks.

The shared shell adds workspace-specific task navigation, a mobile native-dialog drawer, direct workflow/feature routes and active organisation/workspace context. Existing account workspace grants continue to restrict available workspaces; no capability is granted by the manifest. Browser Demo can inspect either UI shell. Existing-project links can open the relevant Studio tool panel. Review entry uses a labelled Organisation Review shell without forcing the immersive editor open.

All new preview forms are ephemeral. Their action is Apply to preview; they do not call a persistence API or claim Saved. Sample data is opt-in and labelled. File controls list names without reading/uploading files. Comparisons expose no invented totals, grades or rankings. AI controls send no request and show Not connected. Preview discard does not delete a genuine project recovery draft. Native dialogs and the existing unsaved-navigation guard remain in use.

## Actual checks

| Command / check | Outcome |
|---|---|
| `npm run test` | 64 passed across 22 files; includes three new roadmap reachability/route invariants. |
| `npm run lint` | Passed. |
| `npm run build` | Passed after correcting a nullable session-derived boolean at the new navigation boundary. Build includes `tsc --noEmit`. Existing large-chunk warning remains for map/editor/PDF bundles. |
| `./scripts/api.ps1 lint` | Ruff check passed; 86 files already formatted. No backend code was changed by this task. |
| `./scripts/api.ps1 test` | 287 passed in 27.92 s, including the repository's configured local database/integration fixtures. One existing Starlette TestClient deprecation warning. |
| `npx playwright test --config playwright.product-ui.config.mjs` | Final qualification: 5 passed, 4 intentionally skipped duplicate traversal/project-entry smoke cases on tablet/phone; 43.6 s. |
| `npx playwright test --config playwright.reference.config.mjs studio-shell.spec.mjs` | Existing local PostGIS + fixture-identity Studio regression: 1 passed, 20.4 s. Verifies selected-site context, known/unknown provider heights, tools, preserved drafts and mobile map layout. This is not live Supabase evidence. |
| Final phone visual follow-up | 1 passed in 8.5 s after selected-tab centring/project-picker layout refinement. Final frontend lint/build also passed after this refinement. |

The UI browser tests traverse all 84 IDs, verify exact feature headings/fields and readiness, observe no domain API writes during preview use, check deep-link reload through explicit Browser Demo entry, exercise sample rows/search/pagination, preview form application, unsaved cancel/discard, rubric weight validation, native-dialog Escape/focus return, workspace switching and not-connected AI feedback. Desktop 1440x1000, tablet 820x1100 and phone 390x844 are tested; the checks assert no document horizontal overflow and reduced-motion removal of new animations.

New product UI test output is isolated in `artifacts/product-ui/test-results` to avoid collision with existing suites. Logs: `artifacts/product-ui/browser-qualified.log`, `existing-studio-regression.log`, `frontend-lint.log`, `frontend-build.log` and `phone-visual-final.log`. These local logs/screenshots are ignored artifacts, not canonical status records.

## Failures found and corrected

- Workspace selection could be overwritten by the previous URL while React Router committed a transition. Workspace selection now commits the destination URL before the route activates that workspace.
- Repeated textarea edits affected the enclosing label's matched text. Stable explicit accessible labels were added.
- Format-guide focus initially returned to the search field; the unnecessary pre-dialog focus move was removed so native focus return targets the invoking button.
- Inherited checkbox sizing and small working text were corrected after rendered inspection. A hidden skip link now uses clipping while unfocused. Mobile project selection occupies a full row and the active feature tab is centred in the scroll strip.
- The initial saved-Demo smoke expected fields before initializing a design boundary; the corrected test follows the existing Start from selected locator flow. Existing project behaviour was preserved.
- A parallel browser attempt collided in the default Playwright trace output directory (ENOENT at context close). The product suite now uses a separate output directory; the final full UI qualification passed.
- Type checking caught `boolean | null` passed to a boolean navigation prop. `loggedIn` now explicitly normalizes the existing session condition with `Boolean`, preserving its truth conditions.

## Rendered inspection and contrast

Inspected actual browser screenshots for Studio quantities/pricing, Design workspace L04 (source-labelled schematic without a selected real project), Organisation Review comparison O08, scorecard O09 at desktop/phone, document structure L24 and assistance A01. Existing Studio map screenshots were also produced by the preserved regression. Nothing in the schematic/preview screenshots is evidence of field measurements, saved proposals, AI generation or calculation acceptance.

Artifacts are under `artifacts/product-ui/`: `desktop-L04.png`, `desktop-L24.png`, `desktop-O08.png`, `desktop-A01.png`, and desktop/tablet/phone studio/review screenshots. New focus, mobile-menu keyboard/Escape, dialog return, absent overflow and reduced-motion behaviour have automated assertions. The smartphone screenshots represent a desktop browser viewport, not a physical phone.

Static contrast spot-checks using sRGB relative luminance: maroon action on white 10.38:1; main text on white 14.27:1; muted copy on white 5.96:1; sidebar metadata on deep maroon 7.91:1; row readiness text on its pale background 4.81:1. Table-header and comparison metadata were darkened after a 4.45:1 header pair was identified. These are selected token checks, not a complete accessibility audit of every legacy screen.

## Tracking and remaining gates

`docs/tracking/ui-coverage.csv` is canonical for UI placement/readiness only. `scripts/ui-catalogue.py` generates the application manifest and Markdown coverage view. Existing CSV feature records retain their domain status values and gain UI code/evidence cross-references. New UI-only criteria: TRK-S01-009, TRK-S01-010 and TRK-S08-006. Reconciliation REC-016 distinguishes UI completion from domain completion. The tracker is regenerated with `python scripts/tracking.py`; no Excel workbook is exported.

Previous S01 UI evidence remains relevant: [Studio home](studio-home-2026-11-09.md), [Studio polish](studio-ui-polish-2026-11-09.md), [maroon/silver](maroon-silver-ui-2026-11-09.md) and the existing organisation-access/domain evidence. This UI checkpoint does not replace or close their permission, field or acceptance limitations.

Remaining: connect each preview feature through its existing detailed specification and acceptance criteria; further audit Not audited domain behaviour before declaring it missing; user review of the interface; physical low-end/touch-device and assistive-technology testing; broad capacity and sustained performance qualification; live Supabase Auth/Storage regressions; field shade/terrain/measurement validation; commercial and pilot/customer acceptance. AI/model, sealed-tender, enterprise, building-surface and other staged expansions remain gated. New controls must not be promoted to connected status until actual services, permissions, revision handling and tests are implemented and recorded.

Final tracker checks: `python scripts/ui-catalogue.py` and `--check` passed for all 84 UI rows; `python scripts/tracking.py` and `--check` passed for 128 feature/reference records, 1010 acceptance records and 160 original requirement names. No Excel export.
