"""Saved calculations and audience-specific issued snapshots; all authority stays here."""

from copy import deepcopy
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import AwareDatetime, Field, NaiveDatetime, model_validator
from sqlalchemy import func, select

from app import access
from app.domain.pricing import calculate_estimate
from app.domain.shade import MODEL, analyse_workspace
from app.errors import APIError, not_found
from app.models import (
    AdministrationEvent,
    Artifact,
    CatalogueRate,
    Evidence,
    Organisation,
    Project,
    Workspace,
)
from app.output_sheet import (
    RENDERER_NOTE,
    SCHEMA,
    TEMPLATE,
    MaintenanceTask,
    maintenance_plan,
    plan_sheet,
)
from app.pricing_readiness import readiness
from app.projects import require_membership
from app.schedules import pricing_items
from app.site_constraints import constraint_summary
from app.terrain import work_changed as terrain_changed
from app.workspace import ScenarioKey, StrictModel, project_for_workspace

Money = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=4)]


class RateInput(StrictModel):
    category: Annotated[str, Field(min_length=1, max_length=80)] = "General"
    code: Annotated[str, Field(min_length=1, max_length=80)]
    description: Annotated[str, Field(min_length=1, max_length=500)]
    unit: Literal["m2", "m", "item", "m3", "h"]
    currency: Literal["MYR"] = "MYR"
    basis: Literal["indicative_budget", "cost"]
    amount: Money
    effective_date: date
    valid_until: date | None = None
    source_note: Annotated[str, Field(min_length=1, max_length=2000)]
    includes: list[Literal["labour", "equipment", "transport", "overhead"]] = []
    # L14: who the price came from. All are user-entered records; none is supplier-verified.
    source_type: Literal["user_entered", "supplier_quote", "price_list", "past_project"] = (
        "user_entered"
    )
    supplier_name: Annotated[str, Field(max_length=200)] = ""
    quote_reference: Annotated[str, Field(max_length=120)] = ""
    exclusions: Annotated[str, Field(max_length=2000)] = ""

    @model_validator(mode="after")
    def validity(self):
        if self.valid_until and self.valid_until < self.effective_date:
            raise ValueError("Rate validity must not precede its effective date.")
        if self.source_type in ("supplier_quote", "price_list") and not self.supplier_name:
            raise ValueError("Name the supplier for a quotation or price-list rate.")
        if self.source_type == "supplier_quote" and not self.quote_reference:
            raise ValueError("Record the quotation reference for a supplier quotation rate.")
        return self


class CalculationInput(StrictModel):
    expected_revision: Annotated[int, Field(ge=1)]
    request_key: UUID


class AnalysisInput(CalculationInput):
    timestamp: AwareDatetime | None = None
    local_timestamp: NaiveDatetime | None = None
    target_id: UUID

    @model_validator(mode="after")
    def one_time(self):
        if (self.timestamp is None) == (self.local_timestamp is None):
            raise ValueError("Supply exactly one local time or time with explicit offset.")
        return self


def analysis_time(data: AnalysisInput, timezone: str):
    if data.timestamp is not None:
        return data.timestamp
    zone = ZoneInfo(timezone)
    candidates = {}
    for fold in (0, 1):
        candidate = data.local_timestamp.replace(tzinfo=zone, fold=fold)
        utc = candidate.astimezone(UTC)
        if utc.astimezone(zone).replace(tzinfo=None) == data.local_timestamp:
            candidates[utc] = candidate
    if len(candidates) != 1:
        raise ValueError(
            "This local time is ambiguous or does not exist because of a clock change. "
            "Use an explicit timezone offset."
        )
    return next(iter(candidates.values()))


class Charge(StrictModel):
    category: Literal["labour", "equipment", "transport", "overhead", "contingency", "fixed"]
    amount: Money
    source_note: Annotated[str, Field(min_length=1, max_length=2000)]


