"""Structured briefs and append-only project history."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "projects",
        sa.Column("details", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_table(
        "project_revisions",
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
        "INSERT INTO project_revisions (project_id, revision, payload, changed_by) "
        "SELECT id, revision, to_jsonb(projects), updated_by FROM projects"
    )
    op.execute("ALTER TABLE project_revisions ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON project_revisions FROM PUBLIC")
    op.execute(
        "CREATE TRIGGER project_revisions_immutable BEFORE UPDATE ON project_revisions "
        "FOR EACH ROW EXECUTE FUNCTION prevent_artifact_update()"
    )


def downgrade():
    op.drop_table("project_revisions")
    op.drop_column("projects", "details")
