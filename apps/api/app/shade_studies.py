"""Bounded duration-weighted ground-shade studies; never a comfort index."""

from datetime import UTC, timedelta
from math import ceil
from typing import Annotated
from uuid import UUID

from pydantic import AwareDatetime, Field, model_validator
from pyproj import Transformer
from shapely import box, transform, union_all
from shapely.geometry import mapping, shape
from sqlalchemy import select

from app import access, calculations
from app.domain.geometry import project_wgs84_geometry
from app.domain.shade import MODEL, analyse_workspace
from app.errors import APIError
from app.models import Artifact, Workspace
from app.workspace import StrictModel, project_for_workspace

METHOD = "duration_midpoint_target_grid_v1/" + MODEL


class Band(StrictModel):
    name: Annotated[str, Field(min_length=1, max_length=80)]
    start: AwareDatetime
    end: AwareDatetime


class StudyInput(calculations.CalculationInput):
    target_id: UUID
    bands: Annotated[list[Band], Field(min_length=1, max_length=4)]
    step_minutes: Annotated[int, Field(ge=15, le=120)] = 60

    @model_validator(mode="after")
    def bounded(self):
        ordered = sorted(self.bands, key=lambda b: b.start.astimezone(UTC))
        count = 0
        for index, band in enumerate(ordered):
            seconds = (band.end.astimezone(UTC) - band.start.astimezone(UTC)).total_seconds()
            if not 0 < seconds <= 86400:
                raise ValueError("Each use band must be positive and at most 24 hours.")
            if not 2000 <= band.start.year <= 2100 or not 2000 <= band.end.year <= 2100:
                raise ValueError("Supported study years are 2000-2100.")
            if index and band.start < ordered[index - 1].end:
                raise ValueError("Use-time bands must not overlap.")
            count += ceil(seconds / (60 * self.step_minutes))
        if count > 32:
            raise ValueError("At most 32 samples per study; shorten bands or increase the step.")
        return self


def samples(data: StudyInput):
    for band in data.bands:
        start, end = band.start.astimezone(UTC), band.end.astimezone(UTC)
        while start < end:
            stop = min(end, start + timedelta(minutes=data.step_minutes))
            yield band.name, start + (stop - start) / 2, (stop - start).total_seconds() / 60
            start = stop


def polygon_parts(geometry):
    if geometry.geom_type == "Polygon":
        return [geometry]
    return [part for child in getattr(geometry, "geoms", []) for part in polygon_parts(child)]


