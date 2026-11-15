"""O17 decision memorandum PDF: allow a retained 'decision_memo' review file purpose."""

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("review_file_purpose", "review_files", type_="check")
    op.create_check_constraint(
        "review_file_purpose",
        "review_files",
        "purpose IN ('received','decision_pack','decision_memo')",
    )
    # One retained memorandum per approved decision revision (first bytes win).
    op.create_index(
        "uq_review_files_decision_memo",
        "review_files",
        ["project_id", "package_version"],
        unique=True,
        postgresql_where="purpose = 'decision_memo'",
    )


def downgrade():
    op.drop_index("uq_review_files_decision_memo", table_name="review_files")
    op.execute("DELETE FROM review_files WHERE purpose = 'decision_memo'")
    op.drop_constraint("review_file_purpose", "review_files", type_="check")
    op.create_check_constraint(
        "review_file_purpose", "review_files", "purpose IN ('received','decision_pack')"
    )
