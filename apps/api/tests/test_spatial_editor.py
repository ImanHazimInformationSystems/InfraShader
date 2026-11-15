from copy import deepcopy
from uuid import uuid4

import pytest
from pyproj import Transformer
from shapely import transform
from shapely.geometry import shape

from app.errors import APIError
from app.spatial_editor import EditInput, edit_draft
from app.workspace import WorkspaceInput, validate_workspace
from tests.test_workspace import fixture_workspace, polygon

BOUNDS = [101.68, 3.13, 101.69, 3.14]


def fixture():
    raw = fixture_workspace()
    item = raw["scenarios"]["option_a"]["items"][0]
    item.update(kind="area", height_m=None, height_source="")
    return raw


def apply(raw, operation, **kwargs):
    return edit_draft(
        EditInput(
            workspace=WorkspaceInput(**raw),
            scenario="option_a",
            ids=[i["id"] for i in raw["scenarios"]["option_a"]["items"]],
            operation=operation,
            **kwargs,
        ),
        BOUNDS,
    )


def metric(geometry):
    return transform(
        shape(geometry),
        Transformer.from_crs(4326, 32647, always_xy=True).transform,
        interleaved=False,
    )


def test_metric_move_rotation_dimensions_and_input_immutability():
    raw = fixture()
    original = deepcopy(raw)
    old = metric(raw["scenarios"]["option_a"]["items"][0]["geometry"])
    moved = apply(raw, "move", east_m=10, north_m=-5)["scenarios"]["option_a"]["items"][0]
    new = metric(moved["geometry"])
    assert new.centroid.x - old.centroid.x == pytest.approx(10, abs=1e-6)
    assert new.centroid.y - old.centroid.y == pytest.approx(-5, abs=1e-6)
    assert raw == original
    rotated = apply(raw, "rotate", angle_deg=37)["scenarios"]["option_a"]["items"][0]
    assert metric(rotated["geometry"]).area == pytest.approx(old.area, abs=1e-5)
    resized = apply(raw, "resize", width_m=20, depth_m=30)["scenarios"]["option_a"]["items"][0]
    bounds = metric(resized["geometry"]).bounds
    assert bounds[2] - bounds[0] == pytest.approx(20, abs=1e-6)
    assert bounds[3] - bounds[1] == pytest.approx(30, abs=1e-6)


@pytest.mark.parametrize(
    "operation,kwargs",
    [
        ("move", {"east_m": 5000}),
        ("duplicate", {"copies": 30, "east_m": 100}),
        ("distribute_x", {}),
    ],
)
def test_invalid_operation_is_atomic(operation, kwargs):
    raw = fixture()
    old = deepcopy(raw)
    with pytest.raises((APIError, ValueError)):
        apply(raw, operation, **kwargs)
    assert raw == old


def test_arrays_unique_ids_and_quantity_recomputed():
    result = apply(fixture(), "duplicate", copies=3, east_m=15)
    items = result["scenarios"]["option_a"]["items"]
    assert len(items) == len({i["id"] for i in items}) == 4
    assert all(i["quantity"]["value"] > 120 for i in items)
    assert result["scenarios"]["option_b"]["items"] == []


def test_metric_grid_and_fixed_dimension_constraint():
    raw = fixture()
    snapped = apply(raw, "snap_grid", grid_m=2)["scenarios"]["option_a"]["items"][0]
    centre = metric(snapped["geometry"]).centroid
    assert centre.x / 2 == pytest.approx(round(centre.x / 2), abs=1e-6)
    assert centre.y / 2 == pytest.approx(round(centre.y / 2), abs=1e-6)
    fixed = apply(raw, "fix_dimensions")["scenarios"]["option_a"]["items"][0]
    raw["scenarios"]["option_a"]["items"][0]["editor_dimensions"] = fixed["editor_dimensions"]
    apply(raw, "move", east_m=5)
    with pytest.raises(APIError, match="Fixed grid dimensions"):
        apply(raw, "resize", width_m=40, depth_m=20)
    released = apply(raw, "release_dimensions")["scenarios"]["option_a"]["items"][0]
    assert released["editor_dimensions"] is None


