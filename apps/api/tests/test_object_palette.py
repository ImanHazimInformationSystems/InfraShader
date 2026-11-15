import hashlib
import json
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.errors import APIError
from app.object_palette import CATALOGUE
from app.workspace import (
    ObjectTransformInput,
    WorkspaceInput,
    get_workspace,
    restore_workspace,
    save_workspace,
    transform_objects,
    validate_workspace,
)
from tests.test_access_foundation import create_org, create_project
from tests.test_terrain import grid
from tests.test_workspace import fixture_workspace

BOUNDS = [101.681, 3.131, 101.683, 3.133]


def object_item(asset="bench", **patch):
    return {
        "id": str(uuid4()),
        "name": "Concept object",
        "kind": "object",
        "geometry": None,
        "source_note": "Synthetic concept fixture",
        "provenance": "estimated",
        "object_instance": {"asset_id": asset, "longitude": 101.682, "latitude": 3.132, **patch},
    }


def draft(*items):
    raw = fixture_workspace()
    raw["scenarios"]["option_a"]["items"] = list(items)
    return raw


def test_every_preset_has_verified_bounds_pivot_license_hash_and_mesh_budget():
    assert len(CATALOGUE) == 16
    canonical = Path(__file__).parents[1] / "app/data/catalogue.json"
    public = Path(__file__).parents[2] / "web/public/objects/catalogue.json"
    assert canonical.read_bytes() == public.read_bytes()
    root = Path(__file__).parents[3]
    assert (root / "LICENSE").read_bytes() == (public.parent / "LICENSE.txt").read_bytes()
    for preset in CATALOGUE.values():
        assert preset["license"] == "MIT" and preset["units"] == "metres"
        assert preset["pivot"] == [0, 0, 0]
        assert preset["triangles"] == sum(
            {"box": 12, "cylinder": 32, "sphere": 80}[p["shape"]] for p in preset["parts"]
        )
        assert preset["triangles"] <= 256 and len(preset["parts"]) <= 12
        low = [min(p["position"][i] - p["size"][i] / 2 for p in preset["parts"]) for i in range(3)]
        high = [max(p["position"][i] + p["size"][i] / 2 for p in preset["parts"]) for i in range(3)]
        assert low[1] == pytest.approx(0)
        assert low[0] + high[0] == pytest.approx(0)
        assert low[2] + high[2] == pytest.approx(0)
        assert [high[i] - low[i] for i in range(3)] == pytest.approx(preset["dimensions"])
        fields = {k: v for k, v in preset.items() if k != "sha256"}
        assert (
            hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()
            == preset["sha256"]
        )


@pytest.mark.parametrize("asset", list(CATALOGUE))
def test_all_admitted_presets_generate_bounded_geometry_and_correct_units(asset):
    result = validate_workspace(
        WorkspaceInput(**draft(object_item(asset, scale=1.5, rotation_deg=90, snap_m=0.5))), BOUNDS
    )
    item = result["scenarios"]["option_a"]["items"][0]
    assert item["quantity"]["calculated"]["unit"] == CATALOGUE[asset]["unit"]
    if asset in ("path", "fence"):
        assert item["quantity"]["value"] == pytest.approx(
            1.5 * (4 if asset == "path" else 2.12), rel=1e-5
        )
    else:
        assert item["quantity"]["value"] == 1
    assert item["object_pose"]["x"] / 0.5 == pytest.approx(round(item["object_pose"]["x"] / 0.5))
    assert item["object_pose"]["license"] == "MIT"


def test_unknown_version_outside_footprint_and_quantity_forgery_rejected():
    for patch in ({"asset_id": "missing"}, {"version": 2}, {"longitude": 101.681}):
        with pytest.raises(APIError):
            validate_workspace(WorkspaceInput(**draft(object_item(**patch))), BOUNDS)
    item = object_item()
    item["count"] = 10
    with pytest.raises(APIError, match="separate object instances"):
        validate_workspace(WorkspaceInput(**draft(item)), BOUNDS)


