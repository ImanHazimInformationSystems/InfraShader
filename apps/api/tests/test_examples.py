import json
from collections import Counter
from decimal import Decimal
from io import BytesIO

import pytest
from fastapi import Response
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app import calculations, change_register, examples, offer_extraction, owner_review, workspace
from app.design_preview import design_preview
from app.errors import APIError
from app.example_pdf import render
from app.models import Project, ReviewFile


def test_offer_pdf_has_a_readable_text_layer():
    pdf = render([("title", "Example"), ("body", "S02  Walking loop  RM 12,345.60")], footer="x")
    text = PdfReader(BytesIO(pdf)).pages[0].extract_text()
    assert "RM 12,345.60" in text
    result = offer_extraction.extract(pdf, "application/pdf")
    assert result["status"] == "ok"
    assert result["suggestions"][0]["amount"] == "12345.60"


def test_three_flat_designs_are_complete_and_distinct():
    designs = examples.offline_examples()
    assert list(designs) == ["studio_a", "studio_b", "studio_c"]
    for value in designs.values():
        priced = [v for v in value["scope"].values() if v is not None]
        assert sum(priced) == value["total"]
        preview = value["preview"]
        assert preview["format"] == "infrashader-design-preview-v1"
        assert 9000 < preview["site"]["area_m2"] < 9500
        kinds = {item["kind"] for item in preview["items"]}
        assert {"tree", "path", "area", "object", "bench"} <= kinds
    assert designs["studio_a"]["preview"]["counts"]["tree"] == 19
    assert designs["studio_b"]["preview"]["counts"]["tree"] == 28
    assert designs["studio_c"]["preview"]["counts"]["tree"] == 10
    assert designs["studio_b"]["preview"]["counts"]["gazebo"] == 1
    assert designs["studio_c"]["scope"]["S04"] is None  # Example C excludes the play area.
    assert designs["studio_c"]["total"] < designs["studio_a"]["total"]
    assert designs["studio_a"]["total"] < designs["studio_b"]["total"]


def items_by_kind(preview):
    return Counter((i["kind"], i.get("asset"), i["status"]) for i in preview["items"])


@pytest.mark.integration
def test_examples_install_once_and_tally_between_studio_and_review(database):
    from tests.test_workflow_integration import initialise

    org, _, admin, member, foreign = initialise(database, "contractor_proposal")
    designs = examples.offline_examples()
    with Session(database) as session:
        studio = examples.install_example(org, "studio", admin, session, Response())
        assert [p.example for p in studio] == ["studio_a", "studio_b", "studio_c"]
        again = examples.install_example(org, "studio", admin, session, Response())
        assert [p.id for p in again] == [p.id for p in studio]
        listed = examples.list_examples(org, admin, session)
        assert listed["studio_b"] == str(studio[1].id)
        assert examples.list_examples(org, member, session)["studio_a"] is None

        for project in studio:
            saved = workspace.get_workspace(session, org, project.id, admin)
            option = saved["data"]["scenarios"]["option_a"]
            assert option.get("terrain") is None  # flat ground: no terrain editing
            assert option["ground_paint"]
            artifacts = calculations.get_artifacts(session, org, project.id, admin)["items"]
            current = next(
                a
                for a in artifacts
                if a["kind"] == "estimate"
                and not a["stale"]
                and a["payload"]["scenario"] == "option_a"
            )
            expected = designs[project.example]
            # Studio estimate == the total shown and offered in the review example.
            assert Decimal(current["payload"]["selling_total"]) == expected["total"]
            # Same items on site in the Studio project and in the review preview.
            preview = design_preview(saved["data"], "option_a")
            assert items_by_kind(preview) == items_by_kind(expected["preview"])
            issued = [a for a in artifacts if a["kind"] == "proposal" and not a["stale"]]
            assert len(issued) == 1 and issued[0]["payload"]["template"] == 3

        changes = change_register.list_changes(org, studio[0].id, admin, session)
        assert changes["items"][0]["payload"]["revised_issue"]["version"] == 2

        review = examples.install_example(org, "review", admin, session, Response())[0]
        assert review.example == "review" and review.purpose == "developer_decision"
        result = owner_review.evaluation(org, review.id, admin, session)
        assert result["official"]
        rows = {row["bidder_name"]: row for row in result["results"]}
        first = rows["Example Landscape Studio"]
        assert first["rank"] == 1 and first["weighted_score"] == "77.00"
        assert Decimal(first["quoted_total"]) == designs["studio_a"]["total"]
        second = rows["Taman Indah Landscape Works (fictional)"]
        assert second["rank"] == 2
        assert Decimal(second["quoted_total"]) == designs["studio_b"]["total"]
        assert Decimal(second["budget_gap"]) > 0  # over budget, still comparable
        incomplete = rows["Kenari Build & Plant (fictional)"]
        assert incomplete["readiness"] == "unpriced" and incomplete["rank"] is None
        assert incomplete["missing_scope"] == ["S04"]
        assert Decimal(incomplete["quoted_total"]) == designs["studio_c"]["total"]

        files = session.query(ReviewFile).filter_by(project_id=review.id).all()
        assert len(files) == 6
        snapshots = [json.loads(f.content) for f in files if f.content_type == "application/json"]
        assert {s["total"] for s in snapshots} == {str(v["total"]) for v in designs.values()}
        for snapshot in snapshots:
            match = next(v for v in designs.values() if str(v["total"]) == snapshot["total"])
            assert items_by_kind(snapshot["preview"]) == items_by_kind(match["preview"])
        pdfs = [f for f in files if f.content_type == "application/pdf"]
        assert all(
            offer_extraction.extract(f.content, f.content_type)["status"] == "ok" for f in pdfs
        )
        assert examples.list_examples(org, admin, session)["review"] == str(review.id)
        with pytest.raises(APIError):
            examples.install_example(org, "studio", foreign, session, Response())
        session.rollback()

        # Archiving one example rebuilds only that one.
        session.get(Project, studio[1].id).archived = True
        session.commit()
        fresh = examples.install_example(org, "studio", admin, session, Response())
        assert fresh[0].id == studio[0].id and fresh[2].id == studio[2].id
        assert fresh[1].id != studio[1].id and fresh[1].example == "studio_b"


@pytest.mark.integration
def test_outdated_examples_are_archived_and_rebuilt(database):
    from app import projects
    from tests.test_workflow_integration import initialise

    org, _, admin, _, _ = initialise(database, "developer_decision")
    with Session(database) as session:
        brief = examples.review_brief().model_copy(deep=True)
        brief.details.opportunity.source = "Built-in example project"  # an earlier version
        legacy = projects.create_project(session, org, admin, brief)
        session.get(Project, legacy.id).example = "review"
        session.commit()
        assert examples.list_examples(org, admin, session)["review"] is None
        review = examples.install_example(org, "review", admin, session, Response())[0]
        assert review.id != legacy.id
        old = session.get(Project, legacy.id)
        session.refresh(old)
        assert old.archived and old.example == "review"  # kept, only archived
