"""S03/L25/O05: invited opportunities and recipient-safe proposal submissions between tenants.

Owner side (Organisation Review project, ``review_project`` grant): prepare a draft invitation,
attach deliberately selected files, preview the exact shared brief, issue it (freezing the
brief/basis revision and returning a single-use opaque link once), revoke it, and read the
received packages.

Contractor side: a verified intended recipient accepts the link for one of their own
organisations (Design Studio access required). Acceptance never creates a membership or a
project grant in the owner organisation. Members link or create a private Design Studio project,
preview the outgoing package and deliberately submit an issued, retained proposal. Sending needs
the ``issue_proposal`` grant on the linked project: reading a project is not commercial
authority.

Packages are allowlisted, versioned and immutable. They are written in one database transaction
together with byte-identical copies of the retained issued PDF and the package manifest in the
owner project's existing review inbox, so a "received" receipt always means the files exist.
"""

import hashlib
import json
import secrets
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from pydantic import AwareDatetime, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import access, owner_review, projects
from app.auth import current_user
from app.db import database_session
from app.errors import APIError, not_found
from app.models import (
    AdministrationEvent,
    Artifact,
    IssuedFile,
    Membership,
    OpportunityFile,
    OpportunityInvitation,
    Organisation,
    Project,
    ProjectGrant,
    ReviewFile,
    SubmissionAttachment,
    SubmissionPackage,
    Workspace,
)
from app.onboarding import Email
from app.schemas import Contract, ProjectCreate

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(database_session)]
User = Annotated[UUID, Depends(current_user)]

PACKAGE_SCHEMA = "infrashader.submission-package.v1"
BRIEF_SCHEMA = "infrashader.opportunity-brief.v1"
OPTIONAL_FIELDS = (
    "problem",
    "intended_users",
    "desired_outcome",
    "use_periods",
    "site",
    "criteria",
)
# Evaluation criteria a contractor may see when the owner opts in: never scores or reviewers.
CRITERIA_SHARED = ("code", "name", "weight", "direction", "scale_min", "scale_max")
MAX_ATTACHMENTS = 5
# Basis fields a contractor may see. Budget, reviewers, self-approval policy, the evaluation
# horizon and the rubric are owner-only and never leave the review project.
BASIS_SHARED = (
    "title",
    "deliverables",
    "submission_requirements",
    "currency",
    "tax_basis",
    "deadline",
    "deadline_timezone",
    "scope_items",
    "requirements",
    "addendum_note",
)
MAX_SHARED_FILES = 5
LINK_DAYS = 14
OWNER_BASE = "/organisations/{organisation_id}/projects/{project_id}/opportunities"
CONTRACTOR_BASE = "/organisations/{organisation_id}/opportunities"


# ---------------------------------------------------------------- contracts


SharedField = Literal[
    "problem", "intended_users", "desired_outcome", "use_periods", "site", "criteria"
]


class DraftInput(Contract):
    recipient_email: str = Field(min_length=3, max_length=320)
    closes_at: AwareDatetime
    instructions: str = Field(default="", max_length=4000)
    shared_fields: list[SharedField] = Field(default_factory=list, max_length=6)

    @field_validator("recipient_email")
    @classmethod
    def email(cls, value):
        value = value.strip().lower()
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("Enter the contractor's account email.")
        return value


class IssueInput(Contract):
    expected_revision: Annotated[int, Field(ge=1)]


class RevisionInput(Contract):
    expected_revision: Annotated[int, Field(ge=1)]


class TokenInput(Contract):
    """Identify an invitation by its link token or, for the verified recipient, by its id."""

    token: str | None = Field(default=None, min_length=40, max_length=128)
    invitation_id: UUID | None = None

    @model_validator(mode="after")
    def one_reference(self):
        if (self.token is None) == (self.invitation_id is None):
            raise ValueError("Provide either the invitation link token or its id.")
        return self


class AcceptInput(TokenInput):
    contractor_organisation_id: UUID


class LinkInput(Contract):
    expected_revision: Annotated[int, Field(ge=1)]
    project_id: UUID


class CreateProjectInput(Contract):
    expected_revision: Annotated[int, Field(ge=1)]
    name: str = Field(min_length=1, max_length=160)


class PreviewInput(Contract):
    artifact_id: UUID
    attachment_ids: list[UUID] = Field(default_factory=list, max_length=5)


class SubmitInput(Contract):
    artifact_id: UUID
    idempotency_key: UUID
    confirmed: Literal[True]
    reason: str = Field(default="", max_length=2000)
    attachment_ids: list[UUID] = Field(default_factory=list, max_length=5)


class WithdrawInput(Contract):
    idempotency_key: UUID
    confirmed: Literal[True]
    reason: str = Field(min_length=1, max_length=2000)


# ---------------------------------------------------------------- helpers


def _now():
    return datetime.now(UTC)


def _digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _audit(db, org, actor, action, **fields):
    db.add(
        AdministrationEvent(
            organisation_id=org, actor_id=actor, payload={"action": action, **fields}
        )
    )


def _state(row):
    if row.state == "pending" and row.expires_at and row.expires_at <= _now():
        return "expired"
    return row.state


def _org_name(db, org_id):
    org = db.get(Organisation, org_id) if org_id else None
    return org.name if org else None


def _basis(db, project_id):
    return owner_review._current(db, project_id, "basis", project_id)


def _brief(db, project, basis_row, fields):
    """The exact allowlisted brief a contractor receives. Built only from named fields."""
    shared_basis = {key: basis_row.payload.get(key) for key in BASIS_SHARED}
    brief = {
        "schema": BRIEF_SCHEMA,
        "owner_organisation": _org_name(db, project.organisation_id),
        "project_name": project.name,
        "timezone": project.timezone,
        "currency": project.currency,
        "basis_revision": basis_row.revision,
        "basis": shared_basis,
    }
    for name in OPTIONAL_FIELDS:
        if name not in fields:
            continue
        if name == "criteria":
            rubric = owner_review._current(db, project.id, "rubric", project.id)
            brief["criteria"] = {
                "status": rubric.payload.get("status", "draft") if rubric else "not_set",
                "items": [
                    {key: item.get(key) for key in CRITERIA_SHARED}
                    for item in (rubric.payload.get("criteria", []) if rubric else [])
                ],
            }
        elif name == "site":
            brief["site"] = {
                "bounds": project.site.get("bounds"),
                "outline": project.site.get("outline"),
                "crs": "EPSG:4326",
            }
        else:
            brief[name] = getattr(project, name)
    return brief


def _file_meta(row):
    return {
        "id": str(row.id),
        "filename": row.filename,
        "content_type": row.content_type,
        "size_bytes": row.size_bytes,
        "sha256": row.sha256,
        "description": row.description,
    }


