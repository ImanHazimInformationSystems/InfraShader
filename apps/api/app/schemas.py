import math
from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Purpose = Literal["developer_decision", "contractor_proposal"]
Capability = Literal[
    "manage_members",
    "change_catalogue",
    "internal_pricing",
    "issue_developer_brief",
    "issue_proposal",
]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Site(Contract):
    bounds: tuple[float, float, float, float]
    crs: Literal["EPSG:4326"] = "EPSG:4326"

    @field_validator("bounds")
    @classmethod
    def valid_bounds(cls, value: tuple[float, float, float, float]):
        west, south, east, north = value
        if not all(math.isfinite(x) for x in value):
            raise ValueError("Site coordinates must be finite")
        if not (-180 <= west < east <= 180 and -85 <= south < north <= 85):
            raise ValueError("Use west < east in ±180 and south < north in ±85 degrees")
        if east - west > 0.2 or north - south > 0.2:
            raise ValueError("Choose a small-site extent no more than 0.2 degrees wide or high")
        return value


class Stakeholder(Contract):
    name: str = Field(min_length=1, max_length=160)
    role: str = Field(default="", max_length=160)
    needs: str = Field(default="", max_length=2000)


class BriefDetails(Contract):
    project_type: str = Field(default="", max_length=160)
    budget: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    priorities: str = Field(default="", max_length=4000)
    constraints: str = Field(default="", max_length=4000)
    stakeholders: list[Stakeholder] = Field(default_factory=list, max_length=30)


class ProjectCreate(Contract):
    details: BriefDetails = Field(default_factory=BriefDetails)
    name: str = Field(min_length=1, max_length=160)
    purpose: Purpose
    stakeholder: str = Field(min_length=1, max_length=160)
    problem: str = Field(default="", max_length=4000)
    intended_users: str = Field(default="", max_length=2000)
    desired_outcome: str = Field(default="", max_length=4000)
    use_periods: str = Field(default="", max_length=2000)
    site: Site
    timezone: str = "Asia/Kuala_Lumpur"
    currency: str = Field(default="MYR", pattern=r"^[A-Z]{3}$")

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Use a recognised IANA timezone, such as Asia/Kuala_Lumpur") from exc
        return value


class ProjectUpdate(Contract):
    details: BriefDetails | None = None
    expected_revision: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    purpose: Purpose | None = None
    stakeholder: str | None = Field(default=None, min_length=1, max_length=160)
    problem: str | None = Field(default=None, max_length=4000)
    intended_users: str | None = Field(default=None, max_length=2000)
    desired_outcome: str | None = Field(default=None, max_length=4000)
    use_periods: str | None = Field(default=None, max_length=2000)
    site: Site | None = None
    timezone: str | None = None
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    archived: bool | None = None

    @model_validator(mode="after")
    def valid_changes(self):
        changes = self.model_dump(exclude_unset=True, exclude={"expected_revision"})
        if not changes:
            raise ValueError("Provide at least one field to update")
        if any(value is None for value in changes.values()):
            raise ValueError(
                "Project fields cannot be null; use empty text for an incomplete brief"
            )
        if self.timezone is not None:
            ProjectCreate.valid_timezone(self.timezone)
        return self


class ProjectResponse(ProjectCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    organisation_id: UUID
    archived: bool
    revision: int
    updated_at: datetime
    created_at: datetime | None = None


class ProjectList(Contract):
    items: list[ProjectResponse]
    total: int
    limit: int
    offset: int


class OrganisationResponse(Contract):
    id: UUID
    name: str
    role: Literal["administrator", "member"]
    capabilities: list[Capability]


class SessionResponse(Contract):
    user_id: UUID
    organisations: list[OrganisationResponse]
