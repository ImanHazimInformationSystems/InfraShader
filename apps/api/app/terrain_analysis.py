"""Model-relative earthworks and a bounded, mass-conserving surface-water screening model."""

from math import ceil, sqrt
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field
from shapely.geometry import Polygon, box, mapping

from app.domain.geometry import project_wgs84_geometry
from app.errors import APIError
from app.terrain import Terrain, pond_footprint, signature
from app.workspace import StrictModel

METHOD = "terrain-tin-ground-reference/v1; cell-storage-manning-routing/v1"


class Outlet(StrictModel):
    row: Annotated[int, Field(ge=0, le=31)]
    column: Annotated[int, Field(ge=0, le=31)]
    capacity_ls: Annotated[float, Field(gt=0, le=10000)]
    invert_m: Annotated[float, Field(ge=-500, le=9000)]


class StudyInput(StrictModel):
    expected_revision: Annotated[int, Field(ge=1)]
    request_key: UUID
    scenario: Literal["baseline", "option_a", "option_b"] = "option_a"
    rainfall_mmh: Annotated[float, Field(ge=0, le=500)]
    duration_minutes: Annotated[int, Field(ge=1, le=120)]
    step_seconds: Annotated[float, Field(ge=1, le=10)] = 5
    infiltration_mmh: Annotated[float, Field(ge=0, le=500)]
    roughness_n: Annotated[float, Field(ge=0.01, le=1)]
    source: Annotated[str, Field(min_length=10, max_length=2000)]
    outlets: Annotated[list[Outlet], Field(max_length=8)] = []


def triangles(t, reference=False):
    w, s, e, n = t.bounds
    for y in range(t.size - 1):
        for x in range(t.size - 1):
            ids = [
                y * t.size + x,
                y * t.size + x + 1,
                (y + 1) * t.size + x,
                (y + 1) * t.size + x + 1,
            ]
            for indexes in ((0, 2, 1), (1, 2, 3)):
                yield [
                    (
                        w + (ids[i] % t.size) / (t.size - 1) * (e - w),
                        n - (ids[i] // t.size) / (t.size - 1) * (n - s),
                        (
                            t.reference_heights[ids[i]]
                            if t.reference_heights is not None
                            else t.base_elevation
                        )
                        if reference
                        else t.heights[ids[i]],
                    )
                    for i in indexes
                ]


def integral(vertices, clip, *, positive=False):
    """Exact integral of a linear triangle field over its clipped positive polygon."""
    a, b, c = vertices
    determinant = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])
    ax = ((b[2] - a[2]) * (c[1] - a[1]) - (c[2] - a[2]) * (b[1] - a[1])) / determinant
    ay = ((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / determinant
    points = vertices
    if positive:
        points = []
        for i, p in enumerate(vertices):
            q = vertices[(i + 1) % 3]
            if p[2] >= 0:
                points.append(p)
            if (p[2] < 0) != (q[2] < 0):
                f = p[2] / (p[2] - q[2])
                points.append((p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1]), 0))
    if len(points) < 3:
        return 0.0
    polygon = Polygon([(p[0], p[1]) for p in points]).intersection(clip)
    if polygon.is_empty or polygon.area < 1e-10:
        return 0.0
    center = polygon.centroid
    return polygon.area * (a[2] + ax * (center.x - a[0]) + ay * (center.y - a[1]))


def earthworks(t, boundary):
    cut = fill = 0.0
    ponds = [pond_footprint(t, pond).intersection(boundary) for pond in t.ponds]
    for i, p in enumerate(ponds):
        if any(p.intersection(other).area > 1e-6 for other in ponds[:i]):
            raise ValueError("Pond water areas overlap; separate them before storage analysis.")
    storage = [0.0] * len(ponds)
    for tri, original in zip(triangles(t), triangles(t, reference=True), strict=True):
        fill += integral(
            [(x, y, h - original[i][2]) for i, (x, y, h) in enumerate(tri)], boundary, positive=True
        )
        cut += integral(
            [(x, y, original[i][2] - h) for i, (x, y, h) in enumerate(tri)], boundary, positive=True
        )
        for i, pond in enumerate(t.ponds):
            storage[i] += integral(
                [(x, y, pond.water_level - h) for x, y, h in tri], ponds[i], positive=True
            )
    return {
        "cut_m3": round(cut, 6),
        "fill_m3": round(fill, 6),
        "net_fill_m3": round(fill - cut, 6),
        "site_area_m2": boundary.area,
        "ponds": [
            {"name": pond.name, "storage_m3": round(storage[i], 6)}
            for i, pond in enumerate(t.ponds)
        ],
        "reference": (
            f"Supplied existing-ground grid; {t.datum}; {t.reference_source}"
            if t.reference_heights is not None
            else f"Declared original flat surface {t.base_elevation} m; {t.datum}; {t.source}"
        ),
        "method": (
            "Positive/negative piecewise-linear TIN integration clipped to projected site; "
            "circle water approximated by 128 edges. In-situ geometric volumes; "
            "no bulking, compaction or topsoil allowances."
        ),
    }


