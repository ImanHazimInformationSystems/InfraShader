"""Deterministic price validity, never a market-price or commercial acceptance claim."""

from datetime import date
from decimal import Decimal


def readiness(payload, today: date, valid_until: date | None = None):
    warnings = []
    lines = payload.get("lines", [])
    missing = payload.get("missing_rates", [])

    def warn(code, message, item_id=None):
        warnings.append({"code": code, "message": message, "item_id": item_id})

    for line in lines:
        rate = line["rate"]
        name = line["description"]
        item = line["item_id"]
        expiry = date.fromisoformat(rate["valid_until"]) if rate.get("valid_until") else None
        effective = (
            date.fromisoformat(rate["effective_date"]) if rate.get("effective_date") else None
        )
        if not expiry:
            warn("unknown_validity", f"{name}: rate validity is not recorded.", item)
        elif expiry < today:
            warn("expired_rate", f"{name}: selected rate expired on {expiry}.", item)
        elif valid_until and expiry < valid_until:
            warn(
                "short_validity",
                f"{name}: selected rate expires before proposal validity ends.",
                item,
            )
        if effective and effective > today:
            warn("future_rate", f"{name}: rate is not effective until {effective}.", item)
        if rate.get("archived"):
            warn("archived_rate", f"{name}: selected rate version is archived.", item)
        if rate.get("superseded_by"):
            warn(
                "superseded_rate",
                f"{name}: rate {rate.get('code')} v{rate.get('version')} has a newer version "
                f"v{rate['superseded_by']}; the estimate keeps v{rate.get('version')} until "
                "you re-estimate deliberately.",
                item,
            )
        if Decimal(line["quantity"]) == 0:
            warn("zero_quantity", f"{name}: zero quantity requires review.", item)
        if Decimal(rate["amount"]) == 0:
            warn("zero_price", f"{name}: explicit zero price requires review.", item)
        status = line.get("pricing_status", "firm")
        if status != "firm":
            warn(
                status,
                f"{name}: {status} scope is included in the stated total; review assumptions.",
                item,
            )
    if payload.get("profit") is not None and Decimal(payload["profit"]) < 0:
        warn(
            "below_cost",
            "Fixed selling total is below the listed cost base; authorised review required.",
        )
    total = len(lines) + len(missing)
    return {
        "checked_on": today.isoformat(),
        "priced_count": len(lines),
        "scope_count": total,
        "unpriced_count": len(missing),
        "warnings": warnings,
        "ready": bool(payload.get("complete")) and not warnings,
        "value_coverage": None,
        "coverage_note": (
            "Counts refer to billable lines, including recipe components. "
            "Unknown scope values prevent a total-cost coverage percentage. "
            "This is not commercial acceptance."
        ),
    }
