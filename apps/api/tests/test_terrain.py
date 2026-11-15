from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.domain.geometry import project_wgs84_geometry
from app.domain.shade import analyse_workspace
from app.errors import APIError
from app.terrain import Terrain, sample
from app.workspace import (
    WorkspaceInput,
    get_workspace,
    restore_workspace,
    save_workspace,
    validate_workspace,
)
from tests.test_access_foundation import create_org, create_project
from tests.test_workspace import fixture_workspace


def grid():
    projected = project_wgs84_geometry(fixture_workspace()["boundary"], source_crs="EPSG:4326")
    return dict(
        datum="Assumed local datum",
        source="Synthetic flat surface",
        metric_crs=projected.metric_crs,
        bounds=list(projected.geometry.bounds),
        size=9,
        base_elevation=10,
        heights=[10.0] * 81,
        ponds=[],
    )


def test_terrain_anchors_quantities_and_shade_boundary():
    raw = fixture_workspace()
    before = validate_workspace(WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14])
    raw["scenarios"]["option_a"]["terrain"] = grid()
    raw["scenarios"]["option_a"]["terrain"]["heights"] = [12.0] * 81
    after = validate_workspace(WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14])
    assert after["scenarios"]["option_a"]["terrain_anchors"][0][
        "ground_elevation_m"
    ] == pytest.approx(12)
    assert (
        after["scenarios"]["option_a"]["items"][0]["quantity"]
        == before["scenarios"]["option_a"]["items"][0]["quantity"]
    )
    assert after["scenarios"]["baseline"]["terrain"] is None
    with pytest.raises(ValueError, match="Edited concept terrain"):
        analyse_workspace(after, datetime(2026, 1, 1, 4, tzinfo=UTC), raw["targets"][0]["id"])


@pytest.mark.parametrize(
    "patch",
    [
        {"heights": [0]},
        {"heights": [float("nan")] * 81},
        {"size": 34},
        {"datum": ""},
        {"bounds": [0, 0, 3000, 3000]},
        {"ponds": [{"name": "Pond", "region": [2, 2, 5, 5], "water_level": 9}]},
    ],
)
def test_invalid_terrain(patch):
    with pytest.raises(ValidationError):
        Terrain(**{**grid(), **patch})


def test_interpolation_and_valid_pond():
    value = grid()
    value["heights"] = [float(x + y) for y in range(9) for x in range(9)]
    t = Terrain(**value)
    w, s, e, n = t.bounds
    assert sample(t, (w + e) / 2, (s + n) / 2) == pytest.approx(8)
    value = grid()
    value["ponds"] = [{"name": "Concept", "region": [2, 2, 5, 5], "water_level": 11}]
    assert Terrain(**value).ponds[0].water_level == 11


def test_wrong_frame_is_rejected():
    raw = fixture_workspace()
    raw["scenarios"]["option_a"]["terrain"] = grid()
    raw["scenarios"]["option_a"]["terrain"]["bounds"][0] += 1
    with pytest.raises(APIError, match="frame"):
        validate_workspace(WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14])


def test_private_revisioned_terrain_persistence(database):
    user, foreign = uuid4(), uuid4()
    with Session(database) as db:
        org = create_org(db, user)
        project = create_project(db, org, user)
        raw = fixture_workspace()
        raw["scenarios"]["option_a"]["terrain"] = grid()
        saved = save_workspace(db, org, project.id, user, WorkspaceInput(**raw))
        assert (
            get_workspace(db, org, project.id, user)["data"]["scenarios"]["option_a"]["terrain"][
                "datum"
            ]
            == "Assumed local datum"
        )
        with pytest.raises(APIError):
            get_workspace(db, org, project.id, foreign)
        with pytest.raises(APIError):
            save_workspace(db, org, project.id, user, WorkspaceInput(**raw))
        raw = deepcopy(raw)
        raw["expected_revision"] = saved["revision"]
        raw["scenarios"]["option_a"]["terrain"]["heights"] = [12.0] * 81
        save_workspace(db, org, project.id, user, WorkspaceInput(**raw))
        restored = restore_workspace(db, org, project.id, user, 1, 2)
        assert restored["revision"] == 3
        assert restored["data"]["scenarios"]["option_a"]["terrain"]["heights"] == [10.0] * 81


def test_circular_water_requires_a_low_bed_and_remains_inside_site():
    value = grid()
    value["heights"] = [8.0] * 81
    value["ponds"] = [
        {"name": "Round pool", "region": [2, 2, 6, 6], "water_level": 9, "shape": "circle"}
    ]
    value["heights"][2 * 9 + 2] = 10  # Outside the round water footprint.
    assert Terrain(**value).ponds[0].shape == "circle"
    value["heights"][4 * 9 + 4] = 10
    with pytest.raises(ValidationError, match="above every"):
        Terrain(**value)


def test_manual_site_work_units_staleness_and_no_invented_terrain_volume():
    from app.domain.pricing import calculate_estimate
    from tests.test_pricing import fixtures

    raw = fixture_workspace()
    raw["scenarios"]["option_a"]["terrain"] = grid()
    checked = validate_workspace(WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14])
    item = deepcopy(raw["scenarios"]["option_a"]["items"][0])
    item.update(
        kind="manual",
        geometry=None,
        count=1,
        height_m=None,
        rate_id=None,
        terrain_work={
            "activity": "Manual excavation",
            "resource": "labour",
            "tools": "Crew with shovels",
            "assumptions": "Crew allowance supplied by contractor; disposal excluded",
            "quantity": "4.25",
            "unit": "h",
            "terrain_signature": checked["scenarios"]["option_a"]["terrain_signature"],
        },
    )
    raw["scenarios"]["option_a"]["items"] = [item]

    def validate():
        return validate_workspace(WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14])["scenarios"][
            "option_a"
        ]["items"][0]

    work = validate()
    assert not work["terrain_work_stale"]
    assert work["quantity"]["value"] == 4.25
    assert work["quantity"]["calculated"]["unit"] == "h"
    assert "Not calculated from concept terrain" in work["source_note"]
    _, rates = fixtures()
    rates["rate"].update(unit="h", amount="20")
    work["rate_id"] = "rate"
    kwargs = dict(currency="MYR", method="markup", percent=0, wastage=0, charges=[])
    priced = calculate_estimate([work], rates, **kwargs)
    assert priced["priced_subtotal"] == "85.00"
    raw["scenarios"]["option_a"]["terrain"]["heights"][40] += 1
    item["terrain_work_stale"] = False  # Client cannot suppress stale detection.
    stale = validate()
    stale["rate_id"] = "rate"
    result = calculate_estimate([stale], rates, **kwargs)
    assert stale["terrain_work_stale"]
    assert not result["complete"] and result["profit"] is None
    assert "Terrain changed" in result["missing_rates"][0]["reason"]
    equipment = deepcopy(work)
    equipment["id"] = "equipment"
    equipment["terrain_work"]["resource"] = "equipment"
    equipment["rate_id"] = "equipment-rate"
    rates["equipment-rate"] = {**rates["rate"], "includes": []}
    rates["rate"]["includes"] = ["equipment"]
    partial = calculate_estimate([equipment, stale], rates, **kwargs)
    assert partial["priced_subtotal"] == "85.00" and not partial["complete"]
    assert not calculate_estimate([], {}, terrain_pending=True, **kwargs)["complete"]
    item["terrain_work"]["quantity"] = "-1"
    with pytest.raises(ValidationError):
        WorkspaceInput(**raw)
