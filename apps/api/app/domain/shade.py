"""Restricted opaque solids/roof projection onto a horizontal ground plane.

This is a geometric model, not a measurement of site comfort or field accuracy.
Tree crowns, terrain, transparency, diffuse light and remote obstructions are excluded.
"""

from datetime import datetime
from math import cos, isfinite, radians, sin, tan

import pandas as pd
from pvlib.solarposition import get_solarposition
from pyproj import Proj, Transformer
from shapely import Polygon, transform, union_all
from shapely.affinity import translate
from shapely.geometry import mapping

from app.domain.geometry import project_wgs84_geometry

MIN_ELEVATION = 5.0


def solar_position(timestamp: datetime, longitude: float, latitude: float) -> dict:
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        raise ValueError("An explicit timezone offset is required.")
    if not 2000 <= timestamp.year <= 2100:
        raise ValueError("Supported analysis years are 2000–2100.")
    position = get_solarposition(
        pd.DatetimeIndex([timestamp]), latitude, longitude, altitude=0, method="nrel_numpy"
    ).iloc[0]
    return {"azimuth_deg": float(position.azimuth), "elevation_deg": float(position.elevation)}


def project_shadow(
    footprint: Polygon,
    height: float,
    elevation: float,
    azimuth: float,
    *,
    roof_only: bool,
    convergence: float = 0,
):
    if not all(isfinite(n) for n in (height, elevation, azimuth, convergence)):
        raise ValueError("Solar and height inputs must be finite.")
    if height <= 0 or height > 100 or not MIN_ELEVATION <= elevation <= 90:
        raise ValueError("Height or solar elevation is outside the supported range.")
    distance = height / tan(radians(elevation))
    bearing = radians(azimuth - convergence)
    dx, dy = -distance * sin(bearing), -distance * cos(bearing)
    roof = translate(footprint, xoff=dx, yoff=dy)
    if roof_only:
        return roof
    # Sweeping each edge supports concave footprints without convex-hull overstatement.
    parts = [footprint, roof]
    vertices = list(footprint.exterior.coords)
    for first, second in zip(vertices, vertices[1:], strict=False):
        edge = Polygon(
            [first, second, (second[0] + dx, second[1] + dy), (first[0] + dx, first[1] + dy)]
        )
        if edge.area > 1e-10:
            parts.append(edge)
    return union_all(parts)


def analyse_workspace(data: dict, timestamp: datetime, target_id: str) -> dict:
    target = next((target for target in data["targets"] if target["id"] == target_id), None)
    if target is None:
        raise ValueError("Select a saved target zone.")
    boundary = project_wgs84_geometry(data["boundary"], source_crs="EPSG:4326")
    geographic_center = data["boundary"]["coordinates"][0]
    longitude = sum(p[0] for p in geographic_center[:-1]) / (len(geographic_center) - 1)
    latitude = sum(p[1] for p in geographic_center[:-1]) / (len(geographic_center) - 1)
    solar = solar_position(timestamp, longitude, latitude)
    status = (
        "night"
        if solar["elevation_deg"] <= 0
        else "low_sun"
        if solar["elevation_deg"] < MIN_ELEVATION
        else "modeled"
    )
    result = {
        "timestamp": timestamp.isoformat(),
        "target_id": target_id,
        "solar": solar,
        "status": status,
        "method": "pvlib_nrel_numpy/opaque_ground_projection_v1",
        "metric_crs": boundary.metric_crs,
        "limitations": [
            "Flat horizontal ground; opaque buildings and elevated roof surfaces only.",
            "Trees, terrain, diffuse light and unknown obstructions excluded.",
            "Modelled result; site measurements and field tolerance acceptance are pending.",
        ],
        "scenarios": {},
    }
    if status != "modeled":
        return result
    target_metric = project_wgs84_geometry(
        target["geometry"], source_crs="EPSG:4326", site_boundary=data["boundary"]
    ).geometry
    convergence = Proj(boundary.metric_crs).get_factors(longitude, latitude).meridian_convergence
    inverse = Transformer.from_crs(boundary.metric_crs, "EPSG:4326", always_xy=True)
    for key, scenario in data["scenarios"].items():
        shadows = []
        excluded = []
        for item in scenario["items"]:
            if item["kind"] not in ("building", "canopy"):
                if item["kind"] == "tree":
                    excluded.append(item["name"])
                continue
            footprint = project_wgs84_geometry(
                item["geometry"], source_crs="EPSG:4326", site_boundary=data["boundary"]
            ).geometry
            shadows.append(
                project_shadow(
                    footprint,
                    item["height_m"],
                    solar["elevation_deg"],
                    solar["azimuth_deg"],
                    roof_only=item["kind"] == "canopy",
                    convergence=convergence,
                )
            )
        clipped = union_all(shadows).intersection(target_metric)
        geographic = transform(clipped, inverse.transform, interleaved=False)
        result["scenarios"][key] = {
            "name": scenario["name"],
            "area_m2": clipped.area,
            "target_area_m2": target_metric.area,
            "coverage_percent": 100 * clipped.area / target_metric.area,
            "shadow_geometry": mapping(geographic),
            "excluded_trees": excluded,
        }
    return result
