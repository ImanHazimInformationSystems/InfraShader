from copy import deepcopy
from math import pi
from uuid import uuid4

import pytest
from pydantic import ValidationError
from shapely.geometry import Polygon, box
from sqlalchemy.orm import Session

from app.errors import APIError
from app.terrain import Terrain, signature
from app.terrain_analysis import StudyInput, create_study, earthworks, list_studies, runoff
from app.workspace import WorkspaceInput, save_workspace, validate_workspace
from tests.test_access_foundation import create_org, create_project
from tests.test_terrain import grid
from tests.test_workspace import fixture_workspace


def surface():
    return Terrain(
        datum="Synthetic local",
        source="Analytical test plane",
        metric_crs="EPSG:32647",
        bounds=[0, 0, 10, 10],
        size=5,
        base_elevation=0,
        heights=[0.0] * 25,
    )


def inputs(**patch):
    return StudyInput(
        expected_revision=1,
        request_key=uuid4(),
        rainfall_mmh=100,
        duration_minutes=60,
        infiltration_mmh=20,
        roughness_n=0.04,
        source="Synthetic analytical test assumptions",
        **patch,
    )


def test_exact_cut_fill_sign_crossing_and_irregular_site_clip():
    t = surface()
    t.heights = [x * 2.5 - 5 for y in range(5) for x in range(5)]
    result = earthworks(t, box(0, 0, 10, 10))
    assert result["cut_m3"] == 125 and result["fill_m3"] == 125
    clipped = earthworks(t, Polygon([(0, 0), (10, 0), (0, 10)]))
    assert clipped["cut_m3"] == pytest.approx(104.1666667)
    assert clipped["fill_m3"] == pytest.approx(20.8333333)


def test_pond_storage_and_overlap_not_double_counted():
    t = surface()
    t.heights = [-2.0] * 25
    t.ponds = Terrain(
        **{
            **t.model_dump(),
            "ponds": [{"name": "Square", "region": [1, 1, 3, 3], "water_level": -1}],
        }
    ).ponds
    assert earthworks(t, box(0, 0, 10, 10))["ponds"][0]["storage_m3"] == 25
    t.ponds[0].shape = "circle"
    assert earthworks(t, box(0, 0, 10, 10))["ponds"][0]["storage_m3"] == pytest.approx(
        pi * 2.5**2, rel=0.0005
    )
    t.ponds.append(t.ponds[0].model_copy())
    with pytest.raises(ValueError, match="overlap"):
        earthworks(t, box(0, 0, 10, 10))


def test_supplied_ground_is_reference_and_invalid_grids_reject():
    t = surface()
    t.reference_heights = [float(x + y) for y in range(5) for x in range(5)]
    t.reference_source = "Synthetic existing ground, same frame and datum"
    t.heights = [value - 1 for value in t.reference_heights]
    checked = Terrain(**t.model_dump())
    result = earthworks(checked, box(0, 0, 10, 10))
    assert result["cut_m3"] == 100 and result["fill_m3"] == 0
    assert "Supplied existing-ground grid" in result["reference"]
    with pytest.raises(ValidationError, match="complete finite"):
        Terrain(**{**t.model_dump(), "reference_heights": [1]})


def test_flat_rain_infiltration_and_closed_boundary_mass_balance():
    result = runoff(surface(), box(0, 0, 10, 10), inputs())
    assert result["rain_m3"] == pytest.approx(10)
    assert result["infiltrated_m3"] == pytest.approx(2)
    assert result["remaining_m3"] == pytest.approx(8)
    assert result["discharged_m3"] == 0
    assert abs(result["balance_error_m3"]) < 1e-10
    assert all(depth == pytest.approx(0.08) for depth in result["frames"][-1]["depths_m"])


