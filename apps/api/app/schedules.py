"""Bounded, user-sourced planting and assembly schedules; no inferred suitability."""

from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


Text = Annotated[str, Field(min_length=1, max_length=500)]
Positive = Annotated[float, Field(gt=0, le=10000)]


class Plant(Record):
    code: Text
    version: Annotated[int, Field(ge=1)] = 1
    scientific_name: Text
    common_name: Text
    source: Text
    nursery_size: Text
    current_crown_m: Annotated[float, Field(ge=0, le=100)] = 0
    mature_crown_m: Annotated[float, Field(ge=0, le=100)] = 0
    spacing_m: Positive = 1
    method: Literal["explicit_count", "square_spacing", "line_spacing"] = "explicit_count"
    sun_water: Text
    suitability: Text
    maintenance: Text
    availability_date: date | None = None
    substitution: Annotated[str, Field(max_length=500)] = ""


class Component(Record):
    code: Text
    name: Text
    category: Literal["material", "labour", "equipment", "transport", "overhead"] = "material"
    basis: Literal["surface", "volume", "length", "per_surface", "fixed"]
    unit: Literal["m2", "m3", "m", "item", "h"]
    factor: Positive = 1
    thickness_mm: Annotated[float, Field(ge=0, le=5000)] = 0
    wastage_percent: Annotated[float, Field(ge=0, le=100)] = 0
    rate_id: UUID | None = None

    @model_validator(mode="after")
    def dimensions(self):
        units = {"surface": "m2", "volume": "m3", "length": "m"}
        if self.basis in units and self.unit != units[self.basis]:
            raise ValueError("Component basis and unit are dimensionally incompatible.")
        if self.basis == "volume" and self.thickness_mm <= 0:
            raise ValueError("Volume requires positive layer thickness in millimetres.")
        if self.basis != "volume" and self.thickness_mm:
            raise ValueError("Thickness applies only to volume layers.")
        if self.category != "material" and self.wastage_percent:
            raise ValueError("Wastage applies to material, not labour or charges.")
        return self


class Assembly(Record):
    code: Text
    version: Annotated[int, Field(ge=1)] = 1
    use: Literal["paving", "edging", "deck", "fence", "road"] = "paving"
    material: Text
    finish: Text
    source: Text
    width_m: Positive = 1
    height_m: Positive = 1
    approved: bool = False
    pricing: Literal["inclusive", "components"] = "inclusive"
    components: Annotated[list[Component], Field(min_length=1, max_length=20)]

    @model_validator(mode="after")
    def unique(self):
        if len({c.code for c in self.components}) != len(self.components):
            raise ValueError("Component codes must be unique within a recipe.")
        if self.pricing == "inclusive" and any(c.rate_id for c in self.components):
            raise ValueError("Inclusive pricing cannot also select component rates.")
        if self.use == "road":
            if self.pricing != "components":
                raise ValueError(
                    "Road layers require component pricing so each layer remains visible."
                )
            if any(
                component.category != "material"
                or component.basis != "volume"
                or component.unit != "m3"
                for component in self.components
            ):
                raise ValueError(
                    "Road layers require explicit material components measured by volume in m3."
                )
        return self


