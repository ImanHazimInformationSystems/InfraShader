from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.errors import APIError
from app.evidence import EvidenceArchive, archive_evidence
from app.models import Evidence
from app.site_constraints import SiteConstraint, constraint_summary
from app.workspace import (
    WorkspaceInput,
    get_workspace,
    restore_workspace,
    save_workspace,
    validate_workspace,
)
from tests.test_access_foundation import create_org, create_project
from tests.test_workspace import fixture_workspace

BOUNDS = [101.68, 3.13, 101.69, 3.14]


def record(**values):
    return {
        "id": str(uuid4()),
        "title": "Utility location",
        "category": "utility",
        "description": "Synthetic private observation",
        "source_type": "estimated",
        "source_note": "Synthetic source",
        "uncertainty": "Unverified location",
        **values,
    }


@pytest.mark.parametrize(
    "values",
    [
        {"geometry": {"type": "Point", "coordinates": [101.682, 3.132]}},
        {"status": "verified"},
        {"status": "site_check"},
        {"source_type": "measured"},
        {
            "status": "verified",
            "source_type": "map_derived",
            "verified_by": "Test verifier",
            "verification_date": "2026-11-01",
            "verification_reference": "Map label",
        },
        {
            "status": "resolved",
            "source_type": "supplied",
            "verified_by": "Test verifier",
            "verification_date": "2026-11-01",
            "verification_reference": "Document",
        },
    ],
)
def test_invalid_declarations_rejected(values):
    with pytest.raises(ValidationError):
        SiteConstraint(**record(**values))


def test_geotagged_observation_requires_inspection_date_and_retains_consent():
    values = record(
        category="observation",
        location_consent=True,
        consent_note="Synthetic permission",
        geometry={"type": "Point", "coordinates": [101.682, 3.132]},
    )
    with pytest.raises(ValidationError, match="inspection date"):
        SiteConstraint(**values)
    values["inspection_date"] = "2026-11-01"
    saved = SiteConstraint(**values).model_dump(mode="json")
    assert saved["inspection_date"] == "2026-11-01"
    assert saved["location_consent"] and saved["consent_note"] == "Synthetic permission"


def test_consent_geometry_links_and_verified_resolution():
    raw = fixture_workspace()
    item = record(
        source_type="supplied",
        status="resolved",
        responsible="Survey lead",
        verified_by="Test verifier",
        verification_date="2026-11-01",
        verification_reference="Supplied test inspection 123",
        resolution="Moved layout",
        geometry={"type": "Point", "coordinates": [101.682, 3.132]},
        location_consent=True,
        consent_note="Synthetic project permission",
        related_ids=[raw["targets"][0]["id"]],
    )
    raw["constraints"] = [item]
    result = validate_workspace(WorkspaceInput(**raw), BOUNDS)
    assert result["constraints"][0]["status"] == "resolved"
    assert result["constraints"][0]["related_ids"] == item["related_ids"]
    item["geometry"]["coordinates"] = [0, 0]
    with pytest.raises(APIError, match="boundary"):
        validate_workspace(WorkspaceInput(**raw), BOUNDS)
    item["geometry"] = None
    item["related_ids"] = [str(uuid4())]
    with pytest.raises(APIError, match="missing geometry"):
        validate_workspace(WorkspaceInput(**raw), BOUNDS)


def test_register_does_not_change_quantities_or_publish_private_details():
    raw = fixture_workspace()
    before = validate_workspace(WorkspaceInput(**raw), BOUNDS)
    raw["constraints"] = [record(critical=True, responsible="Private person")]
    after = validate_workspace(WorkspaceInput(**raw), BOUNDS)
    assert before["scenarios"] == after["scenarios"]
    summary = constraint_summary(after["constraints"])
    assert summary["critical_unverified"] == summary["unverified"] == 1
    assert "Private person" not in str(summary) and "Synthetic source" not in str(summary)
    raw["constraints"].append(deepcopy(raw["constraints"][0]))
    with pytest.raises(APIError, match="unique"):
        validate_workspace(WorkspaceInput(**raw), BOUNDS)


def test_issue_summary_is_frozen_without_private_constraint_fields(database):
    from datetime import date

    from app import calculations
    from tests.test_pricing_readiness import prepared

    org, project, actor, _, _, rate, _, issue = prepared(database, date(2099, 12, 31))
    with Session(database) as db:
        raw = fixture_workspace()
        raw["expected_revision"] = 1
        raw["scenarios"]["option_a"]["items"][0]["rate_id"] = rate["id"]
        raw["constraints"] = [record(critical=True, responsible="Confidential person")]
        save_workspace(db, org, project, actor, WorkspaceInput(**raw))
        estimate = calculations.run_estimate(
            db,
            org,
            project,
            actor,
            calculations.EstimateInput(
                expected_revision=2,
                request_key=uuid4(),
                scenario="option_a",
                method="markup",
                percent=20,
            ),
        )
        issue.estimate_id = estimate["id"]
        issued = calculations.issue_snapshot(db, org, project, actor, issue, "proposal")
        assert issued["payload"]["site_constraints"]["critical_unverified"] == 1
        assert "Confidential person" not in str(issued["payload"])
        assert "Synthetic private observation" not in str(issued["payload"])
        raw["expected_revision"] = 2
        raw["constraints"] = []
        save_workspace(db, org, project, actor, WorkspaceInput(**raw))
        assert issued["payload"]["site_constraints"]["total"] == 1


def test_evidence_scope_revision_restore_and_archive_guard(database):
    actor, foreign = uuid4(), uuid4()
    with Session(database) as db:
        org = create_org(db, actor)
        project = create_project(db, org, actor)
        other = create_project(db, org, actor)
        photo = Evidence(
            id=uuid4(),
            project_id=project.id,
            object_path=f"fixture/{uuid4()}.jpg",
            content_type="image/jpeg",
            size_bytes=100,
            sha256="b" * 64,
            description="Synthetic private photo",
            source_note="Fixture",
            created_by=actor,
        )
        db.add(photo)
        db.commit()
        raw = fixture_workspace()
        raw["constraints"] = [
            record(evidence_ids=[str(photo.id)], status="site_check", responsible="Site lead")
        ]
        save_workspace(db, org, project.id, actor, WorkspaceInput(**raw))
        with pytest.raises(APIError):
            get_workspace(db, org, project.id, foreign)
        with pytest.raises(APIError):
            save_workspace(db, org, project.id, foreign, WorkspaceInput(**raw))
        with pytest.raises(APIError, match="active private reference"):
            save_workspace(db, org, other.id, actor, WorkspaceInput(**raw))
        with pytest.raises(APIError, match="changed"):
            save_workspace(db, org, project.id, actor, WorkspaceInput(**raw))
        with pytest.raises(APIError, match="supports a site constraint"):
            archive_evidence(
                db,
                org,
                project.id,
                actor,
                photo.id,
                EvidenceArchive(expected_revision=photo.revision, archived=True),
            )
        raw["expected_revision"] = 1
        raw["constraints"][0]["source_note"] = "Updated source; original in revision history"
        save_workspace(db, org, project.id, actor, WorkspaceInput(**raw))
        restored = restore_workspace(db, org, project.id, actor, 1, 2)
        assert restored["revision"] == 3
        assert restored["data"]["constraints"][0]["source_note"] == "Synthetic source"
        assert (
            get_workspace(db, org, project.id, actor)["data"]["constraints"][0]["responsible"]
            == "Site lead"
        )
