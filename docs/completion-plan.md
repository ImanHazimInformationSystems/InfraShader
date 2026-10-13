# InfraShader remaining-build plan

13 October 2026. Branch `build/core-spatial-completion`. This is the authoritative continuation plan; [requirements.md](requirements.md) is the feature acceptance matrix. Earlier build-plan/validation records remain historical evidence.

## Authority and references

The user authorises local implementation, tests and commits, not remote writes, deployment or paid resources. All five desktop reference files are accessible; SRS/guide/stack/concept hashes match the earlier full reference review. The new remaining-build prompt was read in full. Document requirements do not independently grant external permissions. SRS governs acceptance; HTML remains visual reference only. Basic sourced MapLibre 3D is core F03/F05, distinct from gated Three.js/BIM/terrain.

## Sequence

1. Baseline: preserve recent startup/auth/bootstrap fixes; reproduce API, web and browser checks.
2. Spatial slice: basemap/search/extent selection; sourced building extrusion, unknown-height state, 2D fallback; saved-item graphical editing; backend shadow overlays. F03-F07, F15, IF-05/06, UI-03.
3. Comparison/commercial: persistent decisions, comparison, catalogue pagination/archive and itemised map-linked estimates. F08-F11/F14.
4. Brief/evidence/outputs: structured briefs/stakeholders, evidence gallery/links, preview and retained PDF lifecycle. F01/F02/F12/F14.
5. App: membership/settings, navigation, draft/history safeguards, privacy requests, rate limits and tested local DB+file restore. D01-D10.
6. Core acceptance: real Auth/Storage browser paths, permissions/conflicts, accessibility/performance and PDF inspection. Field measurements and pilot evidence remain external.
7. Separately gated expansions: F13 Stage A then sample-dependent IFC; F16 templates; F17 plans; F18-F20 terrain/assets only with prerequisites and explicit stage evidence. No unsupported numerical claims.

## Baseline evidence

- `scripts/local-db.ps1 start`, `scripts/api.ps1 migrate`: passed against existing local PostGIS; existing data retained.
- `scripts/api.ps1 lint`: passed; `scripts/api.ps1 test -q`: 143 passed, zero skipped.
- Baseline frontend lint/typecheck/build passed; 20 unit tests, 18 foundation browser tests, 2 database-to-PDF browser workflows passed. Large lazy bundle warnings remain.
- Spatial and review implementation: 145 backend tests, 20 frontend unit tests and 24 responsive browser tests passed. Both existing database-to-PDF workflows passed; new 3D/edit/shadow/review browser path passed on targeted rerun. Two external-provider browser checks passed. Lint/typecheck/build/format passed; see validation.md for limitations.
- Live local Supabase email login/refresh/logout and signup denial passed in the preceding repair checkpoint. Recovery, full browser Auth and private file transfers are not yet accepted.

## Current gates

No field observations, physical touch device, customer pilots, hosted CI or deployment evidence. Map provider selection must preserve attribution and degraded operation; no paid key or automatic geolocation. Existing duplicate user-created organisations remain untouched.

## Next exact work

Current migrations: 0010, applied to the local application database. The 13 October checkpoint below supersedes earlier missing-feature notes in this plan.

1. Retained PDF/file lifecycle, richer scope/evidence output visuals, privacy export/deletion/retention with approved policy, and a joint application/Auth/private-file restore drill.
2. Catalogue/review/output form-recovery browser acceptance is complete. Remaining: evidence/settings form recovery; forced-expiry/multi-tab recovery acceptance. URL/stage navigation is implemented and browser-tested.
3. Estimate revision-comparison browser acceptance is complete for both purposes. Remaining: pricing explanations/commercial approval. Basic object grouping/categories/crown metadata/map visibility and applied-edit undo/redo are implemented. Trees remain excluded from shade.
4. Representative accessibility/physical touch/capacity checks, support/monitoring/throttling and rollback evidence. Field observations, commercial/provider decisions and user pilots remain external gates.

