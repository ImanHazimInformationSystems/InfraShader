# L05 / F17 — calibrated existing-plan reference

Implemented locally on branch `build/l05-calibrated-reference`, 27 October 2026. This is the limited reference-only slice authorised by the user's L05 request, not approval of other F16–F20 expansions.

## Try it

1. Sign in to a Studio organisation with project geometry and evidence editing grants. Open a saved project and its geometry workspace. Browser Demo does not offer private reference intake.
2. Open **Existing-plan reference • L05**. Choose PNG/JPEG or a PDF, specify the PDF page, enter the source/revision and confirm your permission to use it. Choose **Upload reference page**.
3. Pick A then B on the preview, or enter their pixel coordinates. Enter the known A–B distance, the WGS84 longitude/latitude of A, and the A→B bearing measured clockwise from **grid north in the displayed projected CRS**. Enter declared uncertainty in metres; this is not a measured fit residual.
4. Choose **Apply and lock calibration**, inspect the map and then **Validate & save workspace**. Unlock to change position, scale or direction. Visibility and opacity are saved when applied and the workspace is saved.
5. To trace, enable **Link applied work geometry to this calibrated reference**, draw/apply a supported work item or target, then save. Drawing does not automatically infer heights or surveyed quantities. The site boundary retains its existing separate provenance workflow.
6. Replacing/removing/recalibrating a reference flags linked work/targets for review without moving their geometry. Inspect the geometry and quantities, explicitly confirm each review against the current plan, and save. Issuance is blocked while saved traced geometry requires review. Workspace history retains prior calibration and trace links; restoring appends a revision and requires an active private reference file.

## Storage, permissions and numerical contract

The original PDF is processed on the device; only the selected raster page is uploaded to the existing private evidence service. Original filename, SHA-256, selected page, source/revision note and declared uncertainty are saved with calibration. Original PDF retention and CAD extraction are not included. Images are normalised on the device and sanitised/re-encoded by the backend; private image bytes have the existing evidence digest and access controls.

Files are bounded to 10 MiB, references to 16 million pixels / 8192 pixels per side, PDFs to 100 pages and a selected raster side of 3000 pixels. The calibration is a two-point uniform-scale rotation/translation, not perspective correction. Points must be at least 10 pixels apart. The backend derives corners and a calibration fingerprint in the project's suitable projected CRS; a reference extent over 10 km is rejected. Opacity, visibility and lock changes do not invalidate trace links; source/calibration changes do.

Calibration stays in the revisioned workspace JSON, avoiding a duplicate revision system or a migration. Preview/save require current project grants. A foreign, missing or archived evidence ID is rejected. Browser image requests use the authenticated private proxy; object URLs are revoked on reference/session changes and unmount. No browser service key, external file URL, paid service or automatic sharing is introduced.

## Remaining gates

Synthetic fixtures establish software behaviour, not field accuracy. Representative authorised plans, actual control-point uncertainty, physical-device usability and user acceptance are still pending. Two points cannot quantify independent calibration residuals or correct distorted scans; users must verify dimensions on site. Source erasure/retention and joint recovery remain shared S04/D09 work. No terrain, full CAD, survey certification or original-PDF archive is claimed.

PDF rendering uses Mozilla's [PDF.js examples/API pattern](https://mozilla.github.io/pdf.js/examples/) and the pinned `pdfjs-dist` package in the workspace lockfile. Numerical work remains PyProj/Shapely/Python; display remains MapLibre.
