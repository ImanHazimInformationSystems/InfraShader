from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app import projects
from app.errors import APIError
from app.schemas import ProjectCreate, ProjectUpdate


class IsolatedSession:
    """A query recorder, not a persistence substitute or database acceptance test."""

    def __init__(self, results):
        self.results = iter(results)
        self.statements = []
        self.commits = 0

    def scalar(self, statement, **kwargs):
        self.statements.append(statement)
        return next(self.results)

    def commit(self):
        self.commits += 1

    def refresh(self, record):
        pass


def test_each_operation_rechecks_current_membership_before_record_query():
    org, user, project = uuid4(), uuid4(), uuid4()
    for operation in [
        lambda db: projects.get_project(db, org, project, user),
        lambda db: projects.list_projects(db, org, user, False, 50, 0),
        lambda db: projects.create_project(
            db,
            org,
            user,
            ProjectCreate(
                name="Test",
                purpose="developer_decision",
                stakeholder="Lead",
                site={"bounds": [100.95, 4.38, 100.96, 4.39]},
            ),
        ),
        lambda db: projects.update_project(
            db, org, project, user, ProjectUpdate(expected_revision=1, name="New")
        ),
    ]:
        db = IsolatedSession([None])  # absent or revoked membership
        with pytest.raises(APIError) as error:
            operation(db)
        assert error.value.status_code == 404
        assert len(db.statements) == 1
        compiled = db.statements[0].compile(dialect=postgresql.dialect())
        assert org in compiled.params.values()
        assert user in compiled.params.values()
        assert "active IS true" in str(compiled)
        assert db.commits == 0


def test_foreign_project_query_stays_bound_to_authorised_org():
    org, user, project = uuid4(), uuid4(), uuid4()
    db = IsolatedSession([SimpleNamespace(role="administrator"), None])
    with pytest.raises(APIError) as error:
        projects.get_project(db, org, project, user)
    assert error.value.code == "not_found"
    compiled = db.statements[1].compile(dialect=postgresql.dialect())
    assert org in compiled.params.values() and project in compiled.params.values()
    assert "projects.organisation_id =" in str(compiled)


def test_update_uses_atomic_expected_revision_and_conflict_has_no_commit():
    org, user, project = uuid4(), uuid4(), uuid4()
    db = IsolatedSession([SimpleNamespace(role="member"), None, project])
    with pytest.raises(APIError) as error:
        projects.update_project(
            db, org, project, user, ProjectUpdate(expected_revision=3, name="New")
        )
    assert error.value.status_code == 409
    assert error.value.code == "revision_conflict"
    compiled = db.statements[1].compile(dialect=postgresql.dialect())
    assert "projects.revision =" in str(compiled)
    assert "projects.organisation_id =" in str(compiled)
    assert 3 in compiled.params.values()
    assert db.commits == 0


def test_successful_update_increments_revision_after_persistence():
    org, user, project = uuid4(), uuid4(), uuid4()
    record = SimpleNamespace(
        id=project,
        organisation_id=org,
        name="Updated",
        purpose="developer_decision",
        stakeholder="Lead",
        problem="",
        intended_users="",
        desired_outcome="",
        use_periods="",
        site={"bounds": [100.95, 4.38, 100.96, 4.39], "crs": "EPSG:4326"},
        timezone="Asia/Kuala_Lumpur",
        currency="MYR",
        archived=False,
        revision=4,
        updated_at=datetime.now(UTC),
    )
    db = IsolatedSession([SimpleNamespace(role="member"), record])
    response = projects.update_project(
        db, org, project, user, ProjectUpdate(expected_revision=3, name="Updated")
    )
    assert response.revision == 4
    assert db.commits == 1


def test_write_response_is_accepted_revision_even_if_next_writer_commits_immediately():
    org, user, project = uuid4(), uuid4(), uuid4()
    record = SimpleNamespace(
        id=project,
        organisation_id=org,
        name="My accepted edit",
        purpose="developer_decision",
        stakeholder="Lead",
        problem="",
        intended_users="",
        desired_outcome="",
        use_periods="",
        site={"bounds": [100.95, 4.38, 100.96, 4.39], "crs": "EPSG:4326"},
        timezone="Asia/Kuala_Lumpur",
        currency="MYR",
        archived=False,
        revision=4,
        updated_at=datetime.now(UTC),
    )

    class ImmediateNextWriter(IsolatedSession):
        def commit(self):
            super().commit()
            record.name = "Another writer's next edit"
            record.revision = 5

        def refresh(self, record):
            raise AssertionError("A post-commit refresh can observe another writer's revision")

    db = ImmediateNextWriter([SimpleNamespace(role="member"), record])
    response = projects.update_project(
        db, org, project, user, ProjectUpdate(expected_revision=3, name="My accepted edit")
    )
    assert response.name == "My accepted edit"
    assert response.revision == 4
    assert record.revision == 5
    assert db.commits == 1
