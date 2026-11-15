# Pricing readiness and retained proposals

Description clarification (12 November 2026): follow the [contractor workflow](contractor-workflow.md) and [measurement/estimating contract](measurement-and-estimating.md). Drawing or placing an element is separate from deriving its supported quantity, selecting a compatible sourced dated rate, calculating a preliminary estimate and checking completeness. The [concept reconciliation](UI_CONCEPT_RECONCILIATION.md) preserves existing partial/unpriced safeguards and records proposed roadwork/earthworks scope without approving it. The current implementation rules below still govern rate warnings, hard issue blockers, versioning and private pricing.

Updated 31 October 2026. Scope: K04, L14-L16, L24 and necessary F09-F12/S04 links. CORE software workflow; commercial acceptance is separate.

## Try it locally

1. Restart the development API if it was already running. Migration 0012 has been applied to this PC's local database. On another local checkout run `./scripts/api.ps1 migrate` before starting the API.
2. Open a contractor project, complete the brief, and open the geometry workspace. Save proposed scope and its sourced quantities.
3. In Catalogue, add or revise a rate with its source, effective date, optional valid-until date and included components. Revising a code creates a new version; it never silently replaces a selected version.
4. Assign compatible rates or approved assembly components. Mark optional/provisional scope explicitly. Those lines remain included in the stated total and require review; remove excluded scope rather than assuming an optional line is omitted.
5. Calculate an estimate. Review the priced-line count, missing rates, validity warnings, saved charges, pricing formula and takeoff. A partial subtotal is not a complete quotation.
6. Open **Review and issue contractor client proposal**. Select a complete current estimate, enter scope, programme, maintenance (or explicit exclusion), assumptions, exclusions and validity. For a later issue, describe changes or explicitly state no scope changes.
7. Review the proposal-specific warnings. An issuer who also has internal-pricing permission can record an exception reason. Missing prices, stale inputs, unit mismatches and reference-review failures cannot be overridden.
8. Optionally load/select evidence references. The separate photo checkbox explicitly shares bounded copies in the audience-facing output. Review sensitive information and rights before including images. Source gallery photos are not automatically shared.
9. Preview the draft, review it, then confirm issuance. The snapshot is saved, followed by PDF retention. The UI distinguishes a saved snapshot with **PDF retention pending** from **Original PDF retained**.
10. Download under Issued outputs. If initial rendering/upload was interrupted, an authorised issuer can complete retention using that same snapshot. Later downloads return the original bytes and verify their SHA-256; they do not regenerate a new file.

## Authoritative rules

- Backend Decimal arithmetic remains authoritative: four-decimal quantities/rates, two-decimal line and selling amounts, HALF_UP. MYR is the reviewed initial currency. No implicit tax, discount or escalation is introduced.
- Markup: cost base times (1 + percentage/100). Margin: cost base divided by (1 - percentage/100). At MYR 1,000 and 20%, these give 1,200 and 1,250 respectively. Fixed selling prices below listed costs require an authorised issue review.
- Explicit material/labour/equipment/transport/overhead components and explicit contingency/fixed charges use entered sources. No productivity norms are invented. Included charges cannot be billed twice; recipe wastage is not applied a second time.
- Unknown/expired/future rate validity, rate expiry before proposal expiry, archive state, zero values and optional/provisional scope are review warnings. Rate expiry is inclusive of the recorded valid-until date; checks use the API server's calendar date. Date checks rerun at issuance. Archive state is read live while original estimate snapshots remain unchanged.
- Readiness counts billable lines (including recipe components), not map objects. Unknown scope values prevent a meaningful total-cost coverage percentage, so no value coverage percentage is claimed.
- A pricing exception requires issue and internal-pricing grants. Reasons and warning details are recorded in the private administration audit. The client snapshot contains no internal costs, margin, markup or profit. It contains selling values and non-private validity/scope warnings only.
- Proposals include a quantity schedule, schematic site geometry, explicit photo copies if requested, validity, assumptions/exclusions, programme/maintenance and a revision appendix. Previous issue ID/version/selling total and added/removed/changed scope rows are frozen alongside the author's explanation.
- Numerical shade claims remain omitted pending field validation.

## File and revision contract

Migration `0012_pricing_issue.py` adds nullable rate validity and `issued_files`. Existing rates retain unknown validity; existing snapshots are preserved and show pending retention until an issuer deliberately renders their first retained copy. This cannot reconstruct historical bytes that were never stored.

For bounded local CORE output, PDFs up to 10 MiB are retained in private PostgreSQL `bytea`, not a public filesystem or browser storage. The file record contains SHA-256, source-payload hash, renderer identity, creator and timestamp. Source manifests include estimate/project/workspace IDs or revisions, evidence references/hashes, template/renderer version and font digest. Keep the renderer/font manifest updated when those inputs change. Photo copies are sanitised JPEG thumbnails (up to 960x640 and 512 KiB each); original evidence stays in private Supabase Storage. Copies persist in the immutable snapshot after later gallery edits/removal.

Project-grant checks apply on every status, retain and download request. First retention locks the source artifact; concurrent/retried requests preserve the first stored bytes. Database UPDATE triggers reject changes to retained files. Metadata reads defer the large content column. Backend and browser verify download integrity.

The authorised browser renderer supplies reviewed PDF bytes; header/end-marker/size and manifest binding are checked. This is not a digital signature, a PDF malware scanner or independent proof that an arbitrary authorised upload matches every source field. There is no public upload/download URL. Issuance does not send anything externally.

## Remaining boundaries

- L14 full supplier/contact/quotation comparison and bulk import remain NEXT.
- L13 nested BOQ hierarchy and the broader allowance-approval workflow remain partial. L15 supports the limited explicit build-up, not production planning or invented labour productivity.
- S04 coordinated restoration of database, Auth and original private evidence; original-file retention policy; larger-scale storage/performance; formal signatures and external submission exchange remain open.
- Representative commercial/supplier review, physical-device/accessibility acceptance and field validation remain pending. An automated pass is not customer acceptance.

See [checkpoint evidence](tracking/evidence/pricing-proposals-2026-10-31.md) and the canonical [feature summary](FEATURE_STATUS.md).
