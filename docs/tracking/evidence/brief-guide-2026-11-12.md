# Plain-language Studio brief guide — 12 November 2026

Scope: L01 with K01 scope terminology; TRK-L01-012. User requested guidance and an example after selecting a site in `/studio/create`, suitable for a nontechnical new user. Existing modified/untracked work was inspected and preserved.

## Changes

- `apps/web/src/components/BriefGuide.tsx`: visible four-step introduction, purpose/contact explanations, minimum-start guidance, editable-later instructions, expandable fictional courtyard example, and optional opportunity-field definitions. The example covers current form fields, scope vocabulary, sources and unknowns without inventing confirmed site evidence or client agreement. No autofill or state mutations.
- `apps/web/src/components/BriefForm.tsx` and `apps/web/src/App.tsx`: display guidance only on new Studio briefs. Existing form submission, dirty state, templates, selected site and edit workflow retained.
- `apps/web/src/styles.css`: restrained maroon/neutral guide, readable paragraphs, native disclosure controls and wrapping for narrow viewports.
- `tests/browser/brief-guide.spec.mjs`: selected-site continuation, keyboard-opened example, unchanged entered name/problem, optional definitions, no horizontal overflow, project creation and saved brief edit round trip.

## Actual checks

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 64 passed across 22 files.
- `npm run build`: passed; existing large-chunk warning remains.
- `.\scripts\api.ps1 lint`: passed; 86 files already formatted.
- `.\scripts\api.ps1 test -q`: 287 passed; existing Starlette/httpx deprecation warning.
- `npx playwright test tests/browser/brief-guide.spec.mjs`: final run 3 passed (desktop 1280x900, tablet 768x1024, phone 390x844). Browser Demo and offline map; no real Auth/Storage acceptance. The initial test run failed because it assumed the real-service `/studio/create` URL for Demo (which uses `/create`) and desktop navigation on mobile. Corrected the test to follow the existing Demo routes and mobile navigation; the full rerun passed.
- Actual desktop and phone expanded-guide screenshots inspected: `artifacts/brief-guide/desktop-example.png` and `artifacts/brief-guide/phone-example.png`. Tablet screenshot also captured. Text wraps, disclosures remain usable, and the fictional/reference label is visible.

## Tracking and limits

Canonical L01 code/check/evidence references, the new L01/K01 UI criterion and L01 UI connection note updated. Domain implementation, deployment and customer acceptance statuses remain unchanged. No Excel export.

Prior L01 implementation and project-home evidence remain in [the L01/K01 checkpoint](l01-k01-2026-11-04.md) and [the Studio home checkpoint](studio-home-2026-11-09.md).

Tracking and UI generators and their `--check` validations passed after correcting the register's single evidence-link field to reference this record (historical evidence linked above). `python scripts/feature-checklist.py` regenerated the 84-feature checklist. Scoped `git diff --check` passed. Prettier passes for the guide, brief form and browser test; full-file formatting checks flag existing `App.tsx` and `styles.css` formatting, which was preserved to avoid unrelated rewrites.

Real-service integration browser and live Supabase suites were not rerun for this static guidance change. Browser Demo confirms the UI interaction and local create/edit path only. Representative nontechnical-user usability, physical-device and full assistive-technology acceptance remain pending. Existing field/pilot/service gates remain open. No backend or persistence contract changed; no deployment, remote write or external message.
