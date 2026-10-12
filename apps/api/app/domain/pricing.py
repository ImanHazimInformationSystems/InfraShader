"""Explicit Decimal policy: four-decimal quantities/rates, two-decimal line totals."""

from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
QUANTITY = Decimal("0.0001")
POLICY = "MYR/2dp-line-HALF_UP/v1; no implicit tax, discount or escalation"


def amount(value) -> Decimal:
    result = Decimal(str(value))
    if not result.is_finite() or result < 0 or result > Decimal("1000000000000"):
        raise ValueError("Amounts must be finite, nonnegative and within the supported limit.")
    return result


def selling(cost: Decimal, method: str, percent: Decimal) -> Decimal:
    cost, percent = amount(cost), amount(percent)
    if method == "markup":
        if percent > 1000:
            raise ValueError("Markup must not exceed 1000%.")
        result = cost * (1 + percent / 100)
    elif method == "margin":
        if percent >= 100:
            raise ValueError("Margin must be less than 100%.")
        result = cost / (1 - percent / 100)
    else:
        raise ValueError("Select markup or margin.")
    return result.quantize(CENT, rounding=ROUND_HALF_UP)


def calculate_estimate(
    items: list,
    rates: dict,
    *,
    currency: str,
    method: str,
    percent: Decimal,
    wastage: Decimal,
    charges: list,
    fixed_selling: Decimal | None = None,
) -> dict:
    if currency != "MYR":
        raise ValueError("The reviewed initial rounding policy supports MYR only.")
    if method not in ("indicative", "markup", "margin", "fixed_selling"):
        raise ValueError("Unsupported pricing method.")
    wastage = amount(wastage)
    if wastage > 100:
        raise ValueError("Wastage must be between 0 and 100%.")
    if method in ("markup", "margin"):
        selling(Decimal(0), method, percent)
    lines, missing, inclusions = [], [], set()
    subtotal = Decimal(0)
    for item in items:
        if item["status"] == "existing":
            continue
        rate = rates.get(item.get("rate_id"))
        if rate is None:
            missing.append(
                {"item_id": item["id"], "name": item["name"], "reason": "Select a dated rate."}
            )
            continue
        unit = item["quantity"]["calculated"]["unit"]
        if unit != rate["unit"] or currency != rate["currency"]:
            raise ValueError(f"Rate unit/currency does not match {item['name']}.")
        expected = "indicative_budget" if method == "indicative" else "cost"
        if rate["basis"] != expected:
            raise ValueError(f"{method} requires a {expected} rate for {item['name']}.")
        inclusions.update(rate["includes"])
        quantity = amount(item["quantity"]["value"]).quantize(QUANTITY, rounding=ROUND_HALF_UP)
        # Wastage applies only to measured area/length, never to explicit counts or fixed charges.
        factor = (1 + wastage / 100) if unit in ("m2", "m") else Decimal(1)
        total = (quantity * factor * amount(rate["amount"])).quantize(CENT, rounding=ROUND_HALF_UP)
        subtotal += total
        lines.append(
            {
                "item_id": item["id"],
                "description": item["name"],
                "quantity": str(quantity),
                "unit": unit,
                "quantity_source": item["source_note"],
                "rate": rate,
                "wastage_percent": str(wastage if unit in ("m2", "m") else 0),
                "cost_total": str(total),
            }
        )
    additions = Decimal(0)
    seen = set()
    for charge in charges:
        category = charge["category"]
        if category in seen or category in inclusions:
            raise ValueError(f"{category} is already included. Remove the duplicate charge.")
        seen.add(category)
        value = amount(charge["amount"]).quantize(CENT, rounding=ROUND_HALF_UP)
        charge["amount"] = str(value)
        additions += value
    base = subtotal + additions
    total = (
        base
        if method == "indicative"
        else amount(fixed_selling).quantize(CENT, rounding=ROUND_HALF_UP)
        if method == "fixed_selling" and fixed_selling is not None
        else selling(base, method, percent)
    )
    return {
        "currency": currency,
        "rounding_policy": POLICY,
        "method": method,
        "percent": str(percent),
        "lines": lines,
        "charges": charges,
        "missing_rates": missing,
        "complete": not missing and bool(lines),
        "priced_subtotal": str(subtotal),
        "cost_base": str(base),
        "selling_total": str(total),
        "profit": str(total - base) if not missing and lines else None,
        "profit_basis": "Selling less the listed direct costs and explicit charges only.",
    }
