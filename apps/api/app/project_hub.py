"""L01 reusable briefs and contacts, with project-grant checked duplication."""

from copy import deepcopy
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import access, projects, workspace
from app.auth import current_user
from app.db import database_session
from app.errors import APIError, not_found
from app.models import HubRecord, HubRecordRevision, Workspace, WorkspaceRevision
from app.schemas import ClientContact, Contract, ProjectCreate, ProjectResponse, Purpose

router = APIRouter(prefix="/api/v1/organisations/{organisation_id}")
DB = Annotated[Session, Depends(database_session)]
User = Annotated[UUID, Depends(current_user)]


class BriefTemplate(Contract):
    name: str = Field(min_length=1, max_length=160)
    purpose: Purpose = "contractor_proposal"
    problem: str = Field(default="", max_length=4000)
    intended_users: str = Field(default="", max_length=2000)
    desired_outcome: str = Field(default="", max_length=4000)
    use_periods: str = Field(default="", max_length=2000)
    project_type: str = Field(default="", max_length=160)
    priorities: str = Field(default="", max_length=4000)
    constraints: str = Field(default="", max_length=4000)


class RecordInput(Contract):
    kind: Literal["contact", "template"]
    data: dict

    def checked(self):
        schema = ClientContact if self.kind == "contact" else BriefTemplate
        from pydantic import ValidationError

        try:
            return schema.model_validate(self.data).model_dump(mode="json")
        except ValidationError as exc:
            raise APIError(422, "invalid_hub_record", str(exc)) from exc


class RecordUpdate(RecordInput):
    expected_revision: int = Field(ge=1)
    archived: bool = False


class RecordResponse(Contract):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    kind: Literal["contact", "template"]
    data: dict
    revision: int
    archived: bool
    updated_at: datetime


def require_hub(db, org, user):
    # A personal library cannot grant access to another person's projects or records.
    access.require_capability(db, org, user, "create_project")