class EstimateInput(CalculationInput):
    scenario: ScenarioKey
    method: Literal["indicative", "markup", "margin", "fixed_selling"]
    percent: Annotated[Decimal, Field(ge=0, le=1000, max_digits=8, decimal_places=4)] = Decimal(0)
    wastage_percent: Annotated[Decimal, Field(ge=0, le=100, max_digits=8, decimal_places=4)] = (
        Decimal(0)
    )
    fixed_selling: Money | None = None
    charges: Annotated[list[Charge], Field(max_length=6)] = []

    @model_validator(mode="after")
    def one_method(self):
        if self.method == "margin" and self.percent >= 100:
            raise ValueError("Margin must be less than 100%.")
        if self.method == "fixed_selling" and self.fixed_selling is None:
            raise ValueError("Fixed selling price is required.")
        if self.method != "fixed_selling" and self.fixed_selling is not None:
            raise ValueError("Fixed selling price cannot be combined with another pricing method.")
        if self.method in ("indicative", "fixed_selling") and self.percent:
            raise ValueError("This pricing method does not use a percentage.")
        return self


class IssueInput(StrictModel):
    include_evidence_images: bool = False
    valid_until: date | None = None
    programme: Annotated[str, Field(max_length=8000)] = ""
    maintenance: Annotated[str, Field(max_length=8000)] = ""
    # L22 CORE: structured, issuer-supplied responsibility/frequency/assumption checklist.
    maintenance_plan: Annotated[list[MaintenanceTask], Field(max_length=30)] = []
    change_summary: Annotated[str, Field(max_length=8000)] = ""
    pricing_override_reason: Annotated[str, Field(max_length=2000)] = ""

    customer_narrative: Annotated[str, Field(max_length=8000)] = ""
    evidence_ids: Annotated[list[UUID], Field(max_length=20)] = []
    request_key: UUID
    estimate_id: UUID
    expected_project_revision: Annotated[int, Field(ge=1)]
    preferred_option: Literal["option_a", "option_b"]
    criteria: Annotated[
        list[Annotated[str, Field(min_length=1, max_length=500)]],
        Field(min_length=1, max_length=12),
    ]
    review_notes: Annotated[str, Field(min_length=1, max_length=8000)]
    assumptions: Annotated[str, Field(min_length=1, max_length=8000)]
    exclusions: Annotated[str, Field(min_length=1, max_length=8000)]
    confirmed: Literal[True]


class DraftMaintenanceTask(MaintenanceTask):
    task: Annotated[str, Field(max_length=300)] = ""
    frequency: Annotated[str, Field(max_length=120)] = ""


class PreviewInput(IssueInput):
    """Draft preview only: unfinished text is allowed and reported. Never used to issue."""

    criteria: Annotated[
        list[Annotated[str, Field(min_length=1, max_length=500)]],
        Field(max_length=12),
    ] = []
    review_notes: Annotated[str, Field(max_length=8000)] = ""
    assumptions: Annotated[str, Field(max_length=8000)] = ""
    exclusions: Annotated[str, Field(max_length=8000)] = ""
    confirmed: bool = True
    maintenance_plan: Annotated[list[DraftMaintenanceTask], Field(max_length=30)] = []


class ReadinessInput(PreviewInput):
    estimate_id: UUID | None = None
    preferred_option: Literal["baseline", "option_a", "option_b"] = "option_a"


def issue_readiness(session, org_id, project_id, user_id, data, kind):
    from app.issue_readiness import evaluate

    project = access.require_project(session, org_id, project_id, user_id)
    issues = evaluate(session, org_id, project, user_id, data, kind)
    return {
        "issues": issues,
        "ready": not any(i["severity"] == "blocks_issue" for i in issues),
        "project_revision": project.revision,
    }


NOT_PROVIDED = "Not provided yet - required before issue."


def allowed(membership, capability):
    return capability in membership.capabilities


def require_capability(session, org_id, user_id, capability):
    return access.require_capability(session, org_id, user_id, capability)


