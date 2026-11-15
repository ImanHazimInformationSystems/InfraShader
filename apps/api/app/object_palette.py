"""Versioned project-owned MIT primitives and authoritative concept footprints."""

import json
from math import cos, radians, sin
from pathlib import Path
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from pyproj import Transformer
from shapely.geometry import Polygon

from app.domain.geometry import calculate_geographic_quantity, count_quantity
from app.terrain import Terrain, sample

CATALOGUE = {
    a["id"]: a for a in json.loads((Path(__file__).parent / "data/catalogue.json").read_text())
}


class ObjectInstance(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)
    asset_id: str
    version: Annotated[int, Field(ge=1)] = 1
    longitude: Annotated[float, Field(ge=-180, le=180)]
    latitude: Annotated[float, Field(ge=-80, le=84)]
    rotation_deg: Annotated[float, Field(ge=0, lt=360)] = 0
    scale: Annotated[float, Field(ge=0.5, le=2)] = 1
    stretch_x: Annotated[float, Field(ge=0.25, le=4)] = 1
    stretch_y: Annotated[float, Field(ge=0.25, le=4)] = 1
    stretch_z: Annotated[float, Field(ge=0.25, le=4)] = 1
    tilt_deg: Annotated[float, Field(ge=-80, le=80)] = 0
    lean_deg: Annotated[float, Field(ge=-80, le=80)] = 0
    light_on: bool = True
    light_intensity: Annotated[float, Field(ge=0, le=2)] = 1
    elevation_offset_m: Annotated[float, Field(ge=-10, le=10)] = 0
    snap_m: Annotated[float, Field(ge=0, le=10)] = 0
    group: Annotated[str, Field(max_length=80)] = ""
    locked: bool = False


def place(item, projected, boundary, terrain):
    obj = ObjectInstance(**item["object_instance"])
    asset = CATALOGUE.get(obj.asset_id)
    if not asset or obj.version != asset["version"]:
        raise ValueError("Object preset/version is unavailable; select an admitted preset.")
    if item["count"] != 1 or item["quantity_override"] is not None:
        raise ValueError(
            "Place separate object instances; count is one and quantity overrides are not allowed."
        )
    forward = Transformer.from_crs("EPSG:4326", projected.metric_crs, always_xy=True)
    inverse = Transformer.from_crs(projected.metric_crs, "EPSG:4326", always_xy=True)
    x, y = forward.transform(obj.longitude, obj.latitude)
    if obj.snap_m:
        # Projected grid-origin snapping, identical for all objects/groups.
        x = round(x / obj.snap_m) * obj.snap_m
        y = round(y / obj.snap_m) * obj.snap_m
    angle = radians(obj.rotation_deg)
    c, s = cos(angle), sin(angle)
    width, height, length = [
        d * obj.scale * stretch
        for d, stretch in zip(
            asset["dimensions"], (obj.stretch_x, obj.stretch_y, obj.stretch_z), strict=True
        )
    ]
    pitch, roll = radians(obj.tilt_deg), radians(obj.lean_deg)

    # Same YXZ Euler order as Three.js: local roll, then pitch, then clockwise yaw.
    def oriented(dx, up, south):
        rx, ry = dx * cos(roll) - up * sin(roll), dx * sin(roll) + up * cos(roll)
        py, pz = ry * cos(pitch) - south * sin(pitch), ry * sin(pitch) + south * cos(pitch)
        return rx * c - pz * s, py, rx * s + pz * c

    corners = [
        oriented(dx, up, south)
        for dx in (-width / 2, width / 2)
        for up in (0, height)
        for south in (-length / 2, length / 2)
    ]
    lowest = min(p[1] for p in corners)

    def point(dx, dy):
        return list(inverse.transform(x + dx * c + dy * s, y - dx * s + dy * c))

    from shapely.geometry import MultiPoint

    hull = MultiPoint([(p[0], -p[2]) for p in corners]).convex_hull
    ring = [list(inverse.transform(x + dx, y + dy)) for dx, dy in hull.exterior.coords]
    footprint = {"type": "Polygon", "coordinates": [ring]}
    if not boundary.covers(Polygon(ring)):
        raise ValueError("The complete object footprint must stay inside the site boundary.")
    geometry = footprint
    if asset["unit"] == "m":
        ends = (
            [(-width / 2, 0), (width / 2, 0)]
            if asset["linear_axis"] == "x"
            else [(0, -length / 2), (0, length / 2)]
        )
        geometry = {"type": "LineString", "coordinates": [point(*p) for p in ends]}
    item["geometry"] = geometry
    item["category"] = asset["category"]
    item["height_m"] = max(p[1] for p in corners) - lowest
    item["height_source"] = "Concept preset dimensions; not surveyed"
    item["object_instance"]["longitude"], item["object_instance"]["latitude"] = inverse.transform(
        x, y
    )
    ground = sample(Terrain(**terrain), x, y) if terrain else 0
    item["object_pose"] = {
        "x": x,
        "y": y,
        "ground_elevation_m": ground,
        "elevation_m": ground + obj.elevation_offset_m - lowest,
        "dimensions": [width, height, length],
        "footprint": footprint,
        "license": asset["license"],
        "asset_sha256": asset["sha256"],
        "metric_crs": projected.metric_crs,
    }
    return (
        count_quantity(1)
        if asset["unit"] == "item"
        else calculate_geographic_quantity(
            geometry, source_crs="EPSG:4326", site_boundary=boundary.__geo_interface__
        )
    )
