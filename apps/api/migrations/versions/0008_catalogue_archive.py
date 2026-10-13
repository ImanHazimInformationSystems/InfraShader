"""Catalogue categories and reversible archive metadata."""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "catalogue_rates",
        sa.Column("category", sa.String(80), nullable=False, server_default="General"),
    )
    op.add_column(
        "catalogue_rates",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "catalogue_rates",
        sa.Column("metadata_revision", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade():
    for name in ("metadata_revision", "archived", "category"):
        op.drop_column("catalogue_rates", name)
