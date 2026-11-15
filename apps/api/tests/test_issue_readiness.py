"""Issue policy parity against disposable PostGIS; no production data or services."""

from copy import deepcopy
from datetime import date, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import calculations, workspace
from app.errors import APIError
from app.issue_readiness import refusal_code
from app.models import Artifact, BriefCheckpoint, Project, Workspace
from tests.test_pricing_readiness import prepared
from tests.test_workspace import fixture_workspace

pytestmark = pytest.mark.integration


def change(db, project_id, data, case, org, admin):
    project = db.get(Project, project_id)
    saved = db.get(Workspace, project_id)
    if case == "output_purpose":
        project.purpose = "developer_decision"
    elif case == "project_archived":
        project.archived = True
    elif case == "reference_review":
        draft = deepcopy(saved.data)
        draft["targets"][0]["reference_review_required"] = True
        saved.data = draft
    elif case == "target_zone":
        saved.data = {**saved.data, "targets": []}
    elif case == "stale_brief":
        data.expected_project_revision = 2
    elif case == "brief_not_confirmed":
        db.add(
            BriefCheckpoint(
                project_id=project_id,
                project_revision=1,
                version=1,
                created_by=admin,
                payload={"status": "not_confirmed", "issue_policy": "draft_only"},
            )
        )
    elif case == "brief_incomplete":
        project.problem = ""
    elif case == "estimate_missing":
        data.estimate_id = uuid4()
    elif case == "estimate_stale":
        project.revision += 1
        data.expected_project_revision = project.revision
    elif case == "estimate_option":
        data.preferred_option = "option_b"
    elif case == "estimate_incomplete":
        draft = fixture_workspace()
        draft["expected_revision"] = 1
        workspace.save_workspace(db, org, project_id, admin, workspace.WorkspaceInput(**draft))
        estimate = calculations.run_estimate(
            db,
            org,
            project_id,
            admin,
            calculations.EstimateInput(
                expected_revision=2, request_key=uuid4(), scenario="option_a", method="markup"
            ),
        )
        data.estimate_id = UUID(estimate["id"])
    elif case == "proposal_validity":
        data.valid_until = date.today() - timedelta(days=1)
    elif case == "proposal_fields":
        data.customer_narrative = ""
    elif case == "price_review":
        data.valid_until = date(2100, 1, 1)
    elif case == "change_summary":
        calculations.issue_snapshot(db, org, project_id, admin, data, "proposal")
        data.request_key = uuid4()
    elif case == "maintenance_checklist":
        data.maintenance_plan = [
            calculations.DraftMaintenanceTask(
                task="", frequency="", responsibility="client", included_in_price=False
            )
        ]
    elif case == "required_text":
        data.review_notes = ""
    elif case == "evidence_unavailable":
        data.evidence_ids = [uuid4()]
    db.commit()


CASES = [
    ("output_purpose", "brief"),
    ("project_archived", "project"),
    ("reference_review", "reference"),
    ("target_zone", "target"),
    ("stale_brief", "reload"),
    ("brief_not_confirmed", "checkpoint"),
    ("brief_incomplete", "brief"),
    ("estimate_missing", "estimate"),
    ("estimate_stale", "estimate"),
    ("estimate_option", "estimate"),
    ("estimate_incomplete", "pricing"),
    ("proposal_validity", "proposal"),
    ("proposal_fields", "proposal"),
    ("price_review", "pricing_review"),
    ("change_summary", "proposal"),
    ("maintenance_checklist", "proposal"),
    ("required_text", "proposal"),
    ("evidence_unavailable", "proposal"),
]


@pytest.mark.parametrize("code,fix", CASES)
def test_each_rule_is_actionable_and_real_issue_refuses(database, code, fix):
    org, project, admin, _, _, _, _, issue = prepared(database, date(2099, 12, 31))
    with Session(database) as db:
        change(db, project, issue, code, org, admin)
        result = calculations.issue_readiness(db, org, project, admin, issue, "proposal")
        blocker = next(i for i in result["issues"] if i["code"] == code)
        assert blocker["fix"] == fix and blocker["why"]
        assert blocker["severity"] == "blocks_issue" and not result["ready"]
        with pytest.raises(APIError) as error:
            calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        assert error.value.code == refusal_code(code)


def test_all_independent_problems_are_returned_together_and_preview_matches(database):
    org, project, admin, _, _, _, _, issue = prepared(database, date(2099, 12, 31))
    with Session(database) as db:
        for case in ("change_summary", "target_zone", "reference_review"):
            # Keep a traced work item when the target list is empty.
            if case == "reference_review":
                saved = db.get(Workspace, project)
                draft = deepcopy(saved.data)
                draft["scenarios"]["option_a"]["items"][0]["reference_review_required"] = True
                saved.data = draft
                db.commit()
            else:
                change(db, project, issue, case, org, admin)
        for case in (
            "brief_not_confirmed",
            "brief_incomplete",
            "estimate_stale",
            "proposal_validity",
            "proposal_fields",
            "maintenance_checklist",
            "required_text",
        ):
            change(db, project, issue, case, org, admin)
        result = calculations.issue_readiness(db, org, project, admin, issue, "proposal")
        assert {
            "change_summary",
            "target_zone",
            "reference_review",
            "brief_not_confirmed",
            "brief_incomplete",
            "estimate_stale",
            "proposal_validity",
            "proposal_fields",
            "maintenance_checklist",
            "required_text",
        } <= {i["code"] for i in result["issues"]}
        draft = calculations.issue_snapshot(
            db, org, project, admin, issue, "proposal", preview=True
        )
        assert draft["draft_issues"] == [i["message"] for i in result["issues"]]
        assert draft["maintenance_plan"]["tasks"][0]["task"] == calculations.NOT_PROVIDED


