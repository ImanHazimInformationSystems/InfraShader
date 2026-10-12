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