Keep F13/F16-F20 gated. Run relevant regression checks after each slice and update requirements.md. Browser configurations own ports 8000/5173 and run sequentially. Signed fixture identity, Browser Demo, live local Supabase and public provider evidence remain distinct.

## Catalogue checkpoint

Implemented server-side literal code/description search, unit/basis filters, bounded pagination and authorised single-version retrieval. The browser can browse pages, prefill a rate for revision, and save a new immutable-reference version. Assigned IDs are fetched independently of search/pages; creating a version does not silently rebind saved scope. Internal amounts remain omitted for members without pricing capability. No migration or service changes required.

Backend: 146 tests passed, zero skipped; Ruff passed. Frontend: 20 unit tests, lint/typecheck/build/format passed. Real-PostGIS browser catalogue and output regressions are recorded in validation.md. Existing large-bundle warnings remain. F09 is still partial because category/archive/recovery work remains; no core or release gate is claimed complete.


## Core continuation checkpoint - 13 October 2026

Implemented structured briefs and stakeholder records; immutable brief/workspace histories with guarded restore; account/organisation settings and existing-member administration with audit and concurrent last-admin protection; provider-context Explore 3D; canopy dimensions/rotation; matched scenario geometry schematics; saved map-linked takeoffs; catalogue categories/archive/restore; photo gallery/observations/target links; local-time shade input; dashboard search/sort; tab-local workspace/item-form recovery; server-validated draft PDF preview; structured output brief details and both-option budget states.

Real local Supabase browser acceptance now covers email/password login, JWT refresh, logout, locally captured password recovery, private JPEG upload/preview/download, revisioned metadata editing and cross-user/unauthenticated denial. Tests remove their own users/files/schema and local recovery mail. No hosted account or external email is used.

Migrations 0005-0009 add the above state without deleting existing application data. The local application database has been upgraded. Geometry history cannot reconstruct versions before its migration. Provider 3D heights never become analysis inputs. Generated PDF bytes are still download-time artifacts, not a retained-file lifecycle.

Actual checks and remaining release gates are recorded in validation.md. The core MVP remains partial: the next-work list above is implementation work still owed, in addition to external field/pilot/policy gates. No remote write, deployment or paid service was used.


### Basic objects and workspace undo follow-up

Added grouped geometry/object choices, editable categories, optional tree-crown diameter with sourced metadata, and persisted per-item editor-map visibility. Visibility never removes an item from authoritative quantities, pricing, comparison or shade; crown metadata never enables tree shade. Up to 50 applied workspace edits support undo/redo in the current tab; saving/restoring starts a new undo stack. Existing JSONB records receive backward-compatible defaults on validation; no additional migration is needed.

## F01-F08 software closeout - 13 October 2026

Implemented and tested remaining software gaps: known/unknown facts and site notes, budget bounds/readiness; reversible private-photo removal/restore and author/time; map layer controls; nonnegative counts and explicit fixed-price scope; automatic shared Baseline with independent proposals; saved engine/input provenance, baseline area/percentage-point deltas, compatible target/time comparison and saved overlay diagrams. Older analysis model records now require recalculation. See [f01-f08-acceptance.md](f01-f08-acceptance.md) for requirement-level coverage.

F01/F04/F05/F08 software paths are verified. F02/F03/F06/F07 software is implemented with external policy/provider/field gates explicitly open. No field accuracy or production-provider acceptance is claimed. Photo removal retains private recovery bytes and cannot be called permanent erasure.

Earlier uncommitted navigation/settings/account-security/output/support/form-recovery work is preserved and integrated. Retained PDFs, actual data export/permanent deletion, joint backup/restore, broader operations/accessibility/pilot acceptance and staged extensions remain outside this F01-F08 closeout. No push or deployment.

Final continuation: dedicated catalogue/review/output recovery, estimate comparison and support-request browser acceptance passed. Fixed output recovery to restore its selected scenario, and settings reload to discard child-form edits. Latest results and remaining gates are in validation.md.
