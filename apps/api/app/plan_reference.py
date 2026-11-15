"""Reference-only two-point similarity transform in the site's declared metric CRS."""

import hashlib
import json
from math import cos, hypot, radians, sin
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pyproj import Transformer


class PlanReference(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)
    evidence_id: UUID
    source_name: Annotated[str, Field(min_length=1, max_length=200)]
    source_sha256: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    page: Annotated[int, Field(ge=1, le=100)] = 1
    rights_confirmed: bool
    width: Annotated[int, Field(ge=2, le=8192)]
    height: Annotated[int, Field(ge=2, le=8192)]
    point_a: tuple[float, float]
    point_b: tuple[float, float]
    anchor: tuple[float, float]
    distance_m: Annotated[float, Field(gt=0, le=5000)]
    bearing_deg: Annotated[float, Field(ge=0, lt=360)]
    uncertainty_m: Annotated[float, Field(gt=0, le=1000)]
    source_note: Annotated[str, Field(min_length=1, max_length=2000)]
    locked: bool = True
    visible: bool = True
    opacity: Annotated[float, Field(ge=0, le=1)] = 0.5

    @model_validator(mode="after")
    def bounded(self):
        if not self.rights_confirmed:
            raise ValueError("Confirm permission to use this reference plan.")
        if self.width * self.height > 16_000_000:
            raise ValueError("Reference exceeds 16 million pixels.")
        for x, y in [self.point_a, self.point_b]:
            if not (0 <= x <= self.width and 0 <= y <= self.height):
                raise ValueError("Calibration points must be inside the image.")
        if hypot(self.point_b[0] - self.point_a[0], self.point_b[1] - self.point_a[1]) < 10:
            raise ValueError("Choose reference points at least 10 pixels apart.")
        if not (-180 <= self.anchor[0] <= 180 and -80 <= self.anchor[1] <= 84):
            raise ValueError("Anchor must be supported WGS84 longitude/latitude.")
        return self


def calibrate(plan: PlanReference, metric_crs: str, bounds):
    lon, lat = plan.anchor
    if not (bounds[0] <= lon <= bounds[2] and bounds[1] <= lat <= bounds[3]):
        raise ValueError("Anchor must be inside the project locator.")
    to_metric = Transformer.from_crs("EPSG:4326", metric_crs, always_xy=True)
    to_geo = Transformer.from_crs(metric_crs, "EPSG:4326", always_xy=True)
    ox, oy = to_metric.transform(lon, lat)
    ax, ay = plan.point_a
    dx, dy = plan.point_b[0] - ax, -(plan.point_b[1] - ay)
    length = hypot(dx, dy)
    scale = plan.distance_m / length
    if max(plan.width, plan.height) * scale > 10000:
        raise ValueError("Calibrated reference must fit within a 10 km extent.")
    # Bearing is explicitly grid north in the site's projected CRS.
    east, north = sin(radians(plan.bearing_deg)), cos(radians(plan.bearing_deg))
    c, s = (dx * east + dy * north) / length, (dx * north - dy * east) / length
    corners = []
    for x, y in [(0, 0), (plan.width, 0), (plan.width, plan.height), (0, plan.height)]:
        px, py = x - ax, -(y - ay)
        corners.append(
            list(to_geo.transform(ox + scale * (c * px - s * py), oy + scale * (s * px + c * py)))
        )
    inputs = plan.model_dump(mode="json", exclude={"opacity", "visible", "locked"})
    inputs["metric_crs"] = metric_crs
    digest = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
    return {
        **plan.model_dump(mode="json"),
        "corners": corners,
        "metric_crs": metric_crs,
        "calibration_id": digest,
        "metres_per_pixel": scale,
    }
