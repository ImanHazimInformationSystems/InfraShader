from copy import deepcopy
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import calculations
from app.domain.pricing import calculate_estimate
from app.errors import APIError
from app.models import ProjectGrant
from app.schedules import Assembly, Component, Plant, pricing_items, schedule_report
from app.workspace import WorkspaceInput, restore_workspace, save_workspace, validate_workspace
from tests.test_access_foundation import create_org, create_project
from tests.test_workspace import fixture_workspace

BOUNDS = [101.68, 3.13, 101.69, 3.14]


def plant():
    return Plant(
        code="P01",
        scientific_name="Synthetic species",
        common_name="Fixture plant",
        source="Synthetic test, not horticultural advice",
        nursery_size="Test pot",
        sun_water="Unverified",
        suitability="Unverified",
        maintenance="Test",
        method="square_spacing",
        spacing_m=2,
    ).model_dump(mode="json")


def assembly(**patch):
    return Assembly(
        code="A01",
        material="Synthetic paving",
        finish="Test finish",
        source="User fixture recipe",
        approved=True,
        components=[
            Component(
                code="base",
                name="Base layer",
                basis="volume",
                unit="m3",
                thickness_mm=100,
                wastage_percent=10,
            )
        ],
        **patch,
    ).model_dump(mode="json")


def draft(**patch):
    raw = fixture_workspace()
    item = raw["scenarios"]["option_a"]["items"][0]
    item.update(kind="area", height_m=None, height_source="", **patch)
    return raw


def canonical(raw):
    return validate_workspace(WorkspaceInput(**raw), BOUNDS)["scenarios"]["option_a"]["items"][0]


def test_plant_counts_preserve_sources_and_hidden_scope():
    record = {
        **plant(),
        "availability_date": "2026-10-30",
        "substitution": "Supplier review pending",
    }
    item = canonical(draft(plant=record, visible=False))
    assert item["quantity"]["calculated"]["unit"] == "item"
    assert item["quantity"]["value"] == 31
    assert item["schedule"][0]["source_unit"] == "m2"
    assert item["plant"]["nursery_size"] == "Test pot"
    assert item["plant"]["mature_crown_m"] == 0
    assert item["plant"]["availability_date"] == "2026-10-30"
    assert item["plant"]["substitution"] == "Supplier review pending"


def test_individual_and_line_spacing_and_fence_surface():
    raw = draft(plant={**plant(), "method": "explicit_count"})
    target = raw["scenarios"]["option_a"]["items"][0]
    target.update(kind="tree", count=3, geometry={"type": "Point", "coordinates": [101.682, 3.132]})
    assert canonical(raw)["quantity"]["value"] == 3
    target.update(
        kind="path",
        geometry={"type": "LineString", "coordinates": [[101.682, 3.132], [101.6821, 3.132]]},
    )
    target["plant"]["method"] = "line_spacing"
    assert canonical(raw)["quantity"]["value"] == 7
    target["plant"] = None
    target["assembly"] = assembly(use="fence", height_m=2, width_m=0.1)
    item = canonical(raw)
    assert Decimal(item["schedule"][0]["surface_m2"]) == Decimal(str(item["quantity"]["value"])) * 2


@pytest.mark.parametrize(
    "change", [{"spacing_m": 0}, {"spacing_m": float("nan")}, {"mature_crown_m": 101}]
)
def test_invalid_plant_metadata(change):
    with pytest.raises(ValidationError):
        Plant(**{**plant(), **change})


def test_spacing_dimension_and_override_guards():
    raw = draft(plant={**plant(), "method": "line_spacing"})
    with pytest.raises(APIError, match="requires a path"):
        canonical(raw)
    with pytest.raises(APIError, match="Remove quantity override"):
        canonical(draft(plant=plant(), quantity_override="10"))


def test_volume_conversion_wastage_and_pricing_once():
    recipe = assembly(pricing="components")
    rid = str(uuid4())
    recipe["components"][0]["rate_id"] = rid
    item = canonical(draft(assembly=recipe))
    expected = (Decimal(str(item["quantity"]["value"])) * Decimal("0.11")).quantize(
        Decimal("0.0001")
    )
    assert Decimal(item["schedule"][0]["value"]) == expected
    rows = pricing_items([item])
    assert len(rows) == 1 and rows[0]["parent_id"] == item["id"]
    rate = {"unit": "m3", "currency": "MYR", "basis": "cost", "amount": "10", "includes": []}
    result = calculate_estimate(
        rows,
        {rid: rate},
        currency="MYR",
        method="markup",
        percent=Decimal(0),
        wastage=Decimal(50),
        charges=[],
    )
    assert Decimal(result["cost_base"]) == (expected * 10).quantize(Decimal("0.01"))
    assert result["lines"][0]["wastage_percent"] == "0"


