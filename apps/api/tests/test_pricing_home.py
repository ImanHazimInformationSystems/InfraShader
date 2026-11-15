"""Pricing home: supplier records, draft pricing preview, states and restricted visibility."""

from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import calculations
from app.errors import APIError
from app.models import ProjectGrant
from app.schedules import pricing_preview, schedule_report
from app.workspace import WorkspaceInput, get_workspace, save_workspace
from tests.test_access_foundation import create_org, create_project
from tests.test_schedules import assembly, draft
from tests.test_workflow_integration import initialise


def rate_input(**patch):
    values = {
        "code": "BASE",
        "description": "Synthetic crushed base",
        "unit": "m3",
        "basis": "cost",
        "amount": "10",
        "effective_date": date.today() - timedelta(days=10),
        "valid_until": date.today() + timedelta(days=60),
        "source_note": "Testing only",
    }
    values.update(patch)
    return calculations.RateInput(**values)


def test_supplier_record_requires_a_named_supplier_and_quote_reference():
    assert rate_input().source_type == "user_entered"
    with pytest.raises(ValidationError, match="Name the supplier"):
        rate_input(source_type="price_list")
    with pytest.raises(ValidationError, match="quotation reference"):
        rate_input(source_type="supplier_quote", supplier_name="Fixture Quarry Sdn Bhd")
    quote = rate_input(
        source_type="supplier_quote",
        supplier_name="Fixture Quarry Sdn Bhd",
        quote_reference="Q-0001",
        exclusions="Delivery beyond 20 km",
    )
    assert quote.quote_reference == "Q-0001"
    with pytest.raises(ValidationError):
        rate_input(source_type="verified_by_supplier")


def test_supplier_details_are_restricted_and_versions_keep_their_own_record(database):
    org, _, user, reader, foreign = initialise(database, "contractor_proposal")
    with Session(database) as db:
        first = calculations.create_rate(
            db,
            org,
            user,
            rate_input(
                source_type="supplier_quote",
                supplier_name="Fixture Quarry Sdn Bhd",
                quote_reference="Q-0001",
                exclusions="Delivery beyond 20 km",
            ),
        )
        second = calculations.create_rate(db, org, user, rate_input(amount="12"))
        assert first["version"] == 1 and second["version"] == 2
        assert calculations.get_rate(db, org, user, first["id"])["supplier_name"] == (
            "Fixture Quarry Sdn Bhd"
        )
        # A new version is a separate record; it never rewrites the earlier supplier details.
        assert second["source_type"] == "user_entered" and second["supplier_name"] == ""
        assert calculations.get_rate(db, org, user, first["id"])["quote_reference"] == "Q-0001"
        # A member without internal pricing sees that a supplier exists, never who or the quote.
        hidden = calculations.get_rate(db, org, reader, first["id"])
        assert "amount" not in hidden
        assert hidden["supplier_name"] == "Restricted supplier"
        assert hidden["quote_reference"] == ""
        assert hidden["exclusions"] == "Delivery beyond 20 km"
        listed = calculations.list_rates(db, org, reader, query="BASE")["items"]
        assert all(item["quote_reference"] == "" for item in listed)
        with pytest.raises(APIError):
            calculations.create_rate(db, org, reader, rate_input(code="MEMBER"))
        with pytest.raises(APIError):
            calculations.get_rate(db, org, foreign, first["id"])


def priced_recipe(rate_id):
    recipe = assembly(pricing="components")
    recipe["components"][0]["rate_id"] = rate_id
    return recipe


