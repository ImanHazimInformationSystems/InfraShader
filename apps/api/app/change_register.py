"""K03/L26 change requests and K02 'changed since last issue' impact for contractor proposals.

A change request is acknowledgement evidence, not a contract variation, signature or payment.
Impact compares the last *issued* proposal with the current saved design and the latest
current estimate; it never edits an issued proposal and never exposes internal cost.
"""

import io
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Response
from pydantic import Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import access, csv_safety
from app.auth import current_user
from app.db import database_session
from app.errors import APIError, not_found
from app.models import Artifact, ChangeRequest, Evidence, Workspace
from app.schemas import Contract

router = APIRouter(prefix="/api/v1/organisations/{organisation_id}/projects/{project_id}")
DB = Annotated[Session, Depends(database_session)]
User = Annotated[UUID, Depends(current_user)]
Text = Annotated[str, Field(max_length=4000)]

# Allowed transitions. Acknowledged/rejected are client outcomes and need external evidence.
TRANSITIONS = {
    "prepared": {"reviewed", "withdrawn"},
    "reviewed": {"sent", "prepared", "withdrawn"},
    "sent": {"acknowledged", "rejected", "withdrawn"},
    "acknowledged": set(),
    "rejected": set(),
    "withdrawn": set(),
}


class ChangeCreate(Contract):
    requester: Annotated[str, Field(min_length=1, max_length=160)]
    requester_role: Literal["client", "contractor", "site_condition", "other"]
    requested_on: date
    reason: Annotated[str, Field(min_length=1, max_length=4000)]
    original_scope: Text = ""
    proposed_additions: Text = ""
    proposed_removals: Text = ""
    time_effect: Text = ""
    affected_item_ids: Annotated[list[UUID], Field(max_length=200)] = []

    @model_validator(mode="after")
    def check(self):
        if not (self.proposed_additions.strip() or self.proposed_removals.strip()):
            raise ValueError("Describe the proposed addition or removal.")
        return self


class ChangeTransition(Contract):
    expected_revision: Annotated[int, Field(ge=1)]
    state: Literal["prepared", "reviewed", "sent", "acknowledged", "rejected", "withdrawn"]
    note: Annotated[str, Field(min_length=1, max_length=4000)]
    sent_method: Annotated[str, Field(max_length=200)] = ""
    external_person: Annotated[str, Field(max_length=160)] = ""
    outcome_date: date | None = None
    evidence_ids: Annotated[list[UUID], Field(max_length=10)] = []

    @model_validator(mode="after")
    def check(self):
        if self.state == "sent" and not self.sent_method.strip():
            raise ValueError("Record how the change summary was sent.")
        if self.state in ("acknowledged", "rejected") and (
            not self.external_person.strip() or self.outcome_date is None or not self.evidence_ids
        ):
            raise ValueError(
                "A client outcome needs the external person, date and attached evidence; "
                "an internal note cannot stand in for client acknowledgement."
            )
        return self


class IssueLink(Contract):
    expected_revision: Annotated[int, Field(ge=1)]
    proposal_id: UUID


def _project(db, org, pid, user, capability="read_project"):
    project = access.require_project(db, org, pid, user, capability)
    if project.purpose != "contractor_proposal":
        raise APIError(409, "change_purpose", "Change requests apply to contractor proposals.")
    return project


def _current(db, pid, key):
    return db.scalar(
        select(ChangeRequest)
        .where(ChangeRequest.project_id == pid, ChangeRequest.key == key)
        .order_by(ChangeRequest.revision.desc())
        .limit(1)
    )


def _all_current(db, pid):
    latest = (
        select(ChangeRequest.key, func.max(ChangeRequest.revision).label("rev"))
        .where(ChangeRequest.project_id == pid)
        .group_by(ChangeRequest.key)
        .subquery()
    )
    return db.scalars(
        select(ChangeRequest)
        .join(
            latest,
            (ChangeRequest.key == latest.c.key) & (ChangeRequest.revision == latest.c.rev),
        )
        .where(ChangeRequest.project_id == pid)
        .order_by(ChangeRequest.created_at)
    ).all()