def _files(db, invitation_id):
    return db.scalars(
        select(OpportunityFile)
        .where(OpportunityFile.invitation_id == invitation_id)
        .order_by(OpportunityFile.created_at, OpportunityFile.id)
    ).all()


def _packages(db, invitation_id):
    return db.scalars(
        select(SubmissionPackage)
        .where(SubmissionPackage.invitation_id == invitation_id)
        .order_by(SubmissionPackage.version)
    ).all()


def _package_summary(row):
    proposal = row.package.get("proposal", {}) if row.kind == "submission" else {}
    return {
        "id": str(row.id),
        "version": row.version,
        "kind": row.kind,
        "state": row.state,
        "receipt_id": row.receipt_id,
        "received_at": row.received_at.isoformat(),
        "reason": row.reason,
        "supersedes_id": str(row.supersedes_id) if row.supersedes_id else None,
        "issued_version": proposal.get("issued_version"),
        "issued_at": proposal.get("issued_at"),
        "preferred_option": proposal.get("preferred_option"),
        "package_sha256": row.package_sha256,
        "pdf_file_id": str(row.pdf_file_id) if row.pdf_file_id else None,
        "package_file_id": str(row.package_file_id) if row.package_file_id else None,
    }


def _current_submission(packages):
    """The latest submission that is not followed by a withdrawal, if any."""
    current = None
    for row in packages:
        current = row if row.kind == "submission" else None
    return current


def _owner_view(db, row):
    basis = _basis(db, row.owner_project_id)
    packages = _packages(db, row.id)
    current = _current_submission(packages)
    return {
        "id": str(row.id),
        "state": _state(row),
        "revision": row.revision,
        "recipient_email": row.recipient_email,
        "instructions": row.instructions,
        "shared_fields": row.shared_fields,
        "closes_at": row.closes_at.isoformat(),
        "closed": row.closes_at <= _now(),
        "expires_at": row.expires_at.isoformat() if row.expires_at else None,
        "issued_at": row.issued_at.isoformat() if row.issued_at else None,
        "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None,
        "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None,
        "contractor_organisation": _org_name(db, row.contractor_organisation_id),
        "basis_revision": row.basis_revision,
        "current_basis_revision": basis.revision if basis else None,
        "basis_changed": bool(basis and row.basis_revision and basis.revision > row.basis_revision),
        "submission_key": str(row.submission_key) if row.submission_key else None,
        "files": [_file_meta(f) for f in _files(db, row.id)],
        "packages": [_package_summary(p) for p in packages],
        "current_package_version": current.version if current else None,
    }


def _contractor_view(db, row, user, *, detail=True):
    packages = _packages(db, row.id)
    can_read = _can_read_project(db, row, user)
    basis = _basis(db, row.owner_project_id)
    view = {
        "id": str(row.id),
        "state": _state(row),
        "revision": row.revision,
        "owner_organisation": (row.brief_snapshot or {}).get("owner_organisation"),
        "project_name": (row.brief_snapshot or {}).get("project_name"),
        "closes_at": row.closes_at.isoformat(),
        "closed": row.closes_at <= _now(),
        "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None,
        "linked_project_id": str(row.contractor_project_id) if row.contractor_project_id else None,
        "basis_updated": bool(basis and row.basis_revision and basis.revision > row.basis_revision),
        "submission_count": sum(1 for p in packages if p.kind == "submission"),
        # Receipts carry commercial package detail: only members who can read the linked project.
        "packages": [_package_summary(p) for p in packages] if can_read else [],
    }
    if detail:
        view.update(
            instructions=row.instructions,
            brief=row.brief_snapshot,
            files=[_file_meta(f) for f in _files(db, row.id)],
        )
    return view


def _can_read_project(db, row, user):
    if not row.contractor_project_id or not row.contractor_organisation_id:
        return False
    try:
        access.require_project(
            db, row.contractor_organisation_id, row.contractor_project_id, user, "read_project"
        )
    except APIError:
        return False
    return True


def _owner_invitation(db, org, project_id, invitation_id, *, lock=False):
    statement = select(OpportunityInvitation).where(
        OpportunityInvitation.id == invitation_id,
        OpportunityInvitation.owner_project_id == project_id,
        OpportunityInvitation.owner_organisation_id == org,
    )
    if lock:
        statement = statement.with_for_update()
    row = db.scalar(statement)
    if row is None:
        raise not_found()
    return row


def _contractor_invitation(db, org, user, invitation_id, *, lock=False):
    access.require_capability(db, org, user, "studio")
    statement = select(OpportunityInvitation).where(
        OpportunityInvitation.id == invitation_id,
        OpportunityInvitation.contractor_organisation_id == org,
        OpportunityInvitation.state.in_(["accepted", "revoked"]),
    )
    if lock:
        statement = statement.with_for_update()
    row = db.scalar(statement)
    if row is None:
        raise not_found()
    return row


def _bump(row, expected):
    if row.revision != expected:
        raise APIError(409, "opportunity_conflict", "This opportunity changed. Reload and retry.")
    row.revision += 1


# ---------------------------------------------------------------- owner endpoints


@router.get(OWNER_BASE)
def owner_list(organisation_id: UUID, project_id: UUID, user: User, db: DB):
    owner_review._caps(db, organisation_id, project_id, user)
    rows = db.scalars(
        select(OpportunityInvitation)
        .where(
            OpportunityInvitation.owner_project_id == project_id,
            OpportunityInvitation.owner_organisation_id == organisation_id,
        )
        .order_by(OpportunityInvitation.created_at)
    ).all()
    return {"items": [_owner_view(db, row) for row in rows]}


@router.post(OWNER_BASE, status_code=201)
def owner_draft(organisation_id: UUID, project_id: UUID, data: DraftInput, user: User, db: DB):
    owner_review._require(db, organisation_id, project_id, user, "review_project")
    if _basis(db, project_id) is None:
        raise APIError(
            409, "basis_required", "Save the comparison basis before inviting contractors."
        )
    row = OpportunityInvitation(
        owner_organisation_id=organisation_id,
        owner_project_id=project_id,
        recipient_email=data.recipient_email,
        state="draft",
        instructions=data.instructions,
        shared_fields=list(dict.fromkeys(data.shared_fields)),
        closes_at=data.closes_at,
        created_by=user,
    )
    db.add(row)
    db.flush()
    _audit(db, organisation_id, user, "opportunity.drafted", invitation_id=str(row.id))
    db.commit()
    return _owner_view(db, row)


@router.get(OWNER_BASE + "/{invitation_id}/brief")
def owner_brief_preview(
    organisation_id: UUID, project_id: UUID, invitation_id: UUID, user: User, db: DB
):
    """Exactly what the contractor receives: frozen if issued, otherwise a live draft preview."""
    project, _ = owner_review._caps(db, organisation_id, project_id, user)
    row = _owner_invitation(db, organisation_id, project_id, invitation_id)
    if row.brief_snapshot is not None:
        return {"frozen": True, "brief": row.brief_snapshot}
    basis = _basis(db, project_id)
    if basis is None:
        raise APIError(409, "basis_required", "Save the comparison basis first.")
    return {"frozen": False, "brief": _brief(db, project, basis, row.shared_fields)}


