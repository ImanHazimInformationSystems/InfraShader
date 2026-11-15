"""Output template v3 plan sheet (L23) and maintenance checklist (L22) contracts.

The plan sheet is derived by the API from the saved WGS84 project geometry projected
into the workspace's declared metre CRS. Coordinates are emitted as local metres
(east, north) from the boundary's south-west corner so a renderer can draw at a
uniform scale and a scale bar is meaningful *for the plan as drawn*. It remains a
schematic of recorded geometry: not a survey, not field-verified.
"""

from collections import Counter
from math import hypot
from typing import Annotated, Literal

import shapely
from pydantic import Field
from pyproj import Transformer
from shapely.geometry import mapping, shape

from app.domain.geometry import GeometryValidationError, project_wgs84_geometry
from app.workspace import StrictModel

TEMPLATE = 3
SCHEMA = "infrashader-output-v3"
RENDERER_NOTE = "@react-pdf/renderer 4.9.0; template v3"
MAX_DIMENSIONED_EDGES = 16
PROVENANCE_LABEL = {
    "measured": "measured",
    "sourced": "sourced from a supplied record",
    "estimated": "estimated",
    "manually_entered": "manually entered",
    "imported": "imported",
    "calculated": "calculated",
    "traced": "traced from a plan/image",
    "map_derived": "map-derived",
}


class MaintenanceTask(StrictModel):
    task: Annotated[str, Field(min_length=1, max_length=300)]
    responsibility: Literal["contractor", "client", "third_party", "to_be_agreed"]
    frequency: Annotated[str, Field(min_length=1, max_length=120)]
    included_in_price: bool
    assumptions: Annotated[str, Field(max_length=1000)] = ""


def _round(value):
    return round(float(value), 2)


def _local(geometry, transformer, origin):
    ox, oy = origin
    projected = shapely.transform(
        shape(geometry), lambda x, y: transformer.transform(x, y), interleaved=False
    )
    return shapely.transform(projected, lambda x, y: (x - ox, y - oy), interleaved=False)


def _coords(geometry):
    data = mapping(geometry)

    def walk(value):
        if isinstance(value, (list, tuple)) and value and isinstance(value[0], (int, float)):
            return [_round(value[0]), _round(value[1])]
        return [walk(part) for part in value]

    return {"type": data["type"], "coordinates": walk(data["coordinates"])}


def plan_sheet(boundary, targets, scopes, constraints, issued_at, timezone):
    """Return a renderable, honest plan-sheet description or an explicit not-to-scale record.

    ``scopes`` maps a label (baseline / selected / option_a ...) to snapshot scope rows.
    """
    base = {
        "date": issued_at[:10],
        "timezone": timezone,
        "north": "drawn north up (grid north of the declared projected CRS)",
        "sources": [
            "Project boundary, targets and work items as saved in InfraShader "
            "(WGS84 longitude/latitude).",
            "No third-party basemap or imagery is reproduced on this sheet.",
        ],
    }
    try:
        projected = project_wgs84_geometry(boundary, source_crs="EPSG:4326")
    except (GeometryValidationError, ValueError, TypeError) as exc:
        return {
            **base,
            "status": "not_to_scale",
            "reason": f"The site geometry could not be projected for a scaled plan: {exc}",
        }
    crs = projected.metric_crs
    transformer = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    min_x, min_y, max_x, max_y = projected.geometry.bounds
    origin = (min_x, min_y)
    site = _local(boundary, transformer, origin)
    ring = list(site.exterior.coords)
    edges = []
    if len(ring) - 1 <= MAX_DIMENSIONED_EDGES:
        for index, (start, end) in enumerate(zip(ring, ring[1:], strict=False)):
            edges.append(
                {
                    "index": index + 1,
                    "from": [_round(start[0]), _round(start[1])],
                    "to": [_round(end[0]), _round(end[1])],
                    "length_m": _round(hypot(end[0] - start[0], end[1] - start[1])),
                }
            )

    provenance = Counter()
    layers = {}
    numbered = {}
    for label, rows in scopes.items():
        drawn = []
        for row in rows:
            provenance[row.get("provenance") or "unknown"] += 1
            geometry = row.get("geometry")
            if not geometry:
                continue
            try:
                local = _local(geometry, transformer, origin)
            except Exception:  # noqa: BLE001 - an undrawable row is listed, not invented
                continue
            number = numbered.setdefault(row["id"], len(numbered) + 1)
            drawn.append(
                {
                    "id": row["id"],
                    "number": number,
                    "name": row["name"],
                    "geometry": _coords(local),
                    "quantity": row["quantity"],
                    "unit": row["unit"],
                    "provenance": row.get("provenance", ""),
                }
            )
        layers[label] = drawn

    uncertainty = [
        "Schematic plan of recorded geometry; not a measured survey. Verify dimensions on site "
        "before construction or ordering.",
        "Lengths and areas are computed by the InfraShader API in "
        f"{crs} from saved WGS84 coordinates; displayed to 0.01 m.",
    ]
    if provenance:
        uncertainty.append(
            "Recorded sources of drawn items: "
            + "; ".join(
                f"{count} {PROVENANCE_LABEL.get(key, key.replace('_', ' '))}"
                for key, count in sorted(provenance.items())
            )
            + "."
        )
    if constraints and constraints.get("critical_unverified"):
        uncertainty.append(
            f"{constraints['critical_unverified']} critical site fact(s) await verification."
        )
    return {
        **base,
        "status": "scaled",
        "crs": crs,
        "method": "projected_from_wgs84",
        "extent_m": {"width": _round(max_x - min_x), "height": _round(max_y - min_y)},
        "site": {
            "geometry": _coords(site),
            "area_m2": _round(site.area),
            "perimeter_m": _round(site.length),
            "edges": edges,
            "edges_omitted": len(ring) - 1 > MAX_DIMENSIONED_EDGES,
        },
        "targets": [
            {
                "name": target["name"],
                "geometry": _coords(_local(target["geometry"], transformer, origin)),
            }
            for target in targets
            if target.get("geometry")
        ],
        "layers": layers,
        "uncertainty": uncertainty,
    }


def maintenance_plan(tasks):
    return {
        "basis": (
            "Supplied by the issuer. InfraShader does not generate maintenance "
            "recommendations; frequencies and responsibilities are stated assumptions."
        ),
        "tasks": [task.model_dump() for task in tasks],
    }