def _append(db, pid, key, expected, payload, user):
    row = _current(db, pid, key)
    if (row.revision if row else 0) != expected:
        raise APIError(409, "change_conflict", "This change request changed; reload and retry.")
    entry = ChangeRequest(
        project_id=pid, key=key, revision=expected + 1, payload=payload, created_by=user
    )
    db.add(entry)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise APIError(409, "change_conflict", "Another person saved first; reload.") from exc
    return entry


def _view(row):
    return {
        "key": str(row.key),
        "revision": row.revision,
        "payload": row.payload,
        "updated_by": str(row.created_by),
        "updated_at": row.created_at.isoformat(),
    }


def _last_issue(db, pid):
    return db.scalar(
        select(Artifact)
        .where(Artifact.project_id == pid, Artifact.kind == "proposal")
        .order_by(Artifact.created_at.desc(), Artifact.id)
        .limit(1)
    )


def _scope(workspace, option):
    scenarios = workspace.data["scenarios"]
    items = list(scenarios["baseline"]["items"])
    shared = {item["id"] for item in items}
    if option != "baseline":
        items += [item for item in scenarios[option]["items"] if item["id"] not in shared]
    return {
        item["id"]: {
            "name": item["name"],
            "quantity": str(item["quantity"]["value"]),
            "unit": item["quantity"]["calculated"]["unit"],
            "status": item.get("status"),
        }
        for item in items
    }


def impact(db, project):
    """Changed since last issue: item quantities and selling totals, never internal cost."""
    issue = _last_issue(db, project.id)
    workspace = db.get(Workspace, project.id)
    if issue is None:
        return {"status": "no_issue", "message": "No proposal has been issued yet."}
    option = issue.payload["preferred_option"]
    before = {
        row["id"]: {"name": row["name"], "quantity": row["quantity"], "unit": row["unit"]}
        for row in issue.payload["selected_scope"]
    }
    after = _scope(workspace, option) if workspace else {}
    items = []
    for key in sorted(set(before) | set(after)):
        old, new = before.get(key), after.get(key)
        if old and new and (old["quantity"], old["unit"]) == (new["quantity"], new["unit"]):
            if old["name"] == new["name"]:
                continue
        change = "added" if old is None else "removed" if new is None else "changed"
        delta = None
        if old and new and old["unit"] == new["unit"]:
            delta = str(Decimal(new["quantity"]) - Decimal(old["quantity"]))
        items.append(
            {
                "item_id": key,
                "name": (new or old)["name"],
                "change": change,
                "unit_before": old and old["unit"],
                "unit_after": new and new["unit"],
                "quantity_before": old and old["quantity"],
                "quantity_after": new and new["quantity"],
                "quantity_delta": delta,
                "unit_changed": bool(old and new and old["unit"] != new["unit"]),
            }
        )
    estimate = None
    if workspace:
        estimate = db.scalar(
            select(Artifact)
            .where(
                Artifact.project_id == project.id,
                Artifact.kind == "estimate",
                Artifact.workspace_revision == workspace.revision,
                Artifact.project_revision == project.revision,
                Artifact.payload["scenario"].astext == option,
            )
            .order_by(Artifact.created_at.desc(), Artifact.id)
            .limit(1)
        )
    issued_total = issue.payload.get("selling_total")
    price = {"issued_total": issued_total, "currency": issue.payload.get("currency")}
    if estimate is None:
        price.update(status="estimate_needed", current_total=None, delta=None)
    elif not estimate.payload["complete"]:
        # Partial estimates never produce a misleading difference (K04).
        price.update(status="estimate_partial", current_total=None, delta=None)
    else:
        current = estimate.payload["selling_total"]
        price.update(
            status="current",
            current_total=current,
            delta=str(Decimal(current) - Decimal(issued_total)),
            estimate_id=str(estimate.id),
        )
    unchanged_design = (
        workspace is not None
        and workspace.revision == issue.workspace_revision
        and project.revision == issue.project_revision
    )
    return {
        "status": "unchanged" if unchanged_design and not items else "changed",
        "issue": {
            "id": str(issue.id),
            "version": issue.payload["version"],
            "issued_at": issue.payload["issued_at"],
            "preferred_option": option,
            "workspace_revision": issue.workspace_revision,
            "project_revision": issue.project_revision,
        },
        "current": {
            "workspace_revision": workspace.revision if workspace else None,
            "project_revision": project.revision,
        },
        "items": items,
        "price": price,
        "review_needed": [
            *(["Brief changed since issue."] if project.revision != issue.project_revision else []),
            *(
                ["Recalculate the estimate for the issued option."]
                if price["status"] != "current"
                else []
            ),
            *(
                ["Unit changed for at least one item."]
                if any(i["unit_changed"] for i in items)
                else []
            ),
        ],
    }


