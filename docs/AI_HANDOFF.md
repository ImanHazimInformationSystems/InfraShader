# InfraShader AI handoff

**Snapshot date:** 16 November 2026 (Asia/Kuala_Lumpur)  
**Repository observed:** `C:\Users\User\Coding_Projects\InfraShader`  
**Branch / HEAD observed:** `build/l07-object-palette`. The accumulated application work and project documents were pushed to GitHub main and build/l07-object-palette at c444581 on 16 November. Inspect live git state for later changes.
**Worktree observed:** after those commits, only deliberately uncommitted scratch and export folders remain (`tmp/`, `output/`, `outputs/`).

This page is a concise entry point for a new AI or developer. It is not a new requirements document or status database. Always inspect the live repository and use the canonical sources below; do not treat this snapshot as newer evidence than the code, registers, or dated verification records.

## Start here

Read in this order, then narrow to the requested feature:

1. [`AGENTS.md`](../AGENTS.md) — operating rules and project boundaries.
2. [`FEATURE_STATUS.md`](FEATURE_STATUS.md) — generated current feature summary and next work by release stage.
3. [`FEATURE_SPEC.md`](FEATURE_SPEC.md) and the relevant [`features/<ID>.md`](features/) file — specification and acceptance intent.
4. Relevant canonical CSV rows in [`tracking/`](tracking/README.md) — authoritative feature, requirement, gate, reconciliation and UI data.
5. [`build-plan.md`](build-plan.md), [`decisions.md`](decisions.md), [`validation.md`](validation.md), and [`requirements.md`](requirements.md) for the current plan, decisions, evidence, and SRS mapping. Older entries are historical unless a later record explicitly updates them.
6. For interface changes, [`UI_COVERAGE.md`](UI_COVERAGE.md), [`UI_DESIGN.md`](UI_DESIGN.md), and `docs/tracking/ui-coverage.csv`.
7. Inspect the actual frontend/backend implementation and relevant tests before editing or changing any status.

CSV tracking registers are canonical. Generated Markdown, the app's catalogue manifest, and optional Excel files are views or dated exports. Update the canonical CSVs and regenerate their views; do not create a competing checklist.

## Product and architecture at this checkpoint

InfraShader is a local-first React/TypeScript/Vite frontend in `apps/web` and Python 3.12/FastAPI backend in `apps/api`. PostgreSQL/PostGIS owns persisted project geometry and spatial validation. SQLAlchemy/Alembic manage storage; Shapely/PyProj support geometry and projected-frame calculations; pvlib supports sun position; money uses backend `Decimal`. Supabase provides local Auth and private Storage. Backend authorization, quantities, pricing, revisions and issued snapshots remain authoritative. Browser Demo is isolated browser draft storage, not proof of real persistence or authorization.

Current web stack includes React 19, Mapbox GL JS 3.34.2, Terra Draw with the Mapbox adapter 1.5.0, and Three.js 0.186.1 for supported custom 3D layers. The 12 November user-authorized migration replaced MapLibre/OpenFreeMap. See [`mapbox-migration.md`](mapbox-migration.md) and its [dated evidence](tracking/evidence/mapbox-migration-2026-11-12.md). Older October documents that name MapLibre describe historical checkpoints; they do not describe the current renderer.

Mapbox Standard supplies provider context, building/tree scenery and solar/weather visual context. Satellite imagery is composed beneath Standard 3D context. Project geometry and decisions remain in InfraShader's own APIs. A real satellite tile request returned HTTP 429 during the recorded check; synthetic tiles passed a clearly labelled software integration test, not live-provider qualification. Provider coverage, live satellite imagery and DEM resolution/vertical datum remain gates. The app must retain attribution and must not silently substitute another provider. Never expose the Mapbox token or other credentials in source, evidence, chat, screenshots, or handoff material.

## Product scope and current status source

The approved 11 November catalogue baseline has 84 roadmap features; the user-approved L31 roadwork addendum brings the repository roadmap to 85. F/D/E aliases and K01–K06 refinements cross-reference those roadmap items and are not additional features. The latest generated summary records 12 Implemented, 13 Partial, and 60 Not audited; this is not a completion percentage or release acceptance claim. “Not audited” does not mean missing. Check `FEATURE_STATUS.md` and canonical CSVs for current per-feature details instead of copying status from an older conversation.

