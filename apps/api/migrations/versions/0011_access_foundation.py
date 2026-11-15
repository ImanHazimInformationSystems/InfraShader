"""Explicit legacy grants, workspace configuration and hashed team invitations."""

import json

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "organisations",
        sa.Column("workspaces", JSONB, nullable=False, server_default='["studio", "review"]'),
    )
    op.add_column(
        "organisations",
        sa.Column(
            "workspace_setup_required", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    op.create_table(
        "project_grants",
        sa.Column(
            "project_id",
            sa.UUID(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("user_id", sa.UUID(), primary_key=True),
        sa.Column("capabilities", JSONB, nullable=False),
    )
    op.create_table(
        "invitations",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.UUID(),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("capabilities", JSONB, nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("accepted_by", sa.UUID(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_invitation_recipient", "invitations", ["email", "state"])
    # Freeze the old effective access as explicit grants; never apply to future members/projects.
    basic = [
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
    privileged = [
        "manage_members",
        "change_catalogue",
        "internal_pricing",
        "issue_developer_brief",
        "issue_proposal",
        "manage_project_access",
    ]
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE memberships SET capabilities = capabilities || CAST(:basic AS jsonb) || "
            "CASE WHEN role = 'administrator' THEN CAST(:privileged AS jsonb) "
            "ELSE '[]'::jsonb END"
        ),
        {"basic": json.dumps(basic), "privileged": json.dumps(privileged)},
    )
    conn.execute(
        sa.text(
            "INSERT INTO project_grants (project_id,user_id,capabilities) "
            "SELECT p.id,m.user_id,m.capabilities FROM projects p "
            "JOIN memberships m ON p.organisation_id=m.organisation_id"
        )
    )


def downgrade():
    # Explicit capability backfill is deliberately not stripped: it preserves access history.
    op.drop_table("invitations")
    op.drop_table("project_grants")
    op.drop_column("organisations", "workspace_setup_required")
    op.drop_column("organisations", "workspaces")
