import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "backup.py"
spec = importlib.util.spec_from_file_location("infrashader_backup", SCRIPT)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def test_database_url_becomes_libpq_variables_without_leaking_into_arguments():
    env = backup.libpq_environment(
        "postgresql+psycopg://app%40role:p%3Ass@db.example.invalid:6543/infra?sslmode=require"
    )
    assert env == {
        "PGHOST": "db.example.invalid",
        "PGPORT": "6543",
        "PGDATABASE": "infra",
        "PGUSER": "app@role",
        "PGPASSWORD": "p:ss",
        "PGSSLMODE": "require",
    }


@pytest.mark.parametrize("url", ["sqlite:///x.db", "postgresql://host/", "postgresql:///db"])
def test_database_url_must_be_complete_postgres(url):
    with pytest.raises(ValueError):
        backup.libpq_environment(url)


@pytest.mark.parametrize("name", ["../x.png", "/abs.png", "a//b.png", "a/./b", "c:/x", "a\\b"])
def test_storage_names_cannot_escape_the_backup_folder(name):
    with pytest.raises(ValueError):
        backup.safe_object_path(name)


def test_storage_name_keeps_nested_folders():
    assert backup.safe_object_path("org/project/photo.png").parts == (
        "org",
        "project",
        "photo.png",
    )


def test_listing_walks_folders_and_pages():
    class Response:
        def __init__(self, data):
            self.data = data

        def raise_for_status(self):
            pass

        def json(self):
            return self.data

    calls = []

    class Client:
        def post(self, url, json):
            calls.append((url, json["prefix"], json["offset"]))
            if json["prefix"] == "":
                return Response([{"name": "org", "id": None}, {"name": "top.png", "id": "1"}])
            return Response([{"name": "a.png", "id": "2"}])

    names = backup.list_objects(Client(), "https://sb.example.invalid", "evidence")
    assert sorted(names) == ["org/a.png", "top.png"]
    assert all(url.endswith("/storage/v1/object/list/evidence") for url, _, _ in calls)


def test_prune_removes_only_old_complete_generated_backups(tmp_path):
    for name in ["infrashader-20260101T000000Z", "infrashader-20260102T000000Z"]:
        (tmp_path / name).mkdir()
        (tmp_path / name / "manifest.json").write_text("{}")
    (tmp_path / "infrashader-20260103T000000Z").mkdir()  # newest, complete
    (tmp_path / "infrashader-20260103T000000Z" / "manifest.json").write_text("{}")
    (tmp_path / "infrashader-20251231T000000Z.partial").mkdir()  # incomplete, kept
    (tmp_path / "customer-files").mkdir()  # unrelated, kept
    (tmp_path / "infrashader-20251230T000000Z").mkdir()  # no manifest, kept

    removed = backup.prune(tmp_path, keep=2)

    assert removed == ["infrashader-20260101T000000Z"]
    assert sorted(path.name for path in tmp_path.iterdir()) == [
        "customer-files",
        "infrashader-20251230T000000Z",
        "infrashader-20251231T000000Z.partial",
        "infrashader-20260102T000000Z",
        "infrashader-20260103T000000Z",
    ]


def test_env_file_reader_ignores_comments(tmp_path):
    path = tmp_path / "api.env"
    path.write_text('# note\nexport DATABASE_URL="postgresql://h/d"\n\nCORS_ORIGINS=[]\n')
    assert backup.load_env_file(path) == {
        "DATABASE_URL": "postgresql://h/d",
        "CORS_ORIGINS": "[]",
    }
