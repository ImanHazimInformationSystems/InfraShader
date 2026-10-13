"""Organisation settings, profiles and membership change audit."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "organisations",
        sa.Column("settings", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    for table in ("organisations", "memberships"):
        op.add_column(
            table, sa.Column("revision", sa.Integer(), nullable=False, server_default="1")
        )
    op.create_table(
        "user_profiles",
        sa.Column("user_id", sa.Uuid(), primary_key=True),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
    )
    op.create_table(
        "administration_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.Uuid(),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    for table in ("user_profiles", "administration_events"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON {table} FROM PUBLIC")
    op.execute(
        "CREATE TRIGGER administration_events_immutable BEFORE UPDATE ON administration_events "
        "FOR EACH ROW EXECUTE FUNCTION prevent_artifact_update()"
    )


def downgrade():
    op.drop_table("administration_events")
    op.drop_table("user_profiles")
    op.drop_column("memberships", "revision")
    op.drop_column("organisations", "revision")
    op.drop_column("organisations", "settings")
