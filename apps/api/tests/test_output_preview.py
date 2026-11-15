"""Draft output preview: unfinished inputs are allowed and listed, nothing is persisted, and
the same unfinished input can never issue."""

from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import calculations, workspace
from app.errors import APIError
from app.models import Artifact
from tests.test_pricing_readiness import prepared
from tests.test_workspace import fixture_workspace


def unfinished(estimate_id):
    return calculations.PreviewInput(
        request_key=uuid4(),
        estimate_id=estimate_id,
        expected_project_revision=1,
        preferred_option="option_a",
    )


@pytest.mark.integration
def test_draft_preview_lists_what_blocks_issue_and_persists_nothing(database):
    org, project, admin, _, _, _, estimate, _ = prepared(database)
    with Session(database) as db:
        draft = calculations.issue_snapshot(
            db, org, project, admin, unfinished(estimate["id"]), "proposal", preview=True
        )
        assert draft["draft"] is True
        issues = " ".join(draft["draft_issues"])
        for expected in (
            "Review criteria",
            "Review notes",
            "Assumptions",
            "Exclusions",
            "validity date",
            "Scope for the client",
            "Programme",
            "Maintenance",
        ):
            assert expected in issues
        assert draft["assumptions"] == calculations.NOT_PROVIDED
        assert draft["valid_until"] == "Not set"
        # The client output contract still carries no rate, cost, margin or profit.
        assert not {"cost_base", "profit", "lines", "percent"} & set(draft)
        proposals = db.scalar(
            select(func.count())
            .select_from(Artifact)
            .where(Artifact.project_id == project, Artifact.kind == "proposal")
        )
        assert proposals == 0
        # Issuing with the same unfinished input is still refused.
        with pytest.raises(APIError) as refused:
            calculations.issue_snapshot(
                db, org, project, admin, unfinished(estimate["id"]), "proposal"
            )
        assert refused.value.code == "proposal_validity"


@pytest.mark.integration
def test_draft_preview_labels_an_out_of_date_total(database):
    org, project, admin, _, _, rate, estimate, issue = prepared(database)
    with Session(database) as db:
        draft_input = fixture_workspace()
        draft_input["expected_revision"] = 1
        draft_input["scenarios"]["option_a"]["items"][0]["rate_id"] = rate["id"]
        workspace.save_workspace(db, org, project, admin, workspace.WorkspaceInput(**draft_input))
        draft = calculations.issue_snapshot(
            db, org, project, admin, unfinished(estimate["id"]), "proposal", preview=True
        )
        assert any("out of date" in issue for issue in draft["draft_issues"])
        issue.pricing_override_reason = "Fixture review only"
        with pytest.raises(APIError) as refused:
            calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        assert refused.value.code == "issue_not_ready"