Design Studio supports a bounded professional planning workflow: project/site context, evidence, Baseline and proposal options, spatial layout/editing, supported object/plant/material inputs, bounded shade studies, quantities, sourced rates, preliminary pricing, and proposal outputs. Drawing an item does not automatically create an accurate quantity or cost. Measurement method, coordinate frame, compatible dated rate, provenance and assumptions must be valid. Partial/unpriced scope remains visible. Existing-site objects are distinct from proposed work; hidden map layers still count. Trees are excluded from current analytical tree shade. Review/owner procurement remains a separate workspace and workflow from contractor proposals.

The current generated feature summary says L31 now has a bounded drag/click road drawing, width and curve/area editing subset; separate-road overlaps are rejected. Do not rely on earlier conversation summaries that said the drawing interaction was only proposed. Inspect current L31 implementation and evidence before extending or making a completion claim. Local road class/standards, independent metric quantity verification, construction engineering, qualified review, and pilot acceptance remain open.

For Design Studio, the current Layout is where existing/proposed spatial items are drawn and edited. Its UI controls are not all separate roadmap features. Consult the L04/L31 specifications and UI coverage for exact connected behavior. The town-building direction is a product interaction goal; it does not imply full civil-engineering, earthworks, hydrology, or survey-grade capability.

## Recent evidence and open gates

- **23 November 2026 — customer-ready refinement in progress** on branch `refine/customer-ready` (local
  commits only). Read [`REFINEMENT_CONTINUATION.md`](REFINEMENT_CONTINUATION.md) first, then
  [`REFINEMENT_PLAN.md`](REFINEMENT_PLAN.md). First slice:
  [WP1 reliability evidence](tracking/evidence/refine-wp1-reliability-2026-11-23.md). It fixes readable
  cross-origin errors, pending-migration readiness, save states, the L04 polygon and object-move defects,
  and Pricing quantity/rate states.

- [`tracking/evidence/mvp-closeout-2026-11-16.md`](tracking/evidence/mvp-closeout-2026-11-16.md): MVP software close-out.
  - Covers terrain site-work and proposal area in Review, Mapbox 429/403 messages, the Vitest drive-letter fix (`npm test` → `apps/web/scripts/vitest.mjs`), the reference config `cwd` and spec updates, and the API CORS `DELETE` fix.
  - Adds the deployment package (`deploy/`), `scripts/backup.py`, the real-account submission spec and the S12 audit.

- [`tracking/evidence/opportunity-submissions-2026-11-15.md`](tracking/evidence/opportunity-submissions-2026-11-15.md): contractor-to-owner submissions (S03/L25/O05).
  - Backend: `app/opportunities.py`, migration 0021.
  - Frontend: `OpportunityInvitations` (owner), `OpportunityAccept` (`#opportunity=` link), `StudioOpportunities` (Studio projects page), `SubmitToOwner` (Proposal step).
  - Native offers land in the existing owner inbox as `native_infrashader`.
  - `tests/browser_server.py` now has a second test identity, `contractor@example.invalid`, in its own organisation.

- **15 November issue readiness:** [evidence](tracking/evidence/issue-readiness-2026-11-15.md). The read-only issue-readiness POST, draft preview and real issue share server rules. Design Studio Review lists every blocker with a reason and direct fix; Site exposes a confirmed proposal area; brief repairs preserve proposal text and stale totals remain blocked. No migration or issue-policy relaxation. Consult the evidence for current checks, rather than the older client-only summary below.


- [`tracking/evidence/design-studio-journey-2026-11-15.md`](tracking/evidence/design-studio-journey-2026-11-15.md): Design Studio is now one journey, **1 Site → 2 Design → 3 Prices → 4 Proposal** (`StudioShell.tsx`).
  - The dock shows the current step's tools; Terrain, Shade study and List view are under More tools.
  - One option picker on the map; Pricing is the single pricing place; Saved rates holds the organisation price list.
  - Step 4 Review lists what needs attention with direct fixes and an honest Option A/B comparison, then Total and Proposal.
  - The project page leads with Open design map; records sit in one disclosure. Design Studio catalogue previews are in a collapsed sidebar group.
  - Frontend only: no schema, API or permission change. Organisation Review keeps its flat tools. Test helpers: `openStudioTool`, `openListView`, `openProjectRecords` in `tests/studio-helpers.mjs`.

