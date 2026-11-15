from datetime import date
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app import brief_checkpoint as checkpoint
from app import calculations, projects
from app.errors import APIError
from app.models import Evidence, Project
from app.schemas import BriefScope, ProjectUpdate
from tests.test_pricing_readiness import prepared
from tests.test_workflow_integration import initialise


def test_acknowledgement_needs_external_details_and_evidence_and_sourced_facts():
    with pytest.raises(ValidationError):
        checkpoint.CheckpointInput(
            expected_project_revision=1,
            expected_checkpoint_version=0,
            status="acknowledged",
            note="An internal tick is not evidence",
        )
    with pytest.raises(ValidationError):
        checkpoint.CheckpointInput(
            expected_project_revision=1,
            expected_checkpoint_version=0,
            status="not_confirmed",
            person="Someone",
            note="Not confirmed",
        )
    with pytest.raises(ValidationError):
        BriefScope(facts=[{"text": "Unknown service location", "state": "unknown", "source": ""}])


@pytest.mark.integration
def test_exact_revision_checkpoint_history_revocation_and_immutability(database):
    org, pid, user, member, foreign = initialise(database, "contractor_proposal")
    with Session(database) as db:
        scope = {
            "deliverables": "Layout and proposal",
            "inclusions": "Paving",
            "exclusions": "Survey and construction",
            "intended_use": "Client review",
            "unresolved_questions": "Verify services",
            "facts": [
                {"text": "Service route unknown", "source": "Client briefing", "state": "unknown"}
            ],
        }
        projects.update_project(
            db,
            org,
            pid,
            user,
            ProjectUpdate(
                expected_revision=1, details={"scope": scope, "budget_min": "100", "budget": "1000"}
            ),
        )
        evidence = Evidence(
            project_id=pid,
            object_path="fixture/acknowledgement",
            content_type="application/pdf",
            size_bytes=10,
            sha256="a" * 64,
            description="Client email",
            source_note="Fixture acknowledgement only",
            created_by=user,
        )
        db.add(evidence)
        db.commit()
        evidence_id = evidence.id
        data = checkpoint.CheckpointInput(
            expected_project_revision=2,
            expected_checkpoint_version=0,
            status="acknowledged",
            person="External client",
            confirmation_date=date(2026, 1, 1),
            method="Email referencing brief",
            note="Fixture: unresolved services explicitly retained",
            evidence_ids=[evidence_id],
        )
        with pytest.raises(APIError):
            checkpoint.record(org, pid, data, foreign, db)
        with pytest.raises(APIError) as forbidden_policy:
            checkpoint.record(
                org, pid, data.model_copy(update={"issue_policy": "qualified_issue"}), member, db
            )
        assert forbidden_policy.value.status_code == 403
        with pytest.raises(APIError):
            checkpoint.record(
                org, pid, data.model_copy(update={"evidence_ids": [uuid4()]}), user, db
            )
        result = checkpoint.record(org, pid, data, user, db)
        assert result["status"] == "acknowledged" and result["brief_revision"] == 2
        assert result["scope"]["unresolved_questions"] == "Verify services"
        assert result["acknowledgement"]["evidence"][0]["sha256"] == "a" * 64
        assert "object_path" not in str(result)
        with pytest.raises(APIError) as stale:
            checkpoint.record(org, pid, data, user, db)
        assert stale.value.status_code == 409
        projects.update_project(
            db, org, pid, user, ProjectUpdate(expected_revision=2, problem="New scope question")
        )
        current = checkpoint.history(org, pid, user, db)
        assert current["current"]["status"] == "not_confirmed"
        assert current["current"]["issue_policy"] == "draft_only"
        assert current["current"]["acknowledgement"] is None
        assert current["items"][0]["data"]["person"] == "External client"
        # Even restoring the old brief creates a new draft, never revives agreement.
        projects.restore_project(db, org, pid, user, 2, 3)
        assert checkpoint.snapshot(db, db.get(Project, pid))["status"] == "not_confirmed"
        new = checkpoint.record(
            org,
            pid,
            checkpoint.CheckpointInput(
                expected_project_revision=4,
                expected_checkpoint_version=1,
                status="not_confirmed",
                issue_policy="qualified_issue",
                note="Client discussion pending",
            ),
            user,
            db,
        )
        assert new["checkpoint_version"] == 2 and new["status"] == "not_confirmed"
        with pytest.raises(DBAPIError):
            db.execute(
                text("UPDATE brief_checkpoints SET payload='{}'::jsonb WHERE project_id=:pid"),
                {"pid": pid},
            )
            db.commit()
        db.rollback()
        assert (
            checkpoint.history(org, pid, user, db)["items"][-1]["data"]["person"]
            == "External client"
        )


