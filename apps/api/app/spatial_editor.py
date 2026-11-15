"""Atomic, bounded draft operations in the site's declared metric frame.

No persistence here: the ordinary workspace save retains grants/revision checks.
"""

from copy import deepcopy
from math import atan2, ceil, cos, degrees, hypot, log, pi, radians, tan
from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import Field
from pyproj import Transformer
from shapely import affinity, transform
from shapely.geometry import LineString, Point, mapping, shape
from shapely.ops import split, unary_union

from app.domain.geometry import project_wgs84_geometry
from app.errors import APIError
from app.ground_paint import GroundStroke, validate_paint
from app.workspace import ScenarioKey, StrictModel, WorkItem, WorkspaceInput, validate_workspace


class EditInput(StrictModel):
    workspace: WorkspaceInput
    scenario: ScenarioKey
    ids: Annotated[list[UUID], Field(max_length=150)] = []
    road_item: WorkItem | None = None
    plant_item: WorkItem | None = None
    tree_item: WorkItem | None = None
    fence_points: Annotated[list[tuple[float, float]], Field(min_length=2, max_length=2)] | None = (
        None
    )
    paint_stroke: GroundStroke | None = None
    operation: Literal[
        "fence",
        "tree",
        "paint",
        "clear_paint",
        "plant",
        "road",
        "move",
        "rotate",
        "resize",
        "snap_grid",
        "fix_dimensions",
        "release_dimensions",
        "duplicate",
        "align_x",
        "align_y",
        "distribute_x",
        "distribute_y",
        "group",
        "layer",
        "lock",
        "unlock",
        "hide",
        "show",
        "delete",
        "merge",
        "split",
        "cutout",
    ]
    east_m: Annotated[float, Field(ge=-5000, le=5000)] = 0
    north_m: Annotated[float, Field(ge=-5000, le=5000)] = 0
    angle_deg: Annotated[float, Field(ge=-360, le=360)] = 0
    width_m: Annotated[float, Field(gt=0, le=5000)] = 1
    depth_m: Annotated[float, Field(gt=0, le=5000)] = 1
    grid_m: Annotated[float, Field(gt=0, le=100)] = 1
    copies: Annotated[int, Field(ge=1, le=30)] = 1
    label: Annotated[str, Field(max_length=80)] = ""


