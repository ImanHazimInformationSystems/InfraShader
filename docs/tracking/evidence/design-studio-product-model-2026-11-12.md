# Design Studio product model and catalogue update ? 12 November 2026

## Request and scope

The user requested clearer Design Studio descriptions and software/open-source references to align the feature list with an approachable town-building/site-planning workflow and contractor construction estimating. This was a documentation/catalogue task only. No application feature, API, calculation, permission, dependency, or UI implementation was changed.

## Sources inspected

- `AGENTS.md`, `docs/FEATURE_STATUS.md`, `docs/FEATURE_SPEC.md`, `docs/build-plan.md`, `docs/decisions.md`, `docs/validation.md`, and `docs/tracking/README.md`.
- Canonical `feature-register.csv`, `feature-specifications.csv`, `resources.csv`, and `reconciliation.csv`; existing generated `docs/FEATURE_CHECKLIST.md`.
- `docs/contractor-workflow.md`, `docs/measurement-and-estimating.md`, and `docs/UI_CONCEPT_RECONCILIATION.md`.
- Existing resource entries R01-R18 and N01-N20; tool recommendations were reused from the catalogue, not introduced as installed dependencies.

## Changes

- Added `docs/DESIGN_STUDIO_FEATURES.md`, generated from canonical feature/resource registers. It explains the intended contractor journey and cost-estimation stages, lists all L01-L30 with exact priority and repository-audited implementation/verification status, and links the catalogue's software/resource references.
- Clarified canonical summaries for L06, L17-L19, L21-L22, and L25, L27-L30. Names, priorities, reported/audited implementation states, verification/deployment/acceptance fields, IDs, and roadmap count are unchanged.
- Linked the product list from `docs/FEATURE_SPEC.md` and generated full checklist. Documented generation in `docs/tracking/README.md`.
- Recorded the user-requested product framing in `docs/decisions.md` and reconciliation record REC-023.
- Existing approved boundaries remain: L06 terrain concepts stay LATER and do not calculate earthworks; full vehicle-road construction/estimating and terrain/pond costing remain unapproved proposals. Organisation Review remains a separate workflow.

## Tool interpretation

The generated feature list labels current foundations, optional candidates, and curated data separately. Linked package/tool references are not claims that every dependency is currently installed, locked, licensed for a particular use, or required. No new package or service was added. Supplier prices and horticultural records still require permissioned source data and human review.

## Checks performed

- `python scripts/tracking.py` ? passed: 128 records, 84 roadmap features, 1,021 acceptance records, and 160 original requirement names.
- `python scripts/tracking.py --check` ? passed with the same counts; references/status/source checks valid.
- `python scripts/design-studio-catalogue.py` and `--check` ? passed: exactly 30 Studio entries, all resource IDs resolve.
- `python scripts/feature-checklist.py` and `--check` ? passed: generated 84-feature view is current.
- Protected-field comparison against `tmp/reconciliation/protected-before.json` ? IDs, names, record type/count, priorities, implementation status, verification, deployment, and acceptance values are unchanged for the 128 records.
- `git diff --check` on changed tracked documentation/scripts ? passed.
- No application tests were run because application code and behavior were not changed.

No push, deployment, paid service, workbook or PDF generation was performed.
