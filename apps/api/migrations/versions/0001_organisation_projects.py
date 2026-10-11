"""Organisation membership and geographic project foundation."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table(
        "organisations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_table(
        "memberships",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.Uuid(),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("capabilities", postgresql.JSONB(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("organisation_id", "user_id"),
        sa.CheckConstraint("role IN ('administrator', 'member')", name="membership_role"),
    )
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"])
    op.create_index("ix_memberships_user_active", "memberships", ["user_id", "active"])
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.Uuid(),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("purpose", sa.String(30), nullable=False),
        sa.Column("stakeholder", sa.String(160), nullable=False),
        sa.Column("problem", sa.String(4000), nullable=False),
        sa.Column("intended_users", sa.String(2000), nullable=False),
        sa.Column("desired_outcome", sa.String(4000), nullable=False),
        sa.Column("use_periods", sa.String(2000), nullable=False),
        sa.Column("site", postgresql.JSONB(), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("archived", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "purpose IN ('developer_decision', 'contractor_proposal')", name="project_purpose"
        ),
        sa.CheckConstraint("revision > 0", name="project_revision"),
        sa.CheckConstraint("length(trim(name)) > 0", name="project_name"),
    )
    op.create_index(
        "ix_projects_organisation_archived", "projects", ["organisation_id", "archived"]
    )
    # Bounds remain the external contract; PostGIS stores a derived spatial envelope/index.
    op.execute("""
        ALTER TABLE projects ADD COLUMN site_envelope geometry(Polygon,4326)
        GENERATED ALWAYS AS (ST_MakeEnvelope(
            (site->'bounds'->>0)::double precision, (site->'bounds'->>1)::double precision,
            (site->'bounds'->>2)::double precision, (site->'bounds'->>3)::double precision,4326
        )) STORED
    """)
    op.execute("CREATE INDEX ix_projects_site_envelope ON projects USING gist (site_envelope)")
    # Business records are backend-only; Supabase browser roles get no table grants or policies.
    for table in ("organisations", "memberships", "projects"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON TABLE {table} FROM PUBLIC")
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
          REVOKE ALL ON organisations, memberships, projects FROM anon;
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
          REVOKE ALL ON organisations, memberships, projects FROM authenticated;
        END IF;
    END $$""")


def downgrade() -> None:
    op.drop_table("projects")
    op.drop_table("memberships")
    op.drop_table("organisations")
    # Shared extension may be used by unrelated tables; do not drop it.