def rate_data(rate):
    return {
        key: value
        for key, value in {
            "id": str(rate.id),
            "code": rate.code,
            "category": rate.category,
            "archived": rate.archived,
            "metadata_revision": rate.metadata_revision,
            "version": rate.version,
            "description": rate.description,
            "unit": rate.unit,
            "currency": rate.currency,
            "basis": rate.basis,
            "amount": str(rate.amount),
            "effective_date": rate.effective_date.isoformat(),
            "valid_until": rate.valid_until.isoformat() if rate.valid_until else None,
            "source_note": rate.source_note,
            "includes": rate.includes,
            "source_type": rate.source_type,
            "supplier_name": rate.supplier_name,
            "quote_reference": rate.quote_reference,
            "exclusions": rate.exclusions,
        }.items()
    }


def visible_rate(rate, membership):
    item = rate_data(rate)
    if item["basis"] == "cost" and not allowed(membership, "internal_pricing"):
        del item["amount"]
        item["source_note"] = "Restricted supplier source"
        # Supplier identity and quotation numbers are internal commercial details.
        item["supplier_name"] = "Restricted supplier" if rate.supplier_name else ""
        item["quote_reference"] = ""
    return item


def get_rate(session, org_id, user_id, rate_id):
    membership = require_membership(session, org_id, user_id)
    rate = session.scalar(
        select(CatalogueRate).where(
            CatalogueRate.id == rate_id, CatalogueRate.organisation_id == org_id
        )
    )
    if rate is None:
        raise not_found()
    return visible_rate(rate, membership)


def list_rates(
    session,
    org_id,
    user_id,
    *,
    query="",
    unit=None,
    basis=None,
    offset=0,
    limit=50,
    category="",
    archived=False,
):
    membership = require_membership(session, org_id, user_id)
    filters = [CatalogueRate.organisation_id == org_id, CatalogueRate.archived == archived]
    if category.strip():
        filters.append(CatalogueRate.category.icontains(category.strip(), autoescape=True))
    if query.strip():
        # Literal substring matching: SQL wildcards in user input are escaped.
        filters.append(
            CatalogueRate.code.icontains(query.strip(), autoescape=True)
            | CatalogueRate.description.icontains(query.strip(), autoescape=True)
        )
    if unit:
        filters.append(CatalogueRate.unit == unit)
    if basis:
        filters.append(CatalogueRate.basis == basis)
    total = session.scalar(select(func.count()).select_from(CatalogueRate).where(*filters))
    rates = session.scalars(
        select(CatalogueRate)
        .where(*filters)
        .order_by(CatalogueRate.code, CatalogueRate.version.desc(), CatalogueRate.id)
        .offset(offset)
        .limit(limit)
    ).all()
    return {
        "items": [visible_rate(rate, membership) for rate in rates],
        "limit": limit,
        "offset": offset,
        "total": total,
    }


def create_rate(session, org_id, user_id, data: RateInput):
    require_capability(session, org_id, user_id, "change_catalogue")
    if data.basis == "cost":
        require_capability(session, org_id, user_id, "internal_pricing")
    session.scalar(select(Organisation).where(Organisation.id == org_id).with_for_update())
    latest = (
        session.scalar(
            select(func.max(CatalogueRate.version)).where(
                CatalogueRate.organisation_id == org_id, CatalogueRate.code == data.code
            )
        )
        or 0
    )
    rate = CatalogueRate(**data.model_dump(), organisation_id=org_id, version=latest + 1)
    session.add(rate)
    session.flush()
    result = rate_data(rate)
    session.commit()
    return result


def current_workspace(session, project_id, revision):
    workspace = session.get(Workspace, project_id)
    if workspace is None or workspace.revision != revision:
        raise APIError(
            409, "stale_workspace", "Save and reload the current workspace before calculating."
        )
    return workspace


