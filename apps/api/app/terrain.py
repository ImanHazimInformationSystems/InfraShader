"""Bounded sourced heightfields; numerical studies live in terrain_analysis."""

import json
from decimal import Decimal
from hashlib import sha256
from math import floor
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pyproj import Transformer
from shapely.affinity import scale
from shapely.geometry import Point, box, shape


class Pond(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    name: Annotated[str, Field(min_length=1, max_length=80)]
    region: tuple[int, int, int, int]
    water_level: Annotated[float, Field(ge=-500, le=9000)]
    shape: Literal["square", "circle"] = "square"


class TerrainWork(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)
    activity: Annotated[str, Field(min_length=3, max_length=120)]
    resource: Literal["labour", "equipment", "material", "transport"]
    tools: Annotated[str, Field(min_length=3, max_length=300)]
    assumptions: Annotated[str, Field(min_length=3, max_length=1000)]
    quantity: Annotated[Decimal, Field(ge=0, le=1000000000000, decimal_places=4)]
    quantity_basis: Literal["manual", "cut", "fill"] = "manual"
    unit: Literal["h", "m3", "item"]
    terrain_signature: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")] | None = None

    @model_validator(mode="after")
    def quantity_method(self):
        if self.quantity_basis == "manual" and self.quantity <= 0:
            raise ValueError("Manual site-work quantity must be positive.")
        if self.quantity_basis != "manual" and self.unit != "m3":
            raise ValueError("Automatic cut/fill quantities require m3 rates.")
        return self


def pond_contains(pond, x, y):
    x0, y0, x1, y1 = pond.region
    if pond.shape == "square":
        return x0 <= x <= x1 and y0 <= y <= y1
    return ((x - (x0 + x1) / 2) / ((x1 - x0) / 2)) ** 2 + (
        (y - (y0 + y1) / 2) / ((y1 - y0) / 2)
    ) ** 2 <= 1.000001


class Terrain(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)
    datum: Annotated[str, Field(min_length=3, max_length=200)]
    source: Annotated[str, Field(min_length=3, max_length=1000)]
    metric_crs: str
    bounds: tuple[float, float, float, float]
    size: Annotated[int, Field(ge=5, le=33)]
    base_elevation: Annotated[float, Field(ge=-500, le=9000)]
    heights: Annotated[list[float], Field(max_length=1089)]
    reference_heights: Annotated[list[float], Field(max_length=1089)] | None = None
    reference_source: Annotated[str, Field(max_length=1000)] = ""
    ponds: Annotated[list[Pond], Field(max_length=8)] = []

    @model_validator(mode="after")
    def valid(self):
        if self.reference_heights is not None and (
            len(self.reference_heights) != self.size**2
            or len(self.reference_source.strip()) < 3
            or any(not -500 <= h <= 9000 for h in self.reference_heights)
        ):
            raise ValueError("Existing ground needs a complete finite height grid and its source.")
        if len(self.heights) != self.size**2 or any(not -500 <= h <= 9000 for h in self.heights):
            raise ValueError("Provide a finite bounded square height grid (-500 to 9000 m).")
        w, s, e, n = self.bounds
        if not (1 <= e - w <= 2000 and 1 <= n - s <= 2000):
            raise ValueError("Concept terrain frame must span 1 to 2000 metres per side.")
        for pond in self.ponds:
            x0, y0, x1, y1 = pond.region
            if not (0 <= x0 < x1 < self.size and 0 <= y0 < y1 < self.size):
                raise ValueError("Pond outline needs a non-empty region inside the grid.")
            bed = [
                self.heights[y * self.size + x]
                for y in range(y0, y1 + 1)
                for x in range(x0, x1 + 1)
                if pond_contains(pond, x, y)
            ]
            if pond.water_level <= max(bed):
                raise ValueError(
                    "Concept water level must be above every pond bed node; "
                    "lower the bed or remove the pond before raising it."
                )
        return self


def signature(value):
    if value is None:
        return None
    normalized = Terrain(**value).model_dump(mode="json")
    if normalized.get("reference_heights") is None:
        normalized.pop("reference_heights", None)
        normalized.pop("reference_source", None)
    return sha256(json.dumps(normalized, sort_keys=True).encode()).hexdigest()


def changed(value):
    return bool(
        value
        and (
            value.get("ponds")
            or any(abs(h - value["base_elevation"]) > 1e-6 for h in value["heights"])
        )
    )


def work_changed(value):
    return bool(
        value
        and (
            value.get("ponds")
            or any(
                abs(
                    h
                    - (
                        value["reference_heights"][i]
                        if value.get("reference_heights")
                        else value["base_elevation"]
                    )
                )
                > 1e-6
                for i, h in enumerate(value["heights"])
            )
        )
    )


def validate_frame(terrain, projected):
    if terrain.metric_crs != projected.metric_crs or any(
        abs(a - b) > 0.01 for a, b in zip(terrain.bounds, projected.geometry.bounds, strict=True)
    ):
        raise ValueError(
            "Terrain frame no longer matches the boundary/CRS. "
            "Remove terrain before changing the boundary."
        )
    for pond in terrain.ponds:
        footprint = pond_footprint(terrain, pond)
        if not projected.geometry.buffer(0.001).covers(footprint):
            raise ValueError(
                "Pond water must stay within the site boundary; reduce or move its brush."
            )


def pond_footprint(terrain, pond):
    w, s, e, n = terrain.bounds
    a, b, c, d = pond.region
    x0, x1 = w + a / (terrain.size - 1) * (e - w), w + c / (terrain.size - 1) * (e - w)
    y0, y1 = n - d / (terrain.size - 1) * (n - s), n - b / (terrain.size - 1) * (n - s)
    if pond.shape == "circle":
        return scale(
            Point((x0 + x1) / 2, (y0 + y1) / 2).buffer(1, quad_segs=32),
            xfact=(x1 - x0) / 2,
            yfact=(y1 - y0) / 2,
        )
    return box(x0, y0, x1, y1)


def sample(terrain, x, y):
    w, s, e, n = terrain.bounds
    gx = max(0, min(terrain.size - 1, (x - w) / (e - w) * (terrain.size - 1)))
    gy = max(0, min(terrain.size - 1, (n - y) / (n - s) * (terrain.size - 1)))
    ix, iy = min(floor(gx), terrain.size - 2), min(floor(gy), terrain.size - 2)
    fx, fy = gx - ix, gy - iy
    h = terrain.heights
    return (h[iy * terrain.size + ix] * (1 - fx) + h[iy * terrain.size + ix + 1] * fx) * (
        1 - fy
    ) + (h[(iy + 1) * terrain.size + ix] * (1 - fx) + h[(iy + 1) * terrain.size + ix + 1] * fx) * fy


def anchors(terrain, items):
    transform = Transformer.from_crs("EPSG:4326", terrain.metric_crs, always_xy=True)
    result = []
    for item in items:
        if not item.get("geometry"):
            continue
        point = shape(item["geometry"]).representative_point()
        x, y = transform.transform(point.x, point.y)
        result.append(
            {
                "id": item["id"],
                "name": item["name"],
                "x": x,
                "y": y,
                "ground_elevation_m": sample(terrain, x, y),
            }
        )
    return result