@router.post(OWNER_BASE + "/{invitation_id}/files", status_code=201)
def owner_attach(
    organisation_id: UUID,
    project_id: UUID,
    invitation_id: UUID,
    user: User,
    db: DB,
    file: Annotated[UploadFile, File()],
    description: Annotated[str, Form(min_length=1, max_length=500)],
):
    owner_review._require(db, organisation_id, project_id, user, "review_project")
    row = _owner_invitation(db, organisation_id, project_id, invitation_id, lock=True)
    if row.state != "draft":
        raise APIError(
            409, "opportunity_frozen", "Shared files are frozen once the invitation is issued."
        )
    if len(_files(db, row.id)) >= MAX_SHARED_FILES:
        raise APIError(422, "opportunity_files", f"Share at most {MAX_SHARED_FILES} files.")
    content = file.file.read(owner_review.MAX_FILE_BYTES + 1)
    kind = owner_review.sniff(content)
    record = OpportunityFile(
        invitation_id=row.id,
        filename=owner_review._clean_name(file.filename),
        content_type=kind,
        content=content,
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
        description=description,
        created_by=user,
    )
    db.add(record)
    db.flush()
    result = _file_meta(record)
    db.commit()
    return result


@router.delete(OWNER_BASE + "/{invitation_id}/files/{file_id}", status_code=204)
def owner_detach(
    organisation_id: UUID, project_id: UUID, invitation_id: UUID, file_id: UUID, user: User, db: DB
):
    owner_review._require(db, organisation_id, project_id, user, "review_project")
    row = _owner_invitation(db, organisation_id, project_id, invitation_id, lock=True)
    if row.state != "draft":
        raise APIError(409, "opportunity_frozen", "Shared files are frozen once issued.")
    record = db.scalar(
        select(OpportunityFile).where(
            OpportunityFile.id == file_id, OpportunityFile.invitation_id == row.id
        )
    )
    if record is None:
        raise not_found()
    db.delete(record)
    db.commit()
    return Response(status_code=204)


@router.post(OWNER_BASE + "/{invitation_id}/issue")
def owner_issue(
    organisation_id: UUID,
    project_id: UUID,
    invitation_id: UUID,
    data: IssueInput,
    user: User,
    db: DB,
):
    project, _ = owner_review._require(db, organisation_id, project_id, user, "review_project")
    row = _owner_invitation(db, organisation_id, project_id, invitation_id, lock=True)
    if row.state != "draft":
        raise APIError(409, "opportunity_state", "Only a draft invitation can be issued.")
    _bump(row, data.expected_revision)
    now = _now()
    if row.closes_at <= now:
        raise APIError(422, "closing_time", "Set a closing date and time in the future.")
    basis = _basis(db, project_id)
    if basis is None:
        raise APIError(409, "basis_required", "Save the comparison basis first.")
    token = secrets.token_urlsafe(32)
    row.token_hash = _digest(token)
    row.brief_snapshot = _brief(db, project, basis, row.shared_fields)
    row.basis_revision = basis.revision
    row.project_revision = project.revision
    row.issued_at = now
    row.expires_at = min(row.closes_at, now + timedelta(days=LINK_DAYS))
    row.state = "pending"
    _audit(
        db,
        organisation_id,
        user,
        "opportunity.issued",
        invitation_id=str(row.id),
        basis_revision=basis.revision,
    )
    db.commit()
    # The token is returned once; only its hash is stored.
    return {**_owner_view(db, row), "token": token}


@router.post(OWNER_BASE + "/{invitation_id}/reissue")
def owner_reissue(
    organisation_id: UUID,
    project_id: UUID,
    invitation_id: UUID,
    data: RevisionInput,
    user: User,
    db: DB,
):
    """Replace a lost link. The old link stops working; the frozen brief does not change."""
    owner_review._require(db, organisation_id, project_id, user, "review_project")
    row = _owner_invitation(db, organisation_id, project_id, invitation_id, lock=True)
    if row.state != "pending":
        raise APIError(
            409,
            "opportunity_state",
            "Only an invitation that has not been accepted can get a new link.",
        )
    now = _now()
    if row.closes_at <= now:
        raise APIError(409, "closing_time", "The closing time has passed. Create a new invitation.")
    _bump(row, data.expected_revision)
    token = secrets.token_urlsafe(32)
    row.token_hash = _digest(token)
    row.expires_at = min(row.closes_at, now + timedelta(days=LINK_DAYS))
    _audit(db, organisation_id, user, "opportunity.reissued", invitation_id=str(row.id))
    db.commit()
    return {**_owner_view(db, row), "token": token}


@router.post(OWNER_BASE + "/{invitation_id}/revoke")
def owner_revoke(
    organisation_id: UUID,
    project_id: UUID,
    invitation_id: UUID,
    data: RevisionInput,
    user: User,
    db: DB,
):
    owner_review._require(db, organisation_id, project_id, user, "review_project")
    row = _owner_invitation(db, organisation_id, project_id, invitation_id, lock=True)
    if row.state == "draft":
        # Nothing was shared yet: discarding a draft leaves no external record.
        db.delete(row)
        _audit(db, organisation_id, user, "opportunity.draft_discarded", invitation_id=str(row.id))
        db.commit()
        return {"id": str(invitation_id), "state": "discarded"}
    if row.state == "revoked":
        raise APIError(409, "opportunity_state", "This invitation is already revoked.")
    _bump(row, data.expected_revision)
    row.state = "revoked"
    row.revoked_at = _now()
    # Received packages stay with the owner project; revocation stops future actions only.
    _audit(db, organisation_id, user, "opportunity.revoked", invitation_id=str(row.id))
    db.commit()
    return _owner_view(db, row)


@router.get(OWNER_BASE + "/{invitation_id}/packages/{version}")
def owner_package(
    organisation_id: UUID,
    project_id: UUID,
    invitation_id: UUID,
    version: int,
    user: User,
    db: DB,
):
    owner_review._caps(db, organisation_id, project_id, user)
    row = _owner_invitation(db, organisation_id, project_id, invitation_id)
    package = db.scalar(
        select(SubmissionPackage).where(
            SubmissionPackage.invitation_id == row.id, SubmissionPackage.version == version
        )
    )
    if package is None:
        raise not_found()
    return {**_package_summary(package), "package": package.package}


# ---------------------------------------------------------------- recipient acceptance


