"""Organisation-scoped, revisioned ground geometry and independent scenarios."""

from copy import deepcopy
from dataclasses import asdict, replace
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from shapely.geometry import Point, box, shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import access
from app.domain.geometry import (
    GeometryValidationError,
    Provenance,
    calculate_geographic_quantity,
    count_quantity,
    project_wgs84_geometry,
    select_active_quantity,
)
from app.errors import APIError, not_found
from app.ground_paint import GroundStroke, validate_paint
from app.models import Evidence, Project, Workspace, WorkspaceRevision
from app.object_palette import ObjectInstance, place
from app.plan_reference import PlanReference, calibrate
from app.roadwork import RoadRoute, footprint
from app.schedules import Assembly, Plant, derive
from app.site_constraints import SiteConstraint, validate_constraints
from app.terrain import Terrain, TerrainWork, anchors, signature, validate_frame
from app.tree_design import TreeDesign

ScenarioKey = Literal["baseline", "option_a", "option_b"]
Text = Annotated[str, Field(min_length=1, max_length=2000)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class Target(StrictModel):
    reference_calibration: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")] | None = None
    id: UUID
    name: Annotated[str, Field(min_length=1, max_length=160)]
    geometry: dict[str, Any]
    source_note: Text
    provenance: Provenance


class EditorDimensions(StrictModel):
    width_m: Annotated[float, Field(gt=0, le=5000)]
    depth_m: Annotated[float, Field(gt=0, le=5000)]


class WorkItem(StrictModel):
    terrain_work: TerrainWork | None = None
    terrain_work_stale: bool = Field(default=False, exclude=True)
    tree_design: TreeDesign | None = None
    layout_plant: Literal["tree", "shrub", "flowers"] | None = None
    plant_variant: Literal["leafy", "hedge", "grass", "daisy", "tulip", "lavender"] | None = None
    road: RoadRoute | None = None
    editor_dimensions: EditorDimensions | None = None
    editor_locked: bool = False
    editor_group: Annotated[str, Field(max_length=80)] = ""
    pricing_status: Literal["firm", "optional", "provisional"] = "firm"
    plant: Plant | None = None
    assembly: Assembly | None = None
    object_instance: ObjectInstance | None = None
    reference_calibration: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")] | None = None
    manual_basis: Literal["count", "fixed"] = "count"
    id: UUID
    name: Annotated[str, Field(min_length=1, max_length=160)]
    kind: Literal["area", "path", "building", "canopy", "tree", "bench", "manual", "object"]
    status: Literal["existing", "proposed"] = "proposed"
    geometry: dict[str, Any] | None = None
    count: Annotated[int, Field(strict=True, ge=0, le=1000000)] = 1
    height_m: Annotated[float, Field(gt=0, le=100)] | None = None
    height_source: Annotated[str, Field(max_length=2000)] = ""
    quantity_override: Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=4)] | None = (
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
        if self.terrain_work and (
            self.kind != "manual"
            or self.status != "proposed"
            or self.geometry is not None
            or self.quantity_override is not None
            or self.assembly
            or self.plant
            or self.manual_basis != "count"
        ):
            raise ValueError(
                "Site work uses an explicit manual resource quantity without geometry."
            )
        if self.plant_variant and (
            self.layout_plant
            != ("shrub" if self.plant_variant in ("leafy", "hedge", "grass") else "flowers")
            or self.status != "proposed"
        ):
            raise ValueError("Choose a model matching the proposed shrub or flower planting.")
        if self.tree_design:
            if self.kind != "tree" or self.status != "proposed" or self.count != 1:
                raise ValueError("Planted tree models require one proposed tree per location.")
            if self.layout_plant != "tree" or self.quantity_override is not None or self.assembly:
                raise ValueError("Planted tree models use explicit tree counts, not area recipes.")
            if self.rate_id and (
                not self.tree_design.stock_spec or not self.tree_design.rate_reviewed
            ):
                raise ValueError("Specify purchased tree stock and review the selected rate first.")
        if self.layout_plant and self.kind != "tree":
            raise ValueError("Concept planting markers require tree/count geometry.")
        if self.road and (
            self.kind != "area"
            or self.status != "proposed"
            or self.plant is not None
            or self.quantity_override is not None
            or (self.assembly is not None and self.assembly.use != "road")
            or self.rate_id is not None
        ):
            raise ValueError(
                "Road routes require proposed area scope, no quantity override, "
                "and explicit road layers with component rates."
            )
        if (self.kind == "object") != (self.object_instance is not None):
            raise ValueError(
                "Object items require a preset instance; other item kinds cannot carry one."
            )
        if self.manual_basis == "fixed" and (
            self.kind != "manual"
            or self.count != 1
            or self.quantity_override not in (None, Decimal(1))
        ):
            raise ValueError(
                "Fixed-price scope needs a manual item, quantity one and no different override."
            )
        if self.crown_diameter_m is not None and self.kind != "tree":
            raise ValueError("Crown diameter applies only to trees; tree shade is excluded.")
        return self


class Scenario(StrictModel):
    terrain_signature: str | None = Field(default=None, exclude=True)
    ground_paint: Annotated[list[GroundStroke], Field(max_length=128)] = []
    terrain: Terrain | None = None
    name: Annotated[str, Field(min_length=1, max_length=160)]
    items: Annotated[list[WorkItem], Field(max_length=150)] = []


class WorkspaceInput(StrictModel):
    # Accept round-tripped display metadata, but always discard and recalculate it.
    boundary_area_m2: Annotated[float | None, Field(ge=0, exclude=True)] = None
    constraints: Annotated[list[SiteConstraint], Field(max_length=100)] = []
    plan_reference: PlanReference | None = None
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
        if len(data.boundary["coordinates"]) != 1:
            raise GeometryValidationError(
                "Site boundaries require one exterior; cutouts belong to work areas."
            )
        boundary = shape(data.boundary)
        if not box(*site_bounds).covers(boundary):
            raise GeometryValidationError("The boundary must stay within the project site locator.")
        result = data.model_dump(mode="json", exclude={"expected_revision"})
        baseline = result["scenarios"]["baseline"]["items"]
        baseline_ids = {item["id"] for item in baseline}
        for key in ("option_a", "option_b"):
            own = result["scenarios"][key]["items"]
            if any(item["id"] in baseline_ids and item["status"] != "existing" for item in own):
                raise GeometryValidationError(
                    "Proposed items must have IDs distinct from Baseline."
                )
            result["scenarios"][key]["items"] = deepcopy(baseline) + [
                item for item in own if item["id"] not in baseline_ids
            ]
            if len(result["scenarios"][key]["items"]) > 150:
                raise GeometryValidationError(
                    "An option including Baseline may contain at most 150 items."
                )
        validate_constraints(
            data.constraints,
            data.boundary,
            {str(t.id) for t in data.targets}
            | {i["id"] for s in result["scenarios"].values() for i in s["items"]},
        )
        result["metric_crs"] = projected.metric_crs
        result["boundary_area_m2"] = projected.geometry.area
        reference = (
            calibrate(data.plan_reference, projected.metric_crs, site_bounds)
            if data.plan_reference
            else None
        )
        result["plan_reference"] = reference
        current_reference = reference["calibration_id"] if reference else None
        for target in result["targets"]:
            if len(target["geometry"].get("coordinates", [])) != 1:
                raise GeometryValidationError(
                    "Targets require a simple exterior; use work areas for cutouts."
                )
            if target.get("reference_calibration"):
                target["reference_review_required"] = (
                    target["reference_calibration"] != current_reference
                )
            quantity = calculate_geographic_quantity(
                target["geometry"], source_crs=data.source_crs, site_boundary=data.boundary
            )
            if quantity.unit != "m2":
                raise GeometryValidationError("A target must be a Polygon.")
            target["area_m2"] = quantity.value
        for scenario in result["scenarios"].values():
            scenario["terrain_signature"] = signature(scenario.get("terrain"))
            terrain_quantities = None
            for item in scenario["items"]:
                if item.get("road"):
                    item["geometry"] = footprint(RoadRoute(**item["road"]), projected.metric_crs)
                if item.get("reference_calibration"):
                    item["reference_review_required"] = (
                        item["reference_calibration"] != current_reference
                    )
                kind, geometry = item["kind"], item["geometry"]
                if (
                    geometry
                    and geometry.get("type") == "Polygon"
                    and len(geometry.get("coordinates", [])) > 1
                    and kind != "area"
                ):
                    raise GeometryValidationError(
                        "Cutouts are supported for work areas only; "
                        "building/canopy shade does not support courtyard holes."
                    )
                if kind == "object":
                    quantity = place(item, projected, boundary, scenario.get("terrain"))
                elif kind in ("tree", "bench"):
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
                    if item.get("terrain_work"):
                        work = item["terrain_work"]
                        if work["quantity_basis"] != "manual":
                            from app.terrain_analysis import earthworks

                            item["provenance"] = "calculated"

                            if not scenario.get("terrain"):
                                raise ValueError(
                                    "Automatic earthworks require a declared terrain surface."
                                )
                            if terrain_quantities is None:
                                terrain_quantities = earthworks(
                                    Terrain(**scenario["terrain"]), projected.geometry
                                )
                            work["quantity"] = str(
                                Decimal(
                                    str(terrain_quantities[f"{work['quantity_basis']}_m3"])
                                ).quantize(Decimal("0.0001"))
                            )
                        quantity = replace(
                            quantity,
                            value=float(work["quantity"]),
                            unit=work["unit"],
                            method="explicit_manual_site_work_not_terrain_volume"
                            if work["quantity_basis"] == "manual"
                            else f"clipped_tin_{work['quantity_basis']}_volume",
                        )
                        item["terrain_work_stale"] = (
                            not scenario["terrain_signature"]
                            or work["terrain_signature"] != scenario["terrain_signature"]
                        )
                        item["source_note"] = (
                            f"Manual {work['resource']}: {work['activity']}. Tools/resources: "
                            f"{work['tools']}. Assumptions: {work['assumptions']}. "
                            "Not calculated from concept terrain."
                        )
                        if work["quantity_basis"] != "manual":
                            ground_source = (
                                scenario["terrain"].get("reference_source")
                                or scenario["terrain"]["source"]
                            )[:200]
                            item["source_note"] = (
                                f"Model-derived {work['quantity_basis']} m3 relative to "
                                "declared original ground; clipped TIN integration, "
                                "in-situ geometry "
                                "only. No bulking/compaction allowances. "
                                f"Tools: {work['tools']}. Assumptions: {work['assumptions']}"
                                f". Ground source: {ground_source}; "
                                "full source retained with terrain."
                            )
                    if item["manual_basis"] == "fixed":
                        quantity = replace(quantity, method="explicit_fixed_price_scope")
                else:
                    quantity = calculate_geographic_quantity(
                        geometry, source_crs=data.source_crs, site_boundary=data.boundary
                    )
                    expected_unit = "m" if kind == "path" else "m2"
                    if quantity.unit != expected_unit:
                        raise GeometryValidationError(f"{kind} requires {expected_unit} geometry.")
                dimensions = item.get("editor_dimensions")
                if dimensions:
                    if kind not in ("area", "path", "building", "canopy"):
                        raise GeometryValidationError(
                            "Fixed grid dimensions require an ordinary area or path."
                        )
                    measured = project_wgs84_geometry(
                        geometry, source_crs=data.source_crs, site_boundary=data.boundary
                    ).geometry.bounds
                    if (
                        abs(measured[2] - measured[0] - dimensions["width_m"]) > 0.001
                        or abs(measured[3] - measured[1] - dimensions["depth_m"]) > 0.001
                    ):
                        raise GeometryValidationError(
                            "Fixed grid dimensions changed by more than 1 mm; "
                            "release the dimension constraint first."
                        )
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
                schedule = derive(item)
                if schedule:
                    item["schedule"] = schedule
            roads = [
                project_wgs84_geometry(item["geometry"], source_crs=data.source_crs).geometry
                for item in scenario["items"]
                if item["status"] == "proposed"
                and (item.get("road") or (item.get("assembly") or {}).get("use") == "road")
            ]
            for index, road in enumerate(roads):
                for other in roads[index + 1 :]:
                    if road.intersection(other).area > 0.000001:
                        raise GeometryValidationError(
                            "Road footprints overlap. Adjust their edges before takeoff; "
                            "intersection quantities are not supported."
                        )
        for scenario in result["scenarios"].values():
            validate_paint(
                [GroundStroke(**stroke) for stroke in scenario["ground_paint"]],
                projected,
                site_bounds,
            )
            if scenario.get("terrain"):
                terrain = Terrain(**scenario["terrain"])
                validate_frame(terrain, projected)
                scenario["terrain_anchors"] = anchors(terrain, scenario["items"])
        return result
    except (GeometryValidationError, ValueError, TypeError) as exc:
        raise APIError(422, "invalid_geometry", str(exc)) from exc


def project_for_workspace(
    session: Session, org_id: UUID, project_id: UUID, user_id: UUID, *, write: bool = False
) -> Project:
    access.require_project(session, org_id, project_id, user_id)
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
    project = project_for_workspace(session, org_id, project_id, user_id)
    saved = session.get(Workspace, project_id)
    data = deepcopy(saved.data) if saved else None
    if data:
        baseline = data["scenarios"]["baseline"]["items"]
        ids = {item["id"] for item in baseline}
        for key in ("option_a", "option_b"):
            data["scenarios"][key]["items"] = deepcopy(baseline) + [
                item for item in data["scenarios"][key]["items"] if item["id"] not in ids
            ]
        if any(i.get("object_instance") for s in data["scenarios"].values() for i in s["items"]):
            projected = project_wgs84_geometry(data["boundary"], source_crs="EPSG:4326")
            for scenario in data["scenarios"].values():
                for item in scenario["items"]:
                    if item.get("object_instance"):
                        place(item, projected, shape(data["boundary"]), scenario.get("terrain"))
    try:
        site_geometry = project.site.get("outline") or {
            "type": "Polygon",
            "coordinates": [list(box(*project.site["bounds"]).exterior.coords)],
        }
        site_area = project_wgs84_geometry(site_geometry, source_crs="EPSG:4326").geometry.area
        if data:
            data["boundary_area_m2"] = project_wgs84_geometry(
                data["boundary"], source_crs="EPSG:4326"
            ).geometry.area
    except (ValueError, GeometryValidationError):
        site_area = None
    return {"revision": saved.revision if saved else 0, "data": data, "site_area_m2": site_area}


class ObjectTransformInput(StrictModel):
    workspace: WorkspaceInput
    scenario: ScenarioKey
    ids: Annotated[list[UUID], Field(min_length=1, max_length=150)]
    operation: Literal["translate", "rotate", "align_x", "align_y"]
    east_m: Annotated[float, Field(ge=-1000, le=1000)] = 0
    north_m: Annotated[float, Field(ge=-1000, le=1000)] = 0
    rotation_deg: Annotated[float, Field(ge=-360, le=360)] = 0


def transform_objects(data: ObjectTransformInput, bounds):
    from math import cos, radians, sin

    from pyproj import Transformer

    checked = validate_workspace(data.workspace, bounds)
    ids = {str(i) for i in data.ids}
    baseline_ids = {i["id"] for i in checked["scenarios"]["baseline"]["items"]}
    items = [i for i in checked["scenarios"][data.scenario]["items"] if i["id"] in ids]
    if len(items) != len(ids) or any(
        not i.get("object_instance") or i["object_instance"]["locked"] for i in items
    ):
        raise APIError(422, "invalid_group", "Select available unlocked object instances.")
    if data.scenario != "baseline" and ids & baseline_ids:
        raise APIError(422, "shared_object", "Edit inherited objects in Baseline.")
    cx = sum(i["object_pose"]["x"] for i in items) / len(items)
    cy = sum(i["object_pose"]["y"] for i in items) / len(items)
    inverse = Transformer.from_crs(checked["metric_crs"], "EPSG:4326", always_xy=True)
    angle = radians(data.rotation_deg)
    draft = data.workspace.model_copy(deep=True)
    for item in draft.scenarios[data.scenario].items:
        if str(item.id) not in ids:
            continue
        pose = next(i["object_pose"] for i in items if i["id"] == str(item.id))
        x, y = pose["x"], pose["y"]
        obj = item.object_instance
        if data.operation == "translate":
            x, y = x + data.east_m, y + data.north_m
        if data.operation == "align_x":
            x = cx
        if data.operation == "align_y":
            y = cy
        if data.operation == "rotate":
            x, y = (
                cx + (x - cx) * cos(angle) + (y - cy) * sin(angle),
                cy - (x - cx) * sin(angle) + (y - cy) * cos(angle),
            )
            obj.rotation_deg = (obj.rotation_deg + data.rotation_deg) % 360
        obj.longitude, obj.latitude = inverse.transform(x, y)
    return validate_workspace(draft, bounds)


def save_workspace(
    session: Session, org_id: UUID, project_id: UUID, user_id: UUID, data: WorkspaceInput
) -> dict:
    access.require_project(session, org_id, project_id, user_id, "edit_geometry")
    project = project_for_workspace(session, org_id, project_id, user_id, write=True)
    saved = session.get(Workspace, project_id)
    revision = saved.revision if saved else 0
    if data.expected_revision != revision:
        raise APIError(
            409, "revision_conflict", "The workspace changed. Reload before saving again."
        )
    if saved:
        old_ids = {item["id"] for item in saved.data["scenarios"]["baseline"]["items"]}
        new_ids = {str(item.id) for item in data.scenarios["baseline"].items}
        removed = old_ids - new_ids
        data = data.model_copy(deep=True)
        for key in ("option_a", "option_b"):
            data.scenarios[key].items = [
                item
                for item in data.scenarios[key].items
                if str(item.id) not in removed or item.status != "existing"
            ]
    # Saved workspace revisions retain prior definitions; recipe/plant version is server-owned.
    data = data.model_copy(deep=True)
    for key, scenario in data.scenarios.items():
        previous = {i["id"]: i for i in saved.data["scenarios"][key]["items"]} if saved else {}
        for item in scenario.items:
            for field in ("plant", "assembly"):
                definition = getattr(item, field)
                if definition is None:
                    continue
                old = previous.get(str(item.id), {}).get(field)
                value = definition.model_dump(mode="json", exclude={"version"})
                definition.version = (
                    (old["version"] + (value != {k: v for k, v in old.items() if k != "version"}))
                    if old
                    else 1
                )
    canonical = validate_workspace(data, project.site["bounds"])
    if data.plan_reference:
        require_reference(session, project_id, data.plan_reference.evidence_id)
    for constraint in data.constraints:
        for evidence_id in constraint.evidence_ids:
            require_reference(session, project_id, evidence_id)
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


def require_reference(session, project_id, evidence_id):
    record = session.scalar(
        select(Evidence).where(
            Evidence.id == evidence_id,
            Evidence.project_id == project_id,
            Evidence.archived.is_(False),
        )
    )
    if record is None:
        raise APIError(
            422, "reference_unavailable", "Select an active private reference from this project."
        )
    return record


def reference_preview(session, org_id, project_id, user_id, data):
    access.require_project(session, org_id, project_id, user_id, "edit_geometry")
    project = project_for_workspace(session, org_id, project_id, user_id)
    require_reference(session, project_id, data.evidence_id)
    w, s, e, n = project.site["bounds"]
    crs = project_wgs84_geometry(
        {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]},
        source_crs="EPSG:4326",
    ).metric_crs
    return calibrate(data, crs, project.site["bounds"])


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
    draft.pop("boundary_area_m2", None)
    if draft.get("plan_reference"):
        for key in ("corners", "metric_crs", "calibration_id", "metres_per_pixel"):
            draft["plan_reference"].pop(key, None)
    for target in draft["targets"]:
        target.pop("area_m2", None)
        target.pop("reference_review_required", None)
    for scenario in draft["scenarios"].values():
        scenario.pop("terrain_anchors", None)
        for item in scenario["items"]:
            item.pop("schedule", None)
            item.pop("object_pose", None)
            item.pop("quantity", None)
            item.pop("reference_review_required", None)
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
