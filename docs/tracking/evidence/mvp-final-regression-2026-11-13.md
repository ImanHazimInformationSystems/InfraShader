# MVP completion — final local regression and status — 13 November 2026

Branch `build/l07-object-palette`, HEAD `7effa9c` plus the preserved and new working-tree changes (no commits).
Local only: disposable PostGIS schemas, local Supabase (Docker, 54331), test-signed identity for integration specs.

## Slice evidence

- Regression repair, template v3, O17 memorandum: `outputs-v3-memo-regressions-2026-11-13.md`
- Real local Auth/Storage, access boundaries, DB + private-photo restore: `live-auth-storage-restore-2026-11-13.md`
- S03/S07/S08/S09/S10/L12 audit and fixes: `shared-audit-2026-11-13.md`
- K02/K05/L13/L14/L04: `studio-dependencies-2026-11-13.md`
- O06 suggestions, O08 side-by-side, read retry: `owner-extraction-compare-2026-11-13.md`
- Earlier in the run: `owner-review-d1b-2026-11-13.md`, `change-register-2026-11-13.md`, `restore-drill-2026-11-13.md`

## Final checks (this session)

See the table under "MVP completion final regression" in `docs/validation.md`. Summary: backend 362 passed and
Ruff/format clean; frontend lint/typecheck/build clean and 99 unit tests passed; integration browser 13/13 (one
environmental `ENOBUFS` failure passed on rerun); live 3/3 (one intermittent recovery failure passed on rerun);
access 1/1; Browser Demo 27/30.

## Browser Demo suite repair

Stale assumptions fixed in `tests/browser/*` (Home start page, mobile navigation dialog, "Draw and snap"
disclosure, immersive studio after reload, site-shape selection replacing two-corner clicks, duplicate status
regions). `playwright.config.mjs` gained optional alternate ports (`INFRA_BROWSER_API_PORT`,
`INFRA_BROWSER_WEB_PORT`) and failure screenshots; default behaviour unchanged.

## Open defect (not fixed)

**L04 mouse polygon drawing in the detailed workspace.** After "Draw polygon", clicks on the drawing canvas register
no vertices and the coordinate field stays empty, in Browser Demo and against the real API (headless Edge). Two map
canvases are visible at that point; the Terra Draw instance may be bound to a different map than the one clicked.
Coordinate entry, rectangle/canopy generators, the immersive layout tools and vertex dragging still work. Foundation
spec "Terra Draw polygon…" fails on all three viewports; it was not weakened.

## Intermittent / environmental observations

Windows loopback socket exhaustion (`ENOBUFS`, Edge `ERR_NO_BUFFER_SPACE`) after many connections in long runs;
one live recovery-email run and one workflow duplicate-labour alert failed once and passed on immediate reruns. Product
mitigations added: lazy-chunk recovery screen; one retry for idempotent reads.

## Not claimed

No deployment, no hosted services, no customer acceptance, no field accuracy, no adopted procurement policy
(REC-010), no representative-document (AC-04) or pilot (AC-10) evidence. See `docs/PILOT_ACCEPTANCE_PROCEDURES.md`.