def test_capacity_limited_drain_removes_actual_available_water():
    t = surface()
    t.ponds = Terrain(
        **{**t.model_dump(), "ponds": [{"name": "Full", "region": [0, 0, 4, 4], "water_level": 1}]}
    ).ponds
    config = inputs(outlets=[{"row": 0, "column": 0, "capacity_ls": 0.01, "invert_m": 0}])
    config.rainfall_mmh = config.infiltration_mmh = 0
    config.duration_minutes = 1
    result = runoff(t, box(0, 0, 10, 10), config)
    assert result["initial_water_m3"] == pytest.approx(100)
    assert result["discharged_m3"] == pytest.approx(0.0006)
    assert result["peak_outlet_ls"] == pytest.approx(0.01)
    assert result["remaining_m3"] == pytest.approx(99.9994)
    assert abs(result["balance_error_m3"]) < 1e-8
    config.outlets[0].invert_m = 2
    assert runoff(t, box(0, 0, 10, 10), config)["discharged_m3"] == 0


def test_sloped_runoff_moves_downhill_without_negative_water():
    t = surface()
    t.heights = [float(4 - y) for y in range(5) for x in range(5)]
    result = runoff(t, box(0, 0, 10, 10), inputs())
    frame = result["frames"][-1]
    assert min(frame["depths_m"]) >= 0
    assert sum(frame["depths_m"][-4:]) > sum(frame["depths_m"][:4])
    assert any(destination >= 0 for destination in frame["flow_to"])
    assert abs(result["balance_error_m3"]) < 1e-8
    with pytest.raises(ValueError, match="distinct active"):
        runoff(
            t,
            box(0, 0, 10, 10),
            inputs(outlets=[{"row": 31, "column": 0, "capacity_ls": 1, "invert_m": 0}]),
        )
    with pytest.raises(ValidationError):
        inputs(outlets=[{"row": 0, "column": 0, "capacity_ls": float("nan"), "invert_m": 0}])


def test_automatic_cost_quantity_ignores_client_volume_and_marks_changes_stale():
    raw = fixture_workspace()
    t = grid()
    t["heights"] = [9.0] * 81
    raw["scenarios"]["option_a"]["terrain"] = t
    item = deepcopy(raw["scenarios"]["option_a"]["items"][0])
    item.update(
        kind="manual",
        geometry=None,
        count=1,
        height_m=None,
        quantity_override=None,
        terrain_work={
            "activity": "Excavation",
            "resource": "equipment",
            "tools": "Supplied excavator",
            "assumptions": "In-situ excavation, haulage excluded",
            "quantity": "999",
            "quantity_basis": "cut",
            "unit": "m3",
            "terrain_signature": signature(t),
        },
    )
    raw["scenarios"]["option_a"]["items"] = [item]
    checked = validate_workspace(WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14])
    work = checked["scenarios"]["option_a"]["items"][0]
    assert work["quantity"]["value"] == pytest.approx(checked["boundary_area_m2"], abs=0.0001)
    assert not work["terrain_work_stale"]
    assert work["quantity"]["calculated"]["unit"] == "m3"
    assert work["quantity"]["calculated"]["method"] == "clipped_tin_cut_volume"
    assert work["provenance"] == "calculated"
    assert "Model-derived cut" in work["source_note"]


def test_private_saved_studies_idempotence_stale_revisions_and_history(database):
    user = uuid4()
    with Session(database) as db:
        org = create_org(db, user)
        project = create_project(db, org, user)
        raw = fixture_workspace()
        raw["scenarios"]["option_a"]["terrain"] = grid()
        save_workspace(db, org, project.id, user, WorkspaceInput(**raw))
        study_input = inputs()
        result = create_study(db, org, project.id, user, study_input)
        assert create_study(db, org, project.id, user, study_input)["id"] == result["id"]
        assert not list_studies(db, org, project.id, user)["items"][0]["stale"]
        with pytest.raises(APIError):
            list_studies(db, org, project.id, uuid4())
        raw["expected_revision"] = 1
        raw["scenarios"]["option_a"]["terrain"]["heights"][40] += 1
        save_workspace(db, org, project.id, user, WorkspaceInput(**raw))
        assert list_studies(db, org, project.id, user)["items"][0]["stale"]
        with pytest.raises(APIError, match="current workspace"):
            create_study(db, org, project.id, user, inputs())
