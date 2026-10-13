"""Append-only workspace history and safe restoration."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "workspace_revisions",
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("revision", sa.Integer(), primary_key=True),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("changed_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.execute(
        "INSERT INTO workspace_revisions (project_id, revision, payload, changed_by) "
        "SELECT project_id, revision, data, updated_by FROM workspaces"
    )
    op.execute("ALTER TABLE workspace_revisions ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON workspace_revisions FROM PUBLIC")
    op.execute(
        "CREATE TRIGGER workspace_revisions_immutable BEFORE UPDATE ON workspace_revisions "
        "FOR EACH ROW EXECUTE FUNCTION prevent_artifact_update()"
    )


def downgrade():
    op.drop_table("workspace_revisions")
