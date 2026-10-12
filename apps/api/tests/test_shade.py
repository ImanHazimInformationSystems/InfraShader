from datetime import datetime

import pytest
from shapely import box

from app.domain.shade import analyse_workspace, project_shadow, solar_position
from app.workspace import WorkspaceInput, validate_workspace
from tests.test_workspace import fixture_workspace


def test_roof_translates_without_filling_swept_ground():
    roof = project_shadow(box(0, 0, 10, 10), 10, 45, 90, roof_only=True)
    solid = project_shadow(box(0, 0, 10, 10), 10, 45, 90, roof_only=False)
    assert roof.bounds == pytest.approx((-10, 0, 0, 10))
    assert roof.area == pytest.approx(100)
    assert solid.area == pytest.approx(200)


def test_north_sun_casts_south_and_overlaps_union():
    shadow = project_shadow(box(0, 0, 10, 10), 10, 45, 0, roof_only=False)
    assert shadow.bounds == pytest.approx((0, -10, 10, 10))
    assert shadow.union(shadow).area == pytest.approx(200)


@pytest.mark.parametrize("elevation", [-5, 0, 4.9, float("nan")])
def test_unsupported_sun_rejected(elevation):
    with pytest.raises(ValueError):
        project_shadow(box(0, 0, 1, 1), 3, elevation, 180, roof_only=True)


def test_solar_nrel_reference():
    # NREL SPA reference example 17 Oct 2003, Golden CO; geometric elevation.
    position = solar_position(
        datetime.fromisoformat("2003-10-17T12:30:30-07:00"), -105.1786, 39.742476
    )
    assert position["azimuth_deg"] == pytest.approx(194.3402, abs=0.01)
    assert position["elevation_deg"] == pytest.approx(39.8720, abs=0.03)
    with pytest.raises(ValueError):
        solar_position(datetime(2026, 1, 1), 101, 3)


def test_saved_target_scenario_clip_and_night():
    data = validate_workspace(WorkspaceInput(**fixture_workspace()), [101.68, 3.13, 101.69, 3.14])
    result = analyse_workspace(
        data, datetime.fromisoformat("2026-03-21T12:00:00+08:00"), data["targets"][0]["id"]
    )
    assert result["status"] == "modeled"
    assert result["scenarios"]["baseline"]["area_m2"] == 0
    assert 0 < result["scenarios"]["option_a"]["coverage_percent"] < 100
    assert result["scenarios"]["option_b"]["area_m2"] == 0
    night = analyse_workspace(
        data, datetime.fromisoformat("2026-03-21T00:00:00+08:00"), data["targets"][0]["id"]
    )
    assert night["status"] == "night" and night["scenarios"] == {}


def test_unknown_building_is_preserved_but_blocks_shade():
    raw = fixture_workspace()
    building = raw["scenarios"]["option_a"]["items"][0]
    building.update(kind="building", height_m=None, height_source="")
    data = validate_workspace(WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14])
    assert data["scenarios"]["option_a"]["items"][0]["height_m"] is None
    with pytest.raises(ValueError, match="Building height unknown"):
        analyse_workspace(
            data, datetime.fromisoformat("2026-03-21T12:00:00+08:00"), data["targets"][0]["id"]
        )
    building.update(height_m=12, height_source="Measured fixture")
    data = validate_workspace(WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14])
    result = analyse_workspace(
        data, datetime.fromisoformat("2026-03-21T12:00:00+08:00"), data["targets"][0]["id"]
    )
    assert result["status"] == "modeled"
    assert result["scenarios"]["option_a"]["coverage_percent"] > 0
