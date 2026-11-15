"""Three Design Studio example projects (A, B, C) share one site and feed the Review example."""

from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

NEW = "example IS NULL OR example IN ('studio', 'studio_a', 'studio_b', 'studio_c', 'review')"
OLD = "example IS NULL OR example IN ('studio', 'review')"


def upgrade():
    op.drop_constraint("project_example", "projects", type_="check")
    op.create_check_constraint("project_example", "projects", NEW)


def downgrade():
    op.execute("UPDATE projects SET example = 'studio' WHERE example LIKE 'studio_%'")
    op.drop_constraint("project_example", "projects", type_="check")
    op.create_check_constraint("project_example", "projects", OLD)