def derive(item):
    """Return schedule rows and replace only explicitly derived plant quantities."""
    q = item["quantity"]
    raw, unit = Decimal(str(q["value"])), q["calculated"]["unit"]
    plant, recipe = item.get("plant"), item.get("assembly")
    if plant and recipe:
        raise ValueError("An item cannot be both planting and hardscape.")
    if (plant or recipe) and q["is_override"]:
        raise ValueError("Remove quantity override before using a planting method or recipe.")
    if plant:
        if item["kind"] not in ("area", "path", "tree", "manual"):
            raise ValueError("Plant records require a planting area, path, tree or manual count.")
        method, spacing = plant["method"], Decimal(str(plant["spacing_m"]))
        if method == "explicit_count":
            if unit != "item":
                raise ValueError("Explicit planting counts require a count item.")
            value = raw
        elif method == "square_spacing":
            if unit != "m2":
                raise ValueError("Square spacing requires an area polygon.")
            value = (raw / spacing**2).to_integral_value(rounding=ROUND_CEILING)
        else:
            if unit != "m":
                raise ValueError("Line spacing requires a path.")
            value = (raw / spacing).to_integral_value(rounding=ROUND_CEILING) + 1
        if value > 1000000:
            raise ValueError("Planting count exceeds one million; review spacing/scope.")
        item["quantity"] = {
            **q,
            "value": float(value),
            "calculated": {
                **q["calculated"],
                "value": float(value),
                "unit": "item",
                "method": method,
            },
        }
        return [
            {
                "code": plant["code"],
                "description": plant["common_name"],
                "value": str(value),
                "unit": "item",
                "method": method,
                "formula": f"{method}: source {raw} {unit}; spacing {spacing} m; count {value}",
                "source_quantity": str(raw),
                "source_unit": unit,
                "rate_id": item.get("rate_id"),
                "priced": True,
            }
        ]
    if recipe:
        if unit not in ("m", "m2") or item["kind"] not in ("path", "area"):
            raise ValueError("Hardscape recipes require area or path geometry.")
        if recipe["use"] == "road" and (unit != "m2" or item["kind"] != "area"):
            raise ValueError("Road takeoff requires a deliberately drawn area polygon.")
        if recipe["pricing"] == "components" and item.get("rate_id"):
            raise ValueError("Component pricing cannot also charge a parent inclusive rate.")
        surface = (
            raw
            if unit == "m2"
            else raw
            * Decimal(str(recipe["height_m"] if recipe["use"] == "fence" else recipe["width_m"]))
        )
        rows = []
        for c in recipe["components"]:
            if c["basis"] == "length" and unit != "m":
                raise ValueError("Length components require a path, not an inferred perimeter.")
            value = {
                "surface": surface,
                "volume": surface * Decimal(str(c["thickness_mm"])) / 1000,
                "length": raw,
                "per_surface": surface,
                "fixed": Decimal(1),
            }[c["basis"]]
            value *= Decimal(str(c["factor"])) * (1 + Decimal(str(c["wastage_percent"])) / 100)
            if c["unit"] == "item":
                value = value.to_integral_value(rounding=ROUND_CEILING)
            if value > Decimal("1000000000000"):
                raise ValueError("Recipe quantity exceeds the supported limit.")
            rows.append(
                {
                    "code": c["code"],
                    "description": c["name"],
                    "value": str(value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)),
                    "unit": c["unit"],
                    "method": c["basis"],
                    "formula": (
                        f"{c['basis']}: source {raw} {unit}; surface {surface} m2; "
                        f"thickness {c['thickness_mm']} mm; factor {c['factor']}; "
                        f"material wastage {c['wastage_percent']}%; whole items round up"
                    ),
                    "source_quantity": str(raw),
                    "source_unit": unit,
                    "surface_m2": str(surface),
                    "rate_id": c["rate_id"],
                    "priced": recipe["pricing"] == "components",
                    "category": c["category"],
                }
            )
        return rows
    return []


def pricing_items(items):
    """Expand recipes once for both saved estimates and schedules."""
    result = []
    for item in items:
        recipe = item.get("assembly")
        if not recipe:
            result.append(item)
            continue
        if not recipe["approved"]:
            result.append({**item, "rate_id": None})
            continue
        if recipe["pricing"] == "inclusive":
            result.append(item)
            continue
        for row in item.get("schedule", []):
            result.append(
                {
                    **item,
                    "id": f"{item['id']}:{row['code']}",
                    "parent_id": item["id"],
                    "name": f"{item['name']} / {row['description']}",
                    "rate_id": row["rate_id"],
                    "assembly_component": True,
                    "component_category": row["category"],
                    "quantity": {
                        "value": row["value"],
                        "calculated": {
                            "unit": row["unit"],
                            "method": row.get("formula", row["method"]),
                        },
                    },
                }
            )
    return result


def rate_review(rate, today: date):
    """Reasons a selected rate needs a person to look again; never a market-price judgement."""
    reasons = []
    if rate is None:
        return reasons
    if rate.valid_until is None:
        reasons.append("unknown_validity")
    elif rate.valid_until < today:
        reasons.append("expired")
    if rate.effective_date > today:
        reasons.append("not_yet_effective")
    if rate.archived:
        reasons.append("archived")
    return reasons


