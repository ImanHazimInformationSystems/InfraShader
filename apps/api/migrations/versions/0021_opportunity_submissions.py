"""S03/L25/O05 contractor-to-owner submissions: invitations, shared files, received packages.

An owner review project prepares a draft invitation, attaches deliberately selected files, then
issues it: the brief/basis snapshot is frozen and a single-use opaque token is returned once
(only its SHA-256 is stored). An intended, verified recipient accepts it for one contractor
organisation; no membership or project grant crosses tenants. Each submission is an immutable,
versioned package built from an issued proposal. Packages and their retained file copies live
with the owner project, so sender edits, archives or access changes never alter them.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "opportunity_invitations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "owner_organisation_id",
            sa.Uuid(),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "owner_project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("recipient_email", sa.String(320), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=True, unique=True),
        sa.Column("state", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("instructions", sa.String(4000), nullable=False, server_default=""),
        sa.Column("shared_fields", JSONB(), nullable=False, server_default="[]"),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("brief_snapshot", JSONB(), nullable=True),
        sa.Column("basis_revision", sa.Integer(), nullable=True),
        sa.Column("project_revision", sa.Integer(), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_by", sa.Uuid(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "contractor_organisation_id",
            sa.Uuid(),
            sa.ForeignKey("organisations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("contractor_project_id", sa.Uuid(), nullable=True),
        sa.Column("submission_key", sa.Uuid(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "state IN ('draft', 'pending', 'accepted', 'revoked')", name="opportunity_state"
        ),
        sa.CheckConstraint(
            "state = 'draft' OR (token_hash IS NOT NULL AND brief_snapshot IS NOT NULL "
            "AND issued_at IS NOT NULL AND expires_at IS NOT NULL)",
            name="opportunity_issued_frozen",
        ),
        sa.CheckConstraint(
            "state <> 'accepted' OR (accepted_by IS NOT NULL "
            "AND contractor_organisation_id IS NOT NULL)",
            name="opportunity_accepted_bound",
        ),
    )
    op.create_index("ix_opportunity_owner_project", "opportunity_invitations", ["owner_project_id"])
    op.create_index(
        "ix_opportunity_contractor", "opportunity_invitations", ["contractor_organisation_id"]
    )
    op.create_table(
        "opportunity_files",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "invitation_id",
            sa.Uuid(),
            sa.ForeignKey("opportunity_invitations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("filename", sa.String(200), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "submission_packages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "invitation_id",
            sa.Uuid(),
            sa.ForeignKey("opportunity_invitations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(20), nullable=False, server_default="received"),
        sa.Column("kind", sa.String(20), nullable=False, server_default="submission"),
        sa.Column("contractor_organisation_id", sa.Uuid(), nullable=False),
        sa.Column("contractor_project_id", sa.Uuid(), nullable=True),
        # The source issued proposal; deliberately no FK so sender changes never cascade here.
        sa.Column("source_artifact_id", sa.Uuid(), nullable=True),
        sa.Column("idempotency_key", sa.Uuid(), nullable=False),
        sa.Column("receipt_id", sa.String(40), nullable=False, unique=True),
        sa.Column("package", JSONB(), nullable=False),
        sa.Column("package_sha256", sa.String(64), nullable=False),
        sa.Column("pdf_file_id", sa.Uuid(), nullable=True),
        sa.Column("package_file_id", sa.Uuid(), nullable=True),
        sa.Column("reason", sa.String(2000), nullable=False, server_default=""),
        sa.Column("supersedes_id", sa.Uuid(), nullable=True),
        sa.Column("sent_by", sa.Uuid(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("invitation_id", "version", name="submission_package_version"),
        sa.UniqueConstraint(
            "invitation_id", "idempotency_key", name="submission_package_idempotency"
        ),
        sa.CheckConstraint("version > 0", name="submission_package_positive"),
        sa.CheckConstraint("kind IN ('submission', 'withdrawal')", name="submission_package_kind"),
        sa.CheckConstraint(
            "kind = 'withdrawal' OR (pdf_file_id IS NOT NULL AND package_file_id IS NOT NULL "
            "AND source_artifact_id IS NOT NULL)",
            name="submission_package_complete",
        ),
    )
    op.create_index("ix_submission_packages_invitation", "submission_packages", ["invitation_id"])
    # Contractor documents (certificates, method statements) staged before a submission and
    # copied into the owner inbox in the same transaction as the package that consumes them.
    op.create_table(
        "submission_attachments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "invitation_id",
            sa.Uuid(),
            sa.ForeignKey("opportunity_invitations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("contractor_organisation_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(200), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("consumed_package_id", sa.Uuid(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("submission_attachments")
    op.drop_index("ix_submission_packages_invitation", table_name="submission_packages")
    op.drop_table("submission_packages")
    op.drop_table("opportunity_files")
    op.drop_index("ix_opportunity_contractor", table_name="opportunity_invitations")
    op.drop_index("ix_opportunity_owner_project", table_name="opportunity_invitations")
    op.drop_table("opportunity_invitations")
