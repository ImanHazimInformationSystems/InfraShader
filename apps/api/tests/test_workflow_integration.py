from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import date, datetime
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app import calculations, projects, workspace
from app.errors import APIError
from app.models import Evidence, Membership, Organisation
from app.schemas import ProjectCreate
from tests.test_workspace import fixture_workspace

pytestmark = pytest.mark.integration


def initialise(database, purpose):
    with Session(database) as session:
        admin, member, foreign = uuid4(), uuid4(), uuid4()
        org = Organisation(name="Workflow fixture")
        other = Organisation(name="Other tenant")
        session.add_all([org, other])
        session.flush()
        org_id, other_id = org.id, other.id
        session.add_all(
            [
                Membership(
                    organisation_id=org_id, user_id=admin, role="administrator", capabilities=[]
                ),
                Membership(organisation_id=org_id, user_id=member, role="member", capabilities=[]),
                Membership(
                    organisation_id=other_id, user_id=foreign, role="administrator", capabilities=[]
                ),
            ]
        )
        session.commit()
        project = projects.create_project(
            session,
            org_id,
            admin,
            ProjectCreate(
                name="Full workflow",
                purpose=purpose,
                stakeholder="Test stakeholder",
                problem="Exposed courtyard",
                intended_users="Visitors",
                desired_outcome="Compare supported scope",
                use_periods="Weekday noon",
                site={"bounds": [101.68, 3.13, 101.69, 3.14]},
            ),
        )
    return org_id, project.id, admin, member, foreign


