# Built-in examples (v2) and Organisation Review overhaul — 14 November 2026

Branch `build/l07-object-palette`, working tree (no commits). Local only. Onboarding aid under S01, with an O08
comparison improvement; no feature's implementation, verification or acceptance status is changed.

## Why v2

User feedback on v1: the Studio example looked glitchy (edited terrain), the review was confusing ("one project or
many?"), and items placed in the Studio example (trees, objects) did not appear in Organisation Review, so the two
interfaces did not tally.

## Design Studio: three examples, flat ground

`apps/api/app/examples.py` builds three contractor_proposal projects for the same real open field in Shah Alam,
Selangor (origin 3.07315 N, 101.51053 E; fictional client, contractors, rates, documents). No terrain editing:
level ground with ground-paint textures, paths, an access road (Example B), objects and trees.

| Example | Contractor (fictional) | Design | Margin | Estimate (option A) |
| --- | --- | --- | --- | --- |
| A | Example Landscape Studio | Community park: 1.8 m concrete loop, wakaf plaza, play area, planting bed, hedge, 19 trees; Value option; client change → proposal v2 | 15% | MYR 372,697.18 |
| B | Taman Indah Landscape Works | Shaded garden park: paver walkways crossing at a gazebo plaza, 2 pergolas, flower beds, play area, 3.5 m premix access road, 28 trees | 18% | MYR 500,191.60 |
| C | Kenari Build & Plant | Open lawn park: gravel loop, small shelter, shrub beds, 10 trees, no play area | 12% | MYR 167,604.41 |

Each is created through `projects.create_project`, `workspace.save_workspace`, `calculations.run_estimate`,
`issue_snapshot` (template v3) and, for A, the change register (request → reviewed → sent → linked v2).

## Organisation Review: the same three designs

The review example (developer_decision) holds basis (8 lump-sum common scope items, MYR 480,000 budget, 3
requirements), a locked rubric with a safety gate, and three offers. Each offer retains a text-layer PDF and a native
JSON **design file** (`infrashader-design-snapshot-v1`) built from the same design builders and pricing code
(`offline_examples()`); scores, one answered clarification. Result: A rank 1 (77.00), B rank 2 (74.50, MYR
20,191.60 over budget), C "unpriced" (play area excluded), not ranked.

`app/design_preview.py` turns a saved design option into a local-metre, north-up preview (items with kind,
category, quantity, tree crowns, object assets, path widths, ground paint). The same renderer
(`components/DesignPlan.tsx`) draws the Studio example cards and banner and the review proposals.

**Tally checks** (`apps/api/tests/test_examples.py`, real PostGIS): every Studio example's current estimate equals
the offline total offered in the review; the Studio project's own preview has the same items by kind/asset/status as
the review preview and the retained JSON file; review quoted totals equal the Studio totals; no terrain in any
example. Outdated v1 examples are archived (not deleted) and rebuilt (`EXAMPLE_SOURCE` version tag); migration
`0019` allows markers `studio_a|b|c`.

## Organisation Review UI overhaul

- Review folder lists reviews only (owner-decision projects); a "How Organisation Review works" explainer; the
  example review card shows the three plans and totals.
- Opening a review leads with the comparison: project name and "one project, N proposals", the example note, the
  guide, and a new default **Overview of proposals** step: one card per proposal (site plan, price and budget
  difference, readiness in plain words incl. what is not included, rank, score, programme, warranty, maintenance),
  a larger plan viewer with legend, "what each proposal puts on the site" and "prices side by side" tables (with
  5-year cost) and a glossary. Each numbered step shows a one-line plain-language hint.
- Studio-style panels (brief checkpoint, site map, duplicate/template, history, access, readiness) fold into one
  collapsed "Project details, site and settings" section for reviewers.
- Preferences gain "Overview of proposals" as the default opening view.

## Checks run

| Check | Result |
| --- | --- |
| `pytest tests/test_examples.py` | 4 passed |
| Backend full `pytest`; Ruff check/format | 365 passed (before the 4th example test); clean |
| Web lint / typecheck / build | clean |
| Web unit tests (run with an upper-case `C:` working directory) | 35 files, 103 passed. From a lower-case `c:` shell, files importing `vitest` explicitly fail to load (module loaded twice); environment artefact, not a test result |
| Integration browser full suite | 12/14 first run; project-hub and map frame-timing passed on immediate rerun; examples, owner-review and accessibility rerun after the versioning change: passed |
| Accessibility (axe) | 0 serious/critical |
| Dev database | migrated to 0019; v1 examples there are archived on next example open |

Screenshots: `test-results/examples/` (studio-examples, studio-example-b, review-overview, review-plan-focus).

## Not claimed

Learning material only: no survey, field accuracy, species suitability, market price or real tender. The plan
preview is a schematic of recorded geometry. Browser Demo does not contain the examples. No user testing of the
onboarding yet; no pilots, deployment or acceptance.
