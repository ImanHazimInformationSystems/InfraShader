from uuid import UUID

from sqlalchemy import case, exists, func, or_, select, update
from sqlalchemy.orm import Session

from app import access
from app.errors import APIError, not_found
from app.models import (
    Artifact,
    Membership,
    Organisation,
    Project,
    ProjectGrant,
    ProjectRevision,
    Workspace,
)
from app.schemas import (
    OrganisationResponse,
    ProjectCreate,
    ProjectList,
    ProjectResponse,
    ProjectUpdate,
    SessionResponse,
)

ADMIN_CAPABILITIES = access.ALL_CAPABILITIES
require_membership = access.membership


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
                capabilities=membership.capabilities,
                workspaces=[w for w in org.workspaces if w in membership.capabilities],
                enabled_workspaces=org.workspaces,
                workspace_setup_required=org.workspace_setup_required,
            )
            for org, membership in rows
        ],
    )


def project_stage():
    def artifact(kind):
        return exists(
            select(Artifact.id).where(Artifact.project_id == Project.id, Artifact.kind == kind)
        )

    return case(
        (artifact("proposal"), "proposal"),
        (artifact("developer_brief"), "developer_brief"),
        (artifact("estimate"), "estimate"),
        (
            exists(
                select(Workspace.project_id).where(
                    Workspace.project_id == Project.id,
                    or_(
                        func.jsonb_array_length(Workspace.data["scenarios"]["option_a"]["items"])
                        > 0,
                        func.jsonb_array_length(Workspace.data["scenarios"]["option_b"]["items"])
                        > 0,
                    ),
                )
            ),
            "option",
        ),
        (exists(select(Workspace.project_id).where(Workspace.project_id == Project.id)), "site"),
        else_="brief",
    )


