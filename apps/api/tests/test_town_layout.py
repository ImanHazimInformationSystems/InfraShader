from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.errors import APIError
from app.spatial_editor import EditInput, edit_draft
from app.workspace import WorkItem, WorkspaceInput, validate_workspace
from tests.test_roadwork import BOUNDS, road_fixture


def test_site_area_surface_and_planting_are_canonical_and_unpriced():
    raw, road = road_fixture()
    raw["boundary_area_m2"] = 1
    road["road"]["surface"] = "stone"
    raw["scenarios"]["option_a"]["items"] = [road]
    checked = validate_workspace(WorkspaceInput(**raw), BOUNDS)
    assert checked["boundary_area_m2"] > 40000
    assert checked["scenarios"]["option_a"]["items"][0]["road"]["surface"] == "stone"
    plant = {
        "id": str(uuid4()),
        "name": "Flowers",
        "kind": "tree",
        "layout_plant": "flowers",
        "geometry": {"type": "Point", "coordinates": [101.682, 3.132]},
        "provenance": "estimated",
        "source_note": "Concept display, not specified planting",
    }
    result = edit_draft(
        EditInput(workspace=raw, scenario="option_a", operation="plant", plant_item=plant), BOUNDS
    )
    saved = result["scenarios"]["option_a"]["items"][-1]
    assert saved["quantity"]["value"] == 1
    assert saved["rate_id"] is None and saved["plant"] is None
    assert result["scenarios"]["option_b"]["items"] == []
    with pytest.raises(APIError):
        edit_draft(
            EditInput(workspace=raw, scenario="baseline", operation="plant", plant_item=plant),
            BOUNDS,
        )
    plant["geometry"]["coordinates"] = [101.67, 3.132]
    with pytest.raises(APIError):
        edit_draft(
            EditInput(workspace=raw, scenario="option_a", operation="plant", plant_item=plant),
            BOUNDS,
        )
    with pytest.raises(ValidationError):
        WorkItem(**{**plant, "kind": "bench"})


@pytest.mark.parametrize(
    "variant,kind",
    [
        (v, "shrub" if v in ("leafy", "hedge", "grass") else "flowers")
        for v in ("leafy", "hedge", "grass", "daisy", "tulip", "lavender")
    ],
)
def test_plant_model_choice_preserves_count_and_rejects_mismatch(variant, kind):
    raw, _ = road_fixture()
    plant = {
        "id": str(uuid4()),
        "name": "Concept planting",
        "kind": "tree",
        "layout_plant": kind,
        "plant_variant": variant,
        "geometry": {"type": "Point", "coordinates": [101.682, 3.132]},
        "provenance": "estimated",
        "source_note": "Illustrative model only",
    }
    result = edit_draft(
        EditInput(workspace=raw, scenario="option_a", operation="plant", plant_item=plant), BOUNDS
    )
    saved = result["scenarios"]["option_a"]["items"][-1]
    assert saved["plant_variant"] == variant and saved["quantity"]["value"] == 1
    assert saved["rate_id"] is None and saved["height_m"] is None
    with pytest.raises(ValidationError):
        WorkItem(**{**plant, "layout_plant": "flowers" if kind == "shrub" else "shrub"})
    with pytest.raises(ValidationError):
        WorkItem(**{**plant, "plant_variant": "unknown"})
