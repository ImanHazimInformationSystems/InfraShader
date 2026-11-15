from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError
from pyproj import Transformer

from app.plan_reference import PlanReference, calibrate
from app.workspace import WorkspaceInput, validate_workspace
from tests.test_workspace import fixture_workspace


def test_private_persistence_conflict_and_replacement_review(database):
    from sqlalchemy.orm import Session

    from app.errors import APIError
    from app.models import Evidence
    from app.workspace import get_workspace, reference_preview, restore_workspace, save_workspace
    from tests.test_access_foundation import create_org, create_project

    user, foreign = uuid4(), uuid4()
    with Session(database) as db:
        org = create_org(db, user)
        project = create_project(db, org, user)
        reference = plan()
        db.add(
            Evidence(
                id=reference.evidence_id,
                project_id=project.id,
                object_path=f"fixture/{uuid4()}.jpg",
                content_type="image/jpeg",
                size_bytes=100,
                sha256="b" * 64,
                description="Synthetic plan",
                source_note="Test fixture",
                created_by=user,
            )
        )
        db.commit()
        with pytest.raises(APIError):
            reference_preview(db, org, project.id, foreign, reference)
        preview = reference_preview(db, org, project.id, user, reference)
        data = fixture_workspace()
        data["plan_reference"] = reference.model_dump(mode="json")
        data["scenarios"]["option_a"]["items"][0]["reference_calibration"] = preview[
            "calibration_id"
        ]
        first = save_workspace(db, org, project.id, user, WorkspaceInput(**data))
        assert first["revision"] == 1
        assert (
            get_workspace(db, org, project.id, user)["data"]["plan_reference"]["calibration_id"]
            == preview["calibration_id"]
        )
        with pytest.raises(APIError, match="workspace changed"):
            save_workspace(db, org, project.id, user, WorkspaceInput(**data))
        data["expected_revision"] = 1
        data["plan_reference"]["distance_m"] = 110
        second = save_workspace(db, org, project.id, user, WorkspaceInput(**data))
        assert second["data"]["scenarios"]["option_a"]["items"][0]["reference_review_required"]
        restored = restore_workspace(db, org, project.id, user, 1, 2)
        assert restored["revision"] == 3
        assert not restored["data"]["scenarios"]["option_a"]["items"][0][
            "reference_review_required"
        ]
        another = create_project(db, org, user)
        with pytest.raises(APIError):
            reference_preview(db, org, another.id, user, reference)
        row = db.get(Evidence, reference.evidence_id)
        row.archived = True
        db.commit()
        with pytest.raises(APIError):
            reference_preview(db, org, project.id, user, reference)


def plan():
    return PlanReference(
        evidence_id=uuid4(),
        source_name="synthetic.png",
        source_sha256="a" * 64,
        rights_confirmed=True,
        width=1000,
        height=500,
        point_a=(0, 0),
        point_b=(1000, 0),
        anchor=(101.682, 3.132),
        distance_m=100,
        bearing_deg=90,
        uncertainty_m=0.5,
        source_note="Synthetic 100 m control line; not field evidence",
    )


def test_metric_scale_orientation_and_display_only_changes():
    reference = plan()
    bounds = [101.681, 3.131, 101.683, 3.133]
    result = calibrate(reference, "EPSG:32647", bounds)
    transform = Transformer.from_crs("EPSG:4326", "EPSG:32647", always_xy=True)
    a, b, c, d = [transform.transform(*p) for p in result["corners"]]
    assert b[0] - a[0] == pytest.approx(100, abs=1e-6)
    assert d[1] - a[1] == pytest.approx(-50, abs=1e-6)
    assert result["metres_per_pixel"] == 0.1
    assert (
        calibrate(
            reference.model_copy(update={"opacity": 0.2, "locked": False}), "EPSG:32647", bounds
        )["calibration_id"]
        == result["calibration_id"]
    )
    assert (
        calibrate(reference.model_copy(update={"bearing_deg": 0}), "EPSG:32647", bounds)[
            "calibration_id"
        ]
        != result["calibration_id"]
    )


@pytest.mark.parametrize(
    "patch",
    [
        {"rights_confirmed": False},
        {"point_b": (0, 0)},
        {"uncertainty_m": 0},
        {"distance_m": float("nan")},
        {"width": 8192, "height": 8192},
        {"point_a": (-1, 0)},
    ],
)
def test_invalid_reference_rejected(patch):
    with pytest.raises(ValidationError):
        PlanReference(**{**plan().model_dump(), **patch})


def test_replacement_flags_traces_and_never_moves_geometry():
    data = fixture_workspace()
    data["plan_reference"] = plan().model_dump(mode="json")
    first = validate_workspace(WorkspaceInput(**data), [101.681, 3.131, 101.683, 3.133])
    item = data["scenarios"]["option_a"]["items"][0]
    original = deepcopy(item["geometry"])
    item["reference_calibration"] = first["plan_reference"]["calibration_id"]
    data["plan_reference"]["distance_m"] = 101
    replaced = validate_workspace(WorkspaceInput(**data), [101.681, 3.131, 101.683, 3.133])
    assert replaced["scenarios"]["option_a"]["items"][0]["reference_review_required"]
    assert replaced["scenarios"]["option_a"]["items"][0]["geometry"] == original


def test_outside_anchor_and_oversized_extent_rejected():
    with pytest.raises(ValueError, match="locator"):
        calibrate(plan(), "EPSG:32647", [0, 0, 1, 1])
    ref = plan().model_copy(update={"point_b": (10, 0), "distance_m": 5000})
    with pytest.raises(ValueError, match="10 km"):
        calibrate(ref, "EPSG:32647", [101, 3, 102, 4])