def test_ready_then_issue_and_readiness_does_not_write(database):
    org, project, admin, _, _, _, _, issue = prepared(database, date(2099, 12, 31))
    with Session(database) as db:
        before = db.scalar(select(func.count()).select_from(Artifact))
        result = calculations.issue_readiness(db, org, project, admin, issue, "proposal")
        assert result["ready"] and result["issues"] == []
        assert not db.new and not db.dirty and not db.deleted
        assert db.scalar(select(func.count()).select_from(Artifact)) == before
        issued = calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        assert issued["payload"]["version"] == 1


def test_every_simultaneously_applicable_rule_is_reported_in_one_pass(database):
    org, project, admin, _, _, rate, _, issue = prepared(database)
    with Session(database) as db:
        issue.pricing_override_reason = "Fixture-only authorised review"
        calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        draft = fixture_workspace()
        draft["expected_revision"] = 1
        first = draft["scenarios"]["option_a"]["items"][0]
        second = deepcopy(first)
        second.update(id=str(uuid4()), name="Unpriced fixture work")
        first["rate_id"] = rate["id"]
        draft["scenarios"]["option_a"]["items"].append(second)
        workspace.save_workspace(db, org, project, admin, workspace.WorkspaceInput(**draft))
        total = calculations.run_estimate(
            db,
            org,
            project,
            admin,
            calculations.EstimateInput(
                expected_revision=2, request_key=uuid4(), scenario="option_a", method="markup"
            ),
        )
        record = db.get(Project, project)
        record.revision = 2
        record.archived = True
        record.purpose = "developer_decision"
        for field in ("problem", "intended_users", "desired_outcome", "use_periods"):
            setattr(record, field, "")
        saved = db.get(Workspace, project)
        source = deepcopy(saved.data)
        source["targets"] = []
        source["scenarios"]["option_a"]["items"][0]["reference_review_required"] = True
        saved.data = source
        db.add(
            BriefCheckpoint(
                project_id=project,
                project_revision=2,
                version=1,
                created_by=admin,
                payload={"status": "not_confirmed", "issue_policy": "draft_only"},
            )
        )
        db.commit()
        data = calculations.ReadinessInput(
            request_key=uuid4(),
            expected_project_revision=1,
            preferred_option="option_b",
            estimate_id=total["id"],
            confirmed=False,
            evidence_ids=[uuid4()],
            maintenance_plan=[
                {
                    "task": "",
                    "frequency": "",
                    "responsibility": "client",
                    "included_in_price": False,
                }
            ],
        )
        result = calculations.issue_readiness(db, org, project, admin, data, "proposal")
        codes = {i["code"] for i in result["issues"]}
        assert codes == {
            "output_purpose",
            "project_archived",
            "reference_review",
            "target_zone",
            "stale_brief",
            "brief_not_confirmed",
            "brief_incomplete",
            "estimate_option",
            "estimate_stale",
            "estimate_incomplete",
            "unpriced_item",
            "proposal_validity",
            "proposal_fields",
            "price_review",
            "change_summary",
            "maintenance_checklist",
            "required_text",
            "evidence_unavailable",
            "issue_confirmation",
        }
        assert len([i for i in result["issues"] if i["code"] == "brief_incomplete"]) == 4
        assert len([i for i in result["issues"] if i["code"] == "required_text"]) == 4
        assert not db.new and not db.dirty


def test_reader_and_foreign_access_never_disclose_private_pricing(database):
    org, project, admin, reader, foreign, _, _, issue = prepared(database)
    with Session(database) as db:
        result = calculations.issue_readiness(db, org, project, reader, issue, "proposal")
        assert "price_review" in {i["code"] for i in result["issues"]}
        for private in (
            "Private source",
            "supplier_name",
            "amount",
            "profit",
            "below_cost",
            "CORE",
        ):
            assert private not in str(result)
        assert not db.new and not db.dirty
        with pytest.raises(APIError):
            calculations.issue_readiness(db, org, project, foreign, issue, "proposal")


def test_endpoint_accepts_incomplete_inputs_and_only_reads(database):
    from fastapi.testclient import TestClient
    from sqlalchemy import event

    from app.auth import current_user
    from app.db import database_session
    from app.main import app

    org, project, admin, reader, foreign, _, _, issue = prepared(database)
    identity = [reader]
    statements = []

    def record_sql(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement.lower())

    def connection():
        with Session(database) as db:
            yield db

    prior = app.dependency_overrides.copy()
    app.dependency_overrides[database_session] = connection
    app.dependency_overrides[current_user] = lambda: identity[0]
    event.listen(database, "before_cursor_execute", record_sql)
    try:
        client = TestClient(app)
        url = f"/api/v1/organisations/{org}/projects/{project}/issue-readiness?kind=proposal"
        body = {
            "request_key": str(uuid4()),
            "expected_project_revision": 1,
            "maintenance_plan": [
                {
                    "task": "",
                    "frequency": "",
                    "responsibility": "client",
                    "included_in_price": False,
                }
            ],
        }
        result = client.post(url, json=body)
        assert result.status_code == 200
        codes = {i["code"] for i in result.json()["issues"]}
        assert {"estimate_missing", "required_text", "maintenance_checklist"} <= codes
        assert not any(s.lstrip().startswith(("insert", "update", "delete")) for s in statements)
        assert not any("for update" in s for s in statements)
        identity[0] = foreign
        assert client.post(url, json=body).status_code == 404
    finally:
        event.remove(database, "before_cursor_execute", record_sql)
        app.dependency_overrides.clear()
        app.dependency_overrides.update(prior)