- [`tracking/evidence/pricing-home-2026-11-15.md`](tracking/evidence/pricing-home-2026-11-15.md): Design Studio pricing now has one **Pricing** dock tool (`PricingBoard.tsx`, `domain/pricing.ts`).
  - It prices unsaved drafts through `POST /projects/{id}/pricing-preview`, which validates like a save, uses saved rate versions, never persists, and keeps costs behind internal pricing.
  - Rate versions carry `source_type`, `supplier_name`, `quote_reference` and `exclusions` (migration 0020). These are user-entered records, never supplier-verified.
  - Bulk apply and tree stock confirmation are reviewed in the browser and saved through the existing draft and revision workflow. Trees and Studies keep their detailed controls.

- **MVP completion run (13 Nov, final):** continuation state and next actions in [`MVP_COMPLETION_PLAN.md`](MVP_COMPLETION_PLAN.md); final regression in [evidence](tracking/evidence/mvp-final-regression-2026-11-13.md). Added: D1B owner review (0015), change register (0016), decision memorandum (0017), output template v3, real local Auth/Storage + joint restore drills, CSV safety, axe scan, performance measurements, K02 superseded-rate review, O06 suggestions, O08 side-by-side. Dev DB at Alembic 0017. Open: L04 mouse polygon drawing defect; external gates REC-010, AC-04, AC-06, AC-07, AC-10 ([procedures](PILOT_ACCEPTANCE_PROCEDURES.md)). Playwright configs accept alternate ports (see plan).

- [`tracking/evidence/scene-surface-textures-2026-11-13.md`](tracking/evidence/scene-surface-textures-2026-11-13.md): saved road patterns and six grass-paint looks now transfer to both geographic and local metric 3D, including terrain-draped road surfaces. Original pixels/strokes are reused; no quantity/rate change. Reference and real Mapbox render paths checked. This supersedes older statements that the local metric canvas cannot render saved ground paint; issued report schematics remain unchanged.

- [`tracking/evidence/terrain-water-analysis-2026-11-13.md`](tracking/evidence/terrain-water-analysis-2026-11-13.md): later explicit user authorization adds supplied existing-ground grids, backend-clipped TIN cut/fill/pond storage, automatic sourced m³ work records and immutable revisioned surface-water screening studies with timeline/flow arrows. Live Mapbox Standard tiles were exercised and rendered scenes inspected. Ground/storm/rates remain synthetic; provider tree-model warnings persist. This supersedes earlier blanket no-volume/no-routing exclusions for the bounded slice only; full hydraulic networks, calibrated flood/velocity, soil/engineering and field/customer acceptance remain open.

- [`tracking/evidence/terrain-builder-2026-11-13.md`](tracking/evidence/terrain-builder-2026-11-13.md): L06 timed circle/square brushes, site-clipped concept ground and round/square water, retained precision controls, and explicit manual site-work resources/tools/quantities with sourced preliminary costs. Terrain-change signatures keep stale work outside complete estimates. The provider elevation is not rewritten; no cut/fill, hydrology, pond volumes, construction productivity or field accuracy is inferred. Actual focused checks and live-provider/device/customer limits are recorded in the evidence.

- [`tracking/evidence/object-builder-lighting-2026-11-13.md`](tracking/evidence/object-builder-lighting-2026-11-13.md): landscape Objects controls, 16 original MIT presets, projected grouped fence drawing, tilted footprints and bounded visual day/night effects. Shadows/light pools do not establish analytical shade, lux, electrical design or solar output. Current checks and limits live in this evidence and the canonical rows.
- [`tracking/evidence/planted-trees-2026-11-13.md`](tracking/evidence/planted-trees-2026-11-13.md), [`tracking/evidence/tree-shadow-preview-2026-11-13.md`](tracking/evidence/tree-shadow-preview-2026-11-13.md), and [`tracking/evidence/shrub-flower-models-2026-11-13.md`](tracking/evidence/shrub-flower-models-2026-11-13.md): separate proposed Trees workspace, four tree forms, six shrub/flower models and illustrative flat-ground sun shadows. Model dimensions do not become measured inventory or analytical tree shade.
- [`tracking/evidence/mapbox-migration-2026-11-12.md`](tracking/evidence/mapbox-migration-2026-11-12.md): Mapbox migration checks, browser render review, provider failures and limits.
- [`tracking/evidence/l04-connected-2026-11-12.md`](tracking/evidence/l04-connected-2026-11-12.md): connected L04 project editor subset and actual checks.
- [`tracking/evidence/roadwork-feature-addition-2026-11-12.md`](tracking/evidence/roadwork-feature-addition-2026-11-12.md), plus current L31 feature/evidence records: bounded roadwork implementation and remaining checks.
- [`validation.md`](validation.md): newest checkpoint first, with historical records below it.

