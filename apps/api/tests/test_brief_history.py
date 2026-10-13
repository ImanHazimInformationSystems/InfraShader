import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app import projects
from app.errors import APIError
from app.schemas import BriefDetails, ProjectUpdate, Stakeholder
from tests.test_workflow_integration import initialise


@pytest.mark.integration
def test_structured_brief_history_restore_conflict_and_tenant(database):
    org, project, admin, member, foreign = initialise(database, "developer_decision")
    with Session(database) as session:
        updated = projects.update_project(
            session,
            org,
            project,
            admin,
            ProjectUpdate(
                expected_revision=1,
                details=BriefDetails(
                    project_type="Courtyard",
                    budget="10000.50",
                    priorities="Access",
                    constraints="Keep entrance clear",
                    stakeholders=[
                        Stakeholder(name="Facilities", role="Operator", needs="Maintenance")
                    ],
                ),
            ),
        )
        assert str(updated.details.budget) == "10000.50"
    with Session(database) as session:
        history = projects.project_history(session, org, project, member)
        assert [item["revision"] for item in history["items"]] == [2, 1]
        assert history["items"][0]["project"]["details"]["stakeholders"][0]["name"] == "Facilities"
        with pytest.raises(APIError):
            projects.project_history(session, org, project, foreign)
        restored = projects.restore_project(session, org, project, admin, 1, 2)
        assert restored.revision == 3 and restored.details.budget is None
        with pytest.raises(APIError) as conflict:
            projects.restore_project(session, org, project, admin, 2, 2)
        assert conflict.value.status_code == 409
        session.rollback()
        assert len(projects.project_history(session, org, project, member)["items"]) == 3
        with pytest.raises(DBAPIError):
            session.execute(
                text("UPDATE project_revisions SET revision=99 WHERE project_id=:id"),
                {"id": project},
            )


@pytest.mark.integration
def test_rectangular_canopy_uses_metric_projection_and_rotation(database):
    from app import workspace
    from app.domain.geometry import project_wgs84_geometry

    org, project, actor, _, foreign = initialise(database, "developer_decision")
    with Session(database) as session:
        data = workspace.RectangleInput(
            longitude=101.685, latitude=3.135, width_m=10, length_m=20, rotation_deg=35
        )
        result = workspace.rectangle_preview(session, org, project, actor, data)
        metric = project_wgs84_geometry(result["geometry"], source_crs="EPSG:4326")
        assert metric.geometry.area == pytest.approx(200, abs=0.0001)
        assert result["metric_crs"] == "EPSG:32647"
        with pytest.raises(APIError):
            workspace.rectangle_preview(session, org, project, foreign, data)


@pytest.mark.integration
def test_workspace_restore_recalculates_and_preserves_history(database):
    from app import workspace
    from tests.test_workflow_integration import fixture_workspace

    org, project, admin, member, foreign = initialise(database, "developer_decision")
    draft = fixture_workspace()
    with Session(database) as session:
        first = workspace.save_workspace(
            session, org, project, admin, workspace.WorkspaceInput(**draft)
        )
        draft["expected_revision"] = 1
        draft["scenarios"]["option_a"]["items"][0]["height_m"] = 5
        workspace.save_workspace(session, org, project, admin, workspace.WorkspaceInput(**draft))
    with Session(database) as session:
        history = workspace.workspace_history(session, org, project, member)
        assert [row["revision"] for row in history["items"]] == [2, 1]
        with pytest.raises(APIError):
            workspace.restore_workspace(session, org, project, foreign, 1, 2)
        session.rollback()
        restored = workspace.restore_workspace(session, org, project, admin, 1, 2)
        assert restored["revision"] == 3
        assert restored["data"] == first["data"]
        with pytest.raises(APIError) as conflict:
            workspace.restore_workspace(session, org, project, admin, 1, 2)
        assert conflict.value.status_code == 409
        session.rollback()
        assert len(workspace.workspace_history(session, org, project, member)["items"]) == 3
        with pytest.raises(DBAPIError):
            session.execute(
                text("UPDATE workspace_revisions SET payload='{}'::jsonb WHERE project_id=:id"),
                {"id": project},
            )
        session.rollback()


@pytest.mark.integration
def test_project_search_literal_sort_and_tenant(database):
    from app.schemas import ProjectCreate

    org, project, admin, _, foreign = initialise(database, "developer_decision")
    with Session(database) as session:
        for name in ("ZZZ 100% Courtyard", "AAA Sponsor site"):
            projects.create_project(
                session,
                org,
                admin,
                ProjectCreate(
                    name=name,
                    purpose="developer_decision",
                    stakeholder="Residents",
                    site={"bounds": [101.68, 3.13, 101.69, 3.14]},
                ),
            )
        literal = projects.list_projects(session, org, admin, False, 100, 0, "%", "name")
        assert literal.total == 1 and literal.items[0].name == "ZZZ 100% Courtyard"
        matched = projects.list_projects(session, org, admin, False, 1, 0, "Residents", "name")
        assert matched.total == 2 and matched.items[0].name == "AAA Sponsor site"
        second = projects.list_projects(session, org, admin, False, 1, 1, "Residents", "name")
        assert second.items[0].name == "ZZZ 100% Courtyard"
        with pytest.raises(APIError):
            projects.list_projects(session, org, foreign, False, 100, 0, "Residents", "name")
