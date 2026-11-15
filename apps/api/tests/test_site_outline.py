from copy import deepcopy

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import projects
from app.errors import APIError
from app.schemas import ProjectUpdate, Site
from tests.test_workflow_integration import initialise


def selected_site():
    return {
        "bounds": [101.681, 3.131, 101.683, 3.133],
        "outline": {
            "type": "Polygon",
            "coordinates": [
                [
                    [101.681, 3.132],
                    [101.682, 3.131],
                    [101.683, 3.132],
                    [101.682, 3.133],
                    [101.681, 3.132],
                ]
            ],
        },
    }


def test_outline_contract_and_legacy_compatibility():
    assert Site(bounds=[0, 0, 0.01, 0.01]).outline is None
    assert Site.model_validate(selected_site()).outline.type == "Polygon"
    bad = selected_site()
    bad["bounds"][0] -= 0.001
    with pytest.raises(ValidationError, match="envelope"):
        Site.model_validate(bad)
    for ring in [
        [[0, 0], [0.01, 0.01], [0, 0.01], [0.01, 0], [0, 0]],
        [[0, 0], [0.01, 0], [0, 0.01]],
        [[0, 0], [0.01, 0], [0.005, 0], [0, 0]],
        [[0, 0], [float("nan"), 0], [0, 0.01], [0, 0]],
    ]:
        with pytest.raises(ValidationError):
            Site(bounds=[0, 0, 0.01, 0.01], outline={"type": "Polygon", "coordinates": [ring]})


@pytest.mark.integration
def test_site_outline_persistence_permissions_and_stale_revision(database):
    org, project, admin, member, foreign = initialise(database, "contractor_proposal")
    site = selected_site()
    with Session(database) as session:
        saved = projects.update_project(
            session, org, project, admin, ProjectUpdate(expected_revision=1, site=site)
        )
        assert saved.revision == 2
    with Session(database) as session:
        loaded = projects.get_project(session, org, project, admin)
        assert loaded.site.model_dump(mode="json")["outline"] == site["outline"]
        with pytest.raises(APIError):
            projects.get_project(session, org, project, foreign)
        with pytest.raises(APIError) as conflict:
            projects.update_project(
                session,
                org,
                project,
                admin,
                ProjectUpdate(expected_revision=1, site=deepcopy(site)),
            )
        assert conflict.value.status_code == 409
