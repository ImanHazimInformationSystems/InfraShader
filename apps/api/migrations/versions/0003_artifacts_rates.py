"""Versioned rates, analysis/estimate revisions and immutable issued snapshots."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "catalogue_rates",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.Uuid(),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("unit", sa.String(8), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("basis", sa.String(24), nullable=False),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("source_note", sa.String(2000), nullable=False),
        sa.Column("includes", JSONB(), nullable=False),
        sa.UniqueConstraint("organisation_id", "code", "version"),
        sa.CheckConstraint("amount >= 0 AND version > 0", name="rate_values"),
    )
    op.create_table(
        "artifacts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("request_key", sa.Uuid(), nullable=False),
        sa.Column("workspace_revision", sa.Integer(), nullable=False),
        sa.Column("project_revision", sa.Integer(), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("project_id", "kind", "request_key"),
    )
    op.create_index("ix_artifacts_project_id", "artifacts", ["project_id"])
    for table in ("catalogue_rates", "artifacts"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON {table} FROM PUBLIC")
        op.execute(f"""DO $$ BEGIN
          IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
            REVOKE ALL ON {table} FROM anon;
          END IF;
          IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
            REVOKE ALL ON {table} FROM authenticated;
          END IF;
        END $$""")
    # Issued snapshots and calculation revisions are append-only, even for normal backend SQL.
    op.execute("""CREATE FUNCTION prevent_artifact_update() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'Artifacts are immutable; create a new revision'; END;
      $$ LANGUAGE plpgsql""")
    op.execute(
        "CREATE TRIGGER artifacts_immutable BEFORE UPDATE ON artifacts "
        "FOR EACH ROW EXECUTE FUNCTION prevent_artifact_update()"
    )


def downgrade():
    op.drop_table("artifacts")
    op.execute("DROP FUNCTION prevent_artifact_update()")
    op.drop_table("catalogue_rates")
