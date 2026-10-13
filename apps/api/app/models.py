from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
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
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_by: Mapped[UUID] = mapped_column()
    updated_by: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


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
    source_note: Mapped[str] = mapped_column(String(2000))
    includes: Mapped[list] = mapped_column(JSONB)


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
