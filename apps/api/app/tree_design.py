"""Illustrative proposed tree appearance; purchased stock/rates remain explicit."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class TreeDesign(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    variant: Literal["canopy", "columnar", "evergreen", "palm"] = "canopy"
    scale: Annotated[float, Field(ge=0.25, le=3)] = 1
    rotation_deg: Annotated[float, Field(ge=0, lt=360)] = 0
    stock_spec: Annotated[str, Field(max_length=500)] = ""
    rate_reviewed: bool = False
