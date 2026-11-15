"""L14 rate source records: supplier name, source type, quotation reference and exclusions.

Existing rate versions keep their values and become 'user_entered' with empty supplier fields;
nothing is inferred from the free-text source note.
"""

import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None

TYPES = "('user_entered', 'supplier_quote', 'price_list', 'past_project')"


def upgrade():
    op.add_column(
        "catalogue_rates",
        sa.Column("source_type", sa.String(24), nullable=False, server_default="user_entered"),
    )
    op.add_column(
        "catalogue_rates",
        sa.Column("supplier_name", sa.String(200), nullable=False, server_default=""),
    )
    op.add_column(
        "catalogue_rates",
        sa.Column("quote_reference", sa.String(120), nullable=False, server_default=""),
    )
    op.add_column(
        "catalogue_rates",
        sa.Column("exclusions", sa.String(2000), nullable=False, server_default=""),
    )
    op.create_check_constraint("rate_source_type", "catalogue_rates", f"source_type IN {TYPES}")
    op.create_check_constraint(
        "rate_supplier_named",
        "catalogue_rates",
        "source_type NOT IN ('supplier_quote', 'price_list') OR supplier_name <> ''",
    )


def downgrade():
    op.drop_constraint("rate_supplier_named", "catalogue_rates", type_="check")
    op.drop_constraint("rate_source_type", "catalogue_rates", type_="check")
    for name in ("exclusions", "quote_reference", "supplier_name", "source_type"):
        op.drop_column("catalogue_rates", name)
