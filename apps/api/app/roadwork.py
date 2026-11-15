"""Concept road footprints in the workspace's declared projected metric CRS."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from pyproj import Transformer
from shapely import transform
from shapely.geometry import LineString, Polygon, mapping

Longitude = Annotated[float, Field(ge=-180, le=180)]
Latitude = Annotated[float, Field(ge=-80, le=84)]


class RoadRoute(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    mode: Literal["line", "curve", "area"] = "line"
    surface: Literal["dirt", "pavement", "stone", "gravel"] = "pavement"
    points: Annotated[list[tuple[Longitude, Latitude]], Field(min_length=2, max_length=12)]
    width_m: Annotated[float, Field(gt=0, le=100)]


def footprint(road: RoadRoute, metric_crs: str) -> dict:
    """Flat caps, round joins; union within one footprint, no engineered alignment."""
    forward = Transformer.from_crs(4326, metric_crs, always_xy=True)
    inverse = Transformer.from_crs(metric_crs, 4326, always_xy=True)
    points = [forward.transform(*point, errcheck=True) for point in road.points]
    if len(set(points)) != len(points):
        raise ValueError("Road control points must be distinct.")
    if road.mode == "area":
        if len(points) < 3:
            raise ValueError("A road area needs at least three corners.")
        result = Polygon(points)
    else:
        if road.mode == "curve":
            # Uniform Catmull–Rom spline through explicit, editable control points.
            sampled = []
            for index in range(len(points) - 1):
                a, b = points[max(0, index - 1)], points[index]
                c, d = points[index + 1], points[min(len(points) - 1, index + 2)]
                for step in range(8):
                    t = step / 8
                    sampled.append(
                        tuple(
                            0.5
                            * (
                                2 * b[axis]
                                + (-a[axis] + c[axis]) * t
                                + (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * t**2
                                + (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * t**3
                            )
                            for axis in (0, 1)
                        )
                    )
            points = [*sampled, points[-1]]
        route = LineString(points)
        if not route.is_simple or route.length < 0.1:
            raise ValueError("Road route must not cross itself and must be at least 0.1 m long.")
        result = route.buffer(road.width_m / 2, cap_style="flat", join_style="round", quad_segs=2)
        result = result.simplify(0.01, preserve_topology=True)
    if (
        result.geom_type != "Polygon"
        or not result.is_valid
        or result.is_empty
        or result.interiors
        or result.area < 0.01
        or len(result.exterior.coords) > 129
    ):
        raise ValueError("Unsupported road footprint. Use fewer points and avoid loops or holes.")
    return mapping(transform(result, inverse.transform, interleaved=False))
