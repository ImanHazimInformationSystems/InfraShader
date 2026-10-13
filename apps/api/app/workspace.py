"""Organisation-scoped, revisioned ground geometry and independent scenarios."""

from copy import deepcopy
from dataclasses import asdict
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from shapely.geometry import Point, box, shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.geometry import (
    GeometryValidationError,
    Provenance,
    calculate_geographic_quantity,
    count_quantity,
    project_wgs84_geometry,
    select_active_quantity,
)
from app.errors import APIError, not_found
from app.models import Project, Workspace, WorkspaceRevision
from app.projects import require_membership

ScenarioKey = Literal["baseline", "option_a", "option_b"]
Text = Annotated[str, Field(min_length=1, max_length=2000)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class Target(StrictModel):
    id: UUID
    name: Annotated[str, Field(min_length=1, max_length=160)]
    geometry: dict[str, Any]
    source_note: Text
    provenance: Provenance


class WorkItem(StrictModel):
    id: UUID
    name: Annotated[str, Field(min_length=1, max_length=160)]
    kind: Literal["area", "path", "building", "canopy", "tree", "bench", "manual"]
    status: Literal["existing", "proposed"] = "proposed"
    geometry: dict[str, Any] | None = None
    count: Annotated[int, Field(strict=True, ge=1, le=1000000)] = 1
    height_m: Annotated[float, Field(gt=0, le=100)] | None = None
    height_source: Annotated[str, Field(max_length=2000)] = ""
    quantity_override: Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=4)] | None = (
        None
    )
    provenance: Provenance
    source_note: Text
    rate_id: UUID | None = None
    category: Annotated[str, Field(min_length=1, max_length=80)] = "General"
    visible: bool = True
    crown_diameter_m: Annotated[float, Field(gt=0, le=100)] | None = None

    @model_validator(mode="after")
    def tree_metadata(self):
        if self.crown_diameter_m is not None and self.kind != "tree":
            raise ValueError("Crown diameter applies only to trees; tree shade is excluded.")
        return self


class Scenario(StrictModel):
    name: Annotated[str, Field(min_length=1, max_length=160)]
    items: Annotated[list[WorkItem], Field(max_length=150)] = []


class WorkspaceInput(StrictModel):
    expected_revision: Annotated[int, Field(ge=0)]
    source_crs: Literal["EPSG:4326"] = "EPSG:4326"
    boundary: dict[str, Any]
    boundary_provenance: Provenance
    boundary_source: Text
    targets: Annotated[list[Target], Field(max_length=20)] = []
    scenarios: dict[ScenarioKey, Scenario]

    @model_validator(mode="after")
    def require_three_scenarios(self):
        if set(self.scenarios) != {"baseline", "option_a", "option_b"}:
            raise ValueError("Supply baseline, option_a and option_b independently.")
        ids = [target.id for target in self.targets]
        if len(ids) != len(set(ids)):
            raise ValueError("Target IDs must be unique.")
        for scenario in self.scenarios.values():
            ids = [item.id for item in scenario.items]
            if len(ids) != len(set(ids)):
                raise ValueError("Item IDs must be unique within each scenario.")
        if any(item.status != "existing" for item in self.scenarios["baseline"].items):
            raise ValueError(
                "Baseline may contain existing items only; put proposals in an option."
            )
        return self


def validate_workspace(data: WorkspaceInput, site_bounds: tuple | list) -> dict:
    try:
        projected = project_wgs84_geometry(data.boundary, source_crs=data.source_crs)
        if projected.geometry.geom_type != "Polygon":
            raise GeometryValidationError("The site boundary must be a Polygon.")
        boundary = shape(data.boundary)
        if not box(*site_bounds).covers(boundary):
            raise GeometryValidationError("The boundary must stay within the project site locator.")
        result = data.model_dump(mode="json", exclude={"expected_revision"})
        result["metric_crs"] = projected.metric_crs
        for target in result["targets"]:
            quantity = calculate_geographic_quantity(
                target["geometry"], source_crs=data.source_crs, site_boundary=data.boundary
            )
            if quantity.unit != "m2":
                raise GeometryValidationError("A target must be a Polygon.")
            target["area_m2"] = quantity.value
        for scenario in result["scenarios"].values():
            for item in scenario["items"]:
                kind, geometry = item["kind"], item["geometry"]
                if kind in ("tree", "bench"):
                    if not isinstance(geometry, dict) or geometry.get("type") != "Point":
                        raise GeometryValidationError("Trees and benches need a Point location.")
                    coordinates = geometry.get("coordinates")
                    if (
                        not isinstance(coordinates, list)
                        or len(coordinates) != 2
                        or any(
                            isinstance(n, bool) or not isinstance(n, (int, float))
                            for n in coordinates
                        )
                        or not boundary.covers(Point(coordinates))
                    ):
                        raise GeometryValidationError(
                            "Point must be finite and inside the boundary."
                        )
                    quantity = count_quantity(item["count"])
                elif kind == "manual":
                    if geometry is not None:
                        raise GeometryValidationError(
                            "Manual count items must not claim map geometry."
                        )
                    quantity = count_quantity(item["count"])
                else:
                    quantity = calculate_geographic_quantity(
                        geometry, source_crs=data.source_crs, site_boundary=data.boundary
                    )
                    expected_unit = "m" if kind == "path" else "m2"
                    if quantity.unit != expected_unit:
                        raise GeometryValidationError(f"{kind} requires {expected_unit} geometry.")
                if (kind == "canopy" and item["height_m"] is None) or (
                    kind in ("building", "canopy")
                    and item["height_m"] is not None
                    and not item["height_source"]
                ):
                    raise GeometryValidationError(
                        "Known heights need a source; canopy roofs require a known height."
                    )
                active = select_active_quantity(
                    quantity,
                    provenance=item["provenance"],
                    source_note=item["source_note"],
                    override=None
                    if item["quantity_override"] is None
                    else float(item["quantity_override"]),
                )
                item["quantity"] = asdict(active)
        return result
    except (GeometryValidationError, ValueError, TypeError) as exc:
        raise APIError(422, "invalid_geometry", str(exc)) from exc