def edit_draft(request: EditInput, bounds):
    raw = request.workspace.model_dump(mode="json")
    # Validate the input as well as the result. Never transform an invalid draft.
    before = validate_workspace(request.workspace, bounds)
    items = raw["scenarios"][request.scenario]["items"]
    ids = [str(value) for value in request.ids]
    selected = [next((i for i in items if i["id"] == key), None) for key in ids]
    op = request.operation

    def reject(message):
        raise APIError(422, "spatial_edit", message)

    if op == "fence":
        if request.scenario == "baseline" or not request.fence_points:
            reject("Draw a fence in a proposed option.")
        forward = Transformer.from_crs("EPSG:4326", before["metric_crs"], always_xy=True)
        inverse = Transformer.from_crs(before["metric_crs"], "EPSG:4326", always_xy=True)
        a, b = [forward.transform(*p) for p in request.fence_points]
        length = hypot(b[0] - a[0], b[1] - a[1])
        if not 0.6 <= length <= 100:
            reject("Fence runs must be between 0.6 and 100 metres.")
        count = ceil(length / 2.12)
        group = f"Fence {str(uuid4())[:8]}"
        yaw = degrees(atan2(-(b[1] - a[1]), b[0] - a[0])) % 360
        for index in range(count):
            fraction = (index + 0.5) / count
            lng, lat = inverse.transform(
                a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction
            )
            items.append(
                WorkItem(
                    id=uuid4(),
                    name=f"{group} · {index + 1}",
                    kind="object",
                    geometry=None,
                    provenance="estimated",
                    source_note=(
                        "Concept fence run, backend-projected drawn length; "
                        "no foundation or installation design."
                    ),
                    object_instance={
                        "asset_id": "fence",
                        "longitude": lng,
                        "latitude": lat,
                        "rotation_deg": yaw,
                        "stretch_x": length / count / 2.12,
                        "group": group,
                    },
                ).model_dump(mode="json")
            )
        return validate_workspace(WorkspaceInput(**raw), bounds)

    if op in ("paint", "clear_paint"):
        scenario = raw["scenarios"][request.scenario]
        if op == "clear_paint":
            scenario["ground_paint"] = []
        else:
            if not request.paint_stroke:
                reject("Choose a grass texture and supply a brush stroke.")
            try:
                validate_paint(
                    [request.paint_stroke],
                    project_wgs84_geometry(raw["boundary"], source_crs="EPSG:4326"),
                )
            except ValueError as error:
                reject(str(error))
            if len(scenario["ground_paint"]) >= 128:
                reject(
                    "This option has 128 ground strokes. Undo or clear paint before adding more."
                )
            scenario["ground_paint"].append(request.paint_stroke.model_dump(mode="json"))
        return validate_workspace(WorkspaceInput(**raw), bounds)

    if op == "tree":
        candidate = request.tree_item
        if request.scenario == "baseline" or not candidate or not candidate.tree_design:
            reject("Choose a proposed option and a tree model.")
        existing = next((item for item in items if item["id"] == str(candidate.id)), None)
        inherited = {item["id"] for item in raw["scenarios"]["baseline"]["items"]}
        if str(candidate.id) in inherited or (
            existing
            and (
                existing["kind"] != "tree"
                or existing.get("editor_locked")
                or existing.get("layout_plant") not in (None, "tree")
            )
        ):
            reject("Choose an unlocked proposed tree, not inherited site inventory.")
        if existing:
            existing.update(
                tree_design=candidate.tree_design.model_dump(mode="json"),
                geometry=candidate.geometry,
                name=candidate.name,
                rate_id=str(candidate.rate_id) if candidate.rate_id else None,
                layout_plant="tree",
            )
        else:
            if any(
                candidate.id == item.id
                for scenario in request.workspace.scenarios.values()
                for item in scenario.items
            ):
                reject("New trees require a distinct proposed ID.")
            items.append(candidate.model_dump(mode="json"))
        return validate_workspace(WorkspaceInput(**raw), bounds)

    if op == "plant":
        candidate = request.plant_item
        if request.scenario == "baseline" or not candidate or not candidate.layout_plant:
            reject("Choose a proposed option and a concept plant marker.")
        if candidate.status != "proposed" or any(
            candidate.id == item.id
            for scenario in request.workspace.scenarios.values()
            for item in scenario.items
        ):
            reject("Planting requires a new proposed item ID.")
        items.append(candidate.model_dump(mode="json"))
        return validate_workspace(WorkspaceInput(**raw), bounds)

    if op == "road":
        candidate = request.road_item
        if request.scenario == "baseline" or not candidate or not candidate.road:
            reject("Choose a proposed option and supply a road route.")
        existing = next((item for item in items if item["id"] == str(candidate.id)), None)
        if existing and (not existing.get("road") or existing.get("editor_locked")):
            reject("Select an unlocked road to edit.")
        if any(str(candidate.id) == item["id"] for item in raw["scenarios"]["baseline"]["items"]):
            reject("Road work must have its own proposed item ID.")
        if existing:
            # Preserve schedule/rates and other business metadata when editing the route.
            existing.update(
                road=candidate.road.model_dump(mode="json"),
                name=candidate.name,
                source_note=candidate.source_note,
                provenance=candidate.provenance,
            )
        else:
            items.append(candidate.model_dump(mode="json"))
        return validate_workspace(WorkspaceInput(**raw), bounds)

    if not ids:
        reject("Select at least one available work item.")

    if len(set(ids)) != len(ids) or any(i is None for i in selected):
        reject("Select distinct available work items.")
    baseline = {i["id"] for i in raw["scenarios"]["baseline"]["items"]}
    if request.scenario != "baseline" and baseline.intersection(ids):
        reject("Edit inherited items in Baseline.")
    if op not in ("unlock", "show", "hide") and any(
        i.get("editor_locked") or (i.get("object_instance") or {}).get("locked") for i in selected
    ):
        reject("Unlock selected items before editing.")
    if any(item.get("road") for item in selected) and op not in (
        "delete",
        "group",
        "layer",
        "lock",
        "unlock",
        "hide",
        "show",
        "release_dimensions",
    ):
        reject("Edit road points, shape and width in Roads and driveways.")
    if op == "delete":
        items[:] = [i for i in items if i["id"] not in ids]
    elif op in ("group", "layer", "lock", "unlock", "hide", "show", "release_dimensions"):
        if op == "layer" and not request.label:
            reject("Enter a layer name.")
        for item in selected:
            if op == "release_dimensions":
                item["editor_dimensions"] = None
            elif op == "group":
                item["editor_group"] = request.label
            elif op == "layer":
                item["category"] = request.label
            elif op in ("lock", "unlock"):
                item["editor_locked"] = op == "lock" and not bool(item.get("object_instance"))
                if item.get("object_instance"):
                    item["object_instance"]["locked"] = op == "lock"
            else:
                item["visible"] = op == "show"
    else:
        crs = before["metric_crs"]
        forward = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
        inverse = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
        geometries = []
        for item in selected:
            instance = item.get("object_instance")
            geometry = (
                Point(instance["longitude"], instance["latitude"])
                if instance
                else shape(item["geometry"])
                if item["geometry"]
                else None
            )
            if geometry is None:
                reject("Manual scope has no spatial geometry; select mapped items only.")
            geometries.append(transform(geometry, forward.transform, interleaved=False))
        extent = unary_union(geometries).bounds
        center = ((extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2)

        def assign(item, geometry):
            geographic = transform(geometry, inverse.transform, interleaved=False)
            if item.get("object_instance"):
                item["object_instance"].update(
                    longitude=geographic.x, latitude=geographic.y, snap_m=0
                )
            else:
                item["geometry"] = mapping(geographic)

        if op in ("merge", "split", "cutout"):
            if any(
                i["kind"] not in ("area", "path") or i.get("quantity_override") is not None
                for i in selected
            ):
                reject("Split/merge supports areas and paths without quantity overrides.")
            if any(i.get("plant") or i.get("assembly") for i in selected):
                reject("Remove plant/material bindings before split/merge; reassign deliberately.")
            if op == "cutout":
                if len(selected) != 2 or any(i["kind"] != "area" for i in selected):
                    reject("Select an outer work area first and an inner work area second.")
                if not geometries[0].contains(geometries[1]):
                    reject("The cutout must lie strictly inside the first area.")
                assign(selected[0], geometries[0].difference(geometries[1]))
                items.remove(selected[1])
            elif op == "merge":
                if len(selected) < 2:
                    reject("Select at least two compatible items to merge.")
                for item in selected[1:]:
                    for key in (
                        "kind",
                        "rate_id",
                        "source_note",
                        "provenance",
                        "category",
                        "status",
                        "pricing_status",
                        "editor_group",
                        "visible",
                    ):
                        if item[key] != selected[0][key]:
                            reject(
                                "Merge requires matching kind, rate, source, provenance and layer."
                            )
                merged = unary_union(geometries)
                if merged.geom_type == "MultiLineString":
                    from shapely.ops import linemerge

                    merged = linemerge(merged)
                if merged.geom_type not in ("Polygon", "LineString"):
                    reject("Merge must produce one connected polygon or line.")
                assign(selected[0], merged)
                items[:] = [i for i in items if i["id"] not in ids[1:]]
            else:
                if len(selected) != 1:
                    reject("Split one area or path at a time.")
                # Explicit grid-aligned cutting line through the selection centre + offset.
                x, y = center[0] + request.east_m, center[1] + request.north_m
                cutter = affinity.rotate(
                    LineString([(x - 10000, y), (x + 10000, y)]), -request.angle_deg, origin=(x, y)
                )
                parts = list(split(geometries[0], cutter).geoms)
                if len(parts) < 2 or len(parts) > 20:
                    reject("The cut must produce between 2 and 20 valid parts.")
                items.remove(selected[0])
                for index, geometry in enumerate(parts):
                    item = deepcopy(selected[0])
                    item.update(id=str(uuid4()), name=f"{item['name'][:140]} part {index + 1}")
                    assign(item, geometry)
                    items.append(item)
        else:
            axis = 0 if op.endswith("_x") else 1
            ordered = sorted(
                range(len(selected)), key=lambda j: geometries[j].centroid.coords[0][axis]
            )
            positions = [geometries[j].centroid.coords[0][axis] for j in ordered]
            if op.startswith("distribute") and len(selected) < 3:
                reject("Distribution needs at least three items; endpoints stay fixed.")
            if op == "resize" and (len(selected) != 1 or selected[0].get("object_instance")):
                reject("Resize one ordinary polygon or line; preset scale uses its own inspector.")
            for index, (item, geometry) in enumerate(zip(selected, geometries, strict=True)):
                repetitions = request.copies if op == "duplicate" else 1
                for repetition in range(1, repetitions + 1):
                    target = deepcopy(item) if op == "duplicate" else item
                    result = geometry
                    if op in ("move", "duplicate"):
                        result = affinity.translate(
                            geometry, request.east_m * repetition, request.north_m * repetition
                        )
                    elif op == "fix_dimensions":
                        if target["kind"] not in ("area", "path", "building", "canopy"):
                            reject("Dimension constraints require ordinary areas or paths.")
                        a, b, c, d = geometry.bounds
                        if c - a < 0.001 or d - b < 0.001:
                            reject("Fixed grid dimensions require nonzero width and depth.")
                        target["editor_dimensions"] = {"width_m": c - a, "depth_m": d - b}
                    elif op == "snap_grid":
                        x, y = geometry.centroid.coords[0]
                        result = affinity.translate(
                            geometry,
                            round(x / request.grid_m) * request.grid_m - x,
                            round(y / request.grid_m) * request.grid_m - y,
                        )
                    elif op == "rotate":
                        result = affinity.rotate(geometry, -request.angle_deg, origin=center)
                        if target.get("object_instance"):
                            target["object_instance"]["rotation_deg"] = (
                                target["object_instance"]["rotation_deg"] + request.angle_deg
                            ) % 360
                        if target.get("tree_design"):
                            target["tree_design"]["rotation_deg"] = (
                                target["tree_design"]["rotation_deg"] + request.angle_deg
                            ) % 360
                    elif op == "resize":
                        width, depth = extent[2] - extent[0], extent[3] - extent[1]
                        if width < 1e-6 or depth < 1e-6:
                            reject(
                                "Resize needs nonzero grid width and depth; "
                                "use numeric vertices for axial lines."
                            )
                        result = affinity.scale(
                            geometry,
                            request.width_m / width,
                            request.depth_m / depth,
                            origin=center,
                        )
                    elif op.startswith(("align", "distribute")):
                        destination = (
                            positions[0]
                            if op.startswith("align")
                            else (
                                positions[0]
                                + ordered.index(index)
                                * (positions[-1] - positions[0])
                                / (len(selected) - 1)
                            )
                        )
                        delta = destination - geometry.centroid.coords[0][axis]
                        result = affinity.translate(
                            geometry, delta if axis == 0 else 0, delta if axis == 1 else 0
                        )
                    assign(target, result)
                    if op == "duplicate":
                        target.update(
                            id=str(uuid4()),
                            name=f"{item['name'][:140]} copy {repetition}",
                            editor_group="",
                        )
                        if target.get("object_instance"):
                            target["object_instance"]["group"] = ""
                        items.append(target)
    # Topology operations may consume Baseline IDs. Remove their inherited copies
    # before validation so a preview cannot turn deleted context into option work.
    if request.scenario == "baseline":
        removed = baseline - {item["id"] for item in items}
        for key in ("option_a", "option_b"):
            raw["scenarios"][key]["items"] = [
                item for item in raw["scenarios"][key]["items"] if item["id"] not in removed
            ]
    validated = validate_workspace(WorkspaceInput(**raw), bounds)
    return validated


def scene_geometry(data: WorkspaceInput, bounds, georeferenced=False):
    """Read-only display coordinates in the same validated UTM frame as quantities."""
    checked = validate_workspace(data, bounds)
    forward = Transformer.from_crs("EPSG:4326", checked["metric_crs"], always_xy=True)
    shapes = {
        key: {
            item["id"]: mapping(
                transform(shape(item["geometry"]), forward.transform, interleaved=False)
            )
            for item in scenario["items"]
            if item.get("geometry") and not item.get("object_instance")
        }
        for key, scenario in checked["scenarios"].items()
    }
    if not georeferenced:
        return shapes

    def project(geometry):
        return mapping(transform(shape(geometry), forward.transform, interleaved=False))

    return {
        "shapes": shapes,
        "frame": map_frame(checked),
        "context": {
            "boundary": project(checked["boundary"]),
            "targets": {target["id"]: project(target["geometry"]) for target in checked["targets"]},
        },
    }


def map_frame(checked):
    """Display-only local UTM tangent frame, checked over the whole site envelope.

    Never use this approximation for quantities. Reject overlays with sampled
    horizontal residual above 5 cm; precise numeric editing remains available.
    """
    forward = Transformer.from_crs("EPSG:4326", checked["metric_crs"], always_xy=True)
    inverse = Transformer.from_crs(checked["metric_crs"], "EPSG:4326", always_xy=True)
    boundary = transform(shape(checked["boundary"]), forward.transform, interleaved=False)
    west, south, east, north = boundary.bounds
    x, y = (west + east) / 2, (south + north) / 2

    def mercator(easting, northing):
        lon, lat = inverse.transform(easting, northing, errcheck=True)
        return ((lon + 180) / 360, (1 - log(tan(pi / 4 + radians(lat) / 2)) / pi) / 2)

    origin = mercator(x, y)
    dx = tuple((a - b) / 2 for a, b in zip(mercator(x + 1, y), mercator(x - 1, y), strict=True))
    dy = tuple((a - b) / 2 for a, b in zip(mercator(x, y + 1), mercator(x, y - 1), strict=True))
    _, lat = inverse.transform(x, y)
    scale = 1 / (2 * pi * 6378137 * cos(radians(lat)))
    residual = 0.0
    for row in range(17):
        for col in range(17):
            px, py = west + (east - west) * col / 16, south + (north - south) * row / 16
            actual = mercator(px, py)
            predicted = [origin[i] + dx[i] * (px - x) + dy[i] * (py - y) for i in (0, 1)]
            residual = max(
                residual, hypot(*(a - b for a, b in zip(actual, predicted, strict=True))) / scale
            )
    return {
        "origin": [x, y],
        "mercator": list(origin),
        "east": list(dx),
        "north": list(dy),
        "scale": scale,
        "residual_m": residual,
        "supported": residual <= 0.05,
    }