def test_road_takeoff_uses_explicit_area_and_layer_volume_rates():
    recipe = assembly(use="road", pricing="components")
    rate_id = str(uuid4())
    recipe["components"][0]["rate_id"] = rate_id
    item = canonical(draft(assembly=recipe))
    area = Decimal(str(item["quantity"]["value"]))
    expected_volume = (area * Decimal("0.1") * Decimal("1.1")).quantize(Decimal("0.0001"))
    assert item["quantity"]["calculated"]["unit"] == "m2"
    assert item["schedule"][0]["unit"] == "m3"
    assert Decimal(item["schedule"][0]["value"]) == expected_volume
    assert "thickness 100.0 mm" in item["schedule"][0]["formula"]

    priced = calculate_estimate(
        pricing_items([item]),
        {
            rate_id: {
                "unit": "m3",
                "currency": "MYR",
                "basis": "cost",
                "amount": "25",
                "includes": [],
            }
        },
        currency="MYR",
        method="markup",
        percent=Decimal(0),
        wastage=Decimal(40),
        charges=[],
    )
    assert Decimal(priced["cost_base"]) == (expected_volume * Decimal("25")).quantize(
        Decimal("0.01")
    )
    assert priced["lines"][0]["wastage_percent"] == "0"

    raw = draft(assembly=recipe)
    target = raw["scenarios"]["option_a"]["items"][0]
    target.update(
        kind="path",
        geometry={"type": "LineString", "coordinates": [[101.682, 3.132], [101.6821, 3.132]]},
    )
    with pytest.raises(APIError, match="deliberately drawn area polygon"):
        canonical(raw)

    with pytest.raises(ValidationError, match="require component pricing"):
        Assembly(**assembly(use="road", pricing="inclusive"))
    surface_recipe = assembly(use="road", pricing="components")
    surface_recipe["components"][0].update(basis="surface", unit="m2", thickness_mm=0)
    with pytest.raises(ValidationError, match="require explicit material components"):
        Assembly(**surface_recipe)


def test_recipe_approval_duplicate_and_dimension_guards():
    with pytest.raises(ValidationError, match="dimensionally"):
        Component(code="bad", name="Bad", basis="volume", unit="m", thickness_mm=100)
    recipe = assembly(pricing="components")
    with pytest.raises(APIError, match="parent inclusive rate"):
        canonical(draft(assembly=recipe, rate_id=str(uuid4())))
    recipe["approved"] = False
    item = canonical(draft(assembly=recipe))
    assert pricing_items([item])[0]["rate_id"] is None
    recipe = assembly()
    recipe["components"][0]["rate_id"] = str(uuid4())
    with pytest.raises(ValidationError, match="Inclusive pricing"):
        Assembly(**recipe)


def test_included_labour_cannot_be_charged_as_component_or_extra():
    recipe = assembly(pricing="components")
    a, b = str(uuid4()), str(uuid4())
    recipe["components"][0]["rate_id"] = a
    recipe["components"].append(
        Component(
            code="labour",
            name="Labour",
            category="labour",
            basis="per_surface",
            unit="h",
            rate_id=b,
        ).model_dump(mode="json")
    )
    item = canonical(draft(assembly=recipe))
    rates = {
        a: {
            "unit": "m3",
            "currency": "MYR",
            "basis": "cost",
            "amount": "10",
            "includes": ["labour"],
        },
        b: {"unit": "h", "currency": "MYR", "basis": "cost", "amount": "5", "includes": []},
    }
    with pytest.raises(ValueError, match="duplicates an inclusion"):
        calculate_estimate(
            pricing_items([item]),
            rates,
            currency="MYR",
            method="markup",
            percent=Decimal(0),
            wastage=Decimal(0),
            charges=[],
        )


def test_saved_recipe_estimate_versions_impacts_and_tenant_boundary(database):
    user = uuid4()
    with Session(database) as db:
        org = create_org(db, user)
        project = create_project(db, org, user)
        rate = calculations.create_rate(
            db,
            org,
            user,
            calculations.RateInput(
                code="BASE",
                description="Synthetic rate",
                unit="m3",
                basis="cost",
                amount="10",
                effective_date=date(2026, 10, 30),
                source_note="Testing only",
            ),
        )
        recipe = assembly(pricing="components")
        recipe["components"][0]["rate_id"] = rate["id"]
        raw = draft(assembly=recipe)
        saved = save_workspace(db, org, project.id, user, WorkspaceInput(**raw))
        estimate = calculations.run_estimate(
            db,
            org,
            project.id,
            user,
            calculations.EstimateInput(
                expected_revision=1,
                request_key=uuid4(),
                scenario="option_a",
                method="markup",
                percent=0,
            ),
        )
        assert estimate["payload"]["complete"]
        report = schedule_report(db, org, project.id, user, "option_a")
        assert report["rows"][0]["total"] == estimate["payload"]["lines"][0]["cost_total"]
        assert report["rows"][0]["parent_id"] == raw["scenarios"]["option_a"]["items"][0]["id"]
        original = deepcopy(saved)
        raw["expected_revision"] = 1
        raw["scenarios"]["option_a"]["items"][0]["assembly"]["components"][0]["thickness_mm"] = 200
        updated = save_workspace(db, org, project.id, user, WorkspaceInput(**raw))
        assert updated["data"]["scenarios"]["option_a"]["items"][0]["assembly"]["version"] == 2
        assert original["data"]["scenarios"]["option_a"]["items"][0]["assembly"]["version"] == 1
        report = schedule_report(db, org, project.id, user, "option_a")
        assert report["reference_revision"] == 1
        assert report["changes"][0]["fields"] == ["assembly"]
        assert Decimal(report["changes"][0]["cost_difference"]) > 0
        artifacts = calculations.get_artifacts(db, org, project.id, user)
        assert artifacts["items"][0]["stale"]
        with pytest.raises(APIError):
            schedule_report(db, org, project.id, uuid4(), "option_a")
        with pytest.raises(APIError, match="workspace changed"):
            save_workspace(db, org, project.id, user, WorkspaceInput(**raw))
        restored = restore_workspace(db, org, project.id, user, 1, 2)
        definition = restored["data"]["scenarios"]["option_a"]["items"][0]["assembly"]
        assert restored["revision"] == 3 and definition["version"] == 3
        assert definition["components"][0]["thickness_mm"] == 100
        grant = db.get(ProjectGrant, (project.id, user))
        grant.capabilities = ["read_project"]
        db.commit()
        restricted = schedule_report(db, org, project.id, user, "option_a")
        assert restricted["rows"][0]["total"] is None
        assert restricted["rows"][0]["status"] == "restricted"
        assert restricted["changes"][0]["cost_difference"] is None
