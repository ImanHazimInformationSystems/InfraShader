from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError
from pyproj import Transformer
from shapely import transform
from shapely.geometry import shape
from sqlalchemy.orm import Session

from app import calculations, shade_studies, workspace
from app.errors import APIError
from app.models import ProjectGrant
from tests.test_workflow_integration import initialise
from tests.test_workspace import fixture_workspace


def inputs(raw, **updates):
    return shade_studies.StudyInput(
        **{
            "target_id": raw["targets"][0]["id"],
            "expected_revision": 1,
            "request_key": uuid4(),
            "bands": [
                {
                    "name": "Use",
                    "start": "2026-03-21T10:00:00+08:00",
                    "end": "2026-03-21T11:30:00+08:00",
                }
            ],
            **updates,
        }
    )


def test_duration_weights_contribution_union_and_heatmap_area_conservation(monkeypatch):
    monkeypatch.setattr(
        "app.domain.shade.solar_position", lambda *a: {"azimuth_deg": 90.0, "elevation_deg": 45.0}
    )
    raw = fixture_workspace()
    existing = deepcopy(raw["scenarios"]["option_a"]["items"][0])
    existing.update(id=str(uuid4()), status="existing")
    raw["scenarios"]["baseline"]["items"] = [existing]
    data = workspace.validate_workspace(
        workspace.WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14]
    )
    study = shade_studies.calculate(data, inputs(raw))
    assert [s["minutes"] for s in study["samples"]] == [60, 30]
    assert [s["timestamp"] for s in study["samples"]] == [
        "2026-03-21T02:30:00+00:00",
        "2026-03-21T03:15:00+00:00",
    ]
    result = study["scenarios"]["option_a"]
    assert result["contributions_area_hours"]["additional_canopies"] == pytest.approx(0, abs=1e-8)
    assert all(source["standalone_area_hours"] > 0 for source in study["sources"])
    assert sum(result["contributions_area_hours"].values()) == pytest.approx(
        result["shaded_area_hours"]
    )
    integral = 0
    for cell in result["heatmap"]:
        # Project each polygon part using the same target frame; conserve area-time.
        geom = shape(cell["geometry"])
        for part in [geom] if geom.geom_type == "Polygon" else geom.geoms:
            forward = Transformer.from_crs("EPSG:4326", study["metric_crs"], always_xy=True)
            area = transform(part, forward.transform, interleaved=False).area
            integral += area * cell["properties"]["coverage_percent"] / 100 * 1.5
    assert integral == pytest.approx(result["shaded_area_hours"], rel=1e-6)


def test_unsupported_periods_are_not_zero_shade(monkeypatch):
    raw = fixture_workspace()
    data = workspace.validate_workspace(
        workspace.WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14]
    )
    elevations = iter([-10.0, 2.0])
    monkeypatch.setattr(
        "app.domain.shade.solar_position",
        lambda *a: {"azimuth_deg": 90.0, "elevation_deg": next(elevations)},
    )
    result = shade_studies.calculate(data, inputs(raw))
    assert result["night_minutes"] == 60
    assert result["low_sun_minutes"] == 30
    assert result["supported_minutes"] == 0 and not result["complete"]
    assert result["scenarios"]["option_a"]["mean_coverage_percent"] is None
    assert result["scenarios"]["option_a"]["heatmap"] == []


@pytest.mark.parametrize(
    "bands",
    [
        [{"name": "Bad", "start": "2026-03-21T10:00:00", "end": "2026-03-21T11:00:00"}],
        [{"name": "Bad", "start": "2026-03-21T10:00:00Z", "end": "2026-03-21T09:00:00Z"}],
        [
            {"name": "A", "start": "2026-03-21T10:00:00Z", "end": "2026-03-21T12:00:00Z"},
            {"name": "B", "start": "2026-03-21T19:00:00+08:00", "end": "2026-03-21T21:00:00+08:00"},
        ],
    ],
)
def test_invalid_or_overlapping_times_reject(bands):
    with pytest.raises(ValidationError):
        inputs(fixture_workspace(), bands=bands)


def test_sample_capacity_and_saved_target_reject():
    raw = fixture_workspace()
    with pytest.raises(ValidationError, match="32 samples"):
        inputs(
            raw,
            step_minutes=15,
            bands=[{"name": "Day", "start": "2026-03-21T00:00:00Z", "end": "2026-03-22T00:00:00Z"}],
        )
    with pytest.raises(ValueError, match="saved target"):
        shade_studies.calculate(raw, inputs(raw, target_id=uuid4()))


def test_real_saved_study_idempotency_grants_stale_revision_and_artifact_isolation(database):
    org, project, actor, reader, foreign = initialise(database, "contractor_proposal")
    raw = fixture_workspace()
    with Session(database) as session:
        workspace.save_workspace(session, org, project, actor, workspace.WorkspaceInput(**raw))
        grant = session.get(ProjectGrant, (project, reader))
        grant.capabilities = ["read_project"]
        session.commit()
        with pytest.raises(APIError):
            shade_studies.run(session, org, project, reader, inputs(raw))
        assert shade_studies.list_saved(session, org, project, reader)["items"] == []
        data = inputs(raw)
        saved = shade_studies.run(session, org, project, actor, data)
        assert saved["kind"] == "shade_study" and not saved["stale"]
        assert shade_studies.run(session, org, project, actor, data)["id"] == saved["id"]
        with pytest.raises(APIError):
            shade_studies.run(session, org, project, foreign, data)
        with pytest.raises(APIError):
            shade_studies.list_saved(session, org, project, foreign)
        with pytest.raises(APIError, match="different study"):
            shade_studies.run(
                session, org, project, actor, data.model_copy(update={"step_minutes": 30})
            )
        assert calculations.get_artifacts(session, org, project, actor)["items"] == []
        raw["expected_revision"] = 1
        workspace.save_workspace(session, org, project, actor, workspace.WorkspaceInput(**raw))
        assert shade_studies.list_saved(session, org, project, actor)["items"][0]["stale"]
        with pytest.raises(APIError):
            shade_studies.run(session, org, project, actor, inputs(raw))


def test_heatmap_polygon_parts_drop_zero_area_contacts():
    from shapely import GeometryCollection, LineString, box

    parts = shade_studies.polygon_parts(
        GeometryCollection([box(0, 0, 1, 1), LineString([(2, 0), (2, 1)])])
    )
    assert len(parts) == 1 and parts[0].area == 1


def test_short_final_segment_does_not_receive_equal_sample_weight(monkeypatch):
    raw = fixture_workspace()
    raw["targets"][0]["geometry"] = deepcopy(raw["scenarios"]["option_a"]["items"][0]["geometry"])
    data = workspace.validate_workspace(
        workspace.WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14]
    )
    monkeypatch.setattr(
        "app.domain.shade.solar_position",
        lambda timestamp, *args: {
            "azimuth_deg": 90.0,
            "elevation_deg": 20.0 if timestamp.minute == 30 else 70.0,
        },
    )
    result = shade_studies.calculate(data, inputs(raw))
    first, last = [s["scenarios"]["option_a"]["coverage_percent"] for s in result["samples"]]
    assert last - first > 10
    mean = result["scenarios"]["option_a"]["mean_coverage_percent"]
    assert mean == pytest.approx((2 * first + last) / 3)
    assert abs(mean - (first + last) / 2) > 1
