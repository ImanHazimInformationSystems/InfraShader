from decimal import Decimal

import pytest

from app.domain.pricing import calculate_estimate, selling


def fixtures():
    return (
        [
            {
                "id": "item",
                "name": "Paving",
                "status": "proposed",
                "rate_id": "rate",
                "source_note": "Measured fixture",
                "quantity": {"value": 20, "calculated": {"unit": "m2"}},
            }
        ],
        {
            "rate": {
                "id": "rate",
                "amount": "50.0000",
                "basis": "cost",
                "unit": "m2",
                "currency": "MYR",
                "includes": [],
            }
        },
    )


def calculate(items, rates, **kwargs):
    return calculate_estimate(
        items,
        rates,
        currency="MYR",
        method="markup",
        percent=Decimal(20),
        wastage=Decimal(0),
        charges=[],
        **kwargs,
    )


def test_markup_margin_reference_and_line_rounding():
    assert selling(Decimal(1000), "markup", Decimal(20)) == Decimal("1200.00")
    assert selling(Decimal(1000), "margin", Decimal(20)) == Decimal("1250.00")
    assert selling(Decimal("0.025"), "markup", Decimal(0)) == Decimal("0.03")
    result = calculate(*fixtures())
    assert result["complete"] and result["selling_total"] == "1200.00"
    assert result["profit"] == "200.00"


@pytest.mark.parametrize("value", ["100", "101", "NaN", "Infinity", "-1"])
def test_invalid_margin(value):
    with pytest.raises(ValueError):
        selling(Decimal(1000), "margin", Decimal(value))


def test_missing_rate_is_partial_and_has_no_profit_claim():
    items, _ = fixtures()
    result = calculate(items, {})
    assert not result["complete"] and result["missing_rates"][0]["item_id"] == "item"
    assert result["profit"] is None


@pytest.mark.parametrize(
    "field,value", [("unit", "m"), ("currency", "USD"), ("basis", "indicative_budget")]
)
def test_incompatible_rate(field, value):
    items, rates = fixtures()
    rates["rate"][field] = value
    with pytest.raises(ValueError):
        calculate(items, rates)


def test_included_charge_cannot_be_applied_twice():
    items, rates = fixtures()
    rates["rate"]["includes"] = ["labour"]
    with pytest.raises(ValueError, match="already included"):
        calculate_estimate(
            items,
            rates,
            currency="MYR",
            method="markup",
            percent=Decimal(0),
            wastage=Decimal(0),
            charges=[{"category": "labour", "amount": "50", "source_note": "Fixture"}],
        )