def project_for_workspace(
    session: Session, org_id: UUID, project_id: UUID, user_id: UUID, *, write: bool = False
) -> Project:
    require_membership(session, org_id, user_id)
    query = select(Project).where(Project.id == project_id, Project.organisation_id == org_id)
    if write:
        query = query.with_for_update()
    project = session.scalar(query)
    if project is None:
        raise not_found()
    if write and project.archived:
        raise APIError(409, "project_archived", "Restore the project before editing its workspace.")
    return project


def get_workspace(session: Session, org_id: UUID, project_id: UUID, user_id: UUID) -> dict:
    project_for_workspace(session, org_id, project_id, user_id)
    saved = session.get(Workspace, project_id)
    return {"revision": saved.revision if saved else 0, "data": saved.data if saved else None}


def save_workspace(
    session: Session, org_id: UUID, project_id: UUID, user_id: UUID, data: WorkspaceInput
) -> dict:
    project = project_for_workspace(session, org_id, project_id, user_id, write=True)
    saved = session.get(Workspace, project_id)
    revision = saved.revision if saved else 0
    if data.expected_revision != revision:
        raise APIError(
            409, "revision_conflict", "The workspace changed. Reload before saving again."
        )
    canonical = validate_workspace(data, project.site["bounds"])
    if saved is None:
        saved = Workspace(project_id=project_id, revision=1, data=canonical, updated_by=user_id)
        session.add(saved)
    else:
        saved.data, saved.revision, saved.updated_by = canonical, revision + 1, user_id
    response = {"revision": revision + 1, "data": canonical}
    session.add(
        WorkspaceRevision(
            project_id=project_id, revision=revision + 1, payload=canonical, changed_by=user_id
        )
    )
    session.commit()
    return response


def workspace_history(session, org_id, project_id, user_id, offset=0):
    project_for_workspace(session, org_id, project_id, user_id)
    rows = session.scalars(
        select(WorkspaceRevision)
        .where(WorkspaceRevision.project_id == project_id)
        .order_by(WorkspaceRevision.revision.desc())
        .limit(20)
        .offset(offset)
    ).all()
    return {
        "items": [
            {
                "revision": row.revision,
                "created_at": row.created_at,
                "changed_by": str(row.changed_by),
                "data": row.payload,
            }
            for row in rows
        ],
        "offset": offset,
        "limit": 20,
    }


def restore_workspace(session, org_id, project_id, user_id, revision, expected_revision):
    project_for_workspace(session, org_id, project_id, user_id, write=True)
    previous = session.get(WorkspaceRevision, (project_id, revision))
    if previous is None:
        raise not_found()
    draft = deepcopy(previous.payload)
    draft.pop("metric_crs", None)
    for target in draft["targets"]:
        target.pop("area_m2", None)
    for scenario in draft["scenarios"].values():
        for item in scenario["items"]:
            item.pop("quantity", None)
    draft["expected_revision"] = expected_revision
    return save_workspace(session, org_id, project_id, user_id, WorkspaceInput(**draft))


class RectangleInput(StrictModel):
    longitude: Annotated[float, Field(ge=-180, le=180)]
    latitude: Annotated[float, Field(ge=-80, le=84)]
    width_m: Annotated[float, Field(gt=0, le=1000)]
    length_m: Annotated[float, Field(gt=0, le=1000)]
    rotation_deg: Annotated[float, Field(ge=0, lt=360)] = 0


def rectangle_preview(session, org_id, project_id, user_id, data: RectangleInput):
    from math import cos, floor, radians, sin

    from pyproj import Transformer

    project_for_workspace(session, org_id, project_id, user_id)
    zone = min(60, max(1, floor((data.longitude + 180) / 6) + 1))
    crs = f"EPSG:{(32600 if data.latitude >= 0 else 32700) + zone}"
    forward = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    inverse = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    cx, cy = forward.transform(data.longitude, data.latitude)
    angle = radians(data.rotation_deg)
    coordinates = []
    for x, y in [
        (-data.width_m / 2, -data.length_m / 2),
        (data.width_m / 2, -data.length_m / 2),
        (data.width_m / 2, data.length_m / 2),
        (-data.width_m / 2, data.length_m / 2),
    ]:
        coordinates.append(
            list(
                inverse.transform(
                    cx + x * cos(angle) + y * sin(angle), cy - x * sin(angle) + y * cos(angle)
                )
            )
        )
    coordinates.append(coordinates[0])
    geometry = {"type": "Polygon", "coordinates": [coordinates]}
    checked = project_wgs84_geometry(geometry, source_crs="EPSG:4326")
    return {
        "geometry": geometry,
        "metric_crs": checked.metric_crs,
        "rotation_reference": "Clockwise from projected grid north",
    }