def test_locks_inheritance_and_metadata():
    raw = fixture()
    raw["scenarios"]["option_a"]["items"][0]["editor_locked"] = True
    with pytest.raises(APIError, match="Unlock"):
        apply(raw, "move", east_m=1)
    hidden = apply(raw, "hide")["scenarios"]["option_a"]["items"][0]
    assert not hidden["visible"] and hidden["quantity"]["value"] > 0
    assert not apply(raw, "unlock")["scenarios"]["option_a"]["items"][0]["editor_locked"]
    raw["scenarios"]["option_a"]["items"][0]["editor_locked"] = False
    grouped = apply(raw, "group", label="Test group")["scenarios"]["option_a"]["items"][0]
    assert grouped["editor_group"] == "Test group"
    base = deepcopy(raw["scenarios"]["option_a"]["items"][0])
    base["status"] = "existing"
    raw["scenarios"]["baseline"]["items"] = [base]
    with pytest.raises(APIError, match="Baseline"):
        apply(raw, "move", east_m=1)


def test_split_and_merge_conserve_area():
    raw = fixture()
    old = metric(raw["scenarios"]["option_a"]["items"][0]["geometry"]).area
    parts = apply(raw, "split")["scenarios"]["option_a"]["items"]
    assert len(parts) == 2
    assert sum(i["quantity"]["value"] for i in parts) == pytest.approx(old, abs=1e-5)
    # Round-trip the returned geometry through strict input models.
    raw["scenarios"]["option_a"]["items"] = [
        {
            k: v
            for k, v in i.items()
            if k not in ("quantity", "schedule", "object_pose", "reference_review_required")
        }
        for i in parts
    ]
    merged = apply(raw, "merge")["scenarios"]["option_a"]["items"]
    assert len(merged) == 1
    assert merged[0]["quantity"]["value"] == pytest.approx(old, abs=1e-5)


def test_cutout_persists_hole_and_rejects_invalid_shade_footprints():
    raw = fixture()
    outer = raw["scenarios"]["option_a"]["items"][0]
    inner = deepcopy(outer)
    inner.update(id=str(uuid4()), geometry=polygon(101.68122, 3.13122, 101.68128, 3.13128))
    raw["scenarios"]["option_a"]["items"].append(inner)
    result = apply(raw, "cutout")["scenarios"]["option_a"]["items"]
    assert len(result) == 1 and len(result[0]["geometry"]["coordinates"]) == 2
    assert result[0]["quantity"]["value"] == pytest.approx(
        metric(outer["geometry"]).area - metric(inner["geometry"]).area, abs=1e-5
    )
    outer.update(geometry=result[0]["geometry"], kind="building")
    with pytest.raises(APIError, match="Cutouts"):
        validate_workspace(WorkspaceInput(**raw), BOUNDS)


def test_alignment_distribution_and_incompatible_merge():
    raw = fixture()
    original = raw["scenarios"]["option_a"]["items"][0]
    for x in [101.6815, 101.682]:
        item = deepcopy(original)
        item.update(id=str(uuid4()), geometry=polygon(x, 3.1312, x + 0.0001, 3.1313))
        raw["scenarios"]["option_a"]["items"].append(item)
    aligned = apply(raw, "align_x")["scenarios"]["option_a"]["items"]
    assert (
        max(metric(i["geometry"]).centroid.x for i in aligned)
        - min(metric(i["geometry"]).centroid.x for i in aligned)
        < 1e-6
    )
    distributed = apply(raw, "distribute_x")["scenarios"]["option_a"]["items"]
    xs = sorted(metric(i["geometry"]).centroid.x for i in distributed)
    assert xs[1] - xs[0] == pytest.approx(xs[2] - xs[1], abs=1e-6)
    with pytest.raises(APIError, match="connected"):
        apply(raw, "merge")