def artifact_response(artifact, workspace_revision, project_revision, *, internal=False):
    payload = artifact.payload
    from app.shade_studies import METHOD as STUDY_METHOD
    from app.terrain_analysis import METHOD as TERRAIN_METHOD

    if artifact.kind == "estimate" and (not internal or payload["method"] == "indicative"):
        # Construct an allowlist; never forward rate dictionaries or arbitrary nested input.
        payload = {
            key: payload.get(key)
            for key in (
                "scenario",
                "currency",
                "complete",
                "missing_rates",
                "selling_total",
                "rounding_policy",
                "readiness",
            )
        }
        payload["label"] = (
            "Indicative budget" if artifact.payload["method"] == "indicative" else "Selling price"
        )
    if artifact.kind == "estimate":
        payload = dict(payload)
        payload["readiness"] = readiness(artifact.payload, date.today())
        if not internal:
            payload["readiness"]["warnings"] = [
                w for w in payload["readiness"]["warnings"] if w["code"] != "below_cost"
            ]
        payload["takeoff"] = []
        for line in artifact.payload.get("lines", []):
            item = {
                key: line[key]
                for key in (
                    "item_id",
                    "description",
                    "quantity",
                    "unit",
                    "quantity_source",
                    "wastage_percent",
                )
            }
            item.update(
                rate_code=line["rate"]["code"],
                rate_version=line["rate"]["version"],
                effective_date=line["rate"]["effective_date"],
            )
            if internal or artifact.payload["method"] == "indicative":
                item.update(
                    unit_price=line["rate"]["amount"],
                    line_total=line["cost_total"],
                    price_basis="indicative"
                    if artifact.payload["method"] == "indicative"
                    else "internal cost",
                )
            payload["takeoff"].append(item)
    return {
        "id": str(artifact.id),
        "kind": artifact.kind,
        "workspace_revision": artifact.workspace_revision,
        "project_revision": artifact.project_revision,
        "created_at": artifact.created_at.isoformat(),
        "stale": artifact.workspace_revision != workspace_revision
        or artifact.project_revision != project_revision
        or (artifact.kind == "analysis" and payload.get("method") != MODEL)
        or (artifact.kind == "shade_study" and payload.get("method") != STUDY_METHOD)
        or (artifact.kind == "terrain_study" and payload.get("method") != TERRAIN_METHOD),
        "payload": payload,
    }


def prior_request(session, project_id, kind, key):
    return session.scalar(
        select(Artifact).where(
            Artifact.project_id == project_id, Artifact.kind == kind, Artifact.request_key == key
        )
    )


def save_artifact(session, project, workspace, user_id, kind, key, payload):
    artifact = Artifact(
        project_id=project.id,
        kind=kind,
        request_key=key,
        workspace_revision=workspace.revision,
        project_revision=project.revision,
        payload=payload,
        created_by=user_id,
    )
    session.add(artifact)
    session.flush()
    response = artifact_response(artifact, workspace.revision, project.revision, internal=True)
    session.commit()
    return response


def run_analysis(session, org_id, project_id, user_id, data: AnalysisInput):
    access.require_project(session, org_id, project_id, user_id, "analyse")
    project = project_for_workspace(session, org_id, project_id, user_id, write=True)
    workspace = current_workspace(session, project_id, data.expected_revision)
    previous = prior_request(session, project_id, "analysis", data.request_key)
    if previous:
        return artifact_response(previous, workspace.revision, project.revision)
    try:
        payload = analyse_workspace(
            workspace.data, analysis_time(data, project.timezone), str(data.target_id)
        )
    except ValueError as exc:
        raise APIError(422, "analysis_input", str(exc)) from exc
    return save_artifact(
        session, project, workspace, user_id, "analysis", data.request_key, payload
    )


