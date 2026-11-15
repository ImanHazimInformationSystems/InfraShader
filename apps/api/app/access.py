"""One explicit membership/project capability policy; administrator is not a bypass."""

from sqlalchemy import select

from app.errors import APIError, not_found
from app.models import Membership, Organisation, Project, ProjectGrant

ROLE_TEMPLATES = {
    "administrator": ["manage_members"],
    "designer": [
        "studio",
        "read_project",
        "create_project",
        "edit_project",
        "edit_geometry",
        "edit_evidence",
        "analyse",
    ],
    "estimator": ["studio", "read_project", "estimate", "change_catalogue", "internal_pricing"],
    "reviewer": ["review", "read_project", "review_project"],
    "approver": ["review", "read_project", "issue_developer_brief"],
}
ALL_CAPABILITIES = sorted(
    set(sum(ROLE_TEMPLATES.values(), []) + ["issue_proposal", "manage_project_access"])
)
PROJECT_CAPABILITIES = [
    c
    for c in ALL_CAPABILITIES
    if c not in {"studio", "review", "manage_members", "create_project", "change_catalogue"}
]
LEGACY_MEMBER_CAPABILITIES = [
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
]


def membership(session, org_id, user_id):
    row = session.scalar(
        select(Membership)
        .where(
            Membership.organisation_id == org_id,
            Membership.user_id == user_id,
            Membership.active.is_(True),
        )
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise not_found()
    return row


def workspaces(session, org_id, member):
    org = session.get(Organisation, org_id)
    return [w for w in org.workspaces if w in member.capabilities]


def require_capability(session, org_id, user_id, capability):
    member = membership(session, org_id, user_id)
    if capability not in member.capabilities:
        raise APIError(403, "capability_required", "Your membership does not permit this action.")
    if capability != "manage_members" and not workspaces(session, org_id, member):
        raise APIError(
            403,
            "workspace_required",
            "No permitted workspace. Ask your administrator to review access.",
        )
    return member


def project_condition(user_id):
    return Project.id.in_(
        select(ProjectGrant.project_id).where(
            ProjectGrant.user_id == user_id, ProjectGrant.capabilities.contains(["read_project"])
        )
    )


def require_project(session, org_id, project_id, user_id, capability="read_project"):
    member = membership(session, org_id, user_id)
    # Return the same unavailable response for a missing or ungranted record.
    project = session.scalar(
        select(Project).where(
            Project.id == project_id, Project.organisation_id == org_id, project_condition(user_id)
        )
    )
    if project is None:
        raise not_found()
    grant = session.get(ProjectGrant, (project_id, user_id))
    if (
        "read_project" not in member.capabilities
        or capability not in member.capabilities
        or capability not in grant.capabilities
        or not workspaces(session, org_id, member)
    ):
        raise APIError(
            403, "project_capability_required", "Your project grant does not permit this action."
        )
    return project


def project_capabilities(session, org_id, project_id, user_id):
    member = membership(session, org_id, user_id)
    grant = session.get(ProjectGrant, (project_id, user_id))
    return sorted(set(member.capabilities) & set(grant.capabilities)) if grant else []