Recorded Mapbox checkpoint results include frontend lint/typecheck/build, 76 frontend tests, backend Ruff and 296 backend tests, five local PostGIS browser regressions, and one live Standard browser case using explicitly synthetic satellite tiles. Real raster satellite requests were blocked (HTTP 429). These are historical results from the dated evidence, not checks run when this handoff file was written.

Do not claim D0/D1A/D1B or field/pilot acceptance from code, fixture tests or UI presence. Real provider qualification, real local Supabase/Auth/Storage checks where not evidenced, field shade tolerance, commercial and road standards approval, broader accessibility/device/performance, database-plus-private-file restore and user acceptance remain distinct gates. Check current `release-gates.csv` and dated evidence for the precise state.

## Local commands

Run from repository root in PowerShell. See [`setup.md`](setup.md) for Supabase/Auth and safe local database setup.

```powershell
npm ci
.\scripts\api.ps1 sync
.\scripts\local-db.ps1 start
.\scripts\api.ps1 migrate
```

Then use separate terminals:

```powershell
.\scripts\api.ps1 dev
npm run dev
```

Frontend checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Backend checks: `.\scripts\api.ps1 lint` and `.\scripts\api.ps1 test -q`. Browser and integration suites are listed in `package.json`, Playwright configuration files, and `setup.md`; use the relevant one, understand which fixtures/services it exercises, and report skips or provider failures accurately. Do not rerun the entire suite unless the scoped task or project instructions require it.

After canonical tracking changes, run `python scripts/tracking.py` and `python scripts/tracking.py --check`. For UI coverage also run `python scripts/ui-catalogue.py` and `python scripts/ui-catalogue.py --check`. The project-specific Design Studio catalogue and feature checklist have their own generators; see [`tracking/README.md`](tracking/README.md). Do not generate Excel unless the user requests it.

## Preserve the current worktree

The observed worktree already contains extensive modified and untracked application, test, documentation, and generated files. Before editing, run `git status --short --branch` and inspect relevant diffs. Do not reset, clean, revert, overwrite, or assume these changes are disposable. Do not infer that the remote branch contains the observed local work. Keep a requested feature's changes scoped while preserving unrelated existing work.

No push, pull-request publication, deployment, paid service/resource, external message, production credential use, or production data change is authorized by this handoff. Keep F13/F16–F20 behind their recorded release gates.

## Updating this handoff

Refresh this page only when a new checkpoint materially changes repository identity/worktree, core architecture/provider, current run or verification instructions, project-wide scope interpretation, or the recommended reading order. Keep feature-by-feature status and evidence in their canonical files. Put actual commands and results in dated evidence and `validation.md`; never edit this snapshot to make an unperformed check look current.

For sharing with another AI, provide this handoff plus only the requested feature spec, relevant canonical CSV rows, current evidence, and inspected source files. Exclude `.env*` values, tokens, keys, private uploads, `.local/` database files/configuration, user data, and unrelated uncommitted diffs.

## Free pilot deployment in progress (16 November 2026)

The user authorised the free Render + Supabase deployment. Web https://infrashader-web.onrender.com (0dc490a) and API https://infrashader-api.onrender.com (85b5244, final settings) are live. Hosted PostGIS is at migration 0021 in a private application schema with a non-superuser role; private Storage, readiness, CORS, anonymous denial and desktop/phone sign-in rendering were checked. A temporary synthetic Auth identity passed hosted login/refresh/API/browser reload; it was removed. See [hosted evidence](tracking/evidence/free-pilot-hosted-2026-11-16.md) and [pilot setup](../deploy/FREE_PILOT.md). Real-person account/email verification and full hosted workflows, provider limits and hosted backup/restore remain pending. User account creation/Auth URL settings are handed off. No local users/projects were migrated. Never put ignored hosting configuration or credentials in a handoff.
