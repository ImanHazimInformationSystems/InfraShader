from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.errors import APIError, not_found
from app.models import Membership, Organisation, Project
from app.schemas import (
    OrganisationResponse,
    ProjectCreate,
    ProjectList,
    ProjectResponse,
    ProjectUpdate,
    SessionResponse,
)

ADMIN_CAPABILITIES = [
    "manage_members",
    "change_catalogue",
    "internal_pricing",
    "issue_developer_brief",
    "issue_proposal",
]


def require_membership(session: Session, organisation_id: UUID, user_id: UUID) -> Membership:
    # Re-read on each operation. A still-valid JWT cannot override membership revocation.
    membership = session.scalar(
        select(Membership).where(
            Membership.organisation_id == organisation_id,
            Membership.user_id == user_id,
            Membership.active.is_(True),
        )
    )
    if membership is None:
        raise not_found()
    return membership


def session_info(session: Session, user_id: UUID) -> SessionResponse:
    rows = session.execute(
        select(Organisation, Membership)
        .join(Membership, Membership.organisation_id == Organisation.id)
        .where(Membership.user_id == user_id, Membership.active.is_(True))
        .order_by(Organisation.name)
    ).all()
    return SessionResponse(
        user_id=user_id,
        organisations=[
            OrganisationResponse(
                id=org.id,
                name=org.name,
                role=membership.role,
                capabilities=(
                    ADMIN_CAPABILITIES
                    if membership.role == "administrator"
                    else membership.capabilities
                ),
            )
            for org, membership in rows
        ],
    )


def list_projects(
    session: Session,
    organisation_id: UUID,
    user_id: UUID,
    archived: bool,
    limit: int,
    offset: int,
) -> ProjectList:
    require_membership(session, organisation_id, user_id)
    conditions = (Project.organisation_id == organisation_id, Project.archived == archived)
    total = session.scalar(select(func.count()).select_from(Project).where(*conditions)) or 0
    projects = session.scalars(
        select(Project)
        .where(*conditions)
        .order_by(Project.updated_at.desc(), Project.id)
        .offset(offset)
        .limit(limit)
    ).all()
    return ProjectList(
        items=[ProjectResponse.model_validate(project) for project in projects],
        total=total,
        limit=limit,
        offset=offset,
    )


def create_project(
    session: Session, organisation_id: UUID, user_id: UUID, data: ProjectCreate
) -> ProjectResponse:
    require_membership(session, organisation_id, user_id)
    project = Project(
        **data.model_dump(mode="json"),
        organisation_id=organisation_id,
        created_by=user_id,
        updated_by=user_id,
    )
    session.add(project)
    session.flush()
    response = ProjectResponse.model_validate(project)
    session.commit()
    return response


def get_project(
    session: Session, organisation_id: UUID, project_id: UUID, user_id: UUID
) -> ProjectResponse:
    require_membership(session, organisation_id, user_id)
    project = session.scalar(
        select(Project).where(Project.organisation_id == organisation_id, Project.id == project_id)
    )
    if project is None:
        raise not_found()
    return ProjectResponse.model_validate(project)


def update_project(
    session: Session,
    organisation_id: UUID,
    project_id: UUID,
    user_id: UUID,
    data: ProjectUpdate,
) -> ProjectResponse:
    require_membership(session, organisation_id, user_id)
    changes = data.model_dump(mode="json", exclude_unset=True, exclude={"expected_revision"})
    # Revision is part of the UPDATE predicate: two writers cannot both succeed for revision r.
    project = session.scalar(
        update(Project)
        .where(
            Project.organisation_id == organisation_id,
            Project.id == project_id,
            Project.revision == data.expected_revision,
        )
        .values(**changes, revision=Project.revision + 1, updated_by=user_id, updated_at=func.now())
        .returning(Project),
        execution_options={"populate_existing": True},
    )
    if project is None:
        exists = session.scalar(
            select(Project.id).where(
                Project.organisation_id == organisation_id, Project.id == project_id
            )
        )
        if exists is None:
            raise not_found()
        raise APIError(
            409, "revision_conflict", "This project changed. Reload and review before saving again."
        )
    # Capture the accepted row while the UPDATE lock is held. A later writer must not change
    # the response to this write after commit releases the lock.
    response = ProjectResponse.model_validate(project)
    session.commit()
    return response