@pytest.mark.parametrize("purpose", ["developer_decision", "contractor_proposal"])
def test_real_saved_geometry_analysis_estimate_issue_and_audience(database, purpose):
    org, project_id, admin, member, foreign = initialise(database, purpose)
    developer = purpose == "developer_decision"
    with Session(database) as session:
        rate = calculations.create_rate(
            session,
            org,
            admin,
            calculations.RateInput(
                code="CANOPY",
                description="Explicit test fixture rate",
                unit="m2",
                basis="indicative_budget" if developer else "cost",
                amount="50",
                effective_date=date(2026, 10, 11),
                source_note="Testing only; not a market price",
            ),
        )
        draft = fixture_workspace()
        draft["scenarios"]["option_a"]["items"][0]["rate_id"] = rate["id"]
        if developer:
            draft["scenarios"]["option_b"]["items"] = deepcopy(
                draft["scenarios"]["option_a"]["items"]
            )
            draft["scenarios"]["option_b"]["items"][0]["id"] = str(uuid4())
        saved = workspace.save_workspace(
            session, org, project_id, admin, workspace.WorkspaceInput(**draft)
        )
        assert saved["revision"] == 1
        assert (
            projects.list_projects(session, org, admin, False, 100, 0, stage="option").items[0].id
            == project_id
        )
    with Session(database) as session:
        assert workspace.get_workspace(session, org, project_id, member)["data"] == saved["data"]
        with pytest.raises(APIError):
            workspace.get_workspace(session, org, project_id, foreign)
        with pytest.raises(APIError) as conflict:
            workspace.save_workspace(
                session, org, project_id, admin, workspace.WorkspaceInput(**draft)
            )
        assert conflict.value.status_code == 409
        session.rollback()
        analysis = calculations.run_analysis(
            session,
            org,
            project_id,
            member,
            calculations.AnalysisInput(
                expected_revision=1,
                request_key=uuid4(),
                timestamp=datetime.fromisoformat("2026-03-21T12:00:00+08:00"),
                target_id=saved["data"]["targets"][0]["id"],
            ),
        )
        assert analysis["payload"]["scenarios"]["option_a"]["coverage_percent"] > 0
        estimate_input = calculations.EstimateInput(
            expected_revision=1,
            request_key=uuid4(),
            scenario="option_a",
            method="indicative" if developer else "margin",
            percent=0 if developer else 20,
        )
        if not developer:
            with pytest.raises(APIError) as denied:
                calculations.run_estimate(session, org, project_id, member, estimate_input)
            assert denied.value.status_code == 403
            session.rollback()
        estimate = calculations.run_estimate(session, org, project_id, admin, estimate_input)
        assert estimate["payload"]["complete"]
        assert (
            projects.list_projects(session, org, admin, False, 100, 0, stage="estimate").items[0].id
            == project_id
        )
        safe = next(
            item
            for item in calculations.get_artifacts(session, org, project_id, member)["items"]
            if item["kind"] == "estimate"
        )
        assert "cost_base" not in safe["payload"] and "profit" not in safe["payload"]
        assert safe["payload"]["takeoff"][0]["description"]
        if not developer:
            assert "unit_price" not in safe["payload"]["takeoff"][0]
            assert "line_total" not in safe["payload"]["takeoff"][0]
        else:
            assert safe["payload"]["takeoff"][0]["price_basis"] == "indicative"
        kind = "developer_brief" if developer else "proposal"
        photo = Evidence(
            project_id=project_id,
            object_path=f"fixture/{uuid4()}",
            content_type="image/jpeg",
            size_bytes=10,
            sha256="a" * 64,
            description="Site observation",
            source_note="Test source",
            observations="Needs verification",
            target_ids=[],
            created_by=admin,
        )
        session.add(photo)
        session.commit()
        photo_id = photo.id
        issue = calculations.IssueInput(
            customer_narrative="A shaded waiting space with sourced scope.",
            evidence_ids=[photo_id],
            request_key=uuid4(),
            estimate_id=estimate["id"],
            expected_project_revision=1,
            preferred_option="option_a",
            criteria=["Supported shade", "Indicative affordability"],
            review_notes="Fixture review",
            assumptions="Flat ground, fixture dimensions",
            exclusions="No tree shade or field accuracy claim",
            confirmed=True,
        )
        with pytest.raises(APIError):
            calculations.issue_snapshot(session, org, project_id, member, issue, kind)
        session.rollback()
        before_preview = calculations.get_artifacts(session, org, project_id, admin)["items"]
        preview = calculations.issue_snapshot(
            session, org, project_id, admin, issue, kind, preview=True
        )
        assert preview["draft"] is True
        assert (
            calculations.get_artifacts(session, org, project_id, admin)["items"] == before_preview
        )
        with pytest.raises(APIError):
            calculations.issue_snapshot(session, org, project_id, member, issue, kind, preview=True)
        session.rollback()
        issued = calculations.issue_snapshot(session, org, project_id, admin, issue, kind)
        retry = calculations.issue_snapshot(session, org, project_id, admin, issue, kind)
        assert retry["id"] == issued["id"]
        assert (
            projects.list_projects(session, org, admin, False, 100, 0, stage=kind).items[0].id
            == project_id
        )
        assert projects.list_projects(session, org, admin, False, 100, 0, stage="brief").total == 0
        forbidden = {
            "cost",
            "cost_total",
            "cost_base",
            "margin",
            "percent",
            "profit",
            "rate",
            "amount",
        }

        def keys(value):
            if isinstance(value, dict):
                for key, child in value.items():
                    yield key
                    yield from keys(child)
            elif isinstance(value, list):
                for child in value:
                    yield from keys(child)

        assert forbidden.isdisjoint(keys(issued["payload"]))
        assert forbidden.isdisjoint(keys(preview))
        assert "draft" not in issued["payload"]
        assert preview["version"] == issued["payload"]["version"]
        assert issued["payload"]["shade"]["status"] == "omitted"
        assert issued["payload"]["customer_narrative"] == issue.customer_narrative
        assert (
            issued["payload"]["selected_scope"][0]["geometry"]
            == draft["scenarios"]["option_a"]["items"][0]["geometry"]
        )
        assert issued["payload"]["site_evidence"][0]["description"] == "Site observation"
        assert "object_path" not in issued["payload"]["site_evidence"][0]
        photo.description = "Later change"
        session.commit()
        assert issued["payload"]["site_evidence"][0]["description"] == "Site observation"
        with pytest.raises(APIError) as unavailable_evidence:
            calculations.issue_snapshot(
                session,
                org,
                project_id,
                admin,
                issue.model_copy(update={"request_key": uuid4(), "evidence_ids": [uuid4()]}),
                kind,
            )
        assert unavailable_evidence.value.status_code == 404
        session.rollback()
        if developer:
            budgets = issued["payload"]["option_budgets"]
            assert budgets["option_a"]["total"] == estimate["payload"]["selling_total"]
            assert budgets["option_b"] == {"status": "unavailable"}
            other = calculations.run_estimate(
                session,
                org,
                project_id,
                admin,
                calculations.EstimateInput(
                    expected_revision=1,
                    request_key=uuid4(),
                    scenario="option_b",
                    method="indicative",
                ),
            )
            both = calculations.issue_snapshot(
                session,
                org,
                project_id,
                admin,
                issue.model_copy(update={"request_key": uuid4()}),
                kind,
            )
            assert (
                both["payload"]["option_budgets"]["option_b"]["total"]
                == other["payload"]["selling_total"]
            )
            assert both["payload"]["option_budgets"]["option_b"]["estimate_id"] == other["id"]
        original = deepcopy(issued["payload"])
        draft["expected_revision"] = 1
        draft["scenarios"]["option_a"]["items"][0]["height_m"] = 4
        workspace.save_workspace(session, org, project_id, admin, workspace.WorkspaceInput(**draft))
        artifacts = calculations.get_artifacts(session, org, project_id, admin)["items"]
        historical = next(item for item in artifacts if item["id"] == issued["id"])
        assert historical["payload"] == original and historical["stale"]
        assert next(item for item in artifacts if item["id"] == estimate["id"])["stale"]
        issue.request_key = uuid4()
        with pytest.raises(APIError) as stale:
            calculations.issue_snapshot(session, org, project_id, admin, issue, kind)
        assert stale.value.status_code == 409
        session.rollback()
        with pytest.raises(DBAPIError):
            session.execute(
                text("UPDATE artifacts SET payload='{}'::jsonb WHERE id=:id"), {"id": issued["id"]}
            )
        session.rollback()


def test_concurrent_workspace_writers_cannot_overwrite(database):
    org, project_id, admin, _, _ = initialise(database, "developer_decision")
    barrier = Barrier(2)

    def writer():
        with Session(database) as session:
            barrier.wait(timeout=10)
            try:
                workspace.save_workspace(
                    session, org, project_id, admin, workspace.WorkspaceInput(**fixture_workspace())
                )
                return "saved"
            except APIError as error:
                return error.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: writer(), range(2)))
    assert sorted(map(str, results)) == ["409", "saved"]
