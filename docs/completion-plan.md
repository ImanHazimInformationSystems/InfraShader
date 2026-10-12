# InfraShader remaining-build plan

12 October 2026. Branch `build/core-spatial-completion`. This is the authoritative continuation plan; [requirements.md](requirements.md) is the feature acceptance matrix. Earlier build-plan/validation records remain historical evidence.

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

## Next exact commands

Milestone 3 catalogue search/filter/pagination/version editing is implemented. Continue with catalogue categories/archive, matched visual comparison and map-linked itemised takeoff. Add concurrent-review browser recovery coverage. Then proceed through brief/evidence and member/settings slices. Run `scripts/api.ps1 lint`, `scripts/api.ps1 test -q`, frontend lint/typecheck/test/build and relevant browser tests after each slice. Browser configurations own ports 8000/5173 and must run sequentially. Tests using signed fixture identity remain separate from real Supabase acceptance.


## Catalogue checkpoint

Implemented server-side literal code/description search, unit/basis filters, bounded pagination and authorised single-version retrieval. The browser can browse pages, prefill a rate for revision, and save a new immutable-reference version. Assigned IDs are fetched independently of search/pages; creating a version does not silently rebind saved scope. Internal amounts remain omitted for members without pricing capability. No migration or service changes required.

Backend: 146 tests passed, zero skipped; Ruff passed. Frontend: 20 unit tests, lint/typecheck/build/format passed. Real-PostGIS browser catalogue and output regressions are recorded in validation.md. Existing large-bundle warnings remain. F09 is still partial because category/archive/recovery work remains; no core or release gate is claimed complete.