@router.get("/change-requests")
def list_changes(organisation_id: UUID, project_id: UUID, user: User, db: DB):
    project = _project(db, organisation_id, project_id, user)
    return {
        "items": [_view(r) for r in _all_current(db, project_id)],
        "impact": impact(db, project),
        "proposals": [
            {"id": str(a.id), "version": a.payload["version"], "issued_at": a.payload["issued_at"]}
            for a in db.scalars(
                select(Artifact)
                .where(Artifact.project_id == project_id, Artifact.kind == "proposal")
                .order_by(Artifact.created_at)
            ).all()
        ],
    }


@router.post("/change-requests", status_code=201)
def create_change(organisation_id: UUID, project_id: UUID, data: ChangeCreate, user: User, db: DB):
    _project(db, organisation_id, project_id, user, "edit_project")
    workspace = db.get(Workspace, project_id)
    known = set()
    if workspace:
        for scenario in workspace.data["scenarios"].values():
            known |= {item["id"] for item in scenario["items"]}
    if any(str(i) not in known for i in data.affected_item_ids):
        raise APIError(422, "change_items", "Affected items must exist in the saved design.")
    issue = _last_issue(db, project_id)
    payload = {
        **data.model_dump(mode="json"),
        "state": "prepared",
        "base_issue": None
        if issue is None
        else {"id": str(issue.id), "version": issue.payload["version"]},
        "impact_snapshot": None,
        "revised_issue": None,
        "history": [
            {
                "state": "prepared",
                "by": str(user),
                "at": datetime.now(UTC).isoformat(),
                "note": "Recorded",
            }
        ],
    }
    entry = _append(db, project_id, uuid4(), 0, payload, user)
    db.commit()
    return _view(entry)


@router.post("/change-requests/{key}/transition")
def transition(
    organisation_id: UUID, project_id: UUID, key: UUID, data: ChangeTransition, user: User, db: DB
):
    capability = "issue_proposal" if data.state == "reviewed" else "edit_project"
    project = _project(db, organisation_id, project_id, user, capability)
    row = _current(db, project_id, key)
    if row is None:
        raise not_found()
    state = row.payload["state"]
    if data.state not in TRANSITIONS[state]:
        raise APIError(409, "change_state", f"A {state} change request cannot become {data.state}.")
    if data.evidence_ids:
        found = db.scalar(
            select(func.count())
            .select_from(Evidence)
            .where(
                Evidence.project_id == project_id,
                Evidence.id.in_(data.evidence_ids),
                Evidence.archived.is_(False),
            )
        )
        if found != len(set(data.evidence_ids)):
            raise not_found()
    payload = dict(row.payload)
    now = datetime.now(UTC).isoformat()
    if data.state == "reviewed":
        # Freeze the commercial impact as reviewed; later design edits never rewrite it.
        payload["impact_snapshot"] = {**impact(db, project), "frozen_at": now}
    if data.state == "prepared":
        payload["impact_snapshot"] = None
    if data.state == "sent":
        payload["sent_method"] = data.sent_method
    if data.state in ("acknowledged", "rejected"):
        payload["outcome"] = {
            "external_person": data.external_person,
            "date": data.outcome_date.isoformat(),
            "evidence_ids": [str(e) for e in data.evidence_ids],
            "note": "Acknowledgement record only; not a contract variation or payment approval.",
        }
    payload["state"] = data.state
    payload["history"] = row.payload["history"] + [
        {"state": data.state, "by": str(user), "at": now, "note": data.note}
    ]
    entry = _append(db, project_id, key, data.expected_revision, payload, user)
    db.commit()
    return _view(entry)