def _invitation_by_token(db, data, email=None, *, lock=False):
    """Resolve an invitation by link token, or by id for its verified intended recipient only."""
    if data.invitation_id is not None:
        statement = select(OpportunityInvitation).where(
            OpportunityInvitation.id == data.invitation_id,
            # Another account learns nothing about whether this id exists.
            OpportunityInvitation.recipient_email == email,
        )
    else:
        statement = select(OpportunityInvitation).where(
            OpportunityInvitation.token_hash == _digest(data.token)
        )
    if lock:
        statement = statement.with_for_update()
    row = db.scalar(statement)
    if row is None or row.state == "draft":
        raise APIError(
            404, "invitation_unavailable", "This invitation is not valid. Ask the owner."
        )
    return row


def _eligible_organisations(db, user, owner_org):
    rows = db.scalars(
        select(Membership).where(Membership.user_id == user, Membership.active.is_(True))
    ).all()
    result = []
    for member in rows:
        if member.organisation_id == owner_org or "studio" not in member.capabilities:
            continue
        if "studio" not in access.workspaces(db, member.organisation_id, member):
            continue
        result.append(
            {"id": str(member.organisation_id), "name": _org_name(db, member.organisation_id)}
        )
    return result


@router.get("/opportunities/pending")
def recipient_pending(user: User, email: Email, db: DB):
    """Open invitations addressed to the signed-in user's verified email (no link needed)."""
    now = _now()
    rows = db.scalars(
        select(OpportunityInvitation)
        .where(
            OpportunityInvitation.recipient_email == email,
            OpportunityInvitation.state == "pending",
            OpportunityInvitation.expires_at > now,
            OpportunityInvitation.closes_at > now,
        )
        .order_by(OpportunityInvitation.issued_at.desc())
    ).all()
    return {
        "items": [
            {
                "id": str(row.id),
                "owner_organisation": (row.brief_snapshot or {}).get("owner_organisation"),
                "project_name": (row.brief_snapshot or {}).get("project_name"),
                "closes_at": row.closes_at.isoformat(),
                "issued_at": row.issued_at.isoformat() if row.issued_at else None,
            }
            for row in rows
        ]
    }


@router.post("/opportunities/preview")
def recipient_preview(data: TokenInput, user: User, email: Email, db: DB):
    row = _invitation_by_token(db, data, email)
    if row.recipient_email != email:
        raise APIError(
            403,
            "wrong_recipient",
            "This invitation was sent to a different account email. Sign in with that account.",
        )
    state = _state(row)
    return {
        "state": state,
        "owner_organisation": row.brief_snapshot.get("owner_organisation"),
        "project_name": row.brief_snapshot.get("project_name"),
        "closes_at": row.closes_at.isoformat(),
        "expires_at": row.expires_at.isoformat(),
        "instructions": row.instructions,
        "brief": row.brief_snapshot,
        "files": [_file_meta(f) for f in _files(db, row.id)],
        "accepted_by_you": row.accepted_by == user,
        "contractor_organisation_id": str(row.contractor_organisation_id)
        if row.accepted_by == user and row.contractor_organisation_id
        else None,
        "eligible_organisations": _eligible_organisations(db, user, row.owner_organisation_id),
    }


@router.post("/opportunities/accept")
def recipient_accept(data: AcceptInput, user: User, email: Email, db: DB):
    row = _invitation_by_token(db, data, email, lock=True)
    if row.recipient_email != email:
        raise APIError(
            403,
            "wrong_recipient",
            "This invitation was sent to a different account email. Sign in with that account.",
        )
    if row.state == "accepted":
        if (
            row.accepted_by == user
            and row.contractor_organisation_id == data.contractor_organisation_id
        ):
            return _contractor_view(db, row, user)
        raise APIError(409, "already_accepted", "This invitation has already been accepted.")
    if row.state == "revoked":
        raise APIError(409, "invitation_revoked", "The owner withdrew this invitation.")
    if _state(row) == "expired":
        raise APIError(409, "invitation_expired", "This invitation has expired. Ask the owner.")
    if data.contractor_organisation_id == row.owner_organisation_id:
        raise APIError(
            422,
            "same_organisation",
            "Choose your own contractor organisation, not the owner's organisation.",
        )
    member = access.require_capability(db, data.contractor_organisation_id, user, "studio")
    if "studio" not in access.workspaces(db, data.contractor_organisation_id, member):
        raise APIError(
            403, "workspace_required", "That organisation does not have Design Studio enabled."
        )
    row.state = "accepted"
    row.accepted_by = user
    row.accepted_at = _now()
    row.contractor_organisation_id = data.contractor_organisation_id
    row.revision += 1
    for org in (row.owner_organisation_id, data.contractor_organisation_id):
        _audit(db, org, user, "opportunity.accepted", invitation_id=str(row.id))
    db.commit()
    return _contractor_view(db, row, user)


# ---------------------------------------------------------------- contractor endpoints


@router.get(CONTRACTOR_BASE)
def contractor_list(organisation_id: UUID, user: User, db: DB, project_id: UUID | None = None):
    access.require_capability(db, organisation_id, user, "studio")
    statement = select(OpportunityInvitation).where(
        OpportunityInvitation.contractor_organisation_id == organisation_id,
        OpportunityInvitation.state.in_(["accepted", "revoked"]),
    )
    if project_id is not None:
        statement = statement.where(OpportunityInvitation.contractor_project_id == project_id)
    rows = db.scalars(statement.order_by(OpportunityInvitation.closes_at)).all()
    return {"items": [_contractor_view(db, row, user, detail=False) for row in rows]}


@router.get(CONTRACTOR_BASE + "/{invitation_id}")
def contractor_detail(organisation_id: UUID, invitation_id: UUID, user: User, db: DB):
    row = _contractor_invitation(db, organisation_id, user, invitation_id)
    return _contractor_view(db, row, user)


