"""Personal reusable contact/template records for L01."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "hub_records",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "organisation_id",
            UUID,
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("data", JSONB, nullable=False),
        sa.Column("revision", sa.Integer, nullable=False),
        sa.Column("archived", sa.Boolean, nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("kind IN ('contact', 'template')", name="hub_record_kind"),
        sa.CheckConstraint("revision > 0", name="hub_record_revision"),
    )
    op.create_index("ix_hub_owner", "hub_records", ["organisation_id", "owner_id", "kind"])
    op.execute("ALTER TABLE hub_records ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON hub_records FROM PUBLIC")
    op.execute("""DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
        REVOKE ALL ON hub_records FROM anon;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
        REVOKE ALL ON hub_records FROM authenticated;
      END IF;
    END $$""")

    op.create_table(
        "hub_record_revisions",
        sa.Column(
            "record_id", UUID, sa.ForeignKey("hub_records.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("revision", sa.Integer, primary_key=True),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("changed_by", UUID, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.execute("ALTER TABLE hub_record_revisions ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON hub_record_revisions FROM PUBLIC")
    op.execute("""DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
        REVOKE ALL ON hub_record_revisions FROM anon;
      END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
        REVOKE ALL ON hub_record_revisions FROM authenticated;
      END IF;
    END $$""")
    op.execute(
        "CREATE TRIGGER hub_revision_immutable BEFORE UPDATE ON hub_record_revisions "
        "FOR EACH ROW EXECUTE FUNCTION prevent_artifact_update()"
    )


def downgrade():
    op.drop_table("hub_record_revisions")
    op.drop_table("hub_records")
