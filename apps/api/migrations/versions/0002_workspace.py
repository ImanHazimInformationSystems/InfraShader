"""Ground site geometry, canonical quantities and independent scenarios."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "workspaces",
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("data", JSONB(), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("revision > 0", name="workspace_revision"),
    )
    op.execute("ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON workspaces FROM PUBLIC")
    op.execute("""DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
        REVOKE ALL ON workspaces FROM anon;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
        REVOKE ALL ON workspaces FROM authenticated;
      END IF;
    END $$""")


def downgrade():
    op.drop_table("workspaces")
