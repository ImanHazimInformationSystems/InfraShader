"""Presentation-only grass strokes; never measured or priced work."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from pyproj import Transformer
from pyproj.exceptions import ProjError
from shapely.geometry import Point, Polygon


class GroundStroke(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    texture: Literal["lawn", "meadow", "fine", "dry", "deep", "wild", "erase"]
    radius_m: Annotated[float, Field(ge=1, le=100)]
    points: Annotated[
        list[
            tuple[
                Annotated[float, Field(ge=-180, le=180)],
                Annotated[float, Field(ge=-80, le=84)],
            ]
        ],
        Field(min_length=1, max_length=64),
    ]


def validate_paint(strokes: list[GroundStroke], projected, site_bounds=None) -> None:
    forward = Transformer.from_crs(4326, projected.metric_crs, always_xy=True)
    scope = projected.geometry
    if site_bounds:
        w, s, e, n = site_bounds
        scope = Polygon([forward.transform(x, y) for x, y in [(w, s), (e, s), (e, n), (w, n)]])
    # Permit an edge brush to cross the boundary. Rendering clips to the exact
    # selected outline; distant/foreign-site strokes are never admitted.
    for stroke in strokes:
        envelope = scope.buffer(stroke.radius_m + 0.01)
        for point in stroke.points:
            try:
                position = Point(forward.transform(*point, errcheck=True))
            except ProjError as error:
                raise ValueError("Unsupported ground-paint coordinates.") from error
            if not envelope.covers(position):
                raise ValueError("Keep the grass brush on or near the selected site.")
