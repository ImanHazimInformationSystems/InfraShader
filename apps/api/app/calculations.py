"""Saved calculations and audience-specific issued snapshots; all authority stays here."""

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, Field, model_validator
from sqlalchemy import func, select

from app.domain.pricing import calculate_estimate
from app.domain.shade import analyse_workspace
from app.errors import APIError, not_found
from app.models import Artifact, CatalogueRate, Organisation, Workspace
from app.projects import require_membership
from app.workspace import ScenarioKey, StrictModel, project_for_workspace

Money = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=4)]


class RateInput(StrictModel):
    code: Annotated[str, Field(min_length=1, max_length=80)]
    description: Annotated[str, Field(min_length=1, max_length=500)]
    unit: Literal["m2", "m", "item"]
    currency: Literal["MYR"] = "MYR"
    basis: Literal["indicative_budget", "cost"]
    amount: Money
    effective_date: date
    source_note: Annotated[str, Field(min_length=1, max_length=2000)]
    includes: list[Literal["labour", "transport", "overhead"]] = []


class CalculationInput(StrictModel):
    expected_revision: Annotated[int, Field(ge=1)]
    request_key: UUID


class AnalysisInput(CalculationInput):
    timestamp: AwareDatetime
    target_id: UUID


class Charge(StrictModel):
    category: Literal["labour", "transport", "overhead", "fixed"]
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
    charges: Annotated[list[Charge], Field(max_length=4)] = []

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


def allowed(membership, capability):
    return membership.role == "administrator" or capability in membership.capabilities


def require_capability(session, org_id, user_id, capability):
    membership = require_membership(session, org_id, user_id)
    if not allowed(membership, capability):
        raise APIError(403, "permission_denied", f"This action requires {capability} permission.")
    return membership


def rate_data(rate):
    return {
        key: value
        for key, value in {
            "id": str(rate.id),
            "code": rate.code,
            "version": rate.version,
            "description": rate.description,
            "unit": rate.unit,
            "currency": rate.currency,
            "basis": rate.basis,
            "amount": str(rate.amount),
            "effective_date": rate.effective_date.isoformat(),
            "source_note": rate.source_note,
            "includes": rate.includes,
        }.items()
    }


def visible_rate(rate, membership):
    item = rate_data(rate)
    if item["basis"] == "cost" and not allowed(membership, "internal_pricing"):
        del item["amount"]
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


def list_rates(session, org_id, user_id, *, query="", unit=None, basis=None, offset=0, limit=50):
    membership = require_membership(session, org_id, user_id)
    filters = [CatalogueRate.organisation_id == org_id]
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
    if artifact.kind == "estimate" and (not internal or payload["method"] == "indicative"):
        # Construct an allowlist; never forward rate dictionaries or arbitrary nested input.
        payload = {
            key: payload[key]
            for key in (
                "scenario",
                "currency",
                "complete",
                "missing_rates",
                "selling_total",
                "rounding_policy",
            )
        }
        payload["label"] = (
            "Indicative budget" if artifact.payload["method"] == "indicative" else "Selling price"
        )
    return {
        "id": str(artifact.id),
        "kind": artifact.kind,
        "workspace_revision": artifact.workspace_revision,
        "project_revision": artifact.project_revision,
        "created_at": artifact.created_at.isoformat(),
        "stale": artifact.workspace_revision != workspace_revision
        or artifact.project_revision != project_revision,
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
    project = project_for_workspace(session, org_id, project_id, user_id, write=True)
    workspace = current_workspace(session, project_id, data.expected_revision)
    previous = prior_request(session, project_id, "analysis", data.request_key)
    if previous:
        return artifact_response(previous, workspace.revision, project.revision)
    try:
        payload = analyse_workspace(workspace.data, data.timestamp, str(data.target_id))
    except ValueError as exc:
        raise APIError(422, "analysis_input", str(exc)) from exc
    return save_artifact(
        session, project, workspace, user_id, "analysis", data.request_key, payload
    )


def run_estimate(session, org_id, project_id, user_id, data: EstimateInput):
    project = project_for_workspace(session, org_id, project_id, user_id, write=True)
    if project.purpose == "developer_decision" and data.method != "indicative":
        raise APIError(
            422, "pricing_purpose", "Use indicative budget rates for a developer decision."
        )
    if project.purpose == "contractor_proposal" and data.method == "indicative":
        raise APIError(422, "pricing_purpose", "Select a contractor selling-price method.")
    if data.method != "indicative":
        require_capability(session, org_id, user_id, "internal_pricing")
    workspace = current_workspace(session, project_id, data.expected_revision)
    previous = prior_request(session, project_id, "estimate", data.request_key)
    if previous:
        return artifact_response(
            previous, workspace.revision, project.revision, internal=data.method != "indicative"
        )
    items = workspace.data["scenarios"][data.scenario]["items"]
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
        )
    except ValueError as exc:
        raise APIError(422, "pricing_input", str(exc)) from exc
    payload["scenario"] = data.scenario
    result = save_artifact(
        session, project, workspace, user_id, "estimate", data.request_key, payload
    )
    if data.method == "indicative":
        result["payload"] = {
            key: payload[key]
            for key in (
                "scenario",
                "currency",
                "complete",
                "missing_rates",
                "selling_total",
                "rounding_policy",
            )
        }
        result["payload"]["label"] = "Indicative budget"
    return result


