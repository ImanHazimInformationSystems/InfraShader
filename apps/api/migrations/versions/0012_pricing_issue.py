"""Rate validity and bounded immutable issued PDF bytes."""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("catalogue_rates", sa.Column("valid_until", sa.Date(), nullable=True))
    op.create_check_constraint(
        "rate_validity", "catalogue_rates", "valid_until IS NULL OR valid_until >= effective_date"
    )
    op.create_table(
        "issued_files",
        sa.Column(
            "artifact_id",
            sa.Uuid(),
            sa.ForeignKey("artifacts.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("manifest_hash", sa.String(64), nullable=False),
        sa.Column("renderer", sa.String(80), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "octet_length(content) = size_bytes AND size_bytes <= 10485760", name="issued_pdf_size"
        ),
    )
    op.execute("ALTER TABLE issued_files ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON issued_files FROM PUBLIC")
    op.execute("""DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
        REVOKE ALL ON issued_files FROM anon; END IF;
      IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
        REVOKE ALL ON issued_files FROM authenticated; END IF;
    END $$""")
    op.execute(
        "CREATE TRIGGER issued_files_immutable BEFORE UPDATE ON issued_files "
        "FOR EACH ROW EXECUTE FUNCTION prevent_artifact_update()"
    )


def downgrade():
    op.drop_table("issued_files")
    op.drop_constraint("rate_validity", "catalogue_rates")
    op.drop_column("catalogue_rates", "valid_until")