def price_rows(items, rates, *, purpose, currency, internal, today=None):
    """One row per billable line (recipe layers expanded), using saved Decimal rate amounts."""
    today = today or date.today()
    expected = "indicative_budget" if purpose == "developer_decision" else "cost"
    result = []
    for item in pricing_items(items):
        rate = rates.get(item.get("rate_id"))
        quantity = str(item["quantity"]["value"])
        unit = item["quantity"]["calculated"]["unit"]
        valid = bool(
            rate
            and not item.get("terrain_work_stale")
            and rate.unit == unit
            and rate.currency == currency
            and rate.basis == expected
        )
        visible = valid and (rate.basis == "indicative_budget" or internal)
        recipe = item.get("assembly") or {}
        state = (
            "existing"
            if item["status"] == "existing"
            else "stale"
            if item.get("terrain_work_stale")
            else "recipe_not_approved"
            if recipe and not recipe.get("approved")
            else "needs_price"
            if rate is None
            else "unit_mismatch"
            if rate.unit != unit
            else "wrong_basis"
            if rate.basis != expected or rate.currency != currency
            else "priced"
            if visible
            else "restricted"
        )
        result.append(
            {
                "id": item["id"],
                "parent_id": item.get("parent_id", item["id"]),
                "name": item["name"],
                "section": item["category"],
                "quantity": quantity,
                "unit": unit,
                "source": item["source_note"],
                "method": item.get("schedule", [{}])[0].get(
                    "formula", item["quantity"]["calculated"].get("method", "approved recipe")
                )
                if item.get("plant")
                else item["quantity"]["calculated"].get("method", "geometry"),
                "rate": f"{rate.code} v{rate.version} / {rate.effective_date}"
                if visible
                else "Unavailable",
                "specification": "; ".join(
                    f"{k.replace('_', ' ')}: {v}"
                    for k, v in (
                        item.get("plant")
                        or item.get("assembly")
                        or (
                            {"purchased stock": item["tree_design"]["stock_spec"]}
                            if item.get("tree_design")
                            else {}
                        )
                    ).items()
                    if k != "components"
                ),
                "status": "existing"
                if item["status"] == "existing"
                else "terrain changed / review work quantity"
                if item.get("terrain_work_stale")
                else "priced"
                if visible
                else "restricted"
                if valid
                else "unpriced / invalid rate",
                "state": state,
                "review": rate_review(rate, today) if valid else [],
                "rate_id": item.get("rate_id"),
                "unit_price": str(rate.amount) if visible else None,
                "total": str(
                    (Decimal(quantity) * rate.amount).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                )
                if visible
                else None,
            }
        )
    return result


def item_subtotals(rows):
    """Per drawn item: sum of its line totals, or None while any line is unpriced or hidden."""
    result = {}
    for row in rows:
        if row["state"] == "existing":
            continue
        current = result.get(row["parent_id"], Decimal("0.00"))
        result[row["parent_id"]] = (
            None if current is None or row["total"] is None else current + Decimal(row["total"])
        )
    return {key: None if value is None else str(value) for key, value in result.items()}


def row_summary(rows, internal, purpose):
    """Direct-cost subtotal of priced proposed lines; a total is complete only if every line is."""
    proposed = [row for row in rows if row["state"] != "existing"]
    priced = [row for row in proposed if row["state"] == "priced"]
    restricted = any(row["state"] == "restricted" for row in proposed)
    show = internal or purpose == "developer_decision"
    return {
        "lines": len(proposed),
        "priced": len(priced),
        "unpriced": sum(1 for row in proposed if row["state"] not in ("priced", "restricted")),
        "restricted": restricted,
        # Restricted lines are valid but hidden from this viewer; never call that complete here.
        "complete": bool(proposed) and len(priced) == len(proposed),
        "needs_review": sum(1 for row in priced if row["review"]),
        "priced_subtotal": str(sum((Decimal(row["total"]) for row in priced), Decimal("0.00")))
        if show and not restricted
        else None,
        "basis": "indicative budget" if purpose == "developer_decision" else "internal direct cost",
    }


MEASURE_KEYS = (
    "code",
    "value",
    "unit",
    "method",
    "source_quantity",
    "source_unit",
    "surface_m2",
    "rate_id",
)


