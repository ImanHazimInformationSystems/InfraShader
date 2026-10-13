from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app import calculations
from app.errors import APIError
from tests.test_workflow_integration import initialise


@pytest.mark.integration
def test_catalogue_pages_literal_search_versions_and_restricted_access(database):
    org, _, admin, member, foreign = initialise(database, "contractor_proposal")
    with Session(database) as session:
        original = calculations.RateInput(
            code="SHADE_100%",
            description="Explicit canopy fixture",
            unit="m2",
            basis="cost",
            amount="50.25",
            effective_date=date(2026, 10, 12),
            source_note="Fixture only",
        )
        first = calculations.create_rate(session, org, admin, original)
        second = calculations.create_rate(
            session, org, admin, original.model_copy(update={"amount": Decimal("60")})
        )
        other = calculations.create_rate(
            session, org, admin, original.model_copy(update={"code": "OTHER", "unit": "item"})
        )
    with Session(database) as session:
        page = calculations.list_rates(session, org, admin, limit=1)
        assert page["total"] == 3 and page["items"][0]["id"] == other["id"]
        next_page = calculations.list_rates(session, org, admin, offset=1, limit=1)
        assert next_page["items"][0]["id"] == second["id"]
        final_page = calculations.list_rates(session, org, admin, offset=2, limit=1)
        assert final_page["items"][0]["id"] == first["id"]
        assert calculations.get_rate(session, org, admin, first["id"])["amount"] == "50.2500"
        assert calculations.list_rates(session, org, admin, query="%", unit="m2")["total"] == 2
        assert (
            calculations.list_rates(session, org, admin, query="canopy", basis="indicative_budget")[
                "total"
            ]
            == 0
        )
        restricted = calculations.list_rates(session, org, member, query="SHADE_")
        assert all("amount" not in item for item in restricted["items"])
        assert "amount" not in calculations.get_rate(session, org, member, first["id"])
        with pytest.raises(APIError):
            calculations.get_rate(session, org, foreign, first["id"])
        with pytest.raises(APIError):
            calculations.create_rate(session, org, member, original)


@pytest.mark.integration
def test_archive_hides_selection_without_changing_old_rate_and_checks_revision(database):
    org, _, actor, member, _ = initialise(database, "contractor_proposal")
    with Session(database) as session:
        rate = calculations.create_rate(
            session,
            org,
            actor,
            calculations.RateInput(
                code="ARCHIVE",
                category="Canopies",
                description="Fixture",
                unit="m2",
                basis="cost",
                amount="12.50",
                effective_date=date(2026, 10, 13),
                source_note="Test",
            ),
        )
        with pytest.raises(APIError):
            calculations.archive_rate(
                session,
                org,
                member,
                rate["id"],
                calculations.RateArchiveInput(expected_revision=1, archived=True),
            )
        session.rollback()
        archived = calculations.archive_rate(
            session,
            org,
            actor,
            rate["id"],
            calculations.RateArchiveInput(expected_revision=1, archived=True),
        )
        assert archived["metadata_revision"] == 2
        assert calculations.list_rates(session, org, actor)["total"] == 0
        assert (
            calculations.list_rates(session, org, actor, archived=True, category="canop")["total"]
            == 1
        )
        assert calculations.get_rate(session, org, actor, rate["id"])["amount"] == "12.5000"
        with pytest.raises(APIError):
            calculations.archive_rate(
                session,
                org,
                actor,
                rate["id"],
                calculations.RateArchiveInput(expected_revision=1, archived=False),
            )
        session.rollback()
        calculations.archive_rate(
            session,
            org,
            actor,
            rate["id"],
            calculations.RateArchiveInput(expected_revision=2, archived=False),
        )
        assert calculations.list_rates(session, org, actor)["total"] == 1
