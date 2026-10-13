from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.errors import APIError
from app.workspace import WorkspaceInput, validate_workspace


def polygon(w=101.681, s=3.131, e=101.683, n=3.133):
    return {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}


def fixture_workspace():
    item = {
        "id": str(uuid4()),
        "name": "Canopy",
        "kind": "canopy",
        "geometry": polygon(101.6812, 3.1312, 101.6813, 3.1313),
        "height_m": 3,
        "height_source": "Fixture only",
        "source_note": "Fixture only",
        "provenance": "estimated",
    }
    return {
        "expected_revision": 0,
        "boundary": polygon(),
        "boundary_source": "Fixture only",
        "boundary_provenance": "estimated",
        "targets": [
            {
                "id": str(uuid4()),
                "name": "Courtyard",
                "geometry": polygon(),
                "source_note": "Fixture only",
                "provenance": "estimated",
            }
        ],
        "scenarios": {
            "baseline": {"name": "Baseline", "items": []},
            "option_a": {"name": "Option A", "items": [item]},
            "option_b": {"name": "Option B", "items": []},
        },
    }


def test_canonical_quantities_and_independent_options():
    data = fixture_workspace()
    saved = validate_workspace(WorkspaceInput(**data), [101.68, 3.13, 101.69, 3.14])
    assert saved["metric_crs"] == "EPSG:32647"
    assert saved["targets"][0]["area_m2"] > 40000
    item = saved["scenarios"]["option_a"]["items"][0]
    assert item["quantity"]["calculated"]["unit"] == "m2"
    assert 120 < item["quantity"]["value"] < 125
    assert saved["scenarios"]["option_b"]["items"] == []
    assert "quantity" not in data["scenarios"]["option_a"]["items"][0]


@pytest.mark.integration
def test_shared_baseline_edit_and_removal_update_both_options(database):
    from sqlalchemy.orm import Session

    from app import workspace
    from tests.test_workflow_integration import initialise

    org, project, actor, _, _ = initialise(database, "developer_decision")
    raw = fixture_workspace()
    existing = deepcopy(raw["scenarios"]["option_a"]["items"][0])
    existing.update(id=str(uuid4()), kind="building", status="existing", height_m=12)
    raw["scenarios"]["baseline"]["items"] = [existing]
    with Session(database) as session:
        first = workspace.save_workspace(session, org, project, actor, WorkspaceInput(**raw))
        canonical = deepcopy(first["data"])
        canonical.pop("metric_crs")
        for target in canonical["targets"]:
            target.pop("area_m2")
        for scenario in canonical["scenarios"].values():
            for item in scenario["items"]:
                item.pop("quantity")
        canonical["expected_revision"] = 1
        canonical["scenarios"]["baseline"]["items"][0]["height_m"] = 20
        second = workspace.save_workspace(session, org, project, actor, WorkspaceInput(**canonical))
        assert second["data"]["scenarios"]["option_b"]["items"][0]["height_m"] == 20
        assert len(second["data"]["scenarios"]["option_a"]["items"]) == 2
        canonical["scenarios"]["baseline"]["items"] = []
        canonical["expected_revision"] = 2
        third = workspace.save_workspace(session, org, project, actor, WorkspaceInput(**canonical))
        assert third["data"]["scenarios"]["option_b"]["items"] == []
        assert len(third["data"]["scenarios"]["option_a"]["items"]) == 1


def test_zero_count_and_unsupported_canopy_input():
    raw = fixture_workspace()
    item = raw["scenarios"]["option_a"]["items"][0]
    item.update(kind="manual", geometry=None, count=0, height_m=None, height_source="")
    assert (
        validate_workspace(WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14])["scenarios"][
            "option_a"
        ]["items"][0]["quantity"]["value"]
        == 0
    )
    item["roof_slope"] = 15
    with pytest.raises(ValidationError):
        WorkspaceInput(**raw)
    item.pop("roof_slope")
    item.update(count=1, manual_basis="fixed")
    result = validate_workspace(WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14])
    assert (
        result["scenarios"]["option_a"]["items"][0]["quantity"]["calculated"]["method"]
        == "explicit_fixed_price_scope"
    )
    item["count"] = 2
    with pytest.raises(ValidationError):
        WorkspaceInput(**raw)


@pytest.mark.parametrize("change", ["outside", "height", "line_target", "wrong_kind", "override"])
def test_invalid_workspace(change):
    data = fixture_workspace()
    item = data["scenarios"]["option_a"]["items"][0]
    if change == "outside":
        item["geometry"] = polygon(102, 3.13, 102.001, 3.131)
    if change == "height":
        item["height_source"] = ""
    if change == "line_target":
        data["targets"][0]["geometry"] = {
            "type": "LineString",
            "coordinates": [[101.681, 3.131], [101.682, 3.132]],
        }
    if change == "wrong_kind":
        item["kind"] = "path"
    if change == "override":
        item.update(quantity_override="1.0", provenance="calculated")
    with pytest.raises(APIError):
        validate_workspace(WorkspaceInput(**data), [101.68, 3.13, 101.69, 3.14])


def test_duplicate_ids_rejected():
    data = fixture_workspace()
    data["targets"].append(deepcopy(data["targets"][0]))
    with pytest.raises(ValidationError):
        WorkspaceInput(**data)


def test_baseline_cannot_contain_proposed_items():
    data = fixture_workspace()
    data["scenarios"]["baseline"]["items"] = data["scenarios"]["option_a"]["items"]
    with pytest.raises(ValidationError, match="Baseline"):
        WorkspaceInput(**data)


def test_injected_calculated_quantity_rejected():
    data = fixture_workspace()
    data["scenarios"]["option_a"]["items"][0]["quantity"] = {"value": 9999}
    with pytest.raises(ValidationError):
        WorkspaceInput(**data)


def test_tree_metadata_and_hidden_objects_preserve_quantities_and_shade():
    from datetime import datetime

    from app.domain.shade import analyse_workspace

    draft = fixture_workspace()
    tree = {
        "id": str(uuid4()),
        "name": "Existing tree",
        "kind": "tree",
        "geometry": {"type": "Point", "coordinates": [101.68125, 3.13125]},
        "source_note": "Estimated crown from fixture",
        "provenance": "estimated",
        "category": "Vegetation",
        "visible": False,
        "crown_diameter_m": 8,
    }
    draft["scenarios"]["option_a"]["items"].append(tree)
    saved = validate_workspace(WorkspaceInput(**draft), [101.68, 3.13, 101.69, 3.14])
    assert saved["scenarios"]["option_a"]["items"][1]["quantity"]["value"] == 1
    timestamp = datetime.fromisoformat("2026-03-21T12:00:00+08:00")
    first = analyse_workspace(saved, timestamp, saved["targets"][0]["id"])
    saved["scenarios"]["option_a"]["items"][0]["visible"] = False
    second = analyse_workspace(saved, timestamp, saved["targets"][0]["id"])
    assert first == second
    assert tree["name"] in second["scenarios"]["option_a"]["excluded_trees"]
    draft["scenarios"]["option_a"]["items"][0]["crown_diameter_m"] = 8
    with pytest.raises(ValidationError, match="only to trees"):
        WorkspaceInput(**draft)
