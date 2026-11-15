"""Append-only acknowledgement records, separate from an internal opportunity stage."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "brief_checkpoints",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("project_revision", sa.Integer, nullable=False),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("project_id", "version"),
    )
    op.create_index("ix_brief_checkpoints_project_id", "brief_checkpoints", ["project_id"])
    op.execute("ALTER TABLE brief_checkpoints ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON brief_checkpoints FROM PUBLIC")
    op.execute("""DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
        REVOKE ALL ON brief_checkpoints FROM anon;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
        REVOKE ALL ON brief_checkpoints FROM authenticated;
      END IF;
    END $$""")
    op.execute(
        "CREATE TRIGGER brief_checkpoint_immutable BEFORE UPDATE ON brief_checkpoints "
        "FOR EACH ROW EXECUTE FUNCTION prevent_artifact_update()"
    )


def downgrade():
    op.drop_table("brief_checkpoints")
