# K02 dependency graph, K05 quantity verification, L13/L14/L04 audit — 13 November 2026

## K02 — defect found and fixed; graph tested

Before: brief and design changes already made estimates stale (`artifact_response`: workspace/project revision)
and issuing from a stale estimate was refused (`issue_not_ready`, `stale_brief`), but saving a newer version of a
selected rate produced no signal — the estimate correctly kept its bound version yet nobody was asked to review it.

Fix: `calculations.estimate_readiness` finds the latest non-archived version per selected rate code and
`pricing_readiness.readiness` emits `superseded_rate` ("rate CORE v1 has a newer version v2; the estimate keeps v1
until you re-estimate deliberately"). As a readiness warning it requires the authorised pricing review before a
proposal is issued; nothing is rebound.

`apps/api/tests/test_dependency_graph.py` walks the actual graph on disposable PostGIS:
rate v2 saved → estimate still v1, `superseded_rate` warning, estimate not stale, issue blocked without review →
brief edited → estimate stale, issue refused `stale_brief` → deliberate re-estimate current → design geometry doubled
→ quantity doubles (independently: same projected item, twice the east–west extent), estimate stale, issue refused
`issue_not_ready`. Earlier issued snapshots are unchanged (covered by change-register and pricing tests).
Result with related suites: 16 passed. UI: warnings render generically in `PricingIssueReadiness.tsx`.

## K05 — quantity verification visible

`GeometryWorkspace.tsx` item table now shows, per quantity, the measurement method and declared CRS (e.g.
"projected polygon area · EPSG:32647"), the calculated value beside any measured override, and a **Verify on site**
badge for every quantity whose provenance is not `measured`; a scenario-level list states how many quantities are not
field-measured with their sources ("A calculated quantity is not a survey"). Measured overrides remain the existing
`quantity_override` (calculated value preserved). Site-fact queue (L03) unchanged.
Checks: integration `workflow`, `spatial`, `accessibility` specs passed after the change (spatial once hit a
transient "API could not be reached" fetch failure; passed on two immediate repeats — recorded as intermittent).

## L13/L14/L04 — audited against CORE

- L13: visual work → declared geometry/method quantity → explicit dated rate → preliminary estimate with billable
  lines, unpriced work and partial subtotal; itemised takeoff and schedule CSV (now formula-safe, units in a separate
  column). Evidence: workflow spec, `test_schedules.py`, `test_pricing_readiness.py`. Nested takeoff hierarchy and
  allowance approval remain open (beyond CORE); no XLSX workbook export (CSV is the admitted small format).
- L14: versioned rates with source, effective/expiry dates, unit, currency, basis and inclusions; new versions never
  rebind (K02 test) and now prompt review. Supplier/quotation comparison, lead times and CSV import are NEXT.
- L04: numeric dimensions (canopy rectangle), selection, duplication, undo/redo, snapping, Baseline separation and
  draft recovery verified by spatial/workflow specs. Wider terrain-surface/overlay parity remains (beyond CORE).
