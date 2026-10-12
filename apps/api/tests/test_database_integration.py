"""Real PostGIS evidence, skipped explicitly when no disposable database is supplied."""

from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import projects
from app.errors import APIError
from app.models import Membership, Organisation
from app.schemas import ProjectCreate, ProjectUpdate

pytestmark = pytest.mark.integration


def test_migrate_persist_reload_tenants_conflict_archive_and_revocation(database):
    user_a, user_b = uuid4(), uuid4()
    with Session(database) as session:
        org_a, org_b = Organisation(name="A"), Organisation(name="B")
        session.add_all([org_a, org_b])
        session.flush()
        membership = Membership(
            organisation_id=org_a.id,
            user_id=user_a,
            role="administrator",
            capabilities=[],
            active=True,
        )
        session.add_all(
            [
                membership,
                Membership(
                    organisation_id=org_b.id,
                    user_id=user_b,
                    role="administrator",
                    capabilities=[],
                    active=True,
                ),
            ]
        )
        session.commit()
        org_a_id, org_b_id, membership_id = org_a.id, org_b.id, membership.id
        result = projects.create_project(
            session,
            org_a_id,
            user_a,
            ProjectCreate(
                name="Persisted site",
                purpose="developer_decision",
                stakeholder="Sponsor",
                site={"bounds": [100.95, 4.38, 100.96, 4.39]},
            ),
        )
        project_id = result.id
    # Fresh session proves database reload, not Python object identity or an in-memory repository.
    with Session(database) as session:
        reloaded = projects.get_project(session, org_a_id, project_id, user_a)
        assert reloaded.site.bounds == (100.95, 4.38, 100.96, 4.39)
        assert reloaded.revision == 1
        assert (
            session.scalar(
                text("SELECT ST_SRID(site_envelope) FROM projects WHERE id=:id"), {"id": project_id}
            )
            == 4326
        )
        for org, user in [(org_a_id, user_b), (org_b_id, user_b)]:
            with pytest.raises(APIError) as error:
                projects.get_project(session, org, project_id, user)
            assert error.value.status_code == 404
        archived = projects.update_project(
            session, org_a_id, project_id, user_a, ProjectUpdate(expected_revision=1, archived=True)
        )
        assert archived.revision == 2 and archived.archived
        with pytest.raises(APIError) as conflict:
            projects.update_project(
                session,
                org_a_id,
                project_id,
                user_a,
                ProjectUpdate(expected_revision=1, name="Lost update"),
            )
        assert conflict.value.status_code == 409
        assert projects.list_projects(session, org_a_id, user_a, False, 50, 0).total == 0
        restored = projects.update_project(
            session,
            org_a_id,
            project_id,
            user_a,
            ProjectUpdate(expected_revision=2, archived=False),
        )
        assert restored.revision == 3 and not restored.archived
        revoked = session.get(Membership, membership_id)
        revoked.active = False
        session.commit()
        with pytest.raises(APIError):
            projects.get_project(session, org_a_id, project_id, user_a)
