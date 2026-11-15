"""Bounded, stateless preview of provider-derived buildings; never project evidence."""

from datetime import date, datetime, time, timedelta, timezone
from math import isfinite
from typing import Annotated, Literal

import pandas as pd
from pvlib.solarposition import get_solarposition
from pydantic import Field
from pyproj import Proj, Transformer
from shapely import Polygon, transform, union_all
from shapely.geometry import mapping

from app.domain.shade import project_shadow, solar_position
from app.workspace import StrictModel

Coordinate = tuple[Annotated[float, Field(ge=-180, le=180)], Annotated[float, Field(ge=-80, le=80)]]


class SolarDayInput(StrictModel):
    center: Coordinate
    date: date
    utc_offset: Annotated[float, Field(ge=-12, le=14, allow_inf_nan=False)]


def solar_day(data: SolarDayInput):
    """One bounded local day; exact minute positions use the same model as shadows.

    Events are minute-resolution geometric crossings of -0.833 degrees (standard
    approximate sunrise/set convention), not terrain-aware observed visibility.
    """
    if not 2000 <= data.date.year <= 2100:
        raise ValueError("Supported analysis years are 2000-2100.")
    local = timezone(timedelta(hours=data.utc_offset))
    start = datetime.combine(data.date, time(), tzinfo=local)
    times = pd.date_range(start, periods=1441, freq="min")
    positions = get_solarposition(
        times, data.center[1], data.center[0], altitude=0, method="nrel_numpy"
    )
    samples = [
        {"azimuth_deg": float(a), "elevation_deg": float(e)}
        for a, e in zip(positions.azimuth, positions.elevation, strict=True)
    ]
    if not all(isfinite(v) for sample in samples for v in sample.values()):
        raise ValueError("Solar position unavailable for this location/date.")
    elevations = [sample["elevation_deg"] for sample in samples]
    events = {"sunrise": None, "solar_noon": None, "sunset": None}
    for i in range(1440):
        left, right = elevations[i], elevations[i + 1]
        if left < -0.833 <= right:
            events["sunrise"] = i + 1
        if left >= -0.833 > right:
            events["sunset"] = i
    # A local day need not contain a transit if an unrelated offset was chosen.
    noon = max(range(1441), key=elevations.__getitem__)
    if 0 < noon < 1440:
        events["solar_noon"] = noon
    return {
        "date": data.date.isoformat(),
        "utc_offset": data.utc_offset,
        "center": data.center,
        "samples": samples,
        "events": events,
        "event_resolution_minutes": 1,
        "model": "pvlib_nrel_numpy/geometric_elevation",
    }


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
