import math
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.tree_inventory import SiteTree

Purpose = Literal["developer_decision", "contractor_proposal"]
ProjectStage = Literal["brief", "site", "option", "estimate", "developer_brief", "proposal"]
Capability = Literal[
    "studio",
    "review",
    "read_project",
    "create_project",
    "edit_project",
    "edit_geometry",
    "edit_evidence",
    "analyse",
    "estimate",
    "review_project",
    "manage_project_access",
    "manage_members",
    "change_catalogue",
    "internal_pricing",
    "issue_developer_brief",
    "issue_proposal",
]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SiteOutline(Contract):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[tuple[float, float]]] = Field(min_length=1, max_length=1)

    @model_validator(mode="after")
    def valid_polygon(self):
        from shapely.geometry import Polygon

        ring = self.coordinates[0]
        if not 4 <= len(ring) <= 65 or ring[0] != ring[-1]:
            raise ValueError("Site outline needs a closed ring of 3 to 64 vertices")
        if not all(
            math.isfinite(x) and math.isfinite(y) and -180 <= x <= 180 and -85 <= y <= 85
            for x, y in ring
        ):
            raise ValueError("Site outline must use finite WGS84 longitude/latitude")
        polygon = Polygon(ring)
        if not polygon.is_valid or polygon.area <= 1e-14:
            raise ValueError("Site outline must be a non-zero polygon without crossing edges")
        return self


class Site(Contract):
    bounds: tuple[float, float, float, float]
    outline: SiteOutline | None = None
    crs: Literal["EPSG:4326"] = "EPSG:4326"
    trees: list[SiteTree] = Field(default_factory=list, max_length=500)

    @field_validator("trees")
    @classmethod
    def unique_trees(cls, trees):
        if len({tree.id for tree in trees}) != len(trees):
            raise ValueError("Tree IDs must be unique within a project")
        return trees

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

    @model_validator(mode="after")
    def outline_matches_bounds(self):
        if self.outline:
            from shapely.geometry import Polygon

            extent = Polygon(self.outline.coordinates[0]).bounds
            if any(abs(a - b) > 1e-8 for a, b in zip(extent, self.bounds, strict=True)):
                raise ValueError("Site bounds must match the outline envelope")
        return self


class Stakeholder(Contract):
    name: str = Field(min_length=1, max_length=160)
    role: str = Field(default="", max_length=160)
    needs: str = Field(default="", max_length=2000)


class ClientContact(Contract):
    name: str = Field(min_length=1, max_length=160)
    company: str = Field(default="", max_length=160)
    email: str = Field(default="", max_length=320)
    phone: str = Field(default="", max_length=80)
    source: str = Field(default="", max_length=1000)
    notes: str = Field(default="", max_length=2000)

    @field_validator("email")
    @classmethod
    def email_format(cls, value):
        import re

        if value and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter an email address or leave it blank.")
        return value


class Opportunity(Contract):
    owner: str = Field(default="", max_length=160)
    due_date: date | None = None
    stage: Literal["enquiry", "qualified", "design", "submitted", "won", "lost", "on_hold"] = (
        "enquiry"
    )
    tags: list[str] = Field(default_factory=list, max_length=20)
    source: str = Field(default="", max_length=1000)
    client: ClientContact | None = None

    @field_validator("tags")
    @classmethod
    def valid_tags(cls, values):
        clean = [value.strip() for value in values]
        if any(not value or len(value) > 40 for value in clean):
            raise ValueError("Tags must contain 1 to 40 characters.")
        return list(dict.fromkeys(clean))


class BriefFact(Contract):
    text: str = Field(min_length=1, max_length=2000)
    source: str = Field(min_length=1, max_length=1000)
    state: Literal["known", "estimated", "unknown"]


class BriefScope(Contract):
    deliverables: str = Field(default="", max_length=4000)
    inclusions: str = Field(default="", max_length=4000)
    exclusions: str = Field(default="", max_length=4000)
    intended_use: str = Field(default="", max_length=2000)
    unresolved_questions: str = Field(default="", max_length=4000)
    facts: list[BriefFact] = Field(default_factory=list, max_length=30)


class BriefDetails(Contract):
    scope: BriefScope = Field(default_factory=BriefScope)
    opportunity: Opportunity = Field(default_factory=Opportunity)
    budget_min: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    site_notes: str = Field(default="", max_length=8000)
    known_facts: str = Field(default="", max_length=4000)
    unknown_facts: str = Field(default="", max_length=4000)
    project_type: str = Field(default="", max_length=160)
    budget: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    priorities: str = Field(default="", max_length=4000)
    constraints: str = Field(default="", max_length=4000)
    stakeholders: list[Stakeholder] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def budget_range(self):
        if (
            self.budget_min is not None
            and self.budget is not None
            and self.budget_min > self.budget
        ):
            raise ValueError("Budget minimum cannot exceed the budget ceiling.")
        return self


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
    organisation_capabilities: list[Capability] = Field(default_factory=list)
    capabilities: list[Capability] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    organisation_id: UUID
    archived: bool
    revision: int
    updated_at: datetime
    created_at: datetime | None = None
    stage: ProjectStage = "brief"
    example: Literal["studio", "studio_a", "studio_b", "studio_c", "review"] | None = None


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
    workspaces: list[Literal["studio", "review"]]
    enabled_workspaces: list[Literal["studio", "review"]]
    workspace_setup_required: bool


class SessionResponse(Contract):
    user_id: UUID
    organisations: list[OrganisationResponse]