def run_estimate(session, org_id, project_id, user_id, data: EstimateInput):
    access.require_project(session, org_id, project_id, user_id, "estimate")
    project = project_for_workspace(session, org_id, project_id, user_id, write=True)
    if project.purpose == "developer_decision" and data.method != "indicative":
        raise APIError(
            422, "pricing_purpose", "Use indicative budget rates for a developer decision."
        )
    if project.purpose == "contractor_proposal" and data.method == "indicative":
        raise APIError(422, "pricing_purpose", "Select a contractor selling-price method.")
    if data.method != "indicative":
        access.require_project(session, org_id, project_id, user_id, "internal_pricing")
    workspace = current_workspace(session, project_id, data.expected_revision)
    previous = prior_request(session, project_id, "estimate", data.request_key)
    if previous:
        return artifact_response(
            previous, workspace.revision, project.revision, internal=data.method != "indicative"
        )
    items = workspace.data["scenarios"][data.scenario]["items"]
    items = pricing_items(items)
    ids = [UUID(item["rate_id"]) for item in items if item.get("rate_id")]
    rates = session.scalars(
        select(CatalogueRate).where(
            CatalogueRate.organisation_id == org_id, CatalogueRate.id.in_(ids)
        )
    ).all()
    try:
        payload = calculate_estimate(
            items,
            {str(rate.id): rate_data(rate) for rate in rates},
            currency=project.currency,
            method=data.method,
            percent=data.percent,
            wastage=data.wastage_percent,
            charges=[charge.model_dump(mode="json") for charge in data.charges],
            fixed_selling=data.fixed_selling,
            terrain_pending=bool(
                terrain_changed(workspace.data["scenarios"][data.scenario].get("terrain"))
                and not any(item.get("terrain_work") for item in items)
            ),
        )
    except ValueError as exc:
        raise APIError(422, "pricing_input", str(exc)) from exc
    payload["readiness"] = readiness(payload, date.today())
    payload["scenario"] = data.scenario
    result = save_artifact(
        session, project, workspace, user_id, "estimate", data.request_key, payload
    )
    if data.method == "indicative":
        result["payload"] = {
            key: payload.get(key)
            for key in (
                "scenario",
                "currency",
                "complete",
                "missing_rates",
                "selling_total",
                "rounding_policy",
                "readiness",
            )
        }
        result["payload"]["label"] = "Indicative budget"
    return result


def get_artifacts(session, org_id, project_id, user_id):
    project = project_for_workspace(session, org_id, project_id, user_id)
    workspace = session.get(Workspace, project_id)
    records = session.scalars(
        select(Artifact)
        .where(
            Artifact.project_id == project_id,
            Artifact.kind.notin_(["review", "shade_study", "terrain_study"]),
        )
        .order_by(Artifact.created_at.desc(), Artifact.id)
        .limit(100)
    ).all()
    return {
        "items": [
            artifact_response(
                record,
                workspace.revision if workspace else 0,
                project.revision,
                internal="internal_pricing"
                in access.project_capabilities(session, org_id, project_id, user_id),
            )
            for record in records
            if record.kind != "developer_brief"
            or "review_project" in access.project_capabilities(session, org_id, project_id, user_id)
            or "issue_developer_brief"
            in access.project_capabilities(session, org_id, project_id, user_id)
        ],
        "limit": 100,
    }