def test_tilt_and_nonuniform_resize_use_conservative_footprint_and_ground_contact():
    from pydantic import ValidationError

    from app.object_palette import ObjectInstance

    item = object_item("solar", tilt_deg=35, lean_deg=-20, stretch_x=2, stretch_y=1.4)
    checked = validate_workspace(WorkspaceInput(**draft(item)), BOUNDS)
    saved = checked["scenarios"]["option_a"]["items"][0]
    assert saved["quantity"]["value"] == 1
    assert saved["object_pose"]["elevation_m"] >= 0
    assert saved["object_pose"]["dimensions"][0] == pytest.approx(3.6)
    for patch in ({"tilt_deg": 81}, {"stretch_z": 0}, {"light_intensity": float("nan")}):
        with pytest.raises(ValidationError):
            ObjectInstance(**{**item["object_instance"], **patch})
    with pytest.raises(APIError):
        validate_workspace(
            WorkspaceInput(**draft(object_item("solar", longitude=BOUNDS[0], tilt_deg=30))), BOUNDS
        )


def test_drawn_fence_is_atomic_projected_length_with_ordinary_grouped_segments():
    from math import hypot

    from pyproj import Transformer

    from app.spatial_editor import EditInput, edit_draft

    raw = draft()
    points = [(101.682, 3.132), (101.6822, 3.1321)]
    result = edit_draft(
        EditInput(workspace=raw, scenario="option_a", operation="fence", fence_points=points),
        BOUNDS,
    )
    items = result["scenarios"]["option_a"]["items"]
    forward = Transformer.from_crs("EPSG:4326", result["metric_crs"], always_xy=True)
    a, b = [forward.transform(*point) for point in points]
    assert sum(item["quantity"]["value"] for item in items) == pytest.approx(
        hypot(b[0] - a[0], b[1] - a[1]), rel=1e-5
    )
    assert len({item["object_instance"]["group"] for item in items}) == 1
    assert all(item["rate_id"] is None for item in items)
    assert raw["scenarios"]["option_a"]["items"] == []
    for scenario, invalid in [
        ("baseline", points),
        ("option_a", [points[0], points[0]]),
        ("option_a", [points[0], (102, 4)]),
    ]:
        with pytest.raises(APIError):
            edit_draft(
                EditInput(
                    workspace=raw, scenario=scenario, operation="fence", fence_points=invalid
                ),
                BOUNDS,
            )


def test_group_transform_and_locks():
    a, b = object_item(), object_item(longitude=101.6821)
    raw = draft(a, b)
    before = validate_workspace(WorkspaceInput(**raw), BOUNDS)
    moved = transform_objects(
        ObjectTransformInput(
            workspace=raw,
            scenario="option_a",
            ids=[a["id"], b["id"]],
            operation="translate",
            east_m=2,
            north_m=3,
        ),
        BOUNDS,
    )
    for old, new in zip(
        before["scenarios"]["option_a"]["items"],
        moved["scenarios"]["option_a"]["items"],
        strict=True,
    ):
        assert new["object_pose"]["x"] - old["object_pose"]["x"] == pytest.approx(2, abs=1e-6)
        assert new["object_pose"]["y"] - old["object_pose"]["y"] == pytest.approx(3, abs=1e-6)
    aligned = transform_objects(
        ObjectTransformInput(
            workspace=raw, scenario="option_a", ids=[a["id"], b["id"]], operation="align_x"
        ),
        BOUNDS,
    )
    assert aligned["scenarios"]["option_a"]["items"][0]["object_pose"]["x"] == pytest.approx(
        aligned["scenarios"]["option_a"]["items"][1]["object_pose"]["x"]
    )
    rotated = transform_objects(
        ObjectTransformInput(
            workspace=raw,
            scenario="option_a",
            ids=[a["id"], b["id"]],
            operation="rotate",
            rotation_deg=90,
        ),
        BOUNDS,
    )
    from math import hypot

    old_a, old_b = [i["object_pose"] for i in before["scenarios"]["option_a"]["items"]]
    new_a, new_b = [i["object_pose"] for i in rotated["scenarios"]["option_a"]["items"]]
    assert hypot(new_b["x"] - new_a["x"], new_b["y"] - new_a["y"]) == pytest.approx(
        hypot(old_b["x"] - old_a["x"], old_b["y"] - old_a["y"]), abs=1e-6
    )
    assert rotated["scenarios"]["option_a"]["items"][0]["object_instance"]["rotation_deg"] == 90
    a["object_instance"]["locked"] = True
    with pytest.raises(APIError, match="unlocked"):
        transform_objects(
            ObjectTransformInput(
                workspace=raw,
                scenario="option_a",
                ids=[a["id"]],
                operation="rotate",
                rotation_deg=90,
            ),
            BOUNDS,
        )


