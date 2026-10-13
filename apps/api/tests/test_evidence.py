from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image
from sqlalchemy.orm import Session

from app import evidence
from app.errors import APIError
from tests.test_workflow_integration import initialise


def photo():
    stream = BytesIO()
    Image.new("RGB", (20, 20), "green").save(stream, format="PNG")
    return stream.getvalue()


def test_reencode_strips_trailing_data_and_checks_actual_type():
    content, content_type = evidence.sanitise_image(photo() + b"private-trailing-comment")
    assert content_type == "image/jpeg" and content[:2] == b"\xff\xd8"
    assert b"private-trailing-comment" not in content
    with pytest.raises(APIError):
        evidence.sanitise_image(b'<svg onload="alert(1)"></svg>')
    with pytest.raises(APIError):
        evidence.sanitise_image(b"a" * (evidence.MAX_BYTES + 1))


@pytest.mark.integration
def test_private_metadata_tenant_checks_and_integrity(database):
    org, project_id, admin, member, foreign = initialise(database, "developer_decision")

    class StorageFixture:
        def __init__(self):
            self.objects = {}
            self.reads = 0

        def put(self, path, content, content_type):
            self.objects[path] = content

        def get(self, path):
            self.reads += 1
            return self.objects[path]

        def delete(self, path):
            del self.objects[path]

    storage = StorageFixture()
    with Session(database) as session:
        saved = evidence.upload(
            session,
            org,
            project_id,
            admin,
            photo(),
            "Site photo",
            "Fixture with permission",
            storage,
        )
        assert "object_path" not in saved
        with pytest.raises(APIError):
            evidence.download(session, org, project_id, foreign, saved["id"], storage)
        with pytest.raises(APIError):
            evidence.download(session, org, project_id, member, uuid4(), storage)
        assert storage.reads == 0
        content, _ = evidence.download(session, org, project_id, member, saved["id"], storage)
        assert len(content) == saved["size_bytes"]
        storage.objects[next(iter(storage.objects))] = b"changed bytes"
        with pytest.raises(APIError, match="integrity"):
            evidence.download(session, org, project_id, member, saved["id"], storage)


@pytest.mark.integration
def test_evidence_metadata_conflict_and_invalid_target_preserve_saved_notes(database):
    from app import workspace
    from tests.test_workspace import fixture_workspace

    org, project, actor, _, _ = initialise(database, "developer_decision")

    class Storage:
        def put(self, *args):
            pass

        def delete(self, *args):
            pass

    with Session(database) as session:
        saved_workspace = workspace.save_workspace(
            session, org, project, actor, workspace.WorkspaceInput(**fixture_workspace())
        )
        target = saved_workspace["data"]["targets"][0]["id"]
        photo_record = evidence.upload(
            session, org, project, actor, photo(), "Fixture", "Generated pixels", Storage()
        )
        data = evidence.EvidenceUpdate(
            expected_revision=1,
            description="Updated",
            source_note="Test",
            observations="Observed fixture",
            target_ids=[target],
        )
        saved = evidence.update_metadata(session, org, project, actor, photo_record["id"], data)
        assert saved["revision"] == 2 and saved["target_ids"] == [target]
        with pytest.raises(APIError):
            evidence.update_metadata(session, org, project, actor, photo_record["id"], data)
        session.rollback()
        with pytest.raises(APIError):
            evidence.update_metadata(
                session,
                org,
                project,
                actor,
                photo_record["id"],
                data.model_copy(update={"expected_revision": 2, "target_ids": [uuid4()]}),
            )
        session.rollback()
        assert (
            evidence.list_evidence(session, org, project, actor)["items"][0]["observations"]
            == "Observed fixture"
        )