def calculate(workspace, data: StudyInput):
    target = next((t for t in workspace["targets"] if t["id"] == str(data.target_id)), None)
    if target is None:
        raise ValueError("Select a saved target zone.")
    projected = project_wgs84_geometry(
        target["geometry"], source_crs="EPSG:4326", site_boundary=workspace["boundary"]
    )
    forward = Transformer.from_crs("EPSG:4326", projected.metric_crs, always_xy=True)
    inverse = Transformer.from_crs(projected.metric_crs, "EPSG:4326", always_xy=True)
    west, south, east, north = projected.geometry.bounds
    cells = []
    for y in range(10):
        for x in range(10):
            cell = box(
                west + (east - west) * x / 10,
                south + (north - south) * y / 10,
                west + (east - west) * (x + 1) / 10,
                south + (north - south) * (y + 1) / 10,
            )
            cell = union_all(polygon_parts(cell.intersection(projected.geometry)))
            if cell.area > 1e-8:
                cells.append(cell)
    keys = tuple(workspace["scenarios"])
    totals = {
        k: {
            "area_minutes": 0.0,
            "existing": 0.0,
            "additional_buildings": 0.0,
            "additional_canopies": 0.0,
        }
        for k in keys
    }
    source_totals = {k: {} for k in keys}
    heat = {k: [0.0] * len(cells) for k in keys}
    rows, supported, night, low = [], 0.0, 0.0, 0.0
    first = None
    for band, timestamp, minutes in samples(data):
        result = analyse_workspace(workspace, timestamp, str(data.target_id), contributions=True)
        first = first or result
        row = {
            "band": band,
            "timestamp": timestamp.isoformat(),
            "minutes": minutes,
            "status": result["status"],
            "solar": result["solar"],
            "scenarios": {},
        }
        rows.append(row)
        if result["status"] != "modeled":
            if result["status"] == "night":
                night += minutes
            else:
                low += minutes
            continue
        supported += minutes
        for key, scenario in result["scenarios"].items():
            row["scenarios"][key] = {
                k: scenario[k] for k in ("area_m2", "coverage_percent", "contributions_m2")
            }
            totals[key]["area_minutes"] += scenario["area_m2"] * minutes
            for source_id, area in scenario["source_areas_m2"].items():
                source_totals[key][source_id] = (
                    source_totals[key].get(source_id, 0.0) + area * minutes
                )
            for part, area in scenario["contributions_m2"].items():
                totals[key][part] += area * minutes
            shadow = transform(
                shape(scenario["shadow_geometry"]), forward.transform, interleaved=False
            )
            for index, cell in enumerate(cells):
                heat[key][index] += cell.intersection(shadow).area / cell.area * minutes
    scenarios = {}
    for key in keys:
        coverage = (
            100 * totals[key]["area_minutes"] / (projected.geometry.area * supported)
            if supported
            else None
        )
        scenarios[key] = {
            "name": workspace["scenarios"][key]["name"],
            "mean_coverage_percent": coverage,
            "shaded_area_hours": totals[key]["area_minutes"] / 60,
            "contributions_area_hours": {
                p: v / 60 for p, v in totals[key].items() if p != "area_minutes"
            },
            "heatmap": [
                {
                    "type": "Feature",
                    "geometry": mapping(transform(cell, inverse.transform, interleaved=False)),
                    "properties": {
                        "kind": "shadow",
                        "coverage_percent": min(100.0, max(0.0, value / supported * 100)),
                        "color": "#"
                        + (
                            "174d3d"
                            if value / supported >= 0.75
                            else "528b64"
                            if value / supported >= 0.5
                            else "a9bc70"
                            if value / supported >= 0.25
                            else "ede5b8"
                        ),
                    },
                }
                for cell, value in zip(cells, heat[key], strict=True)
            ]
            if supported
            else [],
        }
    return {
        "method": METHOD,
        "engine_versions": first["engine_versions"],
        "request": data.model_dump(mode="json", exclude={"request_key", "expected_revision"}),
        "target": {
            "id": target["id"],
            "name": target["name"],
            "area_m2": projected.geometry.area,
            "source_note": target["source_note"],
            "geometry": target["geometry"],
        },
        "metric_crs": projected.metric_crs,
        "samples": rows,
        "scenarios": scenarios,
        "supported_minutes": supported,
        "night_minutes": night,
        "low_sun_minutes": low,
        "complete": low == 0 and supported > 0,
        "sources": [
            {
                **source,
                "standalone_area_hours": source_totals[source["scenario"]].get(source["id"], 0.0)
                / 60,
            }
            for source in first["inputs"]
        ],
        "excluded": sorted(
            {
                i["name"]
                for s in workspace["scenarios"].values()
                for i in s["items"]
                if i["kind"] in ("tree", "object")
            }
        ),
        "limitations": first["limitations"]
        + [
            "Duration-weighted midpoint samples; no interpolation or exact shade-duration claim.",
            "Means and cell colours use supported daylight minutes only; "
            "night/low sun are not zero shade.",
            "10 by 10 target-bounds grid clipped to target; colour is mean area fraction "
            "per cell, not a point-duration guarantee.",
            "Contribution order: shared Baseline, additional buildings, additional canopies; "
            "overlaps counted once.",
            "Standalone source area-time values overlap and must not be summed.",
            "Shade is not temperature, thermal comfort, weather, or a comfort index.",
        ],
    }


def run(session, org_id, project_id, user_id, data: StudyInput):
    access.require_project(session, org_id, project_id, user_id, "analyse")
    project = project_for_workspace(session, org_id, project_id, user_id, write=True)
    workspace = calculations.current_workspace(session, project_id, data.expected_revision)
    previous = calculations.prior_request(session, project_id, "shade_study", data.request_key)
    if previous:
        signature = data.model_dump(mode="json", exclude={"request_key", "expected_revision"})
        if previous.payload["request"] != signature:
            raise APIError(409, "study_request", "This request key belongs to a different study.")
        return calculations.artifact_response(previous, workspace.revision, project.revision)
    try:
        payload = calculate(workspace.data, data)
    except ValueError as error:
        raise APIError(422, "shade_study", str(error)) from error
    return calculations.save_artifact(
        session, project, workspace, user_id, "shade_study", data.request_key, payload
    )


def list_saved(session, org_id, project_id, user_id):
    project = project_for_workspace(session, org_id, project_id, user_id)
    workspace = session.get(Workspace, project_id)
    records = session.scalars(
        select(Artifact)
        .where(Artifact.project_id == project_id, Artifact.kind == "shade_study")
        .order_by(Artifact.created_at.desc())
        .limit(30)
    ).all()
    return {
        "items": [
            calculations.artifact_response(
                r, workspace.revision if workspace else 0, project.revision
            )
            for r in records
        ]
    }