@router.get(CONTRACTOR_BASE + "/{invitation_id}/files/{file_id}/content")
def contractor_shared_file(
    organisation_id: UUID, invitation_id: UUID, file_id: UUID, user: User, db: DB
):
    row = _contractor_invitation(db, organisation_id, user, invitation_id)
    record = db.scalar(
        select(OpportunityFile).where(
            OpportunityFile.id == file_id, OpportunityFile.invitation_id == row.id
        )
    )
    if record is None:
        raise not_found()
    return Response(
        content=record.content,
        media_type=record.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{record.filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _linkable(db, org, project_id, user):
    project = access.require_project(db, org, project_id, user, "edit_project")
    if project.purpose != "contractor_proposal" or project.archived:
        raise APIError(
            422,
            "link_project",
            "Link an active contractor-proposal project from your own Design Studio.",
        )
    return project


@router.post(CONTRACTOR_BASE + "/{invitation_id}/link")
def contractor_link(
    organisation_id: UUID, invitation_id: UUID, data: LinkInput, user: User, db: DB
):
    row = _contractor_invitation(db, organisation_id, user, invitation_id, lock=True)
    if row.state != "accepted":
        raise APIError(409, "invitation_revoked", "The owner withdrew this invitation.")
    if row.submission_key and row.contractor_project_id != data.project_id:
        raise APIError(
            409,
            "link_fixed",
            "A proposal was already submitted from the linked project. Revisions must come from "
            "the same project.",
        )
    _linkable(db, organisation_id, data.project_id, user)
    _bump(row, data.expected_revision)
    row.contractor_project_id = data.project_id
    _audit(
        db,
        organisation_id,
        user,
        "opportunity.linked",
        invitation_id=str(row.id),
        project_id=str(data.project_id),
    )
    db.commit()
    return _contractor_view(db, row, user)


@router.post(CONTRACTOR_BASE + "/{invitation_id}/project", status_code=201)
def contractor_create_project(
    organisation_id: UUID, invitation_id: UUID, data: CreateProjectInput, user: User, db: DB
):
    row = _contractor_invitation(db, organisation_id, user, invitation_id, lock=True)
    if row.state != "accepted":
        raise APIError(409, "invitation_revoked", "The owner withdrew this invitation.")
    if row.contractor_project_id:
        raise APIError(
            409,
            "already_linked",
            "This opportunity already has a project. Change it with Link existing project.",
        )
    brief = row.brief_snapshot or {}
    site = brief.get("site")
    if not site:
        raise APIError(
            409,
            "site_not_shared",
            "The owner did not share the site location. Create a project from the map, then "
            "link it.",
        )
    _bump(row, data.expected_revision)
    created = projects.create_project(
        db,
        organisation_id,
        user,
        ProjectCreate(
            name=data.name,
            purpose="contractor_proposal",
            stakeholder=(brief.get("owner_organisation") or "Invited owner")[:160],
            problem=brief.get("problem", ""),
            intended_users=brief.get("intended_users", ""),
            desired_outcome=brief.get("desired_outcome", ""),
            use_periods=brief.get("use_periods", ""),
            site={"bounds": site["bounds"], "outline": site.get("outline"), "crs": "EPSG:4326"},
            timezone=brief.get("timezone") or "Asia/Kuala_Lumpur",
            currency=brief.get("currency") or "MYR",
        ),
        commit=False,
    )
    row.contractor_project_id = created.id
    _audit(
        db,
        organisation_id,
        user,
        "opportunity.project_created",
        invitation_id=str(row.id),
        project_id=str(created.id),
    )
    db.commit()
    return {**_contractor_view(db, row, user), "project": created.model_dump(mode="json")}


def _sender(db, row, org, user):
    """Commercial authority: issue_proposal on the linked project of this organisation."""
    if not row.contractor_project_id:
        raise APIError(
            409, "project_not_linked", "Link or create your Design Studio project first."
        )
    return access.require_project(db, org, row.contractor_project_id, user, "issue_proposal")


def _issued(db, row, artifact_id):
    artifact = db.scalar(
        select(Artifact).where(
            Artifact.id == artifact_id,
            Artifact.project_id == row.contractor_project_id,
            Artifact.kind == "proposal",
        )
    )
    if artifact is None:
        raise APIError(
            404,
            "issued_proposal_required",
            "Choose an issued proposal from the linked project. Drafts cannot be submitted.",
        )
    return artifact


def _scope_item(item):
    keep = ("id", "name", "kind", "status", "pricing_status", "quantity", "unit", "provenance")
    result = {key: item.get(key) for key in keep}
    result["geometry"] = item.get("geometry")
    return result


def build_package(db, row, artifact, issued, contractor_org, attachments=()):
    """Allowlisted recipient payload. Never copies the estimate, rates, costs or private notes."""
    payload = artifact.payload
    brief = row.brief_snapshot or {}
    return {
        "schema": PACKAGE_SCHEMA,
        "contractor_organisation": _org_name(db, contractor_org),
        "owner_organisation": brief.get("owner_organisation"),
        "opportunity": {
            "invitation_id": str(row.id),
            "project_name": brief.get("project_name"),
            "basis_revision": row.basis_revision,
            "brief_sha256": hashlib.sha256(_canonical(brief).encode()).hexdigest(),
        },
        "proposal": {
            "title": payload.get("title"),
            "issued_version": payload.get("version"),
            "issued_at": payload.get("issued_at"),
            "project_name": payload.get("project_name"),
            "preferred_option": payload.get("preferred_option"),
            "customer_narrative": payload.get("customer_narrative"),
            "currency": payload.get("currency"),
            "selling_total": payload.get("selling_total"),
            "valid_until": payload.get("valid_until"),
            "programme": payload.get("programme"),
            "maintenance": payload.get("maintenance"),
            "maintenance_plan": payload.get("maintenance_plan"),
            "assumptions": payload.get("assumptions"),
            "exclusions": payload.get("exclusions"),
            "change_summary": payload.get("change_summary"),
            "shade": payload.get("shade"),
        },
        "scope": [_scope_item(item) for item in payload.get("selected_scope", [])],
        "quantity_schedule": [
            {
                "item_id": line.get("item_id"),
                "description": line.get("description"),
                "quantity": line.get("quantity"),
                "unit": line.get("unit"),
            }
            for line in payload.get("quantity_schedule", [])
        ],
        "site": {"boundary": payload.get("site_boundary"), "targets": payload.get("targets")},
        "evidence": [
            {
                "description": item.get("description"),
                "observations": item.get("observations"),
                "sha256": item.get("sha256"),
            }
            for item in payload.get("site_evidence", [])
        ],
        "documents": {
            "proposal_pdf": {
                "sha256": issued.sha256,
                "size_bytes": issued.size_bytes,
                "renderer": issued.renderer,
                "manifest_hash": issued.manifest_hash,
            },
            "attachments": [
                {
                    "filename": item.filename,
                    "content_type": item.content_type,
                    "size_bytes": item.size_bytes,
                    "sha256": item.sha256,
                    "description": item.description,
                }
                for item in attachments
            ],
        },
        "statement": (
            "Submitted by the contractor through InfraShader. Values are the contractor's "
            "declarations from its issued proposal; they are not verified by InfraShader or the "
            "reviewer."
        ),
    }


def _checks(db, row, artifact, issued, packages):
    blockers, warnings = [], []
    now = _now()
    if row.state != "accepted":
        blockers.append("The owner withdrew this invitation.")
    if row.closes_at <= now:
        blockers.append("The closing time has passed. The owner is no longer receiving offers.")
    owner = db.get(Project, row.owner_project_id)
    if owner is None or owner.archived:
        blockers.append("The owner is no longer receiving submissions for this project.")
    if issued is None:
        blockers.append(
            "The issued PDF has not been stored yet. Retry storing it in Issued outputs."
        )
    valid = artifact.payload.get("valid_until")
    if valid and valid != "Not set":
        try:
            if date.fromisoformat(valid) < now.date():
                blockers.append("This proposal's validity date has passed. Issue a new version.")
        except ValueError:
            pass
    current = _current_submission(packages)
    if current is not None and current.source_artifact_id == artifact.id:
        blockers.append(
            "This issued version is already the current submission. Issue a new version to "
            "revise it."
        )
    workspace = db.get(Workspace, row.contractor_project_id)
    project = db.get(Project, row.contractor_project_id)
    if (workspace and artifact.workspace_revision != workspace.revision) or (
        project and artifact.project_revision != project.revision
    ):
        warnings.append(
            "Your design or brief changed after this version was issued. The owner receives the "
            "issued version, not your latest draft."
        )
    basis = _basis(db, row.owner_project_id)
    if basis and row.basis_revision and basis.revision > row.basis_revision:
        warnings.append(
            "The owner has updated its comparison basis since your invitation. Ask the owner "
            "whether your offer still answers the current brief."
        )
    return blockers, warnings


@router.post(CONTRACTOR_BASE + "/{invitation_id}/package-preview")
def contractor_package_preview(
    organisation_id: UUID, invitation_id: UUID, data: PreviewInput, user: User, db: DB
):
    row = _contractor_invitation(db, organisation_id, user, invitation_id)
    _sender(db, row, organisation_id, user)
    artifact = _issued(db, row, data.artifact_id)
    issued = db.get(IssuedFile, artifact.id)
    packages = _packages(db, row.id)
    blockers, warnings = _checks(db, row, artifact, issued, packages)
    attachments = _staged(db, row, data.attachment_ids)
    package = (
        build_package(db, row, artifact, issued, organisation_id, attachments) if issued else None
    )
    return {
        "recipient": {
            "owner_organisation": (row.brief_snapshot or {}).get("owner_organisation"),
            "project_name": (row.brief_snapshot or {}).get("project_name"),
        },
        "contractor_organisation": _org_name(db, organisation_id),
        "closes_at": row.closes_at.isoformat(),
        "is_revision": _current_submission(packages) is not None
        or any(p.kind == "submission" for p in packages),
        "blockers": blockers,
        "warnings": warnings,
        "package": package,
    }


def _owner_entry(db, row, package_row, owner_version, now, contractor_name, reason, withdrawn):
    """Append to the owner's existing review inbox so confirmation and staleness rules apply."""
    pid = row.owner_project_id
    basis = _basis(db, pid)
    if basis is None:
        raise APIError(409, "basis_required", "The owner has no comparison basis yet.")
    others = [
        entry.payload.get("bidder_name")
        for entry in owner_review._latest(db, pid, "submission")
        if entry.key != row.submission_key
    ]
    if contractor_name in others:
        contractor_name = f"{contractor_name} ({row.recipient_email})"
    native = {
        "invitation_id": str(row.id),
        "receipt_id": package_row.receipt_id,
        "package_record_version": package_row.version,
        "opportunity_basis_revision": row.basis_revision,
    }
    evidence = f"InfraShader receipt {package_row.receipt_id}"
    if row.submission_key is None:
        key = uuid4()
        payload = {
            "bidder_name": contractor_name,
            "channel": "native_infrashader",
            "supplier_registered": False,
            "sender": f"Authorised member of {contractor_name}; invitation accepted by "
            f"{row.recipient_email}",
            "received_at": now.isoformat(),
            "receipt_evidence": evidence,
            "package_version": owner_version,
            "basis_revision_received": basis.revision,
            "received_by": "infrashader",
            "fields": owner_review._empty_fields(),
            "lines": [],
            "responses": [],
            "withdrawn": False,
            "confirmed_package_version": None,
            "confirmed_basis_revision": None,
            "revisions": [],
            "native": native,
        }
        owner_review._append(db, pid, "submission", key, 0, payload, package_row.sent_by)
        row.submission_key = key
        return key
    current = owner_review._current(db, pid, "submission", row.submission_key)
    payload = dict(current.payload)
    if withdrawn:
        payload.update(
            withdrawn=True,
            native=native,
            contractor_withdrawal={
                "receipt_id": package_row.receipt_id,
                "at": now.isoformat(),
                "reason": reason,
            },
        )
    else:
        payload.update(
            package_version=owner_version,
            sender=f"Authorised member of {contractor_name}",
            received_at=now.isoformat(),
            receipt_evidence=evidence,
            received_by="infrashader",
            withdrawn=False,
            native=native,
            revisions=payload.get("revisions", [])
            + [
                {
                    "package_version": current.payload["package_version"],
                    "superseded_at": now.isoformat(),
                    "reason": reason or "Revised submission",
                }
            ],
        )
    owner_review._append(
        db, pid, "submission", row.submission_key, current.revision, payload, package_row.sent_by
    )
    return row.submission_key


def _receipt(db, row, package_row):
    return {
        **_package_summary(package_row),
        "owner_organisation": (row.brief_snapshot or {}).get("owner_organisation"),
        "project_name": (row.brief_snapshot or {}).get("project_name"),
        "contractor_organisation": _org_name(db, package_row.contractor_organisation_id),
        "statement": "Received and stored by InfraShader for the owner. Later edits to your "
        "project do not change this submission. Receipt is not acceptance of your offer.",
    }


def _existing(db, row, key):
    return db.scalar(
        select(SubmissionPackage).where(
            SubmissionPackage.invitation_id == row.id, SubmissionPackage.idempotency_key == key
        )
    )


@router.post(CONTRACTOR_BASE + "/{invitation_id}/submit", status_code=201)
def contractor_submit(
    organisation_id: UUID, invitation_id: UUID, data: SubmitInput, user: User, db: DB
):
    row = _contractor_invitation(db, organisation_id, user, invitation_id, lock=True)
    previous = _existing(db, row, data.idempotency_key)
    if previous is not None:
        if previous.kind != "submission" or previous.source_artifact_id != data.artifact_id:
            raise APIError(409, "idempotency_conflict", "This request key was used differently.")
        return _receipt(db, row, previous)
    _sender(db, row, organisation_id, user)
    artifact = _issued(db, row, data.artifact_id)
    issued = db.scalar(
        select(IssuedFile)
        .where(IssuedFile.artifact_id == artifact.id)
        .execution_options(populate_existing=True)
    )
    packages = _packages(db, row.id)
    blockers, _ = _checks(db, row, artifact, issued, packages)
    if blockers:
        raise APIError(409, "submission_blocked", " ".join(blockers))
    content = issued.content
    if hashlib.sha256(content).hexdigest() != issued.sha256:
        raise APIError(
            409, "pdf_integrity", "The stored PDF does not match its record. Contact support."
        )
    is_revision = any(p.kind == "submission" for p in packages)
    if is_revision and not data.reason.strip():
        raise APIError(422, "revision_reason", "Explain what changed in this revised submission.")
    now = _now()
    contractor_name = _org_name(db, organisation_id) or "Contractor"
    attachments = _staged(db, row, data.attachment_ids, lock=True)
    for item in attachments:
        if hashlib.sha256(item.content).hexdigest() != item.sha256:
            raise APIError(409, "attachment_integrity", "Re-upload the attached document.")
    package = build_package(db, row, artifact, issued, organisation_id, attachments)
    package["received_at"] = now.isoformat()
    package_bytes = _canonical(package).encode()
    version = (max((p.version for p in packages), default=0)) + 1
    owner_version = sum(1 for p in packages if p.kind == "submission") + 1
    receipt = "RCPT-" + secrets.token_hex(6).upper()
    current = _current_submission(packages)
    pdf_id, manifest_id = uuid4(), uuid4()
    record = SubmissionPackage(
        invitation_id=row.id,
        version=version,
        state="received",
        kind="submission",
        pdf_file_id=pdf_id,
        package_file_id=manifest_id,
        contractor_organisation_id=organisation_id,
        contractor_project_id=row.contractor_project_id,
        source_artifact_id=artifact.id,
        idempotency_key=data.idempotency_key,
        receipt_id=receipt,
        package=package,
        package_sha256=hashlib.sha256(package_bytes).hexdigest(),
        reason=data.reason.strip(),
        supersedes_id=current.id if current else None,
        sent_by=user,
    )
    db.add(record)
    try:
        db.flush()
        key = _owner_entry(
            db, row, record, owner_version, now, contractor_name, data.reason.strip(), False
        )
        pdf = ReviewFile(
            id=pdf_id,
            project_id=row.owner_project_id,
            submission_key=key,
            purpose="received",
            package_version=owner_version,
            filename=f"proposal-v{artifact.payload.get('version')}-{receipt}.pdf",
            content_type="application/pdf",
            content=content,
            size_bytes=len(content),
            sha256=issued.sha256,
            description=f"Issued proposal PDF, byte copy (InfraShader receipt {receipt})",
            created_by=user,
        )
        manifest = ReviewFile(
            id=manifest_id,
            project_id=row.owner_project_id,
            submission_key=key,
            purpose="received",
            package_version=owner_version,
            filename=f"submission-package-{receipt}.json",
            content_type="application/json",
            content=package_bytes,
            size_bytes=len(package_bytes),
            sha256=record.package_sha256,
            description=f"Submitted package manifest (InfraShader receipt {receipt})",
            created_by=user,
        )
        db.add_all([pdf, manifest])
        for item in attachments:
            db.add(
                ReviewFile(
                    project_id=row.owner_project_id,
                    submission_key=key,
                    purpose="received",
                    package_version=owner_version,
                    filename=item.filename,
                    content_type=item.content_type,
                    content=item.content,
                    size_bytes=item.size_bytes,
                    sha256=item.sha256,
                    description=f"{item.description} (contractor attachment, receipt {receipt})",
                    created_by=user,
                )
            )
            item.consumed_package_id = record.id
        db.flush()
        record.received_at = now
        for org in (row.owner_organisation_id, organisation_id):
            _audit(
                db,
                org,
                user,
                "opportunity.submission_received",
                invitation_id=str(row.id),
                receipt_id=receipt,
                version=version,
            )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        existing = _existing(db, row, data.idempotency_key)
        if existing is not None:
            return _receipt(db, row, existing)
        raise APIError(
            409, "submission_conflict", "Another submission was recorded first. Reload and retry."
        ) from exc
    except APIError:
        db.rollback()
        raise
    return _receipt(db, row, record)


@router.post(CONTRACTOR_BASE + "/{invitation_id}/withdraw", status_code=201)
def contractor_withdraw(
    organisation_id: UUID, invitation_id: UUID, data: WithdrawInput, user: User, db: DB
):
    row = _contractor_invitation(db, organisation_id, user, invitation_id, lock=True)
    previous = _existing(db, row, data.idempotency_key)
    if previous is not None:
        if previous.kind != "withdrawal":
            raise APIError(409, "idempotency_conflict", "This request key was used differently.")
        return _receipt(db, row, previous)
    _sender(db, row, organisation_id, user)
    packages = _packages(db, row.id)
    current = _current_submission(packages)
    if current is None:
        raise APIError(409, "nothing_to_withdraw", "There is no current submission to withdraw.")
    now = _now()
    contractor_name = _org_name(db, organisation_id) or "Contractor"
    record_payload = {
        "schema": PACKAGE_SCHEMA,
        "withdrawal": {"withdraws_receipt_id": current.receipt_id, "reason": data.reason},
        "received_at": now.isoformat(),
    }
    record = SubmissionPackage(
        invitation_id=row.id,
        version=max(p.version for p in packages) + 1,
        state="received",
        kind="withdrawal",
        contractor_organisation_id=organisation_id,
        contractor_project_id=row.contractor_project_id,
        idempotency_key=data.idempotency_key,
        receipt_id="RCPT-" + secrets.token_hex(6).upper(),
        package=record_payload,
        package_sha256=hashlib.sha256(_canonical(record_payload).encode()).hexdigest(),
        reason=data.reason,
        supersedes_id=current.id,
        sent_by=user,
    )
    db.add(record)
    try:
        db.flush()
        record.received_at = now
        _owner_entry(db, row, record, None, now, contractor_name, data.reason, True)
        for org in (row.owner_organisation_id, organisation_id):
            _audit(
                db,
                org,
                user,
                "opportunity.withdrawn",
                invitation_id=str(row.id),
                receipt_id=record.receipt_id,
            )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise APIError(409, "submission_conflict", "Reload and retry.") from exc
    except APIError:
        db.rollback()
        raise
    return _receipt(db, row, record)


@router.get(CONTRACTOR_BASE + "/{invitation_id}/packages/{version}")
def contractor_package(
    organisation_id: UUID, invitation_id: UUID, version: int, user: User, db: DB
):
    row = _contractor_invitation(db, organisation_id, user, invitation_id)
    if not _can_read_project(db, row, user):
        raise not_found()
    package = db.scalar(
        select(SubmissionPackage).where(
            SubmissionPackage.invitation_id == row.id,
            SubmissionPackage.version == version,
            SubmissionPackage.contractor_organisation_id == organisation_id,
        )
    )
    if package is None:
        raise not_found()
    return {**_receipt(db, row, package), "package": package.package}


@router.get(CONTRACTOR_BASE + "/{invitation_id}/packages/{version}/files/{which}")
def contractor_package_file(
    organisation_id: UUID,
    invitation_id: UUID,
    version: int,
    which: Literal["pdf", "package"],
    user: User,
    db: DB,
):
    """The sender's copy of exactly what was received (read from the owner-side retained bytes)."""
    row = _contractor_invitation(db, organisation_id, user, invitation_id)
    if not _can_read_project(db, row, user):
        raise not_found()
    package = db.scalar(
        select(SubmissionPackage).where(
            SubmissionPackage.invitation_id == row.id,
            SubmissionPackage.version == version,
            SubmissionPackage.contractor_organisation_id == organisation_id,
            SubmissionPackage.kind == "submission",
        )
    )
    if package is None:
        raise not_found()
    file_id = package.pdf_file_id if which == "pdf" else package.package_file_id
    record = db.get(ReviewFile, file_id)
    if record is None:
        raise not_found()
    return Response(
        content=record.content,
        media_type=record.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{record.filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Content-SHA256": record.sha256,
        },
    )


def _staged(db, row, ids, *, lock=False):
    """Staged, unconsumed attachments of this invitation chosen for one submission."""
    if not ids:
        return []
    if len(set(ids)) != len(ids):
        raise APIError(422, "attachment_duplicate", "Choose each attachment once.")
    statement = select(SubmissionAttachment).where(
        SubmissionAttachment.id.in_(ids),
        SubmissionAttachment.invitation_id == row.id,
        SubmissionAttachment.consumed_package_id.is_(None),
    )
    if lock:
        statement = statement.with_for_update()
    found = db.scalars(statement.order_by(SubmissionAttachment.created_at)).all()
    if len(found) != len(ids):
        raise APIError(
            404, "attachment_unavailable", "An attachment is unavailable or already submitted."
        )
    return found


def _attachment_meta(item):
    return {
        "id": str(item.id),
        "filename": item.filename,
        "content_type": item.content_type,
        "size_bytes": item.size_bytes,
        "sha256": item.sha256,
        "description": item.description,
        "submitted": item.consumed_package_id is not None,
    }


@router.get(CONTRACTOR_BASE + "/{invitation_id}/attachments")
def contractor_attachments(organisation_id: UUID, invitation_id: UUID, user: User, db: DB):
    row = _contractor_invitation(db, organisation_id, user, invitation_id)
    if not _can_read_project(db, row, user):
        return {"items": []}
    items = db.scalars(
        select(SubmissionAttachment)
        .where(SubmissionAttachment.invitation_id == row.id)
        .order_by(SubmissionAttachment.created_at)
    ).all()
    return {"items": [_attachment_meta(item) for item in items]}


@router.post(CONTRACTOR_BASE + "/{invitation_id}/attachments", status_code=201)
def contractor_attach(
    organisation_id: UUID,
    invitation_id: UUID,
    user: User,
    db: DB,
    file: Annotated[UploadFile, File()],
    description: Annotated[str, Form(min_length=1, max_length=500)],
):
    row = _contractor_invitation(db, organisation_id, user, invitation_id, lock=True)
    if row.state != "accepted" or row.closes_at <= _now():
        raise APIError(409, "opportunity_closed", "This opportunity no longer accepts documents.")
    _sender(db, row, organisation_id, user)
    staged = db.scalars(
        select(SubmissionAttachment.id).where(
            SubmissionAttachment.invitation_id == row.id,
            SubmissionAttachment.consumed_package_id.is_(None),
        )
    ).all()
    if len(staged) >= MAX_ATTACHMENTS:
        raise APIError(
            422, "attachment_limit", f"Attach at most {MAX_ATTACHMENTS} documents at a time."
        )
    content = file.file.read(owner_review.MAX_FILE_BYTES + 1)
    kind = owner_review.sniff(content)
    item = SubmissionAttachment(
        invitation_id=row.id,
        contractor_organisation_id=organisation_id,
        filename=owner_review._clean_name(file.filename),
        content_type=kind,
        content=content,
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
        description=description,
        created_by=user,
    )
    db.add(item)
    db.flush()
    result = _attachment_meta(item)
    db.commit()
    return result


@router.delete(CONTRACTOR_BASE + "/{invitation_id}/attachments/{attachment_id}", status_code=204)
def contractor_detach(
    organisation_id: UUID, invitation_id: UUID, attachment_id: UUID, user: User, db: DB
):
    row = _contractor_invitation(db, organisation_id, user, invitation_id, lock=True)
    _sender(db, row, organisation_id, user)
    item = db.scalar(
        select(SubmissionAttachment).where(
            SubmissionAttachment.id == attachment_id,
            SubmissionAttachment.invitation_id == row.id,
        )
    )
    if item is None:
        raise not_found()
    if item.consumed_package_id is not None:
        raise APIError(
            409, "attachment_submitted", "A submitted document is part of a receipt and stays."
        )
    db.delete(item)
    db.commit()
    return Response(status_code=204)


@router.get(CONTRACTOR_BASE + "/{invitation_id}/linkable-projects")
def contractor_linkable(organisation_id: UUID, invitation_id: UUID, user: User, db: DB):
    """Every active contractor project this user may link (not just one loaded page)."""
    _contractor_invitation(db, organisation_id, user, invitation_id)
    granted = select(ProjectGrant.project_id).where(
        ProjectGrant.user_id == user, ProjectGrant.capabilities.contains(["edit_project"])
    )
    rows = db.scalars(
        select(Project)
        .where(
            Project.organisation_id == organisation_id,
            Project.purpose == "contractor_proposal",
            Project.archived.is_(False),
            Project.id.in_(granted),
        )
        .order_by(Project.updated_at.desc())
        .limit(500)
    ).all()
    member = access.membership(db, organisation_id, user)
    if "edit_project" not in member.capabilities:
        return {"items": []}
    return {"items": [{"id": str(p.id), "name": p.name} for p in rows]}


@router.get(CONTRACTOR_BASE + "/{invitation_id}/eligible-proposals")
def contractor_eligible(organisation_id: UUID, invitation_id: UUID, user: User, db: DB):
    """Issued proposals of the linked project the sender may choose from (drafts never listed)."""
    row = _contractor_invitation(db, organisation_id, user, invitation_id)
    if not row.contractor_project_id:
        return {"items": []}
    access.require_project(db, organisation_id, row.contractor_project_id, user, "read_project")
    artifacts = db.scalars(
        select(Artifact)
        .where(
            Artifact.project_id == row.contractor_project_id,
            Artifact.kind == "proposal",
        )
        .order_by(Artifact.created_at.desc())
    ).all()
    retained = set(
        db.scalars(
            select(IssuedFile.artifact_id).where(
                IssuedFile.artifact_id.in_([a.id for a in artifacts] or [uuid4()])
            )
        ).all()
    )
    submitted = {p.source_artifact_id for p in _packages(db, row.id) if p.kind == "submission"}
    return {
        "items": [
            {
                "artifact_id": str(a.id),
                "version": a.payload.get("version"),
                "issued_at": a.payload.get("issued_at"),
                "preferred_option": a.payload.get("preferred_option"),
                "valid_until": a.payload.get("valid_until"),
                "pdf_retained": a.id in retained,
                "previously_submitted": a.id in submitted,
            }
            for a in artifacts
        ]
    }
