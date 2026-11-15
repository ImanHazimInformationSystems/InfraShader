# O06 bounded text suggestions, O08 side-by-side documents, read retry — 13 November 2026

Scope note: the approved O06 CORE slice is the document viewer plus manual source-linked entry (done in D1B);
OCR/AI extraction is NEXT. This slice adds only **bounded, deterministic text-layer suggestions** (no OCR, no AI),
explicitly requested in the MVP completion brief, without changing the confirmation rule. O08 CORE allows a
document-only fallback; received offers carry no admitted design geometry, so no map comparison is offered.

## O06 suggestions

- `apps/api/app/offer_extraction.py`: PDF text layer via the existing locked `pypdf` 6.20.0 (≤100 pages); XLSX via
  stdlib zip/XML (shared strings, inline strings, numeric cells; ≤5,000 rows; any part >20 MiB uncompressed rejected);
  15 s wall-clock budget in a worker thread; ≤500 suggestions, text ≤300 characters with control characters removed.
  A line/row becomes a suggestion only when it carries text and an amount (`12,500.00`, `RM 15,500.00`,
  `3 000.00`). Explicit statuses: `ok`, `no_text_layer` ("OCR is not available; enter values manually"),
  `unreadable`, `timeout`, `unsupported` (native JSON is already structured).
- `POST …/owner-review/files/{id}/suggestions`: `review_project` only, project-scoped, received originals only,
  SHA-256 integrity check first; nothing is stored.
- UI (`OwnerEvaluation.tsx`): "Suggest lines from text" per retained PDF/XLSX; suggestions list with anchors
  (`page 1 line 2`, `sheet1 row 2 cell B2`) labelled unverified; selected rows are added as **unconfirmed** draft lines
  (scope unmapped, mapping not confirmed, note "Added from an unverified text suggestion") that still require
  mapping, checking against the document and the normal confirmation save.
- Checks: `pytest tests/test_offer_extraction.py` 5 passed (text PDF amounts incl. space thousands; blank PDF →
  `no_text_layer`; XLSX cell anchors; malformed PDF, oversized workbook part, JSON and other types fail explicitly;
  long text bounded; Studio-only, approver-only and foreign users denied; suggestions never change submission lines
  or confirmation). Browser: owner-review spec shows the explicit failure for a PDF without text and adds a
  suggested line as unconfirmed (`test-results/owner-review/suggestions.png`).

## O08 side-by-side documents

`DocumentCompare` in the Offers step: choose any two retained PDF originals (labelled by bidder, filename and
package version) and view them side by side (stacked below 760 px); states that no geometric equivalence, scale or
matching scope is inferred. Browser spec opens two documents (`test-results/owner-review/compare-documents.png`).

## Resilience fix found during this slice

Two browser runs failed with "The API could not be reached" after a reload (fetch rejected at the network layer
between the page and the preview proxy). `services/api.ts` now retries an idempotent GET/HEAD once after 400 ms;
writes are never retried and caller aborts are respected (`api.test.ts`: read retried once, write not retried).

## Remaining

OCR for scanned documents, table structure recognition, bounding boxes and native-snapshot prefill remain NEXT and
need representative documents (AC-04). Spatial comparison of submitted designs needs admitted geometry exchange
(D2). Suggestions are a convenience, not extraction accuracy evidence.
