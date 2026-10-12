"""Private evidence metadata; object bytes live in private Supabase Storage."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "evidence",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("object_path", sa.String(250), nullable=False, unique=True),
        sa.Column("content_type", sa.String(32), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("description", sa.String(2000), nullable=False),
        sa.Column("source_note", sa.String(2000), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_evidence_project_id", "evidence", ["project_id"])
    op.execute("ALTER TABLE evidence ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON evidence FROM PUBLIC")
    op.execute("""DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
        REVOKE ALL ON evidence FROM anon;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
        REVOKE ALL ON evidence FROM authenticated;
      END IF;
    END $$""")


def downgrade():
    op.drop_table("evidence")
