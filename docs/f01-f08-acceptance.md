# F01-F08 implementation and acceptance

13 October 2026, local branch `build/core-spatial-completion`. SRS v0.3 is normative; the feature guide explains the UI. This audit closes identifiable software gaps without claiming field, provider or retention-policy approval. Migrations 0001-0010 are applied locally.

| Feature | Implemented software and verification | External gate |
|---|---|---|
| F01 / FR-01-05 | Both project purposes; progressive required-field validation; structured stakeholder brief and budget bounds; known/unknown facts, visit notes/sources; timezone; output-readiness checklist; revisioned history and restore. Brief/settings and both output browser workflows pass. | Representative pilot acceptance remains part of G8. |
| F02 / FR-05-07 | Private validated/re-encoded photo intake, descriptions, observations, saved-target links, author/time, preview/download and revision conflicts. Reversible removal hides active records and denies content/new-output inclusion; restore keeps the same digest. Real local Auth/Storage browser path passed. | Permanent erasure, backup retention and approved retention procedure remain open. Reversible removal is a holding policy, not an erasure claim. |
| F03 / FR-08, UI-03/04 | Search/site extent, coordinate fallback, pan/zoom, attribution, provider-context 3D with labels, entered project 3D, selection/drawing and independent layer controls. Hidden layers do not alter quantities. | Production provider terms/coverage/capacity approval. |
| F04 / FR-09-12 | Validated polygons/lines/counts, local projected CRS, override source/basis, nonnegative integer counts, explicit fixed-price manual scope (quantity one), categories, numeric/map edit, remove, history and bounded undo/redo. Invalid geometry is rejected with an actionable reason. | Survey/independent takeoff approval is separate from analytical fixture correctness. |
| F05 / FR-13/14 | Building footprints, known/missing height states, height source/provenance, editing and stored-height 3D. Unknown heights reject the affected three-scenario comparison. | External footprint import is optional; no imported height accuracy claim. |
| F06 / FR-15-22 | Explicit saved target/time/timezone, NREL solar reference, solid-building sweep, union/clip, shaded area/coverage, night/low-sun reasons, source records and actual engine versions. Nonfinite solar results fail. Shared baseline model v2 invalidates older model runs. | G3 accessible-site measurements and agreed tolerances; broader worst-case load acceptance. |
| F07 / FR-23-25 | Flat opaque canopy footprints/heights, projected dimensions/rotation, edit/remove, scenario isolation and translated roof-only shadows. Complex/sloped/transparent parameters cannot silently enter the strict schema. | G3 physical shade acceptance. Structural certification is outside this model. |
| F08 / FR-26-29 | Baseline automatically participates in A/B. Baseline changes/removal propagate; proposed items stay independent. Matched map diagrams show compatible saved overlays, shaded area and percentage-point deltas; quantity lists and available budget states work without shade. Selected option/reviewer/history persists. Changed target/time/revision excludes incompatible comparison results. | Numerical field accuracy follows F06/F07; user pilots remain external. |

## Design decisions

- Existing Baseline objects keep the same IDs across scenario views. The backend applies authoritative Baseline values during save and analysis. Existing option-only records are preserved; no user records are bulk deleted. GET derives shared Baseline for older workspaces. Inherited objects are edited in Baseline; proposed item IDs cannot collide with shared IDs.
- All workspace/brief edits conservatively stale dependent artifacts. More granular caching is an optimisation, not a reason to mark the core stale-result safeguard incomplete.
- `opaque_ground_projection_v2_shared_baseline` distinguishes corrected inheritance from older calculations. Old immutable records stay stored but are unavailable as current analysis.
- Layer controls are view-only. Per-item visibility remains persisted separately; neither can remove authoritative scope or shade contributors.
- Evidence removal increments its revision, records an administration event, retains bytes privately and blocks content access/new issue selection until restored. Historical issued evidence references remain frozen. Permanent erasure awaits an approved retention procedure; no existing user photograph was removed by this implementation.
- Optional external building import and conditional Three.js roof detail do not block the stated core. F13/F16-F20 remain gated.

## Evidence and practical limits

Backend tests cover both project purposes, tenant denial, save/reload/conflicts, shared Baseline propagation/removal, nonnegative counts, canonical quantities/overrides, unsupported inputs, solar reference, roof-versus-solid physics, overlap union, clipping, night state, provenance and snapshot immutability.

The local capacity fixture validates and analyses 448 simple overlapping object instances across three scenarios; the complete test took 0.76 seconds in the recorded run. This does not establish worst-case 128-vertex or multi-user throughput, and synthetic objects are not field evidence.

Actual commands and results are recorded in [validation.md](validation.md). UI inspection includes the saved comparison with three matched diagrams, purple model overlays, quantity lists and delta cards. Generated developer/client PDFs preserve narrative and scope diagrams without internal-price labels. Remaining F09-F14/D-series work is tracked separately in [completion-plan.md](completion-plan.md).
