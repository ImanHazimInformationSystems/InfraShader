"""Private, revisioned observations; declarations never certify field accuracy."""

from datetime import date
from math import isfinite
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from shapely.geometry import Point, shape

from app.domain.geometry import GeometryValidationError, project_wgs84_geometry


class SiteConstraint(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    id: UUID
    title: Annotated[str, Field(min_length=1, max_length=160)]
    category: Literal["observation", "access", "utility", "setback", "existing_tree", "no_work"]
    description: Annotated[str, Field(min_length=1, max_length=4000)]
    source_type: Literal["measured", "supplied", "map_derived", "traced", "estimated"]
    source_note: Annotated[str, Field(min_length=1, max_length=2000)]
    uncertainty: Annotated[str, Field(min_length=1, max_length=2000)]
    geometry: dict[str, Any] | None = None
    location_consent: bool = False
    consent_note: Annotated[str, Field(max_length=1000)] = ""
    inspection_date: date | None = None
    evidence_ids: Annotated[list[UUID], Field(max_length=20)] = []
    related_ids: Annotated[list[UUID], Field(max_length=30)] = []
    status: Literal["unverified", "site_check", "verified", "resolved"] = "unverified"
    critical: bool = False
    responsible: Annotated[str, Field(max_length=160)] = ""
    due_date: date | None = None
    response: Annotated[str, Field(max_length=4000)] = ""
    resolution: Annotated[str, Field(max_length=4000)] = ""
    verified_by: Annotated[str, Field(max_length=160)] = ""
    verification_reference: Annotated[str, Field(max_length=2000)] = ""
    verification_date: date | None = None

    @model_validator(mode="after")
    def declarations(self):
        if self.geometry is not None and not (self.location_consent and self.consent_note):
            raise ValueError("Recording a location requires permission confirmation and its basis.")
        if len(set(self.evidence_ids)) != len(self.evidence_ids) or len(
            set(self.related_ids)
        ) != len(self.related_ids):
            raise ValueError("Evidence and geometry links must be unique.")
        if self.status in ("verified", "resolved"):
            if not (self.verified_by and self.verification_reference and self.verification_date):
                raise ValueError(
                    "Verification needs a named verifier, date and supplied reference."
                )
            if self.source_type not in ("measured", "supplied"):
                raise ValueError(
                    "Map-derived, traced or estimated observations cannot claim verification."
                )
        if self.status == "resolved" and not self.resolution:
            raise ValueError("Record the resolution before closing a site check.")
        if self.status == "site_check" and not self.responsible:
            raise ValueError("Assign a responsible person for a site check.")
        if self.source_type == "measured" and not self.inspection_date:
            raise ValueError("Measured observations need an inspection date.")
        if self.geometry and self.category == "observation" and not self.inspection_date:
            raise ValueError("Geotagged observations need an inspection date.")
        if (
            self.verification_date
            and self.inspection_date
            and self.verification_date < self.inspection_date
        ):
            raise ValueError("Verification cannot precede the recorded inspection.")
        return self


def validate_constraints(records, boundary, linked_ids):
    if len({record.id for record in records}) != len(records):
        raise GeometryValidationError("Constraint IDs must be unique.")
    for record in records:
        if not {str(value) for value in record.related_ids}.issubset(linked_ids):
            raise GeometryValidationError(
                "A constraint links to missing geometry; relink before saving."
            )
        geometry = record.geometry
        if geometry is None:
            continue
        if "crs" in geometry:
            raise GeometryValidationError(
                "Constraint geometry uses WGS84; embedded CRS is unsupported."
            )
        if geometry.get("type") == "Point":
            coordinates = geometry.get("coordinates")
            if (
                not isinstance(coordinates, list)
                or len(coordinates) != 2
                or any(
                    isinstance(v, bool) or not isinstance(v, (int, float)) or not isfinite(v)
                    for v in coordinates
                )
            ):
                raise GeometryValidationError(
                    "Use a finite longitude/latitude pair for the location."
                )
            if not shape(boundary).covers(Point(coordinates)):
                raise GeometryValidationError(
                    "Constraint location must stay within the site boundary."
                )
        else:
            project_wgs84_geometry(geometry, source_crs="EPSG:4326", site_boundary=boundary)


def constraint_summary(records):
    """Allowlisted, anonymous issue summary; never publish private notes/locations."""
    unresolved = [r for r in records if r["status"] not in ("verified", "resolved")]
    return {
        "total": len(records),
        "unverified": len(unresolved),
        "critical_unverified": sum(bool(r["critical"]) for r in unresolved),
        "notice": (
            "User-supplied site declarations only. Map labels do not verify buried utilities, "
            "setbacks or survey accuracy. Private constraint notes and locations are not included."
        ),
    }