def list_projects(
    session: Session,
    organisation_id: UUID,
    user_id: UUID,
    archived: bool,
    limit: int,
    offset: int,
    query: str = "",
    sort: str = "updated",
    stage: str = "",
    opportunity: str = "",
    purpose: str = "",
) -> ProjectList:
    require_membership(session, organisation_id, user_id)
    conditions = [
        Project.organisation_id == organisation_id,
        Project.archived == archived,
        access.project_condition(user_id),
    ]
    member = access.membership(session, organisation_id, user_id)
    if "read_project" not in member.capabilities or not access.workspaces(
        session, organisation_id, member
    ):
        return ProjectList(items=[], total=0, limit=limit, offset=offset)
    if stage:
        conditions.append(project_stage() == stage)
    if opportunity:
        conditions.append(
            func.coalesce(Project.details["opportunity"]["stage"].astext, "enquiry") == opportunity
        )
    if purpose:
        conditions.append(Project.purpose == purpose)
    if query.strip():
        conditions.append(
            or_(
                Project.name.icontains(query.strip(), autoescape=True),
                Project.stakeholder.icontains(query.strip(), autoescape=True),
                Project.details["opportunity"]["owner"].astext.icontains(
                    query.strip(), autoescape=True
                ),
                Project.details["opportunity"]["tags"].astext.icontains(
                    query.strip(), autoescape=True
                ),
                Project.details["opportunity"]["source"].astext.icontains(
                    query.strip(), autoescape=True
                ),
                Project.details["opportunity"]["client"]["name"].astext.icontains(
                    query.strip(), autoescape=True
                ),
            )
        )
    order = {
        "updated": Project.updated_at.desc(),
        "name": func.lower(Project.name),
        "created": Project.created_at.desc(),
        "due": Project.details["opportunity"]["due_date"].astext.asc().nullslast(),
    }[sort]
    total = session.scalar(select(func.count()).select_from(Project).where(*conditions)) or 0
    projects = session.execute(
        select(Project, project_stage())
        .where(*conditions)
        .order_by(order, Project.id)
        .offset(offset)
        .limit(limit)
    ).all()
    return ProjectList(
        items=[
            ProjectResponse.model_validate(project).model_copy(
                update={
                    "stage": stage,
                    "organisation_capabilities": access.membership(
                        session, organisation_id, user_id
                    ).capabilities,
                    "capabilities": access.project_capabilities(
                        session, organisation_id, project.id, user_id
                    ),
                }
            )
            for project, stage in projects
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


def create_project(
    session: Session,
    organisation_id: UUID,
    user_id: UUID,
    data: ProjectCreate,
    *,
    commit: bool = True,
) -> ProjectResponse:
    require_membership(session, organisation_id, user_id)
    access.require_capability(session, organisation_id, user_id, "create_project")
    project = Project(
        **data.model_dump(mode="json"),
        organisation_id=organisation_id,
        created_by=user_id,
        updated_by=user_id,
    )
    session.add(project)
    session.flush()
    session.add(
        ProjectGrant(
            project_id=project.id, user_id=user_id, capabilities=access.PROJECT_CAPABILITIES
        )
    )
    response = ProjectResponse.model_validate(project).model_copy(
        update={
            "organisation_capabilities": access.membership(
                session, organisation_id, user_id
            ).capabilities,
            "capabilities": access.project_capabilities(
                session, organisation_id, project.id, user_id
            ),
        }
    )
    session.add(
        ProjectRevision(
            project_id=project.id,
            revision=project.revision,
            payload=response.model_dump(mode="json"),
            changed_by=user_id,
        )
    )
    if commit:
        session.commit()
    else:
        session.flush()
    return response


def get_project(
    session: Session, organisation_id: UUID, project_id: UUID, user_id: UUID
) -> ProjectResponse:
    project = access.require_project(session, organisation_id, project_id, user_id)
    return ProjectResponse.model_validate(project).model_copy(
        update={
            "organisation_capabilities": access.membership(
                session, organisation_id, user_id
            ).capabilities,
            "capabilities": access.project_capabilities(
                session, organisation_id, project.id, user_id
            ),
        }
    )


def update_project(
    session: Session,
    organisation_id: UUID,
    project_id: UUID,
    user_id: UUID,
    data: ProjectUpdate,
) -> ProjectResponse:
    previous = access.require_project(session, organisation_id, project_id, user_id, "edit_project")
    changes = data.model_dump(mode="json", exclude_unset=True, exclude={"expected_revision"})
    # Older site editors do not know about inventories. A locator change must not erase trees.
    if data.site is not None and "trees" not in data.site.model_fields_set:
        changes["site"]["trees"] = previous.site.get("trees", [])
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
    response = ProjectResponse.model_validate(project).model_copy(
        update={
            "organisation_capabilities": access.membership(
                session, organisation_id, user_id
            ).capabilities,
            "capabilities": access.project_capabilities(
                session, organisation_id, project.id, user_id
            ),
        }
    )
    session.add(
        ProjectRevision(
            project_id=project.id,
            revision=project.revision,
            payload=response.model_dump(mode="json"),
            changed_by=user_id,
        )
    )
    session.commit()
    return response


def project_history(session, org_id, project_id, user_id, offset=0):
    get_project(session, org_id, project_id, user_id)
    rows = session.scalars(
        select(ProjectRevision)
        .where(ProjectRevision.project_id == project_id)
        .order_by(ProjectRevision.revision.desc())
        .offset(offset)
        .limit(50)
    ).all()
    return {
        "items": [
            {
                "revision": row.revision,
                "changed_by": str(row.changed_by),
                "created_at": row.created_at.isoformat(),
                "project": row.payload,
            }
            for row in rows
        ],
        "offset": offset,
        "limit": 50,
    }


def restore_project(session, org_id, project_id, user_id, revision, expected_revision):
    get_project(session, org_id, project_id, user_id)
    row = session.get(ProjectRevision, (project_id, revision))
    if row is None:
        raise not_found()
    fields = {key: value for key, value in row.payload.items() if key in ProjectCreate.model_fields}
    return update_project(
        session,
        org_id,
        project_id,
        user_id,
        ProjectUpdate(**fields, expected_revision=expected_revision),
    )
