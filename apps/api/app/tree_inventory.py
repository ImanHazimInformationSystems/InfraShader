"""Project tree records. Display dimensions never become analytical shade inputs."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SiteTree(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=160, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:-]*$")
    name: str = Field(min_length=1, max_length=160)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    latitude: float = Field(ge=-85, le=85, allow_inf_nan=False)
    status: Literal["retain", "remove"] = "retain"
    origin: Literal["manual", "geojson", "osm"] = "manual"
    source: str = Field(min_length=1, max_length=500)
    attribution: str = Field(min_length=1, max_length=500)
    source_id: str = Field(default="", max_length=200)
    species: str = Field(default="", max_length=160)
    form: Literal["broadleaf", "conifer", "palm", "unknown"] = "unknown"
    height_m: float | None = Field(default=None, gt=0, le=120, allow_inf_nan=False)
    crown_diameter_m: float | None = Field(default=None, gt=0, le=80, allow_inf_nan=False)
    dimensions_source: str = Field(default="", max_length=500)
    uncertainty: str = Field(default="", max_length=1000)
    removal_reason: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def dimension_evidence(self):
        if (
            self.height_m is not None or self.crown_diameter_m is not None
        ) and not self.dimensions_source:
            raise ValueError("Record the source or explicit assumption for tree dimensions")
        return self
