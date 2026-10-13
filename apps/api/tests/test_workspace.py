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
