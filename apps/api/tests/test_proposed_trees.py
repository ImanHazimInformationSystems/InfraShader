from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.errors import APIError
from app.spatial_editor import EditInput, edit_draft
from tests.test_roadwork import BOUNDS, road_fixture


def tree(variant="canopy"):
    return {
        "id": str(uuid4()),
        "name": "Proposed tree",
        "kind": "tree",
        "status": "proposed",
        "layout_plant": "tree",
        "geometry": {"type": "Point", "coordinates": [101.682, 3.132]},
        "tree_design": {"variant": variant, "scale": 1, "rotation_deg": 0},
        "provenance": "estimated",
        "source_note": "Concept visual model, not nursery stock",
    }


@pytest.mark.parametrize("variant", ["canopy", "columnar", "evergreen", "palm"])
def test_tree_placement_and_transforms_preserve_count_and_source_rate(variant):
    raw, _ = road_fixture()
    item = tree(variant)
    before = deepcopy(raw)
    result = edit_draft(
        EditInput(workspace=raw, scenario="option_a", operation="tree", tree_item=item), BOUNDS
    )
    assert raw == before
    placed = result["scenarios"]["option_a"]["items"][0]
    assert placed["quantity"]["value"] == 1
    assert placed["quantity"]["calculated"]["unit"] == "item"
    assert result["scenarios"]["option_b"]["items"] == []
    raw["scenarios"]["option_a"]["items"] = [item]
    rate = str(uuid4())
    changed = deepcopy(item)
    changed.update(rate_id=rate)
    changed["tree_design"].update(
        scale=2.5,
        rotation_deg=135,
        stock_spec="Explicit synthetic stock and installed scope",
        rate_reviewed=True,
    )
    updated = edit_draft(
        EditInput(workspace=raw, scenario="option_a", operation="tree", tree_item=changed), BOUNDS
    )
    priced = updated["scenarios"]["option_a"]["items"][0]
    assert priced["quantity"]["value"] == 1 and priced["rate_id"] == rate
    assert priced["tree_design"]["scale"] == 2.5
    assert priced["height_m"] is None  # Display height never enters the shade engine.


def test_invalid_locked_baseline_and_unreviewed_rate_rejected():
    raw, _ = road_fixture()
    item = tree()
    with pytest.raises(APIError):
        edit_draft(
            EditInput(workspace=raw, scenario="baseline", operation="tree", tree_item=item), BOUNDS
        )
    for change in [
        {"scale": 0},
        {"scale": 3.1},
        {"rotation_deg": float("nan")},
        {"variant": "unknown"},
    ]:
        with pytest.raises(ValidationError):
            EditInput(
                workspace=raw,
                scenario="option_a",
                operation="tree",
                tree_item={**item, "tree_design": {**item["tree_design"], **change}},
            )
    with pytest.raises(ValidationError):
        EditInput(
            workspace=raw,
            scenario="option_a",
            operation="tree",
            tree_item={**item, "rate_id": str(uuid4())},
        )
    raw["scenarios"]["option_a"]["items"] = [{**item, "editor_locked": True}]
    with pytest.raises(APIError, match="unlocked"):
        edit_draft(
            EditInput(workspace=raw, scenario="option_a", operation="tree", tree_item=item), BOUNDS
        )
    raw["scenarios"]["option_a"]["items"] = []
    item["geometry"]["coordinates"] = [101.67, 3.132]
    with pytest.raises(APIError):
        edit_draft(
            EditInput(workspace=raw, scenario="option_a", operation="tree", tree_item=item), BOUNDS
        )