def test_draft_preview_prices_unsaved_changes_without_saving(database):
    user = uuid4()
    with Session(database) as db:
        org = create_org(db, user)
        project = create_project(db, org, user)
        rate = calculations.create_rate(db, org, user, rate_input())
        raw = draft(assembly=priced_recipe(rate["id"]))
        save_workspace(db, org, project.id, user, WorkspaceInput(**raw))
        saved = schedule_report(db, org, project.id, user, "option_a")
        assert saved["summary"]["complete"] and saved["rows"][0]["state"] == "priced"
        assert saved["summary"]["priced_subtotal"] == saved["rows"][0]["total"]

        raw["expected_revision"] = 1
        layer = raw["scenarios"]["option_a"]["items"][0]["assembly"]["components"][0]
        layer["thickness_mm"] = 200
        preview = pricing_preview(db, org, project.id, user, WorkspaceInput(**raw), "option_a")
        assert preview["draft"] and preview["saved_revision"] == 1
        row = preview["rows"][0]
        assert row["unit"] == "m3" and row["unit_price"] == "10.0000"
        # Twice the thickness doubles the volume line (rounded per the stated 4dp policy).
        assert Decimal(row["total"]) == pytest.approx(Decimal(saved["rows"][0]["total"]) * 2, abs=1)
        assert row["review"] == []
        item_id = raw["scenarios"]["option_a"]["items"][0]["id"]
        assert preview["subtotals"][item_id] == row["total"]
        measured = preview["measures"][item_id]["schedule"][0]
        assert measured["value"] == row["quantity"] and measured["unit"] == "m3"
        assert None not in measured.values()
        # Nothing was saved: the workspace still has the 100 mm layer at revision 1.
        current = get_workspace(db, org, project.id, user)
        assert current["revision"] == 1
        component = current["data"]["scenarios"]["option_a"]["items"][0]["assembly"]["components"]
        assert component[0]["thickness_mm"] == 100

        # Option B is independent and has no proposed scope.
        other = pricing_preview(db, org, project.id, user, WorkspaceInput(**raw), "option_b")
        assert other["rows"] == [] and other["summary"]["complete"] is False


def test_preview_states_unit_mismatch_expired_unapproved_and_restricted(database):
    user = uuid4()
    with Session(database) as db:
        org = create_org(db, user)
        project = create_project(db, org, user)
        area_rate = calculations.create_rate(db, org, user, rate_input(code="AREA", unit="m2"))
        expired = calculations.create_rate(
            db,
            org,
            user,
            rate_input(
                code="OLD",
                effective_date=date.today() - timedelta(days=400),
                valid_until=date.today() - timedelta(days=30),
            ),
        )
        raw = draft(assembly=priced_recipe(area_rate["id"]))
        mismatch = pricing_preview(db, org, project.id, user, WorkspaceInput(**raw), "option_a")
        assert mismatch["rows"][0]["state"] == "unit_mismatch"
        assert mismatch["rows"][0]["total"] is None
        assert mismatch["summary"]["priced_subtotal"] == "0.00"
        assert mismatch["summary"]["complete"] is False
        assert mismatch["summary"]["unpriced"] == 1

        raw = draft(assembly=priced_recipe(expired["id"]))
        old = pricing_preview(db, org, project.id, user, WorkspaceInput(**raw), "option_a")
        assert old["rows"][0]["state"] == "priced"
        assert "expired" in old["rows"][0]["review"]
        assert old["summary"]["needs_review"] == 1

        recipe = priced_recipe(expired["id"])
        recipe["approved"] = False
        unapproved = pricing_preview(
            db, org, project.id, user, WorkspaceInput(**draft(assembly=recipe)), "option_a"
        )
        assert unapproved["rows"][0]["state"] == "recipe_not_approved"

        grant = db.get(ProjectGrant, (project.id, user))
        grant.capabilities = ["read_project"]
        db.commit()
        restricted = pricing_preview(db, org, project.id, user, WorkspaceInput(**raw), "option_a")
        assert restricted["rows"][0]["state"] == "restricted"
        assert restricted["rows"][0]["total"] is None
        assert restricted["rows"][0]["unit_price"] is None
        assert restricted["summary"]["priced_subtotal"] is None
        assert restricted["summary"]["complete"] is False
        with pytest.raises(APIError):
            pricing_preview(db, org, project.id, uuid4(), WorkspaceInput(**raw), "option_a")
