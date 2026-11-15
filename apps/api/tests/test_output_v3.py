"""L23/L22 output template v3: scaled plan sheet and structured maintenance checklist."""

from uuid import uuid4

import pytest
from pydantic import ValidationError
from pyproj import Geod, Proj
from sqlalchemy.orm import Session

from app import calculations, issued_files
from app.models import Artifact
from app.output_sheet import MaintenanceTask, plan_sheet
from tests.test_pricing_readiness import prepared
from tests.test_workspace import polygon

PDF = b"%PDF-1.4\n% v3 fixture\n%%EOF\n"


def test_plan_sheet_edges_match_independent_geodesic_with_grid_scale():
    boundary = polygon()
    sheet = plan_sheet(
        boundary, [], {"selected": []}, None, "2026-11-13T02:00:00+00:00", "Asia/Kuala_Lumpur"
    )
    assert sheet["status"] == "scaled" and sheet["crs"] == "EPSG:32647"
    south = sheet["site"]["edges"][0]
    # Independent route: ellipsoidal geodesic x UTM point scale factor at the edge midpoint.
    # Hand check: 0.002 deg x cos(3.131) x N(6,378,200.7 m) = 222.31 m; k ~ 1.00069 -> 222.46 m.
    geodesic = Geod(ellps="WGS84").inv(101.681, 3.131, 101.683, 3.131)[2]
    k = Proj("EPSG:32647").get_factors(101.682, 3.131).meridional_scale
    assert south["length_m"] == pytest.approx(geodesic * k, abs=0.02)
    assert 222.3 < south["length_m"] < 222.6
    # Grid convergence (~0.15 deg here) rotates the lon/lat square slightly in grid metres,
    # so the north-up extent is a little wider than the south edge, never narrower.
    assert south["length_m"] <= sheet["extent_m"]["width"] < south["length_m"] * 1.01
    ring = [(101.681, 3.131), (101.683, 3.131), (101.683, 3.133), (101.681, 3.133)]
    geodesic_area = abs(Geod(ellps="WGS84").polygon_area_perimeter(*zip(*ring, strict=True))[0])
    assert sheet["site"]["area_m2"] == pytest.approx(geodesic_area * k * k, rel=2e-4)
    assert sheet["date"] == "2026-11-13"
    assert any("not a measured survey" in line for line in sheet["uncertainty"])


def test_plan_sheet_is_explicitly_not_to_scale_when_projection_fails():
    crossing = polygon(101.9, 3.1, 102.1, 3.2)  # spans the UTM 47/48 boundary at 102 deg E
    sheet = plan_sheet(crossing, [], {}, None, "2026-11-13T00:00:00+00:00", "UTC")
    assert sheet["status"] == "not_to_scale" and "projected" in sheet["reason"]


def test_maintenance_task_contract_rejects_unknown_responsibility():
    with pytest.raises(ValidationError):
        MaintenanceTask(
            task="Sweep", responsibility="nobody", frequency="Weekly", included_in_price=False
        )


@pytest.mark.integration
def test_v3_issue_records_plan_sheet_checklist_and_renderer(database):
    org, project, admin, member, foreign, rate, estimate, issue = prepared(database)
    issue.pricing_override_reason = "Fixture rate reviewed"
    issue.maintenance_plan = [
        MaintenanceTask(
            task="Inspect canopy fixings",
            responsibility="contractor",
            frequency="Every 6 months for the first year",
            included_in_price=True,
            assumptions="Access from paved terrace",
        ),
        MaintenanceTask(
            task="Clear leaf litter from drainage",
            responsibility="client",
            frequency="Monthly",
            included_in_price=False,
        ),
    ]
    with Session(database) as db:
        issued = calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        payload = issued["payload"]
        assert payload["template"] == 3
        assert payload["manifest"]["schema"] == "infrashader-output-v3"
        plan = payload["plan_sheet"]
        assert plan["status"] == "scaled" and plan["crs"] == "EPSG:32647"
        drawn = plan["layers"]["selected"]
        assert [row["name"] for row in drawn] == ["Canopy"]
        assert drawn[0]["quantity"] == payload["selected_scope"][0]["quantity"]
        assert plan["layers"]["baseline"] == []
        checklist = payload["maintenance_plan"]
        assert [t["responsibility"] for t in checklist["tasks"]] == ["contractor", "client"]
        assert "does not generate maintenance recommendations" in checklist["basis"]
        # Confidentiality: the plan sheet carries no rate, cost or margin.
        text = str(plan) + str(checklist)
        for secret in ("rate_id", "cost", "margin", "markup", str(rate["id"])):
            assert secret not in text
        digest = issued_files.manifest_hash(db.get(Artifact, issued["id"]))
        meta = issued_files.retain(db, org, project, admin, issued["id"], PDF, digest)
        assert meta["renderer"] == "infrashader-react-pdf-v3"

        # An older v2 payload (no template key) keeps its v2 renderer identity.
        legacy = Artifact(
            project_id=project,
            kind="proposal",
            request_key=uuid4(),
            created_by=admin,
            workspace_revision=1,
            project_revision=1,
            payload={k: v for k, v in payload.items() if k not in ("template", "plan_sheet")}
            | {"version": 99},
        )
        db.add(legacy)
        db.commit()
        old = issued_files.retain(
            db, org, project, admin, legacy.id, PDF, issued_files.manifest_hash(legacy)
        )
        assert old["renderer"] == "infrashader-react-pdf-v2"
