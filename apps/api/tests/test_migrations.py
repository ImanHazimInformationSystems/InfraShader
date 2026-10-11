from io import StringIO
from pathlib import Path

from alembic import command
from alembic.config import Config


def test_offline_migration_contains_spatial_and_private_access_foundations():
    output = StringIO()
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "migrations"))
    config.attributes["database_url"] = "postgresql+psycopg://unused:unused@localhost/offline_test"
    command.upgrade(config, "head", sql=True)
    sql = output.getvalue()
    assert "CREATE EXTENSION IF NOT EXISTS postgis" in sql
    assert "geometry(Polygon,4326)" in sql
    assert "USING gist (site_envelope)" in sql
    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL ON TABLE projects FROM PUBLIC" in sql
    assert "FOREIGN KEY(organisation_id)" in sql
    assert "UNIQUE (organisation_id, user_id)" in sql
    # SQL generation is useful inspection evidence; execution needs the integration suite.
