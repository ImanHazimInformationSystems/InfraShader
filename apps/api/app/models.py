from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Organisation(Base):
    workspaces: Mapped[list[str]] = mapped_column(JSONB, default=lambda: ["studio", "review"])
    workspace_setup_required: Mapped[bool] = mapped_column(Boolean, default=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __tablename__ = "organisations"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Membership(Base):
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("organisation_id", "user_id"),
        CheckConstraint("role IN ('administrator', 'member')", name="membership_role"),
        Index("ix_memberships_user_active", "user_id", "active"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    organisation_id: Mapped[UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE")
    )
    user_id: Mapped[UUID] = mapped_column(index=True)
    role: Mapped[str] = mapped_column(String(20), default="member")
    capabilities: Mapped[list[str]] = mapped_column(JSONB, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Project(Base):
    details: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('developer_decision', 'contractor_proposal')", name="project_purpose"
        ),
        CheckConstraint("revision > 0", name="project_revision"),
        CheckConstraint("length(trim(name)) > 0", name="project_name"),
        CheckConstraint(
            "example IS NULL OR example IN "
            "('studio', 'studio_a', 'studio_b', 'studio_c', 'review')",
            name="project_example",
        ),
        Index("ix_projects_organisation_archived", "organisation_id", "archived"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    organisation_id: Mapped[UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(160))
    purpose: Mapped[str] = mapped_column(String(30))
    stakeholder: Mapped[str] = mapped_column(String(160))
    problem: Mapped[str] = mapped_column(String(4000), default="")
    intended_users: Mapped[str] = mapped_column(String(2000), default="")
    desired_outcome: Mapped[str] = mapped_column(String(4000), default="")
    use_periods: Mapped[str] = mapped_column(String(2000), default="")
    site: Mapped[dict] = mapped_column(JSONB)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kuala_Lumpur")
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Built-in reference project marker ("studio" / "review"); never set from user input.
    example: Mapped[str | None] = mapped_column(String(16), nullable=True, default=None)
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_by: Mapped[UUID] = mapped_column()
    updated_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProjectGrant(Base):
    __tablename__ = "project_grants"
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(primary_key=True)
    capabilities: Mapped[list[str]] = mapped_column(JSONB, default=list)


class HubRecord(Base):
    """Personal reusable records within an organisation; never a project access grant."""

    __tablename__ = "hub_records"
    __table_args__ = (
        CheckConstraint("kind IN ('contact', 'template')", name="hub_record_kind"),
        CheckConstraint("revision > 0", name="hub_record_revision"),
        Index("ix_hub_owner", "organisation_id", "owner_id", "kind"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    organisation_id: Mapped[UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE")
    )
    owner_id: Mapped[UUID] = mapped_column()
    kind: Mapped[str] = mapped_column(String(16))
    data: Mapped[dict] = mapped_column(JSONB)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HubRecordRevision(Base):
    __tablename__ = "hub_record_revisions"
    record_id: Mapped[UUID] = mapped_column(
        ForeignKey("hub_records.id", ondelete="CASCADE"), primary_key=True
    )
    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    payload: Mapped[dict] = mapped_column(JSONB)
    changed_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BriefCheckpoint(Base):
    __tablename__ = "brief_checkpoints"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    project_revision: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSONB)
    created_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("project_id", "version"),)


class Invitation(Base):
    __tablename__ = "invitations"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    organisation_id: Mapped[UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE")
    )
    email: Mapped[str] = mapped_column(String(320))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    role: Mapped[str] = mapped_column(String(20))
    capabilities: Mapped[list[str]] = mapped_column(JSONB)
    created_by: Mapped[UUID] = mapped_column()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(20), default="pending")
    accepted_by: Mapped[UUID | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (CheckConstraint("revision > 0", name="workspace_revision"),)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    revision: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict] = mapped_column(JSONB)
    updated_by: Mapped[UUID] = mapped_column()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WorkspaceRevision(Base):
    __tablename__ = "workspace_revisions"
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    payload: Mapped[dict] = mapped_column(JSONB)
    changed_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CatalogueRate(Base):
    category: Mapped[str] = mapped_column(String(80), default="General", server_default="General")
    archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    metadata_revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __tablename__ = "catalogue_rates"
    __table_args__ = (UniqueConstraint("organisation_id", "code", "version"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    organisation_id: Mapped[UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE")
    )
    code: Mapped[str] = mapped_column(String(80))
    version: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(500))
    unit: Mapped[str] = mapped_column(String(8))
    currency: Mapped[str] = mapped_column(String(3))
    basis: Mapped[str] = mapped_column(String(24))
    amount = mapped_column(Numeric(18, 4), nullable=False)
    effective_date = mapped_column(Date, nullable=False)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_note: Mapped[str] = mapped_column(String(2000))
    includes: Mapped[list] = mapped_column(JSONB)
    # L14 vendor record: entered by the organisation; InfraShader never verifies a supplier.
    source_type: Mapped[str] = mapped_column(
        String(24), default="user_entered", server_default="user_entered"
    )
    supplier_name: Mapped[str] = mapped_column(String(200), default="", server_default="")
    quote_reference: Mapped[str] = mapped_column(String(120), default="", server_default="")
    exclusions: Mapped[str] = mapped_column(String(2000), default="", server_default="")


class Artifact(Base):
    __tablename__ = "artifacts"
    __table_args__ = (UniqueConstraint("project_id", "kind", "request_key"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(24))
    request_key: Mapped[UUID] = mapped_column()
    workspace_revision: Mapped[int] = mapped_column(Integer)
    project_revision: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSONB)
    created_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Evidence(Base):
    archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    updated_by: Mapped[UUID | None] = mapped_column(nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    observations: Mapped[str] = mapped_column(String(8000), default="", server_default="")
    target_ids: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    __tablename__ = "evidence"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    object_path: Mapped[str] = mapped_column(String(250), unique=True)
    content_type: Mapped[str] = mapped_column(String(32))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(String(2000))
    source_note: Mapped[str] = mapped_column(String(2000))
    created_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProjectRevision(Base):
    __tablename__ = "project_revisions"
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    payload: Mapped[dict] = mapped_column(JSONB)
    changed_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserProfile(Base):
    __tablename__ = "user_profiles"
    user_id: Mapped[UUID] = mapped_column(primary_key=True)
    display_name: Mapped[str] = mapped_column(String(160), default="")
    revision: Mapped[int] = mapped_column(Integer, default=1)


class AdministrationEvent(Base):
    __tablename__ = "administration_events"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    organisation_id: Mapped[UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE")
    )
    actor_id: Mapped[UUID] = mapped_column()
    payload: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReviewEntry(Base):
    """Owner-review record revision. Rows are immutable; the highest revision is current."""

    __tablename__ = "review_entries"
    __table_args__ = (UniqueConstraint("project_id", "kind", "key", "revision"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(24))
    key: Mapped[UUID] = mapped_column()
    revision: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSONB)
    created_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChangeRequest(Base):
    """Contractor change request revision (K03/L26). Rows are immutable."""

    __tablename__ = "change_requests"
    __table_args__ = (UniqueConstraint("project_id", "key", "revision"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    key: Mapped[UUID] = mapped_column()
    revision: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSONB)
    created_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReviewFile(Base):
    __tablename__ = "review_files"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    submission_key: Mapped[UUID | None] = mapped_column(nullable=True)
    purpose: Mapped[str] = mapped_column(String(20))
    package_version: Mapped[int] = mapped_column(Integer)
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(100))
    content: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(String(500))
    created_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IssuedFile(Base):
    __tablename__ = "issued_files"
    artifact_id: Mapped[UUID] = mapped_column(
        ForeignKey("artifacts.id", ondelete="CASCADE"), primary_key=True
    )
    content: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    manifest_hash: Mapped[str] = mapped_column(String(64))
    renderer: Mapped[str] = mapped_column(String(80))
    created_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OpportunityInvitation(Base):
    """S03/L25: an owner project's invitation to one contractor recipient (see 0021)."""

    __tablename__ = "opportunity_invitations"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_organisation_id: Mapped[UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE")
    )
    owner_project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    recipient_email: Mapped[str] = mapped_column(String(320))
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    state: Mapped[str] = mapped_column(String(20), default="draft")
    instructions: Mapped[str] = mapped_column(String(4000), default="")
    shared_fields: Mapped[list[str]] = mapped_column(JSONB, default=list)
    closes_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    brief_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    basis_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    project_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_by: Mapped[UUID | None] = mapped_column(nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    contractor_organisation_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("organisations.id", ondelete="SET NULL"), nullable=True
    )
    contractor_project_id: Mapped[UUID | None] = mapped_column(nullable=True)
    submission_key: Mapped[UUID | None] = mapped_column(nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OpportunityFile(Base):
    """A file the owner deliberately shared with one invitation; frozen when issued."""

    __tablename__ = "opportunity_files"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    invitation_id: Mapped[UUID] = mapped_column(
        ForeignKey("opportunity_invitations.id", ondelete="CASCADE")
    )
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(100))
    content: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(String(500))
    created_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SubmissionPackage(Base):
    """An immutable received package (or recorded withdrawal) for one accepted invitation."""

    __tablename__ = "submission_packages"
    __table_args__ = (
        UniqueConstraint("invitation_id", "version", name="submission_package_version"),
        UniqueConstraint("invitation_id", "idempotency_key", name="submission_package_idempotency"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    invitation_id: Mapped[UUID] = mapped_column(
        ForeignKey("opportunity_invitations.id", ondelete="CASCADE")
    )
    version: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(20), default="received")
    kind: Mapped[str] = mapped_column(String(20), default="submission")
    contractor_organisation_id: Mapped[UUID] = mapped_column()
    contractor_project_id: Mapped[UUID | None] = mapped_column(nullable=True)
    source_artifact_id: Mapped[UUID | None] = mapped_column(nullable=True)
    idempotency_key: Mapped[UUID] = mapped_column()
    receipt_id: Mapped[str] = mapped_column(String(40), unique=True)
    package: Mapped[dict] = mapped_column(JSONB)
    package_sha256: Mapped[str] = mapped_column(String(64))
    pdf_file_id: Mapped[UUID | None] = mapped_column(nullable=True)
    package_file_id: Mapped[UUID | None] = mapped_column(nullable=True)
    reason: Mapped[str] = mapped_column(String(2000), default="")
    supersedes_id: Mapped[UUID | None] = mapped_column(nullable=True)
    sent_by: Mapped[UUID] = mapped_column()
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SubmissionAttachment(Base):
    """A contractor document staged for the next submission; never shared until submitted."""

    __tablename__ = "submission_attachments"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    invitation_id: Mapped[UUID] = mapped_column(
        ForeignKey("opportunity_invitations.id", ondelete="CASCADE")
    )
    contractor_organisation_id: Mapped[UUID] = mapped_column()
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(100))
    content: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(String(500))
    consumed_package_id: Mapped[UUID | None] = mapped_column(nullable=True)
    created_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