def pricing_preview(session, org_id, project_id, user_id, draft, scenario):
    """Price an unsaved draft with the same validation and rows as a save; never persists."""
    from sqlalchemy import select

    from app import access
    from app.models import CatalogueRate, Workspace
    from app.workspace import project_for_workspace, validate_workspace

    project = project_for_workspace(session, org_id, project_id, user_id)
    data = validate_workspace(draft, project.site["bounds"])
    items = data["scenarios"][scenario]["items"]
    ids = {UUID(str(item["rate_id"])) for item in pricing_items(items) if item.get("rate_id")}
    rates = {
        str(rate.id): rate
        for rate in session.scalars(
            select(CatalogueRate).where(
                CatalogueRate.organisation_id == org_id, CatalogueRate.id.in_(ids)
            )
        ).all()
    }
    internal = "internal_pricing" in access.project_capabilities(
        session, org_id, project_id, user_id
    )
    rows = price_rows(
        items, rates, purpose=project.purpose, currency=project.currency, internal=internal
    )
    saved = session.get(Workspace, project_id)
    return {
        "draft": True,
        "scenario": scenario,
        "expected_revision": draft.expected_revision,
        "saved_revision": saved.revision if saved else 0,
        "rows": rows,
        "summary": row_summary(rows, internal, project.purpose),
        "subtotals": item_subtotals(rows),
        # Validated quantities for the draft, so explanations match the numbers being priced.
        "measures": {
            item["id"]: {
                "quantity": item.get("quantity"),
                "schedule": [
                    {key: row[key] for key in MEASURE_KEYS if row.get(key) is not None}
                    for row in item.get("schedule", [])
                ],
            }
            for item in items
            if item["status"] == "proposed"
        },
        "note": (
            "Preview of unsaved changes using saved rate versions. It is not a saved estimate; "
            "save the workspace and calculate an estimate before issuing."
        ),
    }


def schedule_report(session, org_id, project_id, user_id, scenario):
    from sqlalchemy import select

    from app import access
    from app.models import Artifact, CatalogueRate, Workspace, WorkspaceRevision
    from app.workspace import project_for_workspace

    project = project_for_workspace(session, org_id, project_id, user_id)
    workspace = session.get(Workspace, project_id)
    if not workspace:
        return {"revision": 0, "rows": [], "changes": [], "reference_revision": None}
    issued = session.scalar(
        select(Artifact)
        .where(
            Artifact.project_id == project_id,
            Artifact.kind.in_(["developer_brief", "proposal"]),
        )
        .order_by(Artifact.created_at.desc())
        .limit(1)
    )
    reference = issued.workspace_revision if issued else workspace.revision - 1
    prior = session.scalar(
        select(WorkspaceRevision).where(
            WorkspaceRevision.project_id == project_id,
            WorkspaceRevision.revision == reference,
        )
    )
    current = workspace.data["scenarios"][scenario]["items"]
    old = prior.payload["scenarios"][scenario]["items"] if prior else []
    internal = "internal_pricing" in access.project_capabilities(
        session, org_id, project_id, user_id
    )
    rates = {
        str(r.id): r
        for r in session.scalars(
            select(CatalogueRate).where(
                CatalogueRate.organisation_id == org_id,
            )
        ).all()
    }

    def rows(items):
        return price_rows(
            items, rates, purpose=project.purpose, currency=project.currency, internal=internal
        )

    now_rows, old_rows = rows(current), rows(old)
    old_items = {i["id"]: i for i in old}
    current_items = {i["id"]: i for i in current}
    changes = []
    for item_id in sorted(set(old_items) | set(current_items)):
        before, after = old_items.get(item_id), current_items.get(item_id)
        fields = [
            k
            for k in (
                "geometry",
                "count",
                "plant",
                "assembly",
                "rate_id",
                "quantity_override",
                "status",
                "source_note",
            )
            if (before or {}).get(k) != (after or {}).get(k)
        ]
        if before and after and not fields:
            continue
        a = [r for r in now_rows if r["parent_id"] == item_id]
        b = [r for r in old_rows if r["parent_id"] == item_id]

        def total(values):
            return (
                sum((Decimal(r["total"]) for r in values), Decimal(0))
                if all(r["total"] is not None for r in values)
                else None
            )

        at, bt = total(a), total(b)
        changes.append(
            {
                "item_id": item_id,
                "name": (after or before)["name"],
                "action": "added" if not before else "removed" if not after else "changed",
                "fields": fields,
                "before": b,
                "after": a,
                "cost_difference": str(at - bt) if at is not None and bt is not None else None,
                "review": "Recalculate and review proposal. Issued snapshots remain unchanged.",
            }
        )
    return {
        "summary": row_summary(now_rows, internal, project.purpose),
        "subtotals": item_subtotals(now_rows),
        "revision": workspace.revision,
        "reference_revision": reference if prior else None,
        "reference": "last issue" if issued else "previous save",
        "rows": now_rows,
        "changes": changes,
    }