def test_real_persistence_history_conflicts_and_foreign_edit_denial(database):
    from sqlalchemy.orm import Session

    from app.main import spatial_edit
    from app.workspace import get_workspace, restore_workspace, save_workspace
    from tests.test_access_foundation import create_org, create_project

    actor, foreign = uuid4(), uuid4()
    with Session(database) as session:
        org = create_org(session, actor)
        project = create_project(session, org, actor)
        raw = fixture()
        raw["scenarios"]["option_a"]["items"][0].update(
            editor_locked=True, editor_group="Courtyard group"
        )
        saved = save_workspace(session, org, project.id, actor, WorkspaceInput(**raw))
        read = get_workspace(session, org, project.id, actor)
        assert read["data"]["scenarios"]["option_a"]["items"][0]["editor_locked"]
        with pytest.raises(APIError):
            save_workspace(session, org, project.id, actor, WorkspaceInput(**raw))
        edit = EditInput(
            workspace=raw,
            scenario="option_a",
            operation="unlock",
            ids=[raw["scenarios"]["option_a"]["items"][0]["id"]],
        )
        with pytest.raises(APIError):
            spatial_edit(org, project.id, edit, foreign, session)
        raw["expected_revision"] = saved["revision"]
        raw["scenarios"]["option_a"]["items"][0]["editor_locked"] = False
        save_workspace(session, org, project.id, actor, WorkspaceInput(**raw))
        restored = restore_workspace(session, org, project.id, actor, 1, 2)
        assert restored["revision"] == 3
        assert restored["data"]["scenarios"]["option_a"]["items"][0]["editor_locked"]


def test_scene_projection_uses_quantity_frame_without_mutating_draft():
    from app.spatial_editor import scene_geometry

    raw = fixture()
    before = deepcopy(raw)
    result = scene_geometry(WorkspaceInput(**raw), BOUNDS)
    item = raw["scenarios"]["option_a"]["items"][0]
    assert shape(result["option_a"][item["id"]]).area == pytest.approx(
        metric(item["geometry"]).area, abs=1e-6
    )
    assert raw == before


@pytest.mark.parametrize("operation", ["delete", "split", "merge", "cutout"])
def test_baseline_topology_removes_consumed_ids_from_both_option_previews(operation):
    raw = fixture()
    outer = raw["scenarios"]["option_a"]["items"][0]
    outer["status"] = "existing"
    baseline = [deepcopy(outer)]
    if operation in ("merge", "cutout"):
        other = deepcopy(outer)
        other["id"] = str(uuid4())
        other["geometry"] = (
            polygon(101.6813, 3.1312, 101.6814, 3.1313)
            if operation == "merge"
            else polygon(101.68122, 3.13122, 101.68128, 3.13128)
        )
        baseline.append(other)
    own = deepcopy(outer)
    own.update(id=str(uuid4()), status="proposed")
    raw["scenarios"]["baseline"]["items"] = baseline
    for key in ("option_a", "option_b"):
        raw["scenarios"][key]["items"] = deepcopy(baseline) + [deepcopy(own)]
    before = deepcopy(raw)
    result = edit_draft(
        EditInput(
            workspace=raw,
            scenario="baseline",
            ids=[item["id"] for item in baseline],
            operation=operation,
        ),
        BOUNDS,
    )
    new_baseline = result["scenarios"]["baseline"]["items"]
    assert len(new_baseline) == (0 if operation == "delete" else 2 if operation == "split" else 1)
    for key in ("option_a", "option_b"):
        items = result["scenarios"][key]["items"]
        assert items[:-1] == new_baseline
        assert items[-1]["id"] == own["id"]
    assert raw == before


def test_scene_context_matches_authoritative_metric_areas_and_stable_ids():
    from app.spatial_editor import scene_geometry

    raw = fixture()
    before = deepcopy(raw)
    checked = validate_workspace(WorkspaceInput(**raw), BOUNDS)
    context = scene_geometry(WorkspaceInput(**raw), BOUNDS, True)["context"]
    assert shape(context["boundary"]).equals_exact(metric(raw["boundary"]), 1e-8)
    assert set(context["targets"]) == {target["id"] for target in raw["targets"]}
    for target in checked["targets"]:
        assert shape(context["targets"][target["id"]]).area == pytest.approx(
            target["area_m2"], abs=1e-6
        )
    assert raw == before


