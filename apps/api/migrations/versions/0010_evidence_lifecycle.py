"""Reversible private evidence removal and modification provenance."""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "evidence", sa.Column("archived", sa.Boolean(), nullable=False, server_default="false")
    )
    op.add_column("evidence", sa.Column("updated_by", sa.Uuid(), nullable=True))
    op.add_column(
        "evidence",
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.execute("UPDATE evidence SET updated_by=created_by, updated_at=created_at")


def downgrade():
    for name in ("archived", "updated_by", "updated_at"):
        op.drop_column("evidence", name)
