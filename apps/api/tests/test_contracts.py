import pytest
from pydantic import ValidationError

from app.config import Settings
from app.schemas import ProjectCreate, ProjectUpdate, Site


def project_data(**changes):
    return {
        "name": "Courtyard review",
        "purpose": "developer_decision",
        "stakeholder": "Project lead",
        "site": {"bounds": [100.95, 4.38, 100.96, 4.39], "crs": "EPSG:4326"},
        **changes,
    }


def test_progressive_brief_and_project_defaults():
    project = ProjectCreate(**project_data())
    assert project.problem == ""
    assert project.timezone == "Asia/Kuala_Lumpur"
    assert project.currency == "MYR"
    assert project.site.bounds == (100.95, 4.38, 100.96, 4.39)


@pytest.mark.parametrize("purpose", ["developer_decision", "contractor_proposal"])
def test_both_purposes_keep_shared_site_contract(purpose):
    assert ProjectCreate(**project_data(purpose=purpose)).purpose == purpose


@pytest.mark.parametrize(
    "changes",
    [
        {"name": " "},
        {"stakeholder": ""},
        {"purpose": "administrator"},
        {"timezone": "Malaysia/Imagined"},
        {"currency": "myr"},
        {"organisation_id": "spoofed"},
        {"revision": 999},
    ],
)
def test_invalid_or_server_owned_project_fields_rejected(changes):
    with pytest.raises(ValidationError):
        ProjectCreate(**project_data(**changes))


@pytest.mark.parametrize(
    "bounds",
    [
        [4.38, 100.95, 4.39, 100.96],  # coordinate reversal
        [100.96, 4.38, 100.95, 4.39],
        [100.95, 4.39, 100.96, 4.38],
        [100.95, 4.38, 100.95, 4.39],
        [100, 4, 101, 5],
        [float("nan"), 4, 100.9, 4.1],
        [100, 4, float("inf"), 4.1],
    ],
)
def test_invalid_site_extent_cannot_be_saved(bounds):
    with pytest.raises(ValidationError):
        Site(bounds=bounds)


def test_unknown_crs_is_not_assumed_metric():
    with pytest.raises(ValidationError):
        Site(bounds=[100.95, 4.38, 100.96, 4.39], crs="EPSG:3857")


@pytest.mark.parametrize(
    "data",
    [
        {"name": "Rename without revision"},
        {"expected_revision": 0, "name": "Invalid"},
        {"expected_revision": 1},
        {"expected_revision": 1, "name": None},
        {"expected_revision": 1, "timezone": "unknown"},
        {"expected_revision": 1, "organisation_id": "move-tenant"},
    ],
)
def test_invalid_updates_cannot_silently_overwrite_or_move_ownership(data):
    with pytest.raises(ValidationError):
        ProjectUpdate(**data)


def test_patch_can_clear_text_and_archive_with_revision():
    update = ProjectUpdate(expected_revision=2, problem="", archived=True)
    assert update.model_dump(exclude_unset=True) == {
        "expected_revision": 2,
        "problem": "",
        "archived": True,
    }


@pytest.mark.parametrize("url", ["sqlite://", "postgresql://user@localhost/db"])
def test_database_configuration_cannot_silently_change_stack(url):
    with pytest.raises(ValidationError):
        Settings(database_url=url, _env_file=None)
