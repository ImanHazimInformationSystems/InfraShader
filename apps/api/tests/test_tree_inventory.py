from copy import deepcopy

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import projects
from app.errors import APIError
from app.models import ProjectGrant
from app.schemas import ProjectUpdate, Site
from app.tree_inventory import SiteTree
from tests.test_workflow_integration import initialise


def record():
    return dict(
        id="survey:tree-1",
        name="Existing tree",
        longitude=101.685,
        latitude=3.135,
        source="Fixture survey",
        attribution="Fixture owner permission",
    )


def test_tree_contract_unknowns_duplicates_and_dimension_basis():
    assert Site(bounds=[0, 0, 0.01, 0.01]).trees == []
    assert SiteTree(**record()).height_m is None
    for changes in [
        dict(latitude=float("nan")),
        dict(height_m=5),
        dict(status="deleted"),
        dict(height_m=121, dimensions_source="Assumed"),
        dict(source=""),
    ]:
        with pytest.raises(ValidationError):
            SiteTree(**(record() | changes))
    with pytest.raises(ValidationError, match="unique"):
        Site(bounds=[101.68, 3.13, 101.69, 3.14], trees=[record(), record()])


@pytest.mark.integration
def test_inventory_persistence_revisions_restore_and_access(database):
    org, project, admin, member, foreign = initialise(database, "contractor_proposal")
    site = dict(bounds=[101.68, 3.13, 101.69, 3.14], trees=[record()])
    with Session(database) as session:
        saved = projects.update_project(
            session, org, project, admin, ProjectUpdate(expected_revision=1, site=site)
        )
        assert saved.revision == 2
    removed = deepcopy(site)
    removed["trees"][0]["status"] = "remove"
    with Session(database) as session:
        saved = projects.update_project(
            session, org, project, admin, ProjectUpdate(expected_revision=2, site=removed)
        )
        assert saved.site.trees[0].status == "remove"
        assert saved.site.trees[0].source == "Fixture survey"
    with Session(database) as session:
        assert (
            projects.get_project(session, org, project, admin).site.trees[0].id == "survey:tree-1"
        )
        with pytest.raises(APIError) as conflict:
            projects.update_project(
                session, org, project, admin, ProjectUpdate(expected_revision=2, site=site)
            )
        assert conflict.value.status_code == 409
        with pytest.raises(APIError):
            projects.update_project(
                session, org, project, foreign, ProjectUpdate(expected_revision=3, site=site)
            )
        grant = session.get(ProjectGrant, (project, member))
        grant.capabilities = ["read_project"]
        session.commit()
        with pytest.raises(APIError) as denied:
            projects.update_project(
                session, org, project, member, ProjectUpdate(expected_revision=3, site=site)
            )
        assert denied.value.status_code == 403
    with Session(database) as session:
        # Legacy locator-only clients preserve records, including those outside the new locator.
        saved = projects.update_project(
            session,
            org,
            project,
            admin,
            ProjectUpdate(expected_revision=3, site={"bounds": [0, 0, 0.01, 0.01]}),
        )
        assert saved.site.trees[0].status == "remove"
        history = projects.project_history(session, org, project, admin)
        original = next(row for row in history["items"] if row["revision"] == 2)
        assert original["project"]["site"]["trees"][0]["status"] == "retain"
        restored = projects.restore_project(session, org, project, admin, 2, 4)
        assert restored.revision == 5
        assert restored.site.trees[0].status == "retain"