def issue_snapshot(
    session,
    org_id,
    project_id,
    user_id,
    data: IssueInput,
    kind: str,
    *,
    preview=False,
    storage=None,
):
    project = project_for_workspace(session, org_id, project_id, user_id)
    access.require_project(
        session,
        org_id,
        project_id,
        user_id,
        "issue_developer_brief" if kind == "developer_brief" else "issue_proposal",
    )
    # Serialise issue policy with checkpoint writes and brief edits.
    project = session.scalar(
        select(Project)
        .where(Project.id == project_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    from app.issue_readiness import context_issues

    context = context_issues(project, kind)
    if context and not preview:
        first = context[0]
        raise APIError(
            422 if first["code"] == "output_purpose" else 409, first["code"], first["message"]
        )
    workspace = session.get(Workspace, project_id)
    previous = prior_request(session, project_id, kind, data.request_key)
    if previous and not preview:
        return artifact_response(previous, workspace.revision if workspace else 0, project.revision)
    from app.brief_checkpoint import snapshot as brief_checkpoint_snapshot
    from app.issue_readiness import evaluate, refusal_code

    issues = evaluate(session, org_id, project, user_id, data, kind)
    if not preview and issues:
        first = issues[0]
        code = refusal_code(first["code"])
        status = (
            404
            if code == "not_found"
            else 422
            if code
            in {
                "output_purpose",
                "brief_incomplete",
                "proposal_validity",
                "proposal_fields",
                "change_summary",
                "required_text",
                "maintenance_checklist",
                "issue_confirmation",
            }
            else 403
            if code in {"issue_permission", "pricing_permission"}
            else 409
        )
        raise APIError(status, code, first["message"])
    blockers = [issue["message"] for issue in issues]
    checkpoint = brief_checkpoint_snapshot(session, project)
    estimate = session.scalar(
        select(Artifact).where(
            Artifact.id == data.estimate_id,
            Artifact.project_id == project_id,
            Artifact.kind == "estimate",
        )
    )
    # Drafts can be incomplete, but cannot render another option or an unavailable design.
    if (
        workspace is None
        or estimate is None
        or estimate.payload["scenario"] != data.preferred_option
    ):
        raise APIError(409, "issue_not_ready", "Save a design and select a total for this option.")
    price_review = estimate_readiness(
        session, org_id, project_id, user_id, estimate.id, data.valid_until
    )
    if data.pricing_override_reason:
        access.require_project(session, org_id, project_id, user_id, "internal_pricing")
    version = (
        session.scalar(
            select(func.count())
            .select_from(Artifact)
            .where(Artifact.project_id == project_id, Artifact.kind == kind)
        )
        or 0
    ) + 1
    evidence = session.scalars(
        select(Evidence)
        .where(
            Evidence.project_id == project_id,
            Evidence.id.in_(data.evidence_ids),
            Evidence.archived.is_(False),
        )
        .order_by(Evidence.created_at, Evidence.id)
    ).all()
    if len({item.id for item in evidence}) != len(set(data.evidence_ids)):
        raise not_found()

    images = {}
    if data.include_evidence_images:
        from app.output_images import freeze_images

        images = freeze_images(evidence, storage)

    def scope(key):
        items = workspace.data["scenarios"][key]["items"]
        if key != "baseline":
            shared = workspace.data["scenarios"]["baseline"]["items"]
            shared_ids = {item["id"] for item in shared}
            items = shared + [item for item in items if item["id"] not in shared_ids]
        return [
            {
                "id": item["id"],
                "name": item["name"],
                "kind": item["kind"],
                "status": item["status"],
                "pricing_status": item.get("pricing_status", "firm"),
                "quantity": str(item["quantity"]["value"]),
                "unit": item["quantity"]["calculated"]["unit"],
                "source_note": item["source_note"],
                "provenance": item["provenance"],
                "geometry": item["geometry"],
                "manual_basis": item.get("manual_basis", "count"),
            }
            for item in items
        ]

    # Two explicit output contracts. Neither ever contains a rate, cost, markup, margin or profit.
    payload = {
        "version": version,
        "customer_narrative": data.customer_narrative
        or (NOT_PROVIDED if preview and kind == "proposal" else ""),
        "site_constraints": constraint_summary(workspace.data.get("constraints", [])),
        "site_evidence": [
            {
                "id": str(item.id),
                "revision": item.revision,
                "description": item.description,
                "source_note": item.source_note,
                "observations": item.observations,
                "target_ids": item.target_ids,
                "sha256": item.sha256,
                **images.get(str(item.id), {}),
            }
            for item in evidence
        ],
        "issued_at": datetime.now(UTC).isoformat(),
        "project_name": project.name,
        "brief_checkpoint": checkpoint,
        "stakeholder": project.stakeholder,
        "problem": project.problem,
        "intended_users": project.intended_users,
        "desired_outcome": project.desired_outcome,
        "use_periods": project.use_periods,
        "timezone": project.timezone,
        # Hub notes/contact details are internal work-queue data, not customer output.
        "brief_details": {
            key: value for key, value in project.details.items() if key != "opportunity"
        },
        "display_units": session.get(Organisation, org_id).settings.get("units", "metric"),
        "preferred_option": data.preferred_option,
        "baseline": scope("baseline"),
        "selected_scope": scope(data.preferred_option),
        "site_boundary": workspace.data["boundary"],
        "targets": [
            {"name": target["name"], "geometry": target["geometry"]}
            for target in workspace.data["targets"]
        ],
        "currency": estimate.payload["currency"],
        "estimate_id": str(estimate.id),
        "assumptions": data.assumptions or (NOT_PROVIDED if preview else ""),
        "exclusions": data.exclusions or (NOT_PROVIDED if preview else ""),
        "shade": {
            "status": "omitted",
            "reason": "Numerical shade claims omitted; field validation is pending.",
        },
        "visual_source": "Project WGS84 geometry; schematic only, no third-party basemap.",
        "source_workspace_revision": workspace.revision,
        "source_project_revision": project.revision,
    }
    if kind == "developer_brief":
        budgets = {}
        for option in ("option_a", "option_b"):
            candidate = (
                estimate
                if option == data.preferred_option
                else session.scalar(
                    select(Artifact)
                    .where(
                        Artifact.project_id == project_id,
                        Artifact.kind == "estimate",
                        Artifact.workspace_revision == workspace.revision,
                        Artifact.project_revision == project.revision,
                        Artifact.payload["scenario"].astext == option,
                    )
                    .order_by(Artifact.created_at.desc(), Artifact.id)
                    .limit(1)
                )
            )
            budgets[option] = {
                "status": "unavailable"
                if candidate is None
                else "complete"
                if candidate.payload["complete"]
                else "partial"
            }
            if candidate is not None:
                budgets[option]["estimate_id"] = str(candidate.id)
                if candidate.payload["complete"]:
                    budgets[option]["total"] = candidate.payload["selling_total"]
        payload.update(
            title="Developer decision brief",
            criteria=data.criteria or ([NOT_PROVIDED] if preview else []),
            review_notes=data.review_notes or (NOT_PROVIDED if preview else ""),
            reviewer_id=str(user_id),
            reviewed_at=datetime.now(UTC).isoformat(),
            indicative_budget=estimate.payload["selling_total"],
            option_a=scope("option_a"),
            option_b=scope("option_b"),
            option_budgets=budgets,
        )
    else:
        payload.update(
            title="Contractor client proposal",
            selling_total=estimate.payload["selling_total"],
            valid_until=data.valid_until.isoformat() if data.valid_until else "Not set",
            programme=data.programme or (NOT_PROVIDED if preview else ""),
            maintenance=data.maintenance or (NOT_PROVIDED if preview else ""),
            change_summary=data.change_summary,
            pricing_warnings=[
                w["message"] for w in price_review["warnings"] if w["code"] != "below_cost"
            ],
            pricing_review={
                "reviewer_id": str(user_id),
                "reviewed_at": datetime.now(UTC).isoformat(),
                "exception_reviewed": bool(data.pricing_override_reason),
            },
            quantity_schedule=[
                {
                    "item_id": line["item_id"],
                    "description": line["description"],
                    "quantity": line["quantity"],
                    "unit": line["unit"],
                }
                for line in estimate.payload.get("lines", [])
            ],
        )
    if kind == "proposal":
        prior = session.scalar(
            select(Artifact)
            .where(Artifact.project_id == project_id, Artifact.kind == "proposal")
            .order_by(Artifact.created_at.desc(), Artifact.id)
            .limit(1)
        )
        if prior:
            before = {row["id"]: row for row in prior.payload["selected_scope"]}
            after = {row["id"]: row for row in payload["selected_scope"]}
            payload["previous_issue"] = {
                "id": str(prior.id),
                "version": prior.payload["version"],
                "selling_total": prior.payload["selling_total"],
            }
            payload["scope_changes"] = [
                {
                    "id": key,
                    "name": (after.get(key) or before[key])["name"],
                    "change": "added"
                    if key not in before
                    else "removed"
                    if key not in after
                    else "changed",
                }
                for key in sorted(set(before) | set(after))
                if before.get(key) != after.get(key)
            ]
    if kind == "proposal":
        payload["maintenance_plan"] = maintenance_plan(
            [
                task.model_copy(
                    update={
                        "task": task.task or NOT_PROVIDED,
                        "frequency": task.frequency or NOT_PROVIDED,
                    }
                )
                if preview
                else task
                for task in data.maintenance_plan
            ]
        )
    plan_scopes = (
        {"baseline": payload["baseline"], "selected": payload["selected_scope"]}
        if kind == "proposal"
        else {
            "baseline": payload["baseline"],
            "option_a": payload["option_a"],
            "option_b": payload["option_b"],
        }
    )
    payload["plan_sheet"] = plan_sheet(
        workspace.data["boundary"],
        workspace.data["targets"],
        plan_scopes,
        payload["site_constraints"],
        payload["issued_at"],
        project.timezone,
    )
    payload["template"] = TEMPLATE
    payload["manifest"] = {
        "schema": SCHEMA,
        "renderer": RENDERER_NOTE,
        "font_sha256": "b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5",
        "estimate_id": str(estimate.id),
        "workspace_revision": workspace.revision,
        "project_revision": project.revision,
        "evidence": [
            {"id": str(e.id), "revision": e.revision, "sha256": e.sha256} for e in evidence
        ],
    }

    if preview:
        payload["draft"] = True
        payload["draft_issues"] = blockers
        return payload
    if data.pricing_override_reason:
        session.add(
            AdministrationEvent(
                organisation_id=org_id,
                actor_id=user_id,
                payload={
                    "action": "pricing_issue_override",
                    "project_id": str(project_id),
                    "request_key": str(data.request_key),
                    "estimate_id": str(estimate.id),
                    "reason": data.pricing_override_reason,
                    "warnings": price_review["warnings"],
                },
            )
        )
    return save_artifact(session, project, workspace, user_id, kind, data.request_key, payload)


class RateArchiveInput(StrictModel):
    expected_revision: Annotated[int, Field(ge=1)]
    archived: bool


def archive_rate(session, org_id, user_id, rate_id, data: RateArchiveInput):
    require_capability(session, org_id, user_id, "change_catalogue")
    rate = session.scalar(
        select(CatalogueRate)
        .where(CatalogueRate.organisation_id == org_id, CatalogueRate.id == rate_id)
        .with_for_update()
    )
    if rate is None:
        raise not_found()
    if rate.basis == "cost":
        require_capability(session, org_id, user_id, "internal_pricing")
    if rate.metadata_revision != data.expected_revision:
        raise APIError(409, "rate_conflict", "Rate archive state changed. Reload the catalogue.")
    rate.archived = data.archived
    rate.metadata_revision += 1
    result = rate_data(rate)
    session.commit()
    return result


def estimate_readiness(session, org_id, project_id, user_id, estimate_id, valid_until=None):
    project_for_workspace(session, org_id, project_id, user_id)
    estimate = session.scalar(
        select(Artifact).where(
            Artifact.id == estimate_id,
            Artifact.project_id == project_id,
            Artifact.kind == "estimate",
        )
    )
    if not estimate:
        raise not_found()
    payload = deepcopy(estimate.payload)
    rate_ids = [UUID(line["rate"]["id"]) for line in payload.get("lines", [])]
    current = {
        str(r.id): r
        for r in session.scalars(
            select(CatalogueRate).where(
                CatalogueRate.organisation_id == org_id, CatalogueRate.id.in_(rate_ids)
            )
        ).all()
    }
    for line in payload.get("lines", []):
        if line["rate"]["id"] in current:
            line["rate"]["archived"] = current[line["rate"]["id"]].archived
    # K02: a newer version of a selected rate needs review; the estimate keeps its version.
    codes = {line["rate"].get("code") for line in payload.get("lines", [])} - {None}
    latest = dict(
        session.execute(
            select(CatalogueRate.code, func.max(CatalogueRate.version))
            .where(
                CatalogueRate.organisation_id == org_id,
                CatalogueRate.code.in_(codes),
                CatalogueRate.archived.is_(False),
            )
            .group_by(CatalogueRate.code)
        ).all()
    )
    for line in payload.get("lines", []):
        newest = latest.get(line["rate"].get("code"))
        if newest and newest > line["rate"].get("version", newest):
            line["rate"]["superseded_by"] = newest
    result = readiness(payload, date.today(), valid_until)
    caps = access.project_capabilities(session, org_id, project_id, user_id)
    if "internal_pricing" not in caps:
        result["warnings"] = [
            w
            if w["code"] != "below_cost"
            else {
                "code": "commercial_review",
                "message": "An authorised commercial review is required.",
                "item_id": None,
            }
            for w in result["warnings"]
        ]
    return result
