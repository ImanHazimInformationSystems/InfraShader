"""K03/L26 contractor change requests: append-only revisions linked to issued proposals."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "change_requests",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("key", UUID, nullable=False),
        sa.Column("revision", sa.Integer, nullable=False),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("project_id", "key", "revision"),
        sa.CheckConstraint("revision > 0", name="change_request_revision"),
    )
    op.create_index("ix_change_requests_project", "change_requests", ["project_id"])
    op.execute("ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON change_requests FROM PUBLIC")
    op.execute("""DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
        REVOKE ALL ON change_requests FROM anon;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
        REVOKE ALL ON change_requests FROM authenticated;
      END IF;
    END $$""")
    op.execute(
        "CREATE TRIGGER change_requests_immutable BEFORE UPDATE ON change_requests "
        "FOR EACH ROW EXECUTE FUNCTION prevent_artifact_update()"
    )


def downgrade():
    op.drop_table("change_requests")
