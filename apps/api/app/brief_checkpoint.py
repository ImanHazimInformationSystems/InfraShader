"""K01 evidence of acknowledgement of an exact brief; never a digital signature."""

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import access
from app.auth import current_user
from app.db import database_session
from app.errors import APIError
from app.models import BriefCheckpoint, Evidence, Project
from app.schemas import BriefDetails, Contract

router = APIRouter(
    prefix="/api/v1/organisations/{organisation_id}/projects/{project_id}/brief-checkpoints"
)
DB = Annotated[Session, Depends(database_session)]
User = Annotated[UUID, Depends(current_user)]


class CheckpointInput(Contract):
    expected_project_revision: int = Field(ge=1)
    expected_checkpoint_version: int = Field(ge=0)
    status: Literal["not_confirmed", "acknowledged"]
    issue_policy: Literal["draft_only", "qualified_issue"] = "draft_only"
    person: str = Field(default="", max_length=160)
    confirmation_date: date | None = None
    method: str = Field(default="", max_length=1000)
    note: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[UUID] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def acknowledgement_evidence(self):
        if len(set(self.evidence_ids)) != len(self.evidence_ids):
            raise ValueError("Select each evidence record once.")
        if self.status == "acknowledged" and not (
            self.person and self.confirmation_date and self.method and self.evidence_ids
        ):
            raise ValueError(
                "Acknowledgement needs the external person, date, method and attached evidence."
            )
        if self.status == "not_confirmed" and (
            self.person or self.confirmation_date or self.method or self.evidence_ids
        ):
            raise ValueError(
                "An unconfirmed brief cannot carry an acknowledgement. "
                "Use the note for outstanding work."
            )
        return self


def latest(db, project_id):
    return db.scalar(
        select(BriefCheckpoint)
        .where(BriefCheckpoint.project_id == project_id)
        .order_by(BriefCheckpoint.version.desc())
        .limit(1)
    )


def snapshot(db, project):
    row = latest(db, project.id)
    details = BriefDetails.model_validate(project.details)
    current = row is not None and row.project_revision == project.revision
    if not current:
        reason = "Brief not confirmed. " + (
            "The brief changed after the previous checkpoint."
            if row
            else "No acknowledgement has been recorded."
        )
    elif row.payload["status"] == "acknowledged":
        reason = (
            "Recorded acknowledgement evidence; "
            "not a digital signature or independent verification."
        )
    else:
        reason = "Brief explicitly recorded as not confirmed."
    return {
        "status": row.payload["status"] if current else "not_confirmed",
        "issue_policy": row.payload["issue_policy"] if row else "qualified_issue",
        "checkpoint_id": str(row.id) if current else None,
        "checkpoint_version": row.version if row else 0,
        "brief_revision": project.revision,
        "reason": reason,
        "scope": details.scope.model_dump(mode="json"),
        "budget_min": str(details.budget_min) if details.budget_min is not None else None,
        "budget_max": str(details.budget) if details.budget is not None else None,
        "currency": project.currency,
        "acknowledgement": row.payload if current else None,
    }


@router.get("")
def history(
    organisation_id: UUID,
    project_id: UUID,
    user: User,
    db: DB,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    project = access.require_project(db, organisation_id, project_id, user)
    rows = db.scalars(
        select(BriefCheckpoint)
        .where(BriefCheckpoint.project_id == project_id)
        .order_by(BriefCheckpoint.version.desc())
        .limit(50)
        .offset(offset)
    ).all()
    return {
        "current": snapshot(db, project),
        "items": [
            {
                "id": str(row.id),
                "version": row.version,
                "brief_revision": row.project_revision,
                "created_at": row.created_at,
                "created_by": str(row.created_by),
                "data": row.payload,
            }
            for row in rows
        ],
        "offset": offset,
        "limit": 50,
    }


@router.post("", status_code=201)
def record(organisation_id: UUID, project_id: UUID, data: CheckpointInput, user: User, db: DB):
    access.require_project(db, organisation_id, project_id, user, "edit_project")
    project = db.scalar(
        select(Project)
        .where(Project.id == project_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    prior = latest(db, project_id)
    if project.archived:
        raise APIError(
            409, "project_archived", "Restore the project before recording a checkpoint."
        )
    if data.issue_policy == "qualified_issue":
        access.require_project(
            db,
            organisation_id,
            project_id,
            user,
            "issue_proposal"
            if project.purpose == "contractor_proposal"
            else "issue_developer_brief",
        )
    if (
        project.revision != data.expected_project_revision
        or (prior.version if prior else 0) != data.expected_checkpoint_version
    ):
        raise APIError(
            409,
            "revision_conflict",
            "The brief or checkpoint changed. Reload before recording acknowledgement.",
        )
    details = BriefDetails.model_validate(project.details)
    if data.status == "acknowledged" and not all(
        (
            details.scope.deliverables,
            details.scope.inclusions,
            details.scope.exclusions,
            details.scope.intended_use,
        )
    ):
        raise APIError(
            422,
            "scope_incomplete",
            "Record deliverables, inclusions, exclusions and intended use in the brief first.",
        )
    if (
        data.confirmation_date
        and data.confirmation_date > datetime.now(ZoneInfo(project.timezone)).date()
    ):
        raise APIError(422, "future_confirmation", "Confirmation cannot be dated in the future.")
    evidence = db.scalars(
        select(Evidence)
        .where(
            Evidence.project_id == project_id,
            Evidence.id.in_(data.evidence_ids),
            Evidence.archived.is_(False),
        )
        .with_for_update()
    ).all()
    if len(evidence) != len(data.evidence_ids):
        raise APIError(
            422, "confirmation_evidence", "Choose available evidence attached to this project."
        )
    payload = data.model_dump(
        mode="json",
        exclude={"expected_project_revision", "expected_checkpoint_version", "evidence_ids"},
    )
    payload["evidence"] = [
        {
            "id": str(row.id),
            "revision": row.revision,
            "sha256": row.sha256,
            "description": row.description,
            "source_note": row.source_note,
        }
        for row in evidence
    ]
    payload["scope"] = details.scope.model_dump(mode="json")
    row = BriefCheckpoint(
        project_id=project_id,
        version=(prior.version if prior else 0) + 1,
        project_revision=project.revision,
        payload=payload,
        created_by=user,
    )
    db.add(row)
    db.flush()
    result = snapshot(db, project)
    db.commit()
    return result
