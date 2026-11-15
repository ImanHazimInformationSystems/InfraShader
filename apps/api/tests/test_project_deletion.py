from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import calculations
from app import project_deletion as deletion
from app.errors import APIError
from app.models import (
    AdministrationEvent,
    Evidence,
    Project,
    ProjectRevision,
    ReviewEntry,
    Workspace,
)
from tests.test_pricing_readiness import prepared

pytestmark = pytest.mark.integration


def confirm():
    return deletion.DeleteProject(expected_revision=1, confirmation_name="Full workflow")


def test_draft_delete_cascades_only_this_project_and_keeps_audit(database):
    org, project, admin, *_ = prepared(database)
    _, other, *_ = prepared(database)
    with Session(database) as db:
        result = deletion.remove(db, org, project, admin, confirm(), lambda: None)
        assert result["deleted"] and result["pending_files"] == 0
        db.expire_all()
        assert db.get(Project, project) is None
        assert db.get(Workspace, project) is None
        assert not db.scalars(
            select(ProjectRevision).where(ProjectRevision.project_id == project)
        ).all()
        assert db.get(Project, other) is not None
        assert (
            db.scalar(
                select(AdministrationEvent).where(
                    AdministrationEvent.payload["action"].astext == "project_deleted"
                )
            )
            is not None
        )


@pytest.mark.parametrize("case", ["name", "revision", "member", "foreign", "issued", "review"])
def test_refusals_preserve_project(database, case):
    org, project, admin, member, foreign, _, _, issue = prepared(database, date(2099, 12, 31))
    with Session(database) as db:
        data = confirm()
        actor = admin
        if case == "name":
            data.confirmation_name = "Wrong name"
        if case == "revision":
            data.expected_revision = 2
        if case == "member":
            actor = member
        if case == "foreign":
            actor = foreign
        if case == "issued":
            calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        if case == "review":
            db.add(
                ReviewEntry(
                    project_id=project,
                    kind="basis",
                    key=uuid4(),
                    revision=1,
                    payload={},
                    created_by=admin,
                )
            )
            db.commit()
        with pytest.raises(APIError):
            deletion.remove(db, org, project, actor, data, lambda: None)
        db.rollback()
        assert db.get(Project, project) is not None


def test_storage_failure_is_durable_and_retry_only_deletes_owned_paths(database):
    org, project, admin, *_ = prepared(database)
    with Session(database) as db:
        paths = ["fixture/private-one", "fixture/private-two"]
        for path in paths:
            db.add(
                Evidence(
                    project_id=project,
                    object_path=path,
                    content_type="image/jpeg",
                    size_bytes=20,
                    sha256="0" * 64,
                    description="Fixture",
                    source_note="Fixture",
                    created_by=admin,
                )
            )
        db.commit()

        class Storage:
            def delete(self, path):
                assert path in paths
                if path == paths[1]:
                    raise OSError("Fixture storage outage")

        result = deletion.remove(db, org, project, admin, confirm(), Storage)
        assert result["pending_files"] == 1
        jobs = deletion.cleanup_jobs(db, org, admin)
        assert len(jobs) == 1 and db.get(Project, project) is None
        removed = []

        class WorkingStorage:
            def delete(self, path):
                removed.append(path)

        assert deletion.cleanup(db, jobs[0], WorkingStorage) == 0
        assert removed == [paths[1]]
        assert deletion.cleanup(db, jobs[0], WorkingStorage) == 0
        assert removed == [paths[1]]


def test_delete_endpoint_requires_confirmation_and_project_access(database):
    from fastapi.testclient import TestClient

    from app.auth import current_user
    from app.db import database_session
    from app.main import app

    org, project, admin, _, foreign, *_ = prepared(database)
    actor = [foreign]

    def connection():
        with Session(database) as db:
            yield db

    prior = app.dependency_overrides.copy()
    app.dependency_overrides[database_session] = connection
    app.dependency_overrides[current_user] = lambda: actor[0]
    try:
        client = TestClient(app)
        endpoint = f"/api/v1/organisations/{org}/projects/{project}"
        assert client.get(endpoint + "/deletion").status_code == 404
        actor[0] = admin
        assert client.get(endpoint + "/deletion").json()["allowed"]
        assert client.request("DELETE", endpoint, json={}).status_code == 422
        assert client.request("DELETE", endpoint, json=confirm().model_dump()).json()["deleted"]
        assert client.get(endpoint).status_code == 404
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(prior)


def test_file_cleanup_is_bounded_and_resume_safe(database):
    org, project, admin, *_ = prepared(database)
    with Session(database) as db:
        for number in range(5):
            db.add(
                Evidence(
                    project_id=project,
                    object_path=f"fixture/batch/{number}",
                    content_type="image/jpeg",
                    size_bytes=20,
                    sha256="0" * 64,
                    description="Fixture",
                    source_note="Fixture",
                    created_by=admin,
                )
            )
        db.commit()
        removed = []

        class Storage:
            def delete(self, path):
                removed.append(path)

        result = deletion.remove(db, org, project, admin, confirm(), Storage)
        assert result["pending_files"] == 2 and len(removed) == 3
        jobs = deletion.cleanup_jobs(db, org, admin)
        assert deletion.cleanup(db, jobs[0], Storage) == 0
        assert len(set(removed)) == len(removed) == 5
