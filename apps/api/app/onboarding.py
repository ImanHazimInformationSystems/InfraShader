"""Transactional tenant creation and recipient-bound, single-use team invitations."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import access
from app.administration import admin
from app.auth import bearer, current_user
from app.config import Settings, get_settings
from app.db import database_session
from app.errors import APIError, not_found, unavailable
from app.models import AdministrationEvent, Invitation, Membership, Organisation, ProjectGrant
from app.projects import session_info
from app.schemas import Capability, Contract

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(database_session)]
User = Annotated[UUID, Depends(current_user)]


def verified_email(
    user: User,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    # Fetch current identity, rather than trusting editable metadata or a stale email JWT.
    if not settings.supabase_url or not settings.storage_service_key:
        raise unavailable("Verified account lookup is not configured on the API.")
    try:
        result = httpx.get(
            settings.supabase_url + "/auth/v1/user",
            headers={
                "Authorization": f"Bearer {credentials.credentials}",
                "apikey": settings.storage_service_key.get_secret_value(),
            },
            timeout=10,
        )
        if result.status_code in (401, 403):
            raise APIError(401, "invalid_session", "Sign in again to continue.")
        result.raise_for_status()
        account = result.json()
        if (
            UUID(account["id"]) != user
            or not account.get("email_confirmed_at")
            or account.get("is_anonymous")
            or not account.get("email")
        ):
            raise APIError(
                403,
                "verified_email_required",
                "Confirm your account email before creating or joining an organisation.",
            )
        return account["email"].strip().lower()
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise unavailable("Account verification unavailable. Retry shortly.") from exc


Email = Annotated[str, Depends(verified_email)]


class CreateOrganisation(Contract):
    name: str = Field(min_length=1, max_length=160)
    workspaces: list[Literal["studio", "review"]] = Field(min_length=1, max_length=2)


class InviteInput(Contract):
    email: str = Field(min_length=3, max_length=320)
    role: Literal["administrator", "member"] = "member"
    capabilities: list[Capability] = Field(max_length=20)
    expires_days: int = Field(default=7, ge=1, le=14)

    @field_validator("email")
    @classmethod
    def email_address(cls, value):
        value = value.lower()
        if value.count("@") != 1 or any(c.isspace() for c in value) or not all(value.split("@")):
            raise ValueError("Enter the intended recipient's account email.")
        return value


class AcceptInput(Contract):
    token: str = Field(min_length=40, max_length=128)


class GrantInput(Contract):
    user_id: UUID
    capabilities: list[Capability] = Field(max_length=20)


def audit(db, org, actor, action, **fields):
    db.add(
        AdministrationEvent(
            organisation_id=org, actor_id=actor, payload={"action": action, **fields}
        )
    )


def invitation_data(row):
    state = (
        "expired" if row.state == "pending" and row.expires_at <= datetime.now(UTC) else row.state
    )
    return {
        "id": str(row.id),
        "organisation_id": str(row.organisation_id),
        "email": row.email,
        "role": row.role,
        "capabilities": row.capabilities,
        "state": state,
        "expires_at": row.expires_at.isoformat(),
    }


@router.get("/access-policy")
def policy(user: User):
    return {
        "roles": access.ROLE_TEMPLATES,
        "capabilities": access.ALL_CAPABILITIES,
        "project_capabilities": access.PROJECT_CAPABILITIES,
    }


@router.post("/organisations", status_code=201)
def create(data: CreateOrganisation, user: User, email: Email, db: DB):
    org = Organisation(
        name=data.name,
        workspaces=[w for w in ("studio", "review") if w in data.workspaces],
        workspace_setup_required=False,
    )
    db.add(org)
    db.flush()
    # Founder explicitly receives working grants, independently of administrator status.
    caps = set(access.ALL_CAPABILITIES) - {"studio", "review"}
    caps.update(data.workspaces)
    if "studio" not in data.workspaces:
        caps -= {
            "edit_geometry",
            "analyse",
            "estimate",
            "internal_pricing",
            "change_catalogue",
            "issue_proposal",
        }
    if "review" not in data.workspaces:
        caps.discard("issue_developer_brief")
    db.add(
        Membership(
            organisation_id=org.id, user_id=user, role="administrator", capabilities=sorted(caps)
        )
    )
    audit(db, org.id, user, "organisation_created", workspaces=org.workspaces)
    db.commit()
    return session_info(db, user)


@router.get("/invitations")
def pending(user: User, email: Email, db: DB):
    rows = db.scalars(
        select(Invitation).where(
            Invitation.email == email,
            Invitation.state == "pending",
            Invitation.expires_at > datetime.now(UTC),
        )
    ).all()
    return {
        "items": [
            {
                **invitation_data(r),
                "organisation_name": db.get(Organisation, r.organisation_id).name,
            }
            for r in rows
        ]
    }


@router.get("/organisations/{org_id}/invitations")
def invitations(org_id: UUID, user: User, db: DB):
    admin(db, org_id, user)
    return {
        "items": [
            invitation_data(r)
            for r in db.scalars(
                select(Invitation)
                .where(Invitation.organisation_id == org_id)
                .order_by(Invitation.created_at.desc())
                .limit(100)
            )
        ]
    }


@router.post("/organisations/{org_id}/invitations", status_code=201)
def invite(org_id: UUID, data: InviteInput, user: User, db: DB):
    admin(db, org_id, user, True)
    org = db.get(Organisation, org_id)
    if any(w in data.capabilities and w not in org.workspaces for w in ("studio", "review")):
        raise APIError(
            422, "workspace_disabled", "Enable the organisation workspace before assigning it."
        )
    caps = set(data.capabilities)
    if data.role == "administrator":
        caps.add("manage_members")
    elif "manage_members" in caps:
        raise APIError(422, "role_mismatch", "Choose administrator for membership management.")
    duplicate = db.scalar(
        select(Invitation.id).where(
            Invitation.organisation_id == org_id,
            Invitation.email == data.email,
            Invitation.state == "pending",
            Invitation.expires_at > datetime.now(UTC),
        )
    )
    if duplicate:
        raise APIError(
            409,
            "invitation_pending",
            "A pending invitation exists. Revoke it before issuing a replacement.",
        )
    token = secrets.token_urlsafe(32)
    row = Invitation(
        organisation_id=org_id,
        email=data.email,
        role=data.role,
        capabilities=sorted(caps),
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        created_by=user,
        expires_at=datetime.now(UTC) + timedelta(days=data.expires_days),
    )
    db.add(row)
    db.flush()
    audit(db, org_id, user, "invitation_created", invitation_id=str(row.id))
    result = {**invitation_data(row), "token": token}
    db.commit()
    return result


@router.post("/organisations/{org_id}/invitations/{invitation_id}/revoke")
def revoke(org_id: UUID, invitation_id: UUID, user: User, db: DB):
    admin(db, org_id, user, True)
    row = db.scalar(
        select(Invitation)
        .where(Invitation.id == invitation_id, Invitation.organisation_id == org_id)
        .with_for_update()
    )
    if row is None:
        raise not_found()
    if row.state != "pending":
        raise APIError(409, "invitation_closed", "This invitation is already closed.")
    row.state = "revoked"
    audit(db, org_id, user, "invitation_revoked", invitation_id=str(row.id))
    result = invitation_data(row)
    db.commit()
    return result


@router.post("/invitations/accept")
def accept(data: AcceptInput, user: User, email: Email, db: DB):
    digest = hashlib.sha256(data.token.encode()).hexdigest()
    # Same lock ordering as admin/revocation avoids races with role changes.
    org_id = db.scalar(select(Invitation.organisation_id).where(Invitation.token_hash == digest))
    if org_id is None:
        raise APIError(
            403, "invitation_unavailable", "Invitation unavailable for this verified account."
        )
    db.scalar(select(Organisation).where(Organisation.id == org_id).with_for_update())
    row = db.scalar(
        select(Invitation)
        .where(Invitation.token_hash == digest)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row.email != email or row.state != "pending" or row.expires_at <= datetime.now(UTC):
        raise APIError(
            403, "invitation_unavailable", "Invitation unavailable for this verified account."
        )
    # The issuing administrator must still be authorised at acceptance.
    admin(db, org_id, row.created_by)
    member = db.scalar(
        select(Membership).where(Membership.organisation_id == org_id, Membership.user_id == user)
    )
    if member and member.active:
        raise APIError(
            409,
            "already_member",
            "Already a member. Ask an administrator to edit your existing membership.",
        )
    if member:
        # Rejoining does not silently restore old project access.
        grants = db.scalars(
            select(ProjectGrant)
            .join(access.Project, access.Project.id == ProjectGrant.project_id)
            .where(access.Project.organisation_id == org_id, ProjectGrant.user_id == user)
        ).all()
        for grant in grants:
            db.delete(grant)
        member.role, member.capabilities, member.active = row.role, row.capabilities, True
        member.revision += 1
    else:
        db.add(
            Membership(
                organisation_id=org_id, user_id=user, role=row.role, capabilities=row.capabilities
            )
        )
    row.state, row.accepted_by = "accepted", user
    audit(db, org_id, user, "invitation_accepted", invitation_id=str(row.id))
    db.commit()
    return session_info(db, user)


@router.get("/organisations/{org_id}/projects/{project_id}/access")
def grants(org_id: UUID, project_id: UUID, user: User, db: DB):
    access.require_project(db, org_id, project_id, user, "manage_project_access")
    return {
        "items": [
            {"user_id": str(r.user_id), "capabilities": r.capabilities}
            for r in db.scalars(select(ProjectGrant).where(ProjectGrant.project_id == project_id))
        ],
        "members": [
            {"user_id": str(r.user_id), "role": r.role, "capabilities": r.capabilities}
            for r in db.scalars(
                select(Membership).where(
                    Membership.organisation_id == org_id, Membership.active.is_(True)
                )
            )
        ],
    }


@router.put("/organisations/{org_id}/projects/{project_id}/access")
def save_grant(org_id: UUID, project_id: UUID, data: GrantInput, user: User, db: DB):
    db.scalar(select(Organisation).where(Organisation.id == org_id).with_for_update())
    access.require_project(db, org_id, project_id, user, "manage_project_access")
    access.membership(db, org_id, data.user_id)
    if any(c not in access.PROJECT_CAPABILITIES for c in data.capabilities):
        raise APIError(422, "invalid_project_grant", "Use project capabilities only.")
    allowed = access.project_capabilities(db, org_id, project_id, user)
    if any(c not in allowed for c in data.capabilities):
        raise APIError(
            403,
            "grant_escalation",
            "You can delegate only your own effective project capabilities.",
        )
    row = db.get(ProjectGrant, (project_id, data.user_id))
    if row is None:
        row = ProjectGrant(project_id=project_id, user_id=data.user_id)
        db.add(row)
    row.capabilities = sorted(set(data.capabilities))
    audit(
        db,
        org_id,
        user,
        "project_access",
        project_id=str(project_id),
        user_id=str(data.user_id),
        capabilities=row.capabilities,
    )
    db.commit()
    return {"saved": True}