def get_artifacts(session, org_id, project_id, user_id):
    project = project_for_workspace(session, org_id, project_id, user_id)
    membership = require_membership(session, org_id, user_id)
    workspace = session.get(Workspace, project_id)
    records = session.scalars(
        select(Artifact)
        .where(Artifact.project_id == project_id, Artifact.kind != "review")
        .order_by(Artifact.created_at.desc(), Artifact.id)
        .limit(100)
    ).all()
    return {
        "items": [
            artifact_response(
                record,
                workspace.revision if workspace else 0,
                project.revision,
                internal=allowed(membership, "internal_pricing"),
            )
            for record in records
        ],
        "limit": 100,
    }


def issue_snapshot(session, org_id, project_id, user_id, data: IssueInput, kind: str):
    project = project_for_workspace(session, org_id, project_id, user_id, write=True)
    require_capability(
        session,
        org_id,
        user_id,
        "issue_developer_brief" if kind == "developer_brief" else "issue_proposal",
    )
    if (kind == "developer_brief") != (project.purpose == "developer_decision"):
        raise APIError(422, "output_purpose", "Choose the output matching this project purpose.")
    workspace = session.get(Workspace, project_id)
    previous = prior_request(session, project_id, kind, data.request_key)
    if previous:
        return artifact_response(previous, workspace.revision if workspace else 0, project.revision)
    if project.revision != data.expected_project_revision:
        raise APIError(409, "stale_brief", "Reload and review the current project brief.")
    if not all(
        (project.problem, project.intended_users, project.desired_outcome, project.use_periods)
    ):
        raise APIError(
            422, "brief_incomplete", "Complete problem, intended users, outcome and use periods."
        )
    estimate = session.scalar(
        select(Artifact).where(
            Artifact.id == data.estimate_id,
            Artifact.project_id == project_id,
            Artifact.kind == "estimate",
        )
    )
    if estimate is None:
        raise not_found()
    if (
        workspace is None
        or not workspace.data["targets"]
        or estimate.workspace_revision != workspace.revision
        or estimate.project_revision != project.revision
        or not estimate.payload["complete"]
        or estimate.payload["scenario"] != data.preferred_option
    ):
        raise APIError(
            409,
            "issue_not_ready",
            "Save target zones and a complete current estimate for the preferred option.",
        )
    version = (
        session.scalar(
            select(func.count())
            .select_from(Artifact)
            .where(Artifact.project_id == project_id, Artifact.kind == kind)
        )
        or 0
    ) + 1

    def scope(key):
        return [
            {
                "id": item["id"],
                "name": item["name"],
                "kind": item["kind"],
                "status": item["status"],
                "quantity": str(item["quantity"]["value"]),
                "unit": item["quantity"]["calculated"]["unit"],
                "source_note": item["source_note"],
                "provenance": item["provenance"],
            }
            for item in workspace.data["scenarios"][key]["items"]
        ]

    # Two explicit output contracts. Neither ever contains a rate, cost, markup, margin or profit.
    payload = {
        "version": version,
        "issued_at": datetime.now(UTC).isoformat(),
        "project_name": project.name,
        "stakeholder": project.stakeholder,
        "problem": project.problem,
        "intended_users": project.intended_users,
        "desired_outcome": project.desired_outcome,
        "use_periods": project.use_periods,
        "timezone": project.timezone,
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
        "assumptions": data.assumptions,
        "exclusions": data.exclusions,
        "shade": {
            "status": "omitted",
            "reason": "Numerical shade claims omitted; field validation is pending.",
        },
        "visual_source": "Project WGS84 geometry; schematic only, no third-party basemap.",
        "source_workspace_revision": workspace.revision,
        "source_project_revision": project.revision,
    }
    if kind == "developer_brief":
        payload.update(
            title="Developer decision brief",
            criteria=data.criteria,
            review_notes=data.review_notes,
            reviewer_id=str(user_id),
            reviewed_at=datetime.now(UTC).isoformat(),
            indicative_budget=estimate.payload["selling_total"],
            option_a=scope("option_a"),
            option_b=scope("option_b"),
        )
    else:
        payload.update(
            title="Contractor client proposal", selling_total=estimate.payload["selling_total"]
        )
    return save_artifact(session, project, workspace, user_id, kind, data.request_key, payload)
