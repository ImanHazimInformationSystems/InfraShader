# Maintaining the feature tracker

The CSV files in this directory are the canonical tracking data. The Excel workbook, `docs/FEATURE_STATUS.md`, `docs/features/*.md`, `reconciliation.md` and `workbook-data.json` are generated views. Do not maintain independent statuses in Excel or historical plans.

1. Read `../FEATURE_STATUS.md`, `../FEATURE_SPEC.md`, the relevant `../features/<ID>.md` and source contract before feature work.
2. Inspect existing implementation. Edit only affected rows of `feature-register.csv`, `feature-specifications.csv`, `acceptance-checklist.csv`, `release-gates.csv` and `reconciliation.csv`. Keep stable IDs. Add criteria with unused suffixes; never renumber existing IDs. Preserve original SRS IDs. Record actual paths, commands, results, gaps and date.
3. Keep priority separate from implementation. Keep implementation, verification, deployment and customer acceptance separate. A passing subset does not close a whole feature. Use evidence files under `evidence/`; never include credentials, user uploads or personal data.
4. Run `python scripts/tracking.py` from the repository root, followed by `python scripts/tracking.py --check`.
5. Review the affected records, generated pages and evidence. Report the affected feature IDs, actual checks and remaining gaps. Update these same files in place; do not create a new tracker for each checkpoint.

## Read and maintain without Excel

The full product's UI placement/readiness is separately maintained in `ui-coverage.csv` (85 project roadmap rows: 84 PDF-baseline IDs plus user addendum L31). Run `python scripts/ui-catalogue.py` and `python scripts/ui-catalogue.py --check` to regenerate the application manifest and `docs/UI_COVERAGE.md`. This is interface coverage only; it never promotes a feature's domain implementation, verification, deployment or acceptance status. See `docs/UI_DESIGN.md` for the preview data contract and source research.

Start with [the feature summary](../FEATURE_STATUS.md), then open a feature's linked specification for its requirements, sources, implementation evidence and remaining work. Use VS Code's Markdown preview to read these pages.

- `feature-register.csv`: current status, priority, code paths, tests, dependencies and evidence references.
  `Deployment evidence` is required when deployment status is `Deployed`; link
  dated evidence and retain any unverified workflow/operational gates.
- `feature-specifications.csv`: detailed intended behaviour and source contracts.
- `acceptance-checklist.csv`: stable requirement IDs, expected behaviour, results and remaining work.
- `release-gates.csv`: technical prerequisites and acceptance gates.
- `reconciliation.csv`: overlaps, conflicts and unresolved questions.
- `sources/` and `evidence/`: preserved source material and recorded checks.

CSV is the editable source of truth; Markdown is its readable view. Ask Codex to update the affected feature and acceptance records after a change, record evidence, then regenerate and validate. Do not edit generated Markdown as an independent checklist. Git diffs can show changes to these text files; local regeneration does not commit or push them.

The PDF comparison view is `docs/FEATURE_CHECKLIST.md`: regenerate with `python scripts/feature-checklist.py`, then validate with `python scripts/feature-checklist.py --check`. It includes current requirement summaries and groups implemented versus partial/unaudited work by workspace. Use [the contractor workflow](../contractor-workflow.md), [measurement/rate rules](../measurement-and-estimating.md) and [concept reconciliation](../UI_CONCEPT_RECONCILIATION.md) when interpreting those summaries. Proposed additions there do not create approved roadmap rows. No retained PDF-authoring generator was located for the 11 November catalogue; keep that historical source unchanged rather than editing its bytes or creating an unrelated PDF build process.

The contractor-focused `docs/DESIGN_STUDIO_FEATURES.md` is generated from the same feature register and resource catalogue. Regenerate/check it with `python scripts/design-studio-catalogue.py` and `python scripts/design-studio-catalogue.py --check`. Update the canonical CSV description or resource IDs first; do not hand-edit the generated feature list.

## Optional Excel export — only on request

The default workflow above does not create or update an `.xlsx` file. Existing Excel exports are dated snapshots and may lag behind the live registers. Do not regenerate or attach another workbook unless the user explicitly requests an export.

Generate Excel with `node scripts/tracking-workbook.mjs`. This requires the optional Codex `@oai/artifact-tool` runtime; it is not an application dependency. Set `INFRASHADER_ARTIFACT_MODULE` to the absolute module entry URL/path when it is not resolvable. The script defaults to the installed Codex runtime on this PC. The CSV/Markdown validator works with standard Python even without that optional renderer.

Run `python scripts/validate-tracking-workbook.py` to compare every generated table cell and preserved source formula with canonical data. Review the diff and the generated workbook. If someone annotates Excel, explicitly import/reconcile those edits into CSV before regenerating; regeneration does not import edits automatically. Never overwrite the original attachment.

`sources/` contains immutable source snapshots and `source-manifest.json` records their SHA-256 hashes. Original worksheet values/formulas are recorded in `evidence/original-workbook-cells.json`. Historical workbook tabs remain labelled source snapshots to preserve their formulas and tracking context; they are not current implementation assessments.

The generated workbook is saved in `outputs/feature-audit-<latest-review-date>/`. Earlier dated workbooks are historical copies. Close the current dated copy in Excel before regenerating it; an open workbook may be locked by Windows.

Counting: the original PDF baseline has 84 roadmap entries. The current project register adds user-requested L31, for 85 project roadmap entries. F/D/E are 38 overlapping baseline references; K are six refinements. Neither group is added to the roadmap total. Requirements, gates, resources, UI labels and problem/evidence identifiers are not product-feature counts. No completion percentage is used. The PDF is preserved unchanged.

Implementation: Not audited / Not implemented / Partial / Implemented. Verification: Not run / Passed / Failed / Blocked / Not applicable. Deployment: Unknown / Local only / Deployed. Acceptance: Not assessed / Pending / Accepted / Rejected. Partial must name the supported subset and gaps. Deployed and Accepted require their own evidence. Unknown is not a claim that deployment never occurred.

This initial audit is deliberately bounded. Derived acceptance rows require review before signoff; original SRS name-only rows retain their IDs and explicitly lack full criterion wording. See reconciliation for unresolved business-policy and stage questions. Do not implement the backlog merely because it appears in the tracker.
