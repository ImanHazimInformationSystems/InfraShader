"""Explicit deletion of unissued projects, with durable private-file cleanup receipts."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app import access
from app.auth import current_user
from app.config import Settings, get_settings
from app.db import database_session
from app.errors import APIError, not_found
from app.evidence import PrivateStorage
from app.models import (
    AdministrationEvent,
    Artifact,
    Evidence,
    OpportunityInvitation,
    Project,
    ReviewEntry,
    ReviewFile,
)
from app.schemas import Contract

router = APIRouter(prefix="/api/v1/organisations/{organisation_id}")
DB = Annotated[Session, Depends(database_session)]
User = Annotated[UUID, Depends(current_user)]


class DeleteProject(Contract):
    expected_revision: int = Field(ge=1)
    confirmation_name: str = Field(min_length=1, max_length=160)


def authorised(db, org, project_id, user):
    project = access.require_project(db, org, project_id, user, "edit_project")
    if project.created_by != user:
        access.require_project(db, org, project_id, user, "manage_project_access")
    return project


def protection(db, project):
    if db.scalar(
        select(Artifact.id)
        .where(
            Artifact.project_id == project.id,
            Artifact.kind.in_(["proposal", "developer_brief"]),
        )
        .limit(1)
    ):
        return "This project has issued documents. Archive it to preserve those locked records."
    if db.scalar(
        select(ReviewEntry.id).where(ReviewEntry.project_id == project.id).limit(1)
    ) or db.scalar(select(ReviewFile.id).where(ReviewFile.project_id == project.id).limit(1)):
        return "This project has formal review records. Archive it to preserve the review history."
    if db.scalar(
        select(OpportunityInvitation.id)
        .where(
            or_(
                (OpportunityInvitation.owner_project_id == project.id)
                & (OpportunityInvitation.state != "draft"),
                OpportunityInvitation.contractor_project_id == project.id,
            )
        )
        .limit(1)
    ):
        return (
            "This project is part of a shared opportunity. Archive it to keep the invitation "
            "and submission records."
        )
    return None


@router.get("/projects/{project_id}/deletion")
def eligibility(organisation_id: UUID, project_id: UUID, user: User, db: DB):
    project = authorised(db, organisation_id, project_id, user)
    reason = protection(db, project)
    return {"allowed": reason is None, "reason": reason, "revision": project.revision}


def cleanup(db, job, storage_factory):
    # Each successful path has its own immutable receipt. Retrying after a crash is safe:
    # Storage DELETE is idempotent and no other project's paths are ever submitted.
    completed = set(
        db.scalars(
            select(AdministrationEvent.payload["path"].astext).where(
                AdministrationEvent.organisation_id == job.organisation_id,
                AdministrationEvent.payload["action"].astext == "project_file_deleted",
                AdministrationEvent.payload["job_id"].astext == str(job.id),
            )
        ).all()
    )
    remaining = [path for path in job.payload["paths"] if path not in completed]
    if not remaining:
        return 0
    try:
        storage = storage_factory()
        # Bound each request; the visible retry action drains any larger backlog.
        for path in remaining[:3]:
            storage.delete(path)
            db.add(
                AdministrationEvent(
                    organisation_id=job.organisation_id,
                    actor_id=job.actor_id,
                    payload={"action": "project_file_deleted", "job_id": str(job.id), "path": path},
                )
            )
            db.commit()
            completed.add(path)
    except Exception:
        # The deletion receipt already committed with the project removal. Keep pending
        # paths for explicit retry; never claim all private files were removed.
        db.rollback()
    return len(set(job.payload["paths"]) - completed)


def remove(db, org, project_id, user, data, storage_factory):
    authorised(db, org, project_id, user)
    project = db.scalar(
        select(Project)
        .where(Project.id == project_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if project is None:
        raise not_found()
    if project.revision != data.expected_revision:
        raise APIError(409, "revision_conflict", "This project changed. Reload it before deleting.")
    if data.confirmation_name != project.name:
        raise APIError(
            422, "delete_confirmation", "Type the exact project name to confirm deletion."
        )
    reason = protection(db, project)
    if reason:
        raise APIError(409, "project_retained", reason)
    paths = db.scalars(select(Evidence.object_path).where(Evidence.project_id == project_id)).all()
    job = AdministrationEvent(
        organisation_id=org,
        actor_id=user,
        payload={
            "action": "project_deleted",
            "project_id": str(project_id),
            "paths": list(paths),
        },
    )
    db.add(job)
    # DB foreign keys cascade draft workspaces, history, estimates, grants and evidence
    # metadata. Shared organisation rates and other projects stay untouched.
    db.execute(delete(Project).where(Project.id == project_id))
    db.commit()
    return {
        "deleted": True,
        "cleanup_id": str(job.id),
        "pending_files": cleanup(db, job, storage_factory),
    }


@router.delete("/projects/{project_id}")
def delete_project(
    organisation_id: UUID,
    project_id: UUID,
    data: DeleteProject,
    user: User,
    db: DB,
    settings: Annotated[Settings, Depends(get_settings)],
):
    return remove(db, organisation_id, project_id, user, data, lambda: PrivateStorage(settings))


def cleanup_jobs(db, org, user):
    access.require_capability(db, org, user, "read_project")
    return db.scalars(
        select(AdministrationEvent)
        .where(
            AdministrationEvent.organisation_id == org,
            AdministrationEvent.actor_id == user,
            AdministrationEvent.payload["action"].astext == "project_deleted",
        )
        .order_by(AdministrationEvent.created_at.desc())
    ).all()


@router.get("/project-deletions")
def pending_cleanup(organisation_id: UUID, user: User, db: DB):
    items = []
    for job in cleanup_jobs(db, organisation_id, user):
        done = db.scalars(
            select(AdministrationEvent.payload["path"].astext).where(
                AdministrationEvent.organisation_id == organisation_id,
                AdministrationEvent.payload["action"].astext == "project_file_deleted",
                AdministrationEvent.payload["job_id"].astext == str(job.id),
            )
        ).all()
        pending = len(set(job.payload["paths"]) - set(done))
        if pending:
            items.append({"id": str(job.id), "pending_files": pending})
    return {"items": items}


@router.post("/project-deletions/{job_id}/retry")
def retry_cleanup(
    organisation_id: UUID,
    job_id: UUID,
    user: User,
    db: DB,
    settings: Annotated[Settings, Depends(get_settings)],
):
    job = next((job for job in cleanup_jobs(db, organisation_id, user) if job.id == job_id), None)
    if job is None:
        raise not_found()
    return {"pending_files": cleanup(db, job, lambda: PrivateStorage(settings))}