@router.post("/change-requests/{key}/revised-issue")
def link_issue(
    organisation_id: UUID, project_id: UUID, key: UUID, data: IssueLink, user: User, db: DB
):
    _project(db, organisation_id, project_id, user, "issue_proposal")
    row = _current(db, project_id, key)
    if row is None:
        raise not_found()
    if row.payload["state"] not in ("reviewed", "sent", "acknowledged"):
        raise APIError(409, "change_state", "Link a revised issue only after internal review.")
    if row.payload.get("revised_issue"):
        raise APIError(409, "change_linked", "This change request is already linked.")
    proposal = db.scalar(
        select(Artifact).where(
            Artifact.id == data.proposal_id,
            Artifact.project_id == project_id,
            Artifact.kind == "proposal",
        )
    )
    if proposal is None:
        raise not_found()
    base = row.payload.get("base_issue")
    if base and proposal.payload["version"] <= base["version"]:
        raise APIError(
            422, "change_issue", "Link a proposal issued after the change request's base issue."
        )
    payload = {
        **row.payload,
        "revised_issue": {"id": str(proposal.id), "version": proposal.payload["version"]},
        "history": row.payload["history"]
        + [
            {
                "state": row.payload["state"],
                "by": str(user),
                "at": datetime.now(UTC).isoformat(),
                "note": f"Linked revised proposal v{proposal.payload['version']}",
            }
        ],
    }
    entry = _append(db, project_id, key, data.expected_revision, payload, user)
    db.commit()
    return _view(entry)


@router.get("/change-requests/export.csv")
def export(organisation_id: UUID, project_id: UUID, user: User, db: DB):
    project = _project(db, organisation_id, project_id, user)
    out = io.StringIO()
    writer = csv_safety.writer(out)
    writer.writerow(
        [
            "project",
            "change",
            "state",
            "requester",
            "role",
            "requested_on",
            "reason",
            "additions",
            "removals",
            "time_effect",
            "base_issue_version",
            "issued_total",
            "reviewed_current_total",
            "reviewed_delta",
            "revised_issue_version",
            "outcome_person",
            "outcome_date",
        ]
    )
    for row in _all_current(db, project_id):
        p = row.payload
        snap = p.get("impact_snapshot") or {}
        price = snap.get("price") or {}
        writer.writerow(
            [
                project.name,
                str(row.key),
                p["state"],
                p["requester"],
                p["requester_role"],
                p["requested_on"],
                p["reason"],
                p["proposed_additions"],
                p["proposed_removals"],
                p["time_effect"],
                (p.get("base_issue") or {}).get("version"),
                price.get("issued_total"),
                price.get("current_total"),
                price.get("delta"),
                (p.get("revised_issue") or {}).get("version"),
                (p.get("outcome") or {}).get("external_person"),
                (p.get("outcome") or {}).get("date"),
            ]
        )
    return Response(
        out.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="change-register.csv"',
            "Cache-Control": "private, no-store",
        },
    )


__all__ = ["router", "impact"]
