"""S04/S06 joint restore drill including private photo bytes in local Supabase Storage.

LOCAL ONLY. Destination: the disposable `infrashader_test_*` schema created by the `database`
fixture and test-only object paths (fresh org/project UUID prefixes) in the local Supabase
`evidence` bucket on 127.0.0.1:54331. Normal development data and objects are never touched.
Skips when the local Supabase service settings are not configured.
"""

import hashlib
import io
import json
import os
import subprocess

import httpx
import pytest
from PIL import Image
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import evidence as ev
from app.config import Settings
from app.models import Evidence
from tests.test_restore_drill import libpq, tool
from tests.test_workflow_integration import initialise


def local_storage():
    try:
        settings = Settings()
    except Exception:  # noqa: BLE001 - unconfigured environment means the drill cannot run
        pytest.skip("Local Supabase settings are not configured")
    if settings.supabase_url != "http://127.0.0.1:54331" or not settings.storage_service_key:
        pytest.skip("Joint storage drill requires the local Supabase endpoint on 54331")
    try:
        httpx.get(f"{settings.supabase_url}/storage/v1/version", timeout=5)
    except httpx.HTTPError:
        pytest.skip("Local Supabase Storage is not running")
    return ev.PrivateStorage(settings)


def png(colour):
    buffer = io.BytesIO()
    Image.new("RGB", (24, 16), colour).save(buffer, "PNG")
    return buffer.getvalue()


@pytest.mark.integration
def test_joint_database_and_private_photo_restore(database, tmp_path):
    storage = local_storage()
    pg_dump, pg_restore = tool("pg_dump"), tool("pg_restore")
    url = libpq(os.environ["TEST_DATABASE_URL"])
    with database.connect() as connection:
        schema = connection.execute(text("SELECT current_schema()")).scalar_one()
    assert schema.startswith("infrashader_test_")

    org, pid, admin, member, foreign = initialise(database, "contractor_proposal")
    uploaded = []
    try:
        with Session(database) as db:
            for colour in ("green", "navy"):
                uploaded.append(
                    ev.upload(
                        db,
                        org,
                        pid,
                        admin,
                        png(colour),
                        f"{colour} drill photo",
                        "Generated pixels; drill only",
                        storage,
                    )
                )
            paths = {row.id: row.object_path for row in db.query(Evidence).all()}
        assert len(paths) == 2 and all(p.startswith(f"{org}/{pid}/") for p in paths.values())

        # 1. Backup: database dump + private object bytes with a hash manifest.
        dump = tmp_path / "drill.dump"
        subprocess.run(
            [pg_dump, "--format=custom", f"--schema={schema}", f"--file={dump}", f"--dbname={url}"],
            check=True,
            capture_output=True,
            timeout=120,
        )
        manifest = {}
        for path in paths.values():
            content = storage.get(path)
            target = tmp_path / "objects" / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            manifest[path] = hashlib.sha256(content).hexdigest()
        (tmp_path / "manifest.json").write_text(json.dumps(manifest, indent=1))

        # 2. Simulated loss of both the records and the private objects.
        database.dispose()
        with database.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        for path in paths.values():
            storage.delete(path)
            with pytest.raises(Exception):  # noqa: B017 - any not-found/unavailable is a loss
                storage.get(path)

        # 3. Restore records, then objects from the verified backup manifest.
        database.dispose()
        restored = subprocess.run(
            [pg_restore, "--clean", "--if-exists", "--no-owner", f"--dbname={url}", str(dump)],
            capture_output=True,
            timeout=120,
            text=True,
        )
        assert restored.returncode == 0, restored.stderr[-2000:]
        database.dispose()
        backup = json.loads((tmp_path / "manifest.json").read_text())
        for path, digest in backup.items():
            content = (tmp_path / "objects" / path).read_bytes()
            assert hashlib.sha256(content).hexdigest() == digest  # backup integrity first
            storage.put(path, content, "image/jpeg")

        # 4. Verify linked records and actual recovered bytes through the authorised path.
        with Session(database) as db:
            rows = db.query(Evidence).all()
            assert {row.object_path for row in rows} == set(paths.values())
            for item in uploaded:
                content, kind = ev.download(db, org, pid, member, item["id"], storage)
                assert hashlib.sha256(content).hexdigest() == item["sha256"]
                assert kind == "image/jpeg" and content[:2] == b"\xff\xd8"
            with pytest.raises(Exception):  # noqa: B017 - foreign tenant still denied after restore
                ev.download(db, org, pid, foreign, uploaded[0]["id"], storage)
    finally:
        for item in uploaded:
            path = f"{org}/{pid}/{item['id']}.jpg"
            try:
                storage.delete(path)
            except httpx.HTTPError:
                pass
