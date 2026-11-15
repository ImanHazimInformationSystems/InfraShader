"""Built-in example projects: mark a project as the Studio or Review reference example."""

import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("example", sa.String(16), nullable=True))
    op.create_check_constraint(
        "project_example", "projects", "example IS NULL OR example IN ('studio', 'review')"
    )


def downgrade():
    op.drop_constraint("project_example", "projects", type_="check")
    op.drop_column("projects", "example")
