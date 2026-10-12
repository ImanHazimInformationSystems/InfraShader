"""Validated local quantities; geographic coordinates are never treated as metres.

The initial ground-site kernel accepts simple, two-dimensional Polygon exteriors
and LineStrings. It deliberately rejects holes, multipart geometry, cross-zone
sites and extents over 5 km. A suitable WGS84 UTM CRS is chosen before any metric
operation. These calculated quantities do not certify the source measurement.
The project locator may span up to 0.2 degrees; its extent is not a metric-work
boundary. Every quantity geometry must independently satisfy this 5 km limit.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from math import floor, hypot, isfinite
from typing import Any, Literal

from pyproj import CRS, Transformer
from pyproj.exceptions import CRSError, ProjError
from shapely import LineString, Polygon, is_valid_reason, transform
from shapely.geometry import mapping
from shapely.geometry.base import BaseGeometry

MAX_VERTICES = 128  # Excludes a Polygon's required closing coordinate.
MAX_SITE_SPAN_M = 5_000.0
MAX_METRIC_COORDINATE = 100_000_000.0
WGS84 = "EPSG:4326"
QuantityUnit = Literal["m2", "m", "item"]
Provenance = Literal[
    "measured", "sourced", "estimated", "manually_entered", "imported", "calculated"
]
Coordinate = tuple[float, float]


class GeometryValidationError(ValueError):
    """Input cannot produce a supported, trustworthy local metric quantity."""


@dataclass(frozen=True)
class ProjectedGeometry:
    geometry: BaseGeometry
    source_geometry: dict[str, Any]
    source_crs: str
    metric_crs: str


@dataclass(frozen=True)
class CalculatedQuantity:
    value: float
    unit: QuantityUnit
    metric_crs: str | None
    method: str


@dataclass(frozen=True)
class ActiveQuantity:
    calculated: CalculatedQuantity
    value: float
    provenance: Provenance
    source_note: str
    is_override: bool


def _number(value: Any) -> float:
    # bool is an int subclass and must not silently become a coordinate or count.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise GeometryValidationError("Coordinates must be finite numeric values.")
    try:
        number = float(value)
    except OverflowError as exc:
        raise GeometryValidationError("Coordinates must be finite numeric values.") from exc
    if not isfinite(number):
        raise GeometryValidationError("Coordinates must be finite numeric values.")
    return number


def _sequence(value: Any) -> bool:
    return isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray))


def _coordinates(geojson: Mapping[str, Any], *, geographic: bool) -> list[Coordinate]:
    if not isinstance(geojson, Mapping):
        raise GeometryValidationError("Supply a GeoJSON geometry object.")
    if "crs" in geojson:
        raise GeometryValidationError(
            "Declare CRS separately; GeoJSON crs members are unsupported."
        )
    kind = geojson.get("type")
    raw = geojson.get("coordinates")
    if kind == "Polygon":
        if not _sequence(raw) or len(raw) != 1:
            raise GeometryValidationError(
                "Only simple Polygon exteriors without holes are supported."
            )
        raw = raw[0]
    elif kind != "LineString":
        raise GeometryValidationError("Only Polygon and LineString geometries are supported.")
    if not _sequence(raw):
        raise GeometryValidationError("Geometry coordinates must be an array.")
    limit = MAX_VERTICES + (1 if kind == "Polygon" else 0)
    if len(raw) > limit:
        raise GeometryValidationError(f"Geometry exceeds the {MAX_VERTICES}-vertex limit.")

    coordinates = []
    for coordinate in raw:
        if not _sequence(coordinate) or len(coordinate) != 2:
            raise GeometryValidationError("Each coordinate must contain exactly two values.")
        x, y = (_number(value) for value in coordinate)
        if geographic and not (-180 <= x <= 180 and -80 <= y <= 84):
            raise GeometryValidationError("Use longitude [-180, 180] and UTM latitude [-80, 84].")
        if not geographic and max(abs(x), abs(y)) > MAX_METRIC_COORDINATE:
            raise GeometryValidationError("Projected coordinates exceed supported numeric bounds.")
        coordinates.append((x, y))

    if kind == "Polygon":
        if len(coordinates) < 4 or coordinates[0] != coordinates[-1]:
            raise GeometryValidationError(
                "A Polygon needs at least three vertices and a closed ring."
            )
        distinct = coordinates[:-1]
    else:
        if len(coordinates) < 2:
            raise GeometryValidationError("A LineString needs at least two vertices.")
        distinct = coordinates
    if any(a == b for a, b in zip(coordinates, coordinates[1:], strict=False)):
        raise GeometryValidationError("Duplicate consecutive vertices are not supported.")
    if len(set(distinct)) != len(distinct):
        raise GeometryValidationError("Repeated vertices are not supported in simple geometry.")
    return coordinates


def _geometry(geojson: Mapping[str, Any], *, geographic: bool) -> BaseGeometry:
    coordinates = _coordinates(geojson, geographic=geographic)
    geometry = Polygon(coordinates) if geojson["type"] == "Polygon" else LineString(coordinates)
    if geometry.is_empty or not geometry.is_valid:
        raise GeometryValidationError(f"Invalid geometry: {is_valid_reason(geometry)}.")
    if not geometry.is_simple:
        raise GeometryValidationError("Self-intersecting geometry is not supported.")
    if geometry.geom_type == "Polygon" and geometry.area <= 0:
        raise GeometryValidationError("A Polygon must have positive area.")
    if geometry.length <= 0:
        raise GeometryValidationError("Geometry must have positive length.")
    return geometry


def _utm_epsg(longitude: float, latitude: float) -> int:
    # Conservative standard 6-degree UTM zones. Sites spanning a zone boundary
    # or the equator require a separately reviewed CRS outside this MVP kernel.
    zone = max(1, min(60, floor((longitude + 180) / 6) + 1))
    return (32600 if latitude >= 0 else 32700) + zone


def _local_extent(geometry: BaseGeometry) -> None:
    min_x, min_y, max_x, max_y = geometry.bounds
    if not all(isfinite(value) for value in geometry.bounds):
        raise GeometryValidationError("Projection produced non-finite coordinates.")
    if hypot(max_x - min_x, max_y - min_y) > MAX_SITE_SPAN_M:
        raise GeometryValidationError(
            "Use a local site with a diagonal extent no greater than 5 km."
        )


def _metric_crs(value: str) -> CRS:
    if not isinstance(value, str) or not value.strip():
        raise GeometryValidationError("Declare a metre-based projected metric CRS.")
    try:
        crs = CRS.from_user_input(value)
    except CRSError as exc:
        raise GeometryValidationError("Metric CRS could not be read.") from exc
    if (
        not crs.is_projected
        or len(crs.axis_info) != 2
        or any(axis.unit_conversion_factor != 1.0 for axis in crs.axis_info)
    ):
        raise GeometryValidationError(
            "Metric calculation requires a projected CRS with metre axes."
        )
    return crs


def project_wgs84_geometry(
    geojson: Mapping[str, Any],
    *,
    source_crs: str,
    site_boundary: Mapping[str, Any] | None = None,
) -> ProjectedGeometry:
    """Project one local WGS84 geometry, optionally constrained by a site boundary.

    When supplied, the site boundary selects the CRS and must cover the complete
    work geometry. Crossing UTM zones/hemispheres or a 5 km diagonal is rejected.
    A standalone geometry defines its own local scope (for boundary intake).
    """
    if source_crs != WGS84:
        raise GeometryValidationError("Geographic transfer must explicitly declare EPSG:4326.")
    source = _geometry(geojson, geographic=True)
    scope = source if site_boundary is None else _geometry(site_boundary, geographic=True)
    if site_boundary is not None and scope.geom_type != "Polygon":
        raise GeometryValidationError("A site boundary must be a Polygon.")
    if site_boundary is not None and not scope.covers(source):
        raise GeometryValidationError("Work geometry must stay within the declared site boundary.")

    min_x, min_y, max_x, max_y = scope.bounds
    center = ((min_x + max_x) / 2, (min_y + max_y) / 2)
    epsg = _utm_epsg(*center)
    all_points = _coordinates(geojson, geographic=True)
    if site_boundary is not None:
        all_points += _coordinates(site_boundary, geographic=True)
    if any(_utm_epsg(*point) != epsg for point in all_points):
        raise GeometryValidationError(
            "A local site must remain within one UTM zone and hemisphere."
        )
    metric_crs = f"EPSG:{epsg}"
    transformer = Transformer.from_crs(WGS84, metric_crs, always_xy=True)
    try:
        projected = transform(
            source, lambda x, y: transformer.transform(x, y, errcheck=True), interleaved=False
        )
        projected_scope = transform(
            scope, lambda x, y: transformer.transform(x, y, errcheck=True), interleaved=False
        )
    except ProjError as exc:
        raise GeometryValidationError(
            "Coordinates could not be projected into the local CRS."
        ) from exc
    _local_extent(projected_scope)
    _local_extent(projected)
    # Revalidate after projection; do not silently repair a collapsed or invalid ring.
    _geometry(mapping(projected), geographic=False)
    return ProjectedGeometry(
        source_geometry=dict(mapping(source)),
        geometry=projected,
        source_crs=WGS84,
        metric_crs=metric_crs,
    )


def calculate_metric_quantity(geojson: Mapping[str, Any], *, metric_crs: str) -> CalculatedQuantity:
    """Measure already projected geometry; caller declares its actual CRS.

    This low-level helper also supports exact local metre fixtures. Its declared
    CRS verifies units; WGS84 intake must use project_wgs84_geometry instead.
    """
    crs = _metric_crs(metric_crs)
    geometry = _geometry(geojson, geographic=False)
    _local_extent(geometry)
    is_area = geometry.geom_type == "Polygon"
    return CalculatedQuantity(
        value=geometry.area if is_area else geometry.length,
        unit="m2" if is_area else "m",
        metric_crs=crs.to_string(),
        method="projected_polygon_area" if is_area else "projected_line_length",
    )


def calculate_geographic_quantity(
    geojson: Mapping[str, Any],
    *,
    source_crs: str,
    site_boundary: Mapping[str, Any] | None = None,
) -> CalculatedQuantity:
    projected = project_wgs84_geometry(geojson, source_crs=source_crs, site_boundary=site_boundary)
    return calculate_metric_quantity(mapping(projected.geometry), metric_crs=projected.metric_crs)


def count_quantity(count: int) -> CalculatedQuantity:
    if isinstance(count, bool) or not isinstance(count, int) or not 0 <= count <= 1_000_000:
        raise GeometryValidationError("Count must be an integer between 0 and 1,000,000.")
    return CalculatedQuantity(
        value=float(count), unit="item", metric_crs=None, method="explicit_count"
    )


def select_active_quantity(
    calculated: CalculatedQuantity,
    *,
    provenance: Provenance,
    source_note: str,
    override: float | None = None,
) -> ActiveQuantity:
    """Keep a calculation intact when a documented active quantity overrides it."""
    if provenance not in {
        "measured",
        "sourced",
        "estimated",
        "manually_entered",
        "imported",
        "calculated",
    }:
        raise GeometryValidationError("Quantity provenance is unsupported.")
    if not isinstance(source_note, str) or not source_note.strip() or len(source_note) > 2_000:
        raise GeometryValidationError("A source note of 1 to 2,000 characters is required.")
    value = calculated.value if override is None else _number(override)
    if value < 0 or (calculated.unit != "item" and value <= 0):
        raise GeometryValidationError("Active quantity must be positive (count may be zero).")
    if calculated.unit == "item" and (not value.is_integer() or value > 1_000_000):
        raise GeometryValidationError("An active count must be an integer up to 1,000,000.")
    if override is not None and provenance == "calculated":
        raise GeometryValidationError("An override needs its own non-calculated provenance.")
    return ActiveQuantity(
        calculated=calculated,
        value=value,
        provenance=provenance,
        source_note=source_note.strip(),
        is_override=override is not None,
    )
