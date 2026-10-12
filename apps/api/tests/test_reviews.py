from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app import calculations, reviews, workspace
from app.errors import APIError
from tests.test_workflow_integration import initialise
from tests.test_workspace import fixture_workspace


@pytest.mark.integration
def test_review_save_reload_retry_conflict_tenant_and_stale(database):
    org, project, admin, member, foreign = initialise(database, "developer_decision")
    with Session(database) as session:
        workspace.save_workspace(
            session, org, project, admin, workspace.WorkspaceInput(**fixture_workspace())
        )
        data = reviews.ReviewInput(
            request_key=uuid4(),
            expected_review_revision=0,
            expected_workspace_revision=1,
            expected_project_revision=1,
            preferred_option="option_a",
            status="needs_information",
            criteria=["Scope"],
            notes="Need field evidence",
        )
        saved = reviews.save_review(session, org, project, member, data)
        assert saved["payload"]["revision"] == 1
        assert reviews.save_review(session, org, project, member, data)["id"] == saved["id"]
    with Session(database) as session:
        assert (
            reviews.list_reviews(session, org, project, admin)["items"][0]["payload"]["notes"]
            == "Need field evidence"
        )
        assert calculations.get_artifacts(session, org, project, admin)["items"] == []
        with pytest.raises(APIError) as denied:
            reviews.list_reviews(session, org, project, foreign)
        assert denied.value.status_code == 404
        session.rollback()
        with pytest.raises(APIError) as conflict:
            reviews.save_review(
                session, org, project, admin, data.model_copy(update={"request_key": uuid4()})
            )
        assert conflict.value.code == "review_conflict"
        session.rollback()
        draft = fixture_workspace()
        draft["expected_revision"] = 1
        workspace.save_workspace(session, org, project, admin, workspace.WorkspaceInput(**draft))
        assert reviews.list_reviews(session, org, project, admin)["items"][0]["stale"]
        with pytest.raises(APIError):
            reviews.save_review(
                session,
                org,
                project,
                admin,
                data.model_copy(update={"request_key": uuid4(), "expected_review_revision": 1}),
            )
