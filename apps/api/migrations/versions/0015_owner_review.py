"""D1B owner review: append-only revisioned records and retained private files."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def _private(table):
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
    op.execute(
        f"CREATE TRIGGER {table}_immutable BEFORE UPDATE ON {table} "
        "FOR EACH ROW EXECUTE FUNCTION prevent_artifact_update()"
    )


def upgrade():
    op.create_table(
        "review_entries",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("key", UUID, nullable=False),
        sa.Column("revision", sa.Integer, nullable=False),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("project_id", "kind", "key", "revision"),
        sa.CheckConstraint("revision > 0", name="review_entry_revision"),
        sa.CheckConstraint(
            "kind IN ('basis','rubric','submission','score','clarification','decision')",
            name="review_entry_kind",
        ),
    )
    op.create_index("ix_review_entries_project_kind", "review_entries", ["project_id", "kind"])
    op.create_table(
        "review_files",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("submission_key", UUID, nullable=True),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("package_version", sa.Integer, nullable=False),
        sa.Column("filename", sa.String(200), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("content", sa.LargeBinary, nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("purpose IN ('received','decision_pack')", name="review_file_purpose"),
    )
    op.create_index("ix_review_files_project", "review_files", ["project_id"])
    _private("review_entries")
    _private("review_files")


def downgrade():
    op.drop_table("review_files")
    op.drop_table("review_entries")
