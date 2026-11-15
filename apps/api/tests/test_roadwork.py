from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError
from pyproj import Transformer

from app.errors import APIError
from app.roadwork import RoadRoute, footprint
from app.spatial_editor import EditInput, edit_draft
from app.workspace import WorkspaceInput, validate_workspace
from tests.test_schedules import assembly
from tests.test_workspace import fixture_workspace

BOUNDS = [101.68, 3.13, 101.69, 3.14]


def road_fixture():
    raw = fixture_workspace()
    raw["scenarios"]["option_a"]["items"] = []
    project = Transformer.from_crs(4326, 32647, always_xy=True)
    inverse = Transformer.from_crs(32647, 4326, always_xy=True)
    x, y = project.transform(101.682, 3.132)
    points = [inverse.transform(x - 10, y), inverse.transform(x + 10, y)]
    item = {
        "id": str(uuid4()),
        "name": "Concept driveway",
        "kind": "area",
        "status": "proposed",
        "geometry": None,
        "road": {"points": points, "width_m": 4, "mode": "line"},
        "source_note": "Synthetic control dimensions; preliminary, not surveyed",
        "provenance": "estimated",
    }
    return raw, item


def apply(raw, item, scenario="option_a"):
    return edit_draft(
        EditInput(workspace=raw, scenario=scenario, operation="road", road_item=item), BOUNDS
    )


def test_authoritative_metric_footprint_and_edit_retains_layer_rates():
    raw, item = road_fixture()
    original = deepcopy(raw)
    checked = apply(raw, item)
    road = checked["scenarios"]["option_a"]["items"][0]
    assert road["quantity"]["value"] == pytest.approx(80, abs=0.001)
    assert checked["metric_crs"] == "EPSG:32647"
    assert checked["scenarios"]["option_b"]["items"] == []
    assert raw == original
    recipe = assembly(use="road", pricing="components")
    for component in recipe["components"]:
        component.update(category="material", basis="volume", unit="m3", thickness_mm=100)
    item["assembly"] = recipe
    raw["scenarios"]["option_a"]["items"] = [item]
    edit = deepcopy(item)
    edit.pop("assembly")
    edit["road"]["width_m"] = 6
    changed = apply(raw, edit)["scenarios"]["option_a"]["items"][0]
    assert changed["assembly"]["components"] == recipe["components"]
    assert changed["quantity"]["value"] == pytest.approx(120, abs=0.001)
    assert float(changed["schedule"][0]["value"]) >= 12


def test_area_curve_and_serialized_revalidation():
    raw, item = road_fixture()
    a, b = item["road"]["points"]
    item["road"].update(mode="curve", points=[a, (a[0], a[1] + 0.0001), b])
    checked = apply(raw, item)
    road = checked["scenarios"]["option_a"]["items"][0]
    assert len(road["geometry"]["coordinates"][0]) > 5
    assert road["quantity"]["value"] > 80
    clean = deepcopy(raw)
    clean["scenarios"]["option_a"]["items"] = [{**item, "geometry": road["geometry"]}]
    assert (
        validate_workspace(WorkspaceInput(**clean), BOUNDS)["scenarios"]["option_a"]["items"][0][
            "road"
        ]
        == road["road"]
    )
    item["road"]["mode"] = "area"
    assert apply(raw, item)["scenarios"]["option_a"]["items"][0]["quantity"]["value"] > 0


@pytest.mark.parametrize("width", [0, -1, 101, float("nan")])
def test_invalid_width_rejected(width):
    with pytest.raises(ValidationError):
        RoadRoute(points=[(101.682, 3.132), (101.6821, 3.132)], width_m=width)


def test_invalid_crossing_outside_overlap_and_baseline_are_atomic():
    raw, item = road_fixture()
    with pytest.raises(APIError, match="proposed option"):
        apply(raw, item, "baseline")
    outside = deepcopy(item)
    outside["road"]["points"][0] = (101.67, 3.132)
    with pytest.raises(APIError):
        apply(raw, outside)
    checked = apply(raw, item)
    raw["scenarios"]["option_a"]["items"] = [item]
    second = deepcopy(item)
    second["id"] = str(uuid4())
    with pytest.raises(APIError, match="overlap"):
        apply(raw, second)
    item["editor_locked"] = True
    with pytest.raises(APIError, match="unlocked"):
        apply(raw, item)
    with pytest.raises(ValueError, match="cross itself"):
        footprint(
            RoadRoute(
                points=[(101.681, 3.131), (101.683, 3.133), (101.681, 3.133), (101.683, 3.131)],
                width_m=3,
            ),
            checked["metric_crs"],
        )


def test_road_cannot_claim_inclusive_rate_or_quantity_override():
    _, item = road_fixture()
    from app.workspace import WorkItem

    for field, value in [("rate_id", str(uuid4())), ("quantity_override", "200")]:
        with pytest.raises(ValidationError):
            WorkItem(**{**item, field: value})


def test_existing_road_context_does_not_block_proposed_resurfacing():
    raw, item = road_fixture()
    checked = apply(raw, item)
    existing = deepcopy(item)
    existing.update(
        id=str(uuid4()),
        status="existing",
        road=None,
        geometry=checked["scenarios"]["option_a"]["items"][0]["geometry"],
    )
    recipe = assembly(use="road", pricing="components")
    for component in recipe["components"]:
        component.update(category="material", basis="volume", unit="m3", thickness_mm=100)
    existing["assembly"] = recipe
    raw["scenarios"]["baseline"]["items"] = [existing]
    result = apply(raw, item)
    assert len(result["scenarios"]["option_a"]["items"]) == 2
