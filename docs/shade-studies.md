# L11 ground-site shade and use-time studies

Implemented 5 November 2026 in the existing ground geometry workspace. The explicit L11 request authorises this bounded NEXT study slice; it does not establish D2/pilot release acceptance.

## Use

Save a sourced site boundary, target and supported building/canopy geometry. Open **Shade and use-time studies** in the workspace calculations area. Select a target, enter named start/end bands with explicit UTC offsets, choose a sampling step and select **Calculate & save study**. The study compares shared Baseline and both options. Select a scenario in the workspace to inspect its target heatmap and apply that overlay to the site plan. Inspect **Time chart and numerical samples** and **Sources, method and exclusions** for underlying values.

The UI lists the latest 30 saved studies, retaining original input bands and workspace/project revisions. Changing the current inputs does not change a saved result. Older database records are not deleted. Stale history remains inspectable but cannot be applied to the current map. Existing single-time analysis and issued-output calculations remain separate; a study is not silently substituted into a proposal.

## Sampling and interpretation

- One target, one to four non-overlapping bands, each positive and at most 24 hours. Explicit offsets are required, including for clock-change dates. Limits are 15–120 minutes per step and 32 samples across the study.
- Each band is divided into segments no longer than the step. Evaluate the existing ground-shadow engine at each segment's midpoint; weight by its actual duration, including a shorter final segment. Gaps between bands have no weight. Dates/offsets are stored; computed midpoint timestamps use UTC.
- Let `A_i` be shaded target area and `d_i` the supported segment duration in minutes. Area-time is `sum(A_i*d_i)/60` square-metre hours. Mean coverage is `100*sum(A_i*d_i)/(target_area*sum(d_i))`. It is an approximation over sampled use times, not a measured or exact shade-duration guarantee.
- Night (solar elevation <=0) and unsupported low sun (<5 degrees) receive separate duration totals and are excluded from the supported-daylight denominator. No supported samples means an unavailable/null mean and no heatmap, never a successful zero-coverage result.
- Heatmap cells form a 10×10 grid over the projected target bounds, clipped to the target. Each cell records duration-weighted shaded **area fraction**. It does not guarantee every point in a cell has that shade duration. Only polygonal intersections are rendered. The inline SVG is a schematic; the site-plan overlay uses WGS84 coordinates derived from the same metric frame as quantities.
- Non-overlapping contribution attribution follows shared Baseline first, additional buildings second and additional canopies last. This avoids double counting; it is an explicit attribution convention, not a unique physical ownership of overlapping shade. Standalone per-source area-hours can overlap and must not be summed.

## Authority and failure behaviour

The backend owns sampling, solar position, clipping, weighting and contribution calculations. New study writes require the project `analyse` grant, a saved workspace and matching revision under the existing project lock. Readers can inspect permitted studies, but cannot run one without the grant. Changed request-key inputs reject rather than returning another study. Workspace/project/model changes make saved studies stale.

Existing height/source, unknown-building, capacity and edited-terrain safeguards remain. Vegetation and decorative presets are listed as excluded; they are not treated as measured shade. Backend errors retain the form and previous saved history. Study drafts participate in the existing unsaved-form warning. No new database migration, paid source or production dependency was introduced.

## Technology and method references

- Existing [pvlib `get_solarposition`](https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.solarposition.get_solarposition.html) uses the repository's NREL NumPy path with timezone-aware timestamps. Actual installed engine versions are saved with each study.
- Existing [Shapely set operations](https://shapely.readthedocs.io/en/2.0.6/set_operations.html) provide unions/intersections/differences; PyProj supplies the validated local UTM frame already used for quantities. The repository's opaque building/roof projection remains the shadow model.
- Duration-weighted midpoint integration, capacity and grid size are explicit bounded implementation choices. They are not a third-party certification or user-approved field tolerance.

Field accuracy, representative-site sampling/grid tolerances, physical-device usability and customer/pilot acceptance remain pending. Shade is not temperature, observed weather, thermal comfort or a comfort index. Terrain-aware shade, tree crowns, roof/facade targets and full Shadowmap parity remain excluded.

See [L11 status](features/L11.md), [verification evidence](tracking/evidence/l11-2026-11-05.md) and [tracking maintenance](tracking/README.md).
