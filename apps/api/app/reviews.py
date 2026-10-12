"""Independently saved, append-only option review history using existing artifact storage."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field
from sqlalchemy import func, select

from app.calculations import artifact_response, current_workspace, prior_request, save_artifact
from app.errors import APIError
from app.models import Artifact, Workspace
from app.workspace import StrictModel, project_for_workspace


class ReviewInput(StrictModel):
    request_key: UUID
    expected_review_revision: Annotated[int, Field(ge=0)]
    expected_workspace_revision: Annotated[int, Field(ge=1)]
    expected_project_revision: Annotated[int, Field(ge=1)]
    preferred_option: Literal["option_a", "option_b"]
    status: Literal["draft", "needs_information", "reviewed"]
    criteria: Annotated[
        list[Annotated[str, Field(min_length=1, max_length=500)]],
        Field(min_length=1, max_length=20),
    ]
    notes: Annotated[str, Field(min_length=1, max_length=8000)]
    analysis_id: UUID | None = None
    estimate_ids: Annotated[list[UUID], Field(max_length=2)] = []


def list_reviews(session, org_id, project_id, user_id):
    project = project_for_workspace(session, org_id, project_id, user_id)
    workspace = session.get(Workspace, project_id)
    records = session.scalars(
        select(Artifact)
        .where(Artifact.project_id == project_id, Artifact.kind == "review")
        .order_by(Artifact.created_at.desc(), Artifact.id)
        .limit(100)
    ).all()
    return {
        "items": [
            artifact_response(row, workspace.revision if workspace else 0, project.revision)
            for row in records
        ],
        "limit": 100,
    }


def save_review(session, org_id, project_id, user_id, data: ReviewInput):
    project = project_for_workspace(session, org_id, project_id, user_id, write=True)
    workspace = session.get(Workspace, project_id)
    previous = prior_request(session, project_id, "review", data.request_key)
    if previous:
        return artifact_response(previous, workspace.revision if workspace else 0, project.revision)
    workspace = current_workspace(session, project_id, data.expected_workspace_revision)
    if project.revision != data.expected_project_revision:
        raise APIError(409, "stale_brief", "Reload the project brief before saving this review.")
    revision = (
        session.scalar(
            select(func.count())
            .select_from(Artifact)
            .where(Artifact.project_id == project_id, Artifact.kind == "review")
        )
        or 0
    )
    if revision != data.expected_review_revision:
        raise APIError(
            409,
            "review_conflict",
            "Another reviewer saved first. Reload history and compare your notes before retrying.",
        )
    references = [(key, "estimate") for key in data.estimate_ids]
    if data.analysis_id:
        references.append((data.analysis_id, "analysis"))
    for key, kind in references:
        record = session.scalar(
            select(Artifact).where(
                Artifact.id == key, Artifact.project_id == project_id, Artifact.kind == kind
            )
        )
        if (
            record is None
            or record.workspace_revision != workspace.revision
            or record.project_revision != project.revision
        ):
            raise APIError(
                409,
                "review_source_unavailable",
                "Review sources must belong to this project and its current saved inputs.",
            )
    payload = data.model_dump(
        mode="json",
        exclude={
            "request_key",
            "expected_review_revision",
            "expected_workspace_revision",
            "expected_project_revision",
        },
    )
    payload.update(revision=revision + 1, reviewer_id=str(user_id))
    return save_artifact(session, project, workspace, user_id, "review", data.request_key, payload)