def test_read_only_member_can_project_context_but_cannot_edit_or_save(database):
    from sqlalchemy.orm import Session

    from app.main import spatial_edit, spatial_scene
    from app.models import Membership, ProjectGrant
    from app.workspace import get_workspace, restore_workspace, save_workspace
    from tests.test_access_foundation import create_org, create_project

    owner, reader = uuid4(), uuid4()
    with Session(database) as session:
        org = create_org(session, owner)
        project = create_project(session, org, owner)
        session.add(
            Membership(organisation_id=org, user_id=reader, capabilities=["studio", "read_project"])
        )
        session.add(
            ProjectGrant(project_id=project.id, user_id=reader, capabilities=["read_project"])
        )
        session.commit()
        data = WorkspaceInput(**fixture())
        save_workspace(session, org, project.id, owner, data)
        assert spatial_scene(org, project.id, data, reader, session, True)["context"]["targets"]
        with pytest.raises(APIError) as edit_error:
            spatial_edit(
                org,
                project.id,
                EditInput(
                    workspace=data,
                    scenario="option_a",
                    ids=[data.scenarios["option_a"].items[0].id],
                    operation="move",
                    east_m=1,
                ),
                reader,
                session,
            )
        assert edit_error.value.status_code == 403
        with pytest.raises(APIError):
            save_workspace(session, org, project.id, reader, data)
        with pytest.raises(APIError) as restore_error:
            restore_workspace(session, org, project.id, reader, 1, 1)
        assert restore_error.value.status_code == 403
        assert get_workspace(session, org, project.id, owner)["revision"] == 1


def test_scene_read_is_project_scoped_and_does_not_save(database):
    from sqlalchemy.orm import Session

    from app.main import spatial_scene
    from app.workspace import get_workspace
    from tests.test_access_foundation import create_org, create_project

    actor, foreign = uuid4(), uuid4()
    with Session(database) as session:
        org = create_org(session, actor)
        project = create_project(session, org, actor)
        data = WorkspaceInput(**fixture())
        assert spatial_scene(org, project.id, data, actor, session)["option_a"]
        assert get_workspace(session, org, project.id, actor)["revision"] == 0
        with pytest.raises(APIError):
            spatial_scene(org, project.id, data, foreign, session)
        mapped = spatial_scene(org, project.id, data, actor, session, True)
        assert mapped["frame"]["supported"]
        assert get_workspace(session, org, project.id, actor)["revision"] == 0
        with pytest.raises(APIError):
            spatial_scene(org, project.id, data, foreign, session, True)


def test_map_frame_matches_exact_projection_and_keeps_quantity_geometry():
    from math import cos, log, pi, radians, tan

    from app.spatial_editor import scene_geometry

    raw = fixture()
    before = deepcopy(raw)
    mapped = scene_geometry(WorkspaceInput(**raw), BOUNDS, True)
    frame = mapped["frame"]
    assert frame["supported"] and frame["residual_m"] < 0.05
    assert mapped["shapes"] == scene_geometry(WorkspaceInput(**raw), BOUNDS)
    inverse = Transformer.from_crs(32647, 4326, always_xy=True)
    for dx, dy in [(0, 0), (30, 10), (-50, 20)]:
        lon, lat = inverse.transform(frame["origin"][0] + dx, frame["origin"][1] + dy)
        exact = [(lon + 180) / 360, (1 - log(tan(pi / 4 + radians(lat) / 2)) / pi) / 2]
        predicted = [
            frame["mercator"][i] + dx * frame["east"][i] + dy * frame["north"][i] for i in (0, 1)
        ]
        scale = 1 / (2 * pi * 6378137 * cos(radians(lat)))
        assert max(abs(a - b) / scale for a, b in zip(exact, predicted, strict=True)) < 0.05
    assert raw == before


def test_map_frame_rejects_excessive_display_distortion():
    from app.spatial_editor import map_frame

    # Large high-latitude envelope exercises the fallback independently of the
    # smaller workspace admission limits.
    checked = {"metric_crs": "EPSG:32632", "boundary": polygon(9, 70, 9.1, 70.1)}
    frame = map_frame(checked)
    assert not frame["supported"] and frame["residual_m"] > 0.05