def runoff(t, boundary, inputs):
    w, s, e, n = t.bounds
    dx, dy = (e - w) / (t.size - 1), (n - s) / (t.size - 1)
    cells, lookup = [], {}
    for row in range(t.size - 1):
        for col in range(t.size - 1):
            region = box(
                w + col * dx, n - (row + 1) * dy, w + (col + 1) * dx, n - row * dy
            ).intersection(boundary)
            if region.area < 1e-8:
                continue
            if region.geom_type != "Polygon":
                raise ValueError(
                    "A runoff cell has disconnected site fragments; "
                    "use a simpler boundary or finer grid."
                )
            a = row * t.size + col
            ids = [a, a + 1, a + t.size, a + t.size + 1]
            vertices = [(w + (i % t.size) * dx, n - (i // t.size) * dy, t.heights[i]) for i in ids]
            tris = [[vertices[i] for i in indexes] for indexes in ((0, 2, 1), (1, 2, 3))]
            bed = sum(integral(tri, region) for tri in tris) / region.area
            initial = 0.0
            for pond in t.ponds:
                wet = pond_footprint(t, pond).intersection(region)
                initial += sum(
                    integral([(x, y, pond.water_level - h) for x, y, h in tri], wet, positive=True)
                    for tri in tris
                )
            lookup[(row, col)] = len(cells)
            cells.append(
                {
                    "row": row,
                    "column": col,
                    "area": region.area,
                    "bed_m": bed,
                    "polygon": region,
                    "volume": initial,
                }
            )
    edges = []
    for (row, col), i in lookup.items():
        for key, distance in (((row + 1, col), dy), ((row, col + 1), dx)):
            if key not in lookup:
                continue
            j = lookup[key]
            width = cells[i]["polygon"].boundary.intersection(cells[j]["polygon"].boundary).length
            if width > 1e-8:
                edges.append((i, j, width, distance))
    drains = []
    seen = set()
    for outlet in inputs.outlets:
        key = (outlet.row, outlet.column)
        if key not in lookup or key in seen:
            raise ValueError("Each drain must use a distinct active grid cell inside the site.")
        seen.add(key)
        drains.append((lookup[key], outlet.capacity_ls / 1000, outlet.invert_m))
    area = sum(cell["area"] for cell in cells)
    initial = sum(cell["volume"] for cell in cells)
    rainfall = infiltration = discharged = peak = 0.0
    frames = []
    steps = ceil(inputs.duration_minutes * 60 / inputs.step_seconds)
    dt = inputs.duration_minutes * 60 / steps
    limited = 0

    def frame(seconds, destinations):
        frames.append(
            {
                "seconds": seconds,
                "depths_m": [round(c["volume"] / c["area"], 6) for c in cells],
                "flow_to": destinations,
            }
        )

    frame(0, [-1] * len(cells))
    for step in range(steps):
        add = inputs.rainfall_mmh / 1000 / 3600 * dt
        rainfall += add * area
        for c in cells:
            c["volume"] += add * c["area"]
            loss = min(c["volume"], inputs.infiltration_mmh / 1000 / 3600 * dt * c["area"])
            infiltration += loss
            c["volume"] -= loss
        surfaces = [c["bed_m"] + c["volume"] / c["area"] for c in cells]
        outgoing = [0.0] * len(cells)
        transfers = []
        destinations = [-1] * len(cells)
        greatest = [0.0] * len(cells)
        for a, b, width, distance in edges:
            high, low = (a, b) if surfaces[a] > surfaces[b] else (b, a)
            head = surfaces[high] - surfaces[low]
            depth = max(0, surfaces[high] - max(cells[high]["bed_m"], cells[low]["bed_m"]))
            if head <= 1e-10 or depth <= 1e-10:
                continue
            proposed = width / inputs.roughness_n * depth ** (5 / 3) * sqrt(head / distance) * dt
            cap = 0.25 * head / (1 / cells[high]["area"] + 1 / cells[low]["area"])
            transfer = min(proposed, cap)
            limited += proposed > cap
            transfers.append((high, low, transfer))
            outgoing[high] += transfer
        delta = [0.0] * len(cells)
        for high, low, volume in transfers:
            volume *= min(1, cells[high]["volume"] / max(outgoing[high], 1e-30))
            delta[high] -= volume
            delta[low] += volume
            if volume > greatest[high]:
                greatest[high] = volume
                destinations[high] = low
        for i, c in enumerate(cells):
            c["volume"] = max(0, c["volume"] + delta[i])
        drained_step = 0.0
        for i, capacity, invert in drains:
            c = cells[i]
            available = max(0, c["volume"] - max(0, invert - c["bed_m"]) * c["area"])
            amount = min(available, capacity * dt)
            c["volume"] -= amount
            discharged += amount
            drained_step += amount
        peak = max(peak, drained_step / dt * 1000)
        if (step + 1) % max(1, steps // 12) == 0 or step == steps - 1:
            frame((step + 1) * dt, destinations)
    final = sum(c["volume"] for c in cells)
    error = initial + rainfall - infiltration - discharged - final
    if abs(error) > max(1e-6, (initial + rainfall) * 1e-8):
        raise ValueError("Surface-water mass balance failed; no usable result was produced.")
    return {
        "initial_water_m3": initial,
        "rain_m3": rainfall,
        "infiltrated_m3": infiltration,
        "discharged_m3": discharged,
        "remaining_m3": final,
        "balance_error_m3": error,
        "peak_outlet_ls": peak,
        "limited_transfers": limited,
        "time_step_s": dt,
        "cells": [
            {
                "row": c["row"],
                "column": c["column"],
                "bed_m": c["bed_m"],
                "geometry": mapping(c["polygon"]),
            }
            for c in cells
        ],
        "frames": frames,
        "method": (
            "Uniform rain; constant wet-surface infiltration; cell-average ground; "
            "four-neighbour Manning transfer with nonnegative-volume and quarter-equilibrium "
            "limiters; closed boundary except listed constant-capacity drains. "
            "No external inflow, pipes, backwater or momentum. Limiter use and grid/time "
            "resolution affect travel times; screening only."
        ),
    }


def create_study(session, org, project_id, user, data):
    from app import access
    from app.calculations import artifact_response, current_workspace, prior_request, save_artifact
    from app.workspace import project_for_workspace

    access.require_project(session, org, project_id, user, "analyse")
    project = project_for_workspace(session, org, project_id, user, write=True)
    workspace = current_workspace(session, project_id, data.expected_revision)
    if data.scenario not in workspace.data["scenarios"]:
        raise APIError(422, "terrain_input", "Select an existing scenario.")
    previous = prior_request(session, project_id, "terrain_study", data.request_key)
    if previous:
        return artifact_response(previous, workspace.revision, project.revision)
    raw = workspace.data["scenarios"][data.scenario].get("terrain")
    if not raw:
        raise APIError(422, "terrain_input", "Save a declared terrain surface first.")
    terrain = Terrain(**raw)
    boundary = project_wgs84_geometry(workspace.data["boundary"], source_crs="EPSG:4326").geometry
    try:
        quantities = earthworks(terrain, boundary)
        water = runoff(terrain, boundary, data)
    except ValueError as exc:
        raise APIError(422, "terrain_input", str(exc)) from exc
    payload = {
        "method": METHOD,
        "scenario": data.scenario,
        "terrain_signature": signature(raw),
        "inputs": data.model_dump(mode="json"),
        "quantities": quantities,
        "water": water,
        "metric_crs": terrain.metric_crs,
        "datum": terrain.datum,
        "source": terrain.source,
    }
    return save_artifact(
        session, project, workspace, user, "terrain_study", data.request_key, payload
    )


def list_studies(session, org, project_id, user):
    from sqlalchemy import select

    from app.calculations import artifact_response
    from app.models import Artifact, Workspace
    from app.workspace import project_for_workspace

    project = project_for_workspace(session, org, project_id, user)
    workspace = session.get(Workspace, project_id)
    records = session.scalars(
        select(Artifact)
        .where(Artifact.project_id == project_id, Artifact.kind == "terrain_study")
        .order_by(Artifact.created_at.desc())
        .limit(20)
    ).all()
    return {
        "items": [
            artifact_response(record, workspace.revision if workspace else 0, project.revision)
            for record in records
        ]
    }