def test_persistence_foreign_access_restore_rates_and_scenario_ground_contact(database):
    actor, foreign = uuid4(), uuid4()
    with Session(database) as db:
        org = create_org(db, actor)
        project = create_project(db, org, actor)
        item = object_item(elevation_offset_m=1)
        item["status"] = "existing"
        item["rate_id"] = str(uuid4())
        raw = draft()
        raw["scenarios"]["baseline"]["items"] = [item]
        raw["scenarios"]["option_a"]["terrain"] = grid()
        saved = save_workspace(db, org, project.id, actor, WorkspaceInput(**raw))
        read = get_workspace(db, org, project.id, actor)["data"]
        assert read["scenarios"]["baseline"]["items"][0]["object_pose"]["elevation_m"] == 1
        assert read["scenarios"]["option_a"]["items"][0]["object_pose"]["elevation_m"] == 11
        assert read["scenarios"]["baseline"]["items"][0]["rate_id"] == item["rate_id"]
        with pytest.raises(APIError):
            get_workspace(db, org, project.id, foreign)
        with pytest.raises(APIError):
            save_workspace(db, org, project.id, actor, WorkspaceInput(**raw))
        raw = deepcopy(raw)
        raw["expected_revision"] = saved["revision"]
        raw["scenarios"]["baseline"]["items"][0]["object_instance"]["scale"] = 2
        save_workspace(db, org, project.id, actor, WorkspaceInput(**raw))
        restored = restore_workspace(db, org, project.id, actor, 1, 2)
        assert restored["revision"] == 3
        assert (
            restored["data"]["scenarios"]["baseline"]["items"][0]["object_instance"]["scale"] == 1
        )


def test_full_resource_cap_keeps_hidden_objects_in_quantities():
    items = [object_item() for _ in range(150)]
    items[0]["visible"] = False
    result = validate_workspace(WorkspaceInput(**draft(*items)), BOUNDS)
    assert sum(i["quantity"]["value"] for i in result["scenarios"]["option_a"]["items"]) == 150


def test_object_rates_drive_real_saved_estimate_without_mesh_area_pricing(database):
    from datetime import date

    from app import calculations
    from tests.test_workflow_integration import initialise

    org, project, actor, _, _ = initialise(database, "contractor_proposal")
    with Session(database) as db:
        rate = calculations.create_rate(
            db,
            org,
            actor,
            calculations.RateInput(
                code="OBJECT",
                description="Synthetic count rate",
                unit="item",
                basis="cost",
                amount="25",
                effective_date=date(2026, 10, 28),
                source_note="Fixture, not market pricing",
            ),
        )
        item = object_item()
        item["rate_id"] = str(rate["id"])
        save_workspace(db, org, project, actor, WorkspaceInput(**draft(item)))
        result = calculations.run_estimate(
            db,
            org,
            project,
            actor,
            calculations.EstimateInput(
                expected_revision=1,
                request_key=uuid4(),
                scenario="option_a",
                method="markup",
                percent="20",
            ),
        )
        assert result["payload"]["complete"]
        assert float(result["payload"]["selling_total"]) == 30
