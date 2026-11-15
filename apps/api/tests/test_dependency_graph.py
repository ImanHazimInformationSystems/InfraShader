"""K02: dependency-aware change impact through the actual graph, not a generic stale label.

source (rate version / brief / design geometry) -> quantity -> explicit rate selection
-> estimate -> proposal readiness. Selected rate versions and issued outputs never change silently.
"""

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app import calculations, workspace
from app.errors import APIError
from app.projects import update_project
from app.schemas import ProjectUpdate
from tests.test_pricing_readiness import prepared
from tests.test_workspace import fixture_workspace, polygon


def codes(result):
    return {w["code"] for w in result["warnings"]}


def stale(db, org, pid, user):
    return {a["id"]: a["stale"] for a in calculations.get_artifacts(db, org, pid, user)["items"]}


@pytest.mark.integration
def test_rate_brief_and_design_changes_propagate_without_silent_rebinding(database):
    org, pid, admin, member, foreign, rate, estimate, issue = prepared(database)
    issue.pricing_override_reason = "Fixture validity reviewed"
    with Session(database) as db:
        first = calculations.estimate_readiness(db, org, pid, admin, estimate["id"])
        assert "superseded_rate" not in codes(first)

        # 1. Rate source revised: new version v2; estimate stays bound to v1 and flags review.
        calculations.create_rate(
            db,
            org,
            admin,
            calculations.RateInput(
                code="CORE",
                description="Fixture cost revised",
                unit="m2",
                basis="cost",
                amount="12",
                effective_date=date(2020, 1, 1),
                source_note="Revised private source",
            ),
        )
        after_rate = calculations.estimate_readiness(db, org, pid, admin, estimate["id"])
        assert "superseded_rate" in codes(after_rate)
        message = next(w for w in after_rate["warnings"] if w["code"] == "superseded_rate")
        assert "v1" in message["message"] and "v2" in message["message"]
        stored = db.get(calculations.Artifact, estimate["id"]).payload
        assert {line["rate"]["version"] for line in stored["lines"]} == {1}
        assert (
            stale(db, org, pid, admin)[estimate["id"]] is False
        )  # rate change is not a design change
        # Issuing still requires an authorised review of the warning.
        issue.pricing_override_reason = ""
        with pytest.raises(APIError) as caught:
            calculations.issue_snapshot(db, org, pid, admin, issue, "proposal")
        assert caught.value.code == "price_review"
        db.rollback()

        # 2. Brief change: estimate becomes stale and issuing from it is refused.
        update_project(
            db, org, pid, admin, ProjectUpdate(expected_revision=1, problem="Hotter terrace")
        )
        assert stale(db, org, pid, admin)[estimate["id"]] is True
        issue.pricing_override_reason = "Reviewed"
        with pytest.raises(APIError) as caught:
            calculations.issue_snapshot(db, org, pid, admin, issue, "proposal")
        assert caught.value.code == "stale_brief"
        db.rollback()

        # 3. Re-estimate deliberately on the new brief (still v1: the rate is bound in the design).
        second = calculations.run_estimate(
            db,
            org,
            pid,
            admin,
            calculations.EstimateInput(
                expected_revision=1,
                request_key=uuid4(),
                scenario="option_a",
                method="markup",
                percent=20,
            ),
        )
        assert stale(db, org, pid, admin)[second["id"]] is False

        # 4. Design change (geometry) -> new quantity; the estimate is stale and cannot be issued.
        current = workspace.get_workspace(db, org, pid, admin)["data"]
        original = current["scenarios"]["option_a"]["items"][0]
        before = original["quantity"]["value"]
        draft = fixture_workspace()
        draft["expected_revision"] = 1
        item = draft["scenarios"]["option_a"]["items"][0]
        item.update(id=original["id"], rate_id=rate["id"])
        item["geometry"] = polygon(101.6812, 3.1312, 101.6814, 3.1313)
        saved = workspace.save_workspace(db, org, pid, admin, workspace.WorkspaceInput(**draft))
        after = saved["data"]["scenarios"]["option_a"]["items"][0]["quantity"]["value"]
        assert after == pytest.approx(before * 2, rel=1e-3)
        assert stale(db, org, pid, admin)[second["id"]] is True
        issue.estimate_id = second["id"]
        issue.expected_project_revision = 2
        with pytest.raises(APIError) as caught:
            calculations.issue_snapshot(db, org, pid, admin, issue, "proposal")
        assert caught.value.code == "issue_not_ready"
