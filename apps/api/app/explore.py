"""Bounded, stateless preview of provider-derived buildings; never project evidence."""

from datetime import datetime
from math import isfinite
from typing import Annotated, Literal

from pydantic import Field
from pyproj import Proj, Transformer
from shapely import Polygon, transform, union_all
from shapely.geometry import mapping

from app.domain.shade import project_shadow, solar_position
from app.workspace import StrictModel

Coordinate = tuple[Annotated[float, Field(ge=-180, le=180)], Annotated[float, Field(ge=-80, le=80)]]


class PreviewBuilding(StrictModel):
    ring: Annotated[list[Coordinate], Field(min_length=4, max_length=128)]
    height: Annotated[float, Field(gt=0, le=1000)]


class ExploreInput(StrictModel):
    center: Coordinate
    timestamp: datetime
    buildings: Annotated[list[PreviewBuilding], Field(max_length=500)]
    source: Literal["provider_tiles"] = "provider_tiles"


def preview(data: ExploreInput):
    lon, lat = data.center
    solar = solar_position(data.timestamp, lon, lat)
    if not all(isfinite(value) for value in solar.values()):
        raise ValueError("Solar position unavailable for this location/time.")
    if sum(len(item.ring) for item in data.buildings) > 10000:
        raise ValueError("Preview limit exceeded. Zoom in to a smaller area.")
    zone = min(60, int((lon + 180) // 6) + 1)
    crs = f"EPSG:{32600 + zone if lat >= 0 else 32700 + zone}"
    forward = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    inverse = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    elevation = solar["elevation_deg"]
    status = "night" if elevation <= 0 else "low_sun" if elevation < 5 else "preview"
    polygons = []
    omitted = 0
    for item in data.buildings:
        if any(abs(x - lon) > 0.15 or abs(y - lat) > 0.15 for x, y in item.ring):
            raise ValueError("Building data is outside the local preview area. Zoom in.")
        polygon = Polygon(item.ring)
        if item.ring[0] != item.ring[-1] or not polygon.is_valid or polygon.area <= 0:
            omitted += 1
            continue
        if status == "preview":
            metric = transform(polygon, forward.transform, interleaved=False)
            polygons.append(
                project_shadow(
                    metric,
                    item.height,
                    elevation,
                    solar["azimuth_deg"],
                    roof_only=False,
                    convergence=Proj(crs).get_factors(lon, lat).meridian_convergence,
                    max_height=1000,
                )
            )
    features = []
    if polygons:
        shadow = transform(union_all(polygons), inverse.transform, interleaved=False)
        features.append({"type": "Feature", "properties": {}, "geometry": mapping(shadow)})
    return {
        "status": status,
        "solar": solar,
        "building_count": len(data.buildings) - omitted,
        "omitted": omitted,
        "shadows": {"type": "FeatureCollection", "features": features},
        "metric_crs": crs,
        "limitations": (
            "Estimated provider heights; loaded tiles only; flat ground. "
            "Trees, terrain and remote obstructions excluded. Not verified project analysis."
        ),
    }