@pytest.mark.integration
def test_draft_only_gate_and_frozen_qualified_proposal(database):
    org, pid, user, _, _, _, estimate, issue = prepared(database)
    with Session(database) as db:
        issue.pricing_override_reason = "Fixture review only"
        initial = checkpoint.record(
            org,
            pid,
            checkpoint.CheckpointInput(
                expected_project_revision=1,
                expected_checkpoint_version=0,
                status="not_confirmed",
                note="Await client review",
            ),
            user,
            db,
        )
        assert initial["issue_policy"] == "draft_only"
        preview = calculations.issue_snapshot(db, org, pid, user, issue, "proposal", preview=True)
        assert preview["brief_checkpoint"]["status"] == "not_confirmed"
        with pytest.raises(APIError) as blocked:
            calculations.issue_snapshot(db, org, pid, user, issue, "proposal")
        assert blocked.value.code == "brief_not_confirmed"
        db.rollback()
        checkpoint.record(
            org,
            pid,
            checkpoint.CheckpointInput(
                expected_project_revision=1,
                expected_checkpoint_version=1,
                status="not_confirmed",
                issue_policy="qualified_issue",
                note="Issue for discussion; no agreed brief claimed",
            ),
            user,
            db,
        )
        issued = calculations.issue_snapshot(db, org, pid, user, issue, "proposal")
        assert issued["payload"]["brief_checkpoint"]["checkpoint_version"] == 2
        checkpoint.record(
            org,
            pid,
            checkpoint.CheckpointInput(
                expected_project_revision=1,
                expected_checkpoint_version=2,
                status="not_confirmed",
                note="Pause issuing",
            ),
            user,
            db,
        )
        retry = calculations.issue_snapshot(db, org, pid, user, issue, "proposal")
        assert retry["payload"]["brief_checkpoint"]["checkpoint_version"] == 2
        assert retry["id"] == issued["id"]


@pytest.mark.integration
def test_acknowledged_proposal_freezes_exact_scope_and_evidence(database):
    org, pid, user, _, _, _, _, issue = prepared(database)
    with Session(database) as db:
        projects.update_project(
            db,
            org,
            pid,
            user,
            ProjectUpdate(
                expected_revision=1,
                details={
                    "scope": {
                        "deliverables": "Layout",
                        "inclusions": "Canopy",
                        "exclusions": "Construction",
                        "intended_use": "Review",
                        "unresolved_questions": "Verify services",
                    }
                },
            ),
        )
        evidence = Evidence(
            project_id=pid,
            object_path="fixture/ack",
            content_type="application/pdf",
            size_bytes=10,
            sha256="b" * 64,
            description="Acknowledgement fixture",
            source_note="External client fixture",
            created_by=user,
        )
        db.add(evidence)
        db.commit()
        eid = evidence.id
        checkpoint.record(
            org,
            pid,
            checkpoint.CheckpointInput(
                expected_project_revision=2,
                expected_checkpoint_version=0,
                status="acknowledged",
                person="Client",
                confirmation_date=date(2026, 1, 1),
                method="Recorded review",
                note="Unresolved services retained",
                evidence_ids=[eid],
            ),
            user,
            db,
        )
        estimate = calculations.run_estimate(
            db,
            org,
            pid,
            user,
            calculations.EstimateInput(
                expected_revision=1,
                request_key=uuid4(),
                scenario="option_a",
                method="markup",
                percent=20,
            ),
        )
        issue.estimate_id = estimate["id"]
        issue.expected_project_revision = 2
        issue.pricing_override_reason = "Fixture review"
        issued = calculations.issue_snapshot(db, org, pid, user, issue, "proposal")
        saved = issued["payload"]["brief_checkpoint"]
        assert saved["status"] == "acknowledged" and saved["brief_revision"] == 2
        assert saved["scope"]["unresolved_questions"] == "Verify services"
        evidence.description = "Changed later"
        db.commit()
        assert saved["acknowledgement"]["evidence"][0]["description"] == "Acknowledgement fixture"
