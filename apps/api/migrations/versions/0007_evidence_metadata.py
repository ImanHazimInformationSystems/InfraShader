"""Revisioned observations and target links for private evidence."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "evidence", sa.Column("revision", sa.Integer(), nullable=False, server_default="1")
    )
    op.add_column(
        "evidence", sa.Column("observations", sa.String(8000), nullable=False, server_default="")
    )
    op.add_column(
        "evidence",
        sa.Column("target_ids", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )


def downgrade():
    for name in ("target_ids", "observations", "revision"):
        op.drop_column("evidence", name)
