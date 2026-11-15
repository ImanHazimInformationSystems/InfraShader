from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.errors import APIError
from app.spatial_editor import EditInput, edit_draft
from app.workspace import WorkspaceInput, validate_workspace
from tests.test_roadwork import BOUNDS
from tests.test_workspace import fixture_workspace


def test_saved_strokes_survive_boundary_edit_and_history_restore(database):
    from sqlalchemy.orm import Session

    from app.workspace import restore_workspace, save_workspace
    from tests.test_access_foundation import create_org, create_project
    from tests.test_workspace import polygon

    raw = fixture_workspace()
    raw["targets"] = []
    raw["scenarios"]["option_a"]["items"] = []
    raw["scenarios"]["option_a"]["ground_paint"] = [
        {"texture": "meadow", "radius_m": 10, "points": [[101.682, 3.132]]}
    ]
    # A previously admitted stroke is clipped by the new boundary on display,
    # rather than preventing an otherwise valid site edit.
    shrunk = deepcopy(raw)
    shrunk["boundary"] = polygon(101.681, 3.131, 101.6815, 3.1315)
    assert validate_workspace(WorkspaceInput(**shrunk), BOUNDS)["scenarios"]["option_a"][
        "ground_paint"
    ]
    actor = uuid4()
    with Session(database) as db:
        org = create_org(db, actor)
        project = create_project(db, org, actor)
        save_workspace(db, org, project.id, actor, WorkspaceInput(**raw))
        raw["expected_revision"] = 1
        raw["scenarios"]["option_a"]["ground_paint"] = []
        save_workspace(db, org, project.id, actor, WorkspaceInput(**raw))
        restored = restore_workspace(db, org, project.id, actor, 1, 2)
        assert restored["revision"] == 3
        assert restored["data"]["scenarios"]["option_a"]["ground_paint"][0]["texture"] == "meadow"
        assert restored["data"]["scenarios"]["option_a"]["items"] == []


@pytest.mark.parametrize("texture", ["lawn", "meadow", "fine", "dry", "deep", "wild", "erase"])
def test_visual_strokes_do_not_create_quantities_or_cross_options(texture):
    raw = fixture_workspace()
    original = deepcopy(raw)
    before = validate_workspace(WorkspaceInput(**raw), BOUNDS)
    painted = edit_draft(
        EditInput(
            workspace=raw,
            scenario="option_a",
            operation="paint",
            paint_stroke={"texture": texture, "radius_m": 10, "points": [[101.682, 3.132]]},
        ),
        BOUNDS,
    )
    assert painted["scenarios"]["option_a"]["items"] == before["scenarios"]["option_a"]["items"]
    assert painted["scenarios"]["option_a"]["ground_paint"][0]["texture"] == texture
    assert painted["scenarios"]["option_b"]["ground_paint"] == []
    assert painted["scenarios"]["baseline"]["ground_paint"] == []
    assert raw == original


def test_edge_strokes_clear_capacity_and_invalid_inputs():
    raw = fixture_workspace()
    edge = {"texture": "lawn", "radius_m": 20, "points": [[101.681, 3.131]]}
    raw["scenarios"]["option_a"]["ground_paint"] = [edge]
    assert validate_workspace(WorkspaceInput(**raw), BOUNDS)["scenarios"]["option_a"][
        "ground_paint"
    ]
    cleared = edit_draft(
        EditInput(workspace=raw, scenario="option_a", operation="clear_paint"), BOUNDS
    )
    assert cleared["scenarios"]["option_a"]["ground_paint"] == []
    with pytest.raises(APIError, match="selected site|Unsupported ground-paint"):
        edit_draft(
            EditInput(
                workspace=raw,
                scenario="option_a",
                operation="paint",
                paint_stroke={**edge, "points": [[0, 0]]},
            ),
            BOUNDS,
        )
    for invalid in [
        {"texture": "unknown"},
        {"radius_m": 0},
        {"radius_m": 101},
        {"points": [[float("nan"), 3.132]]},
        {"points": [[101.682, 3.132]] * 65},
    ]:
        with pytest.raises(ValidationError):
            EditInput(
                workspace=raw,
                scenario="option_a",
                operation="paint",
                paint_stroke={**edge, **invalid},
            )
    raw["scenarios"]["option_a"]["ground_paint"] = [edge] * 128
    with pytest.raises(APIError, match="128 ground strokes"):
        edit_draft(
            EditInput(workspace=raw, scenario="option_a", operation="paint", paint_stroke=edge),
            BOUNDS,
        )