@router.get("/hub")
def list_records(
    organisation_id: UUID,
    user: User,
    db: DB,
    kind: Literal["contact", "template"],
    archived: bool = False,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    require_hub(db, organisation_id, user)
    conditions = [
        HubRecord.organisation_id == organisation_id,
        HubRecord.owner_id == user,
        HubRecord.kind == kind,
        HubRecord.archived == archived,
    ]
    rows = db.scalars(
        select(HubRecord)
        .where(*conditions)
        .order_by(HubRecord.updated_at.desc(), HubRecord.id)
        .limit(100)
        .offset(offset)
    ).all()
    return {
        "items": [RecordResponse.model_validate(row) for row in rows],
        "total": db.scalar(select(func.count()).select_from(HubRecord).where(*conditions)),
        "offset": offset,
        "limit": 100,
    }


@router.post("/hub", response_model=RecordResponse, status_code=201)
def create_record(organisation_id: UUID, data: RecordInput, user: User, db: DB):
    require_hub(db, organisation_id, user)
    row = HubRecord(
        organisation_id=organisation_id, owner_id=user, kind=data.kind, data=data.checked()
    )
    db.add(row)
    db.flush()
    result = RecordResponse.model_validate(row)
    db.add(
        HubRecordRevision(
            record_id=row.id,
            revision=row.revision,
            payload=result.model_dump(mode="json"),
            changed_by=user,
        )
    )
    db.commit()
    return result


@router.patch("/hub/{record_id}", response_model=RecordResponse)
def update_record(organisation_id: UUID, record_id: UUID, data: RecordUpdate, user: User, db: DB):
    require_hub(db, organisation_id, user)
    row = db.scalar(
        select(HubRecord)
        .where(
            HubRecord.id == record_id,
            HubRecord.organisation_id == organisation_id,
            HubRecord.owner_id == user,
        )
        .with_for_update()
    )
    if row is None:
        raise not_found()
    if row.revision != data.expected_revision:
        raise APIError(409, "revision_conflict", "This record changed. Reload before saving.")
    if row.kind != data.kind:
        raise APIError(422, "record_kind", "A record's kind cannot change.")
    row.data, row.archived = data.checked(), data.archived
    row.revision += 1
    row.updated_at = func.now()
    db.flush()
    result = RecordResponse.model_validate(row)
    db.add(
        HubRecordRevision(
            record_id=row.id,
            revision=row.revision,
            payload=result.model_dump(mode="json"),
            changed_by=user,
        )
    )
    db.commit()
    return result


@router.get("/hub/{record_id}/history")
def record_history(
    organisation_id: UUID,
    record_id: UUID,
    user: User,
    db: DB,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    require_hub(db, organisation_id, user)
    row = db.scalar(
        select(HubRecord).where(
            HubRecord.id == record_id,
            HubRecord.organisation_id == organisation_id,
            HubRecord.owner_id == user,
        )
    )
    if row is None:
        raise not_found()
    rows = db.scalars(
        select(HubRecordRevision)
        .where(HubRecordRevision.record_id == record_id)
        .order_by(HubRecordRevision.revision.desc())
        .offset(offset)
        .limit(50)
    ).all()
    return {
        "items": [
            {"revision": r.revision, "created_at": r.created_at, "data": r.payload} for r in rows
        ],
        "offset": offset,
        "limit": 50,
    }


class DuplicateInput(Contract):
    name: str = Field(min_length=1, max_length=160)
    expected_revision: int = Field(ge=1)
    include_design: bool = False
    expected_workspace_revision: int = Field(default=0, ge=0)


def duplicate_design(data):
    """Copy inputs, recalculate derived values; project-local evidence never follows."""
    draft = {
        key: deepcopy(value)
        for key, value in data.items()
        if key in workspace.WorkspaceInput.model_fields
    }
    draft.update(expected_revision=0, plan_reference=None)
    for target in draft.get("targets", []):
        for key in list(target):
            if key not in workspace.Target.model_fields:
                del target[key]
        target["reference_calibration"] = None
    for constraint in draft.get("constraints", []):
        constraint.update(
            evidence_ids=[],
            status="unverified",
            verification_date=None,
            verified_by="",
            verification_reference="",
        )
    for scenario in draft["scenarios"].values():
        scenario.pop("terrain_anchors", None)
        for item in scenario["items"]:
            for key in list(item):
                if key not in workspace.WorkItem.model_fields:
                    del item[key]
            item["reference_calibration"] = None
    return workspace.WorkspaceInput.model_validate(draft)


@router.post("/projects/{project_id}/duplicate", response_model=ProjectResponse, status_code=201)
def duplicate_project(
    organisation_id: UUID, project_id: UUID, data: DuplicateInput, user: User, db: DB
):
    require_hub(db, organisation_id, user)
    source = access.require_project(db, organisation_id, project_id, user, "edit_project")
    # Lock the brief and design so a concurrent edit cannot change the requested snapshot.
    from app.models import Project

    source = db.scalar(
        select(Project)
        .where(Project.id == source.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if source.revision != data.expected_revision:
        raise APIError(409, "revision_conflict", "The source brief changed. Reload before copying.")
    fields = ProjectCreate.model_validate(
        ProjectResponse.model_validate(source).model_dump(include=set(ProjectCreate.model_fields))
    ).model_dump(mode="json")
    fields["name"] = data.name
    fields["details"]["opportunity"].update(stage="enquiry", owner="", due_date=None)
    design = None
    if data.include_design:
        access.require_project(db, organisation_id, project_id, user, "edit_geometry")
        saved = db.scalar(
            select(Workspace).where(Workspace.project_id == project_id).with_for_update()
        )
        if (saved.revision if saved else 0) != data.expected_workspace_revision:
            raise APIError(
                409, "revision_conflict", "The source design changed. Reload before copying."
            )
        if saved:
            design = workspace.validate_workspace(
                duplicate_design(saved.data), source.site["bounds"]
            )
    result = projects.create_project(
        db, organisation_id, user, ProjectCreate(**fields), commit=False
    )
    if design:
        db.add(Workspace(project_id=result.id, revision=1, data=design, updated_by=user))
        db.add(WorkspaceRevision(project_id=result.id, revision=1, payload=design, changed_by=user))
    db.commit()
    return result
