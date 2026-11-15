"""D1B owner proposal review: intake, confirmed comparison, locked rubric, signoff and pack.

Every change appends an immutable ``review_entries`` revision. Policy that the catalogue
leaves to the owner (weights, missing-score rule, reviewer aggregation, self-approval) has
no default: the owner must choose it explicitly before it is used (REC-010). Ties are
reported, never broken. Nothing here infers prices, scope, scores or approval.
"""

import hashlib
import io
import json
import zipfile
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from statistics import median
from typing import Annotated, Literal
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from pydantic import AwareDatetime, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import access, csv_safety
from app.auth import current_user
from app.db import database_session
from app.errors import APIError, not_found
from app.models import Project, ProjectGrant, ReviewEntry, ReviewFile
from app.schemas import Contract

router = APIRouter(prefix="/api/v1/organisations/{organisation_id}")
DB = Annotated[Session, Depends(database_session)]
User = Annotated[UUID, Depends(current_user)]

MAX_FILE_BYTES = 10 * 1024 * 1024
FOUR = Decimal("0.0001")
TWO = Decimal("0.01")
READ_CAPS = {"review_project", "issue_developer_brief"}
Text = Annotated[str, Field(max_length=4000)]
Short = Annotated[str, Field(min_length=1, max_length=160)]
Code = Annotated[str, Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9._-]+$")]
Money = Annotated[Decimal, Field(ge=0, max_digits=16, decimal_places=2)]
SignedMoney = Annotated[Decimal, Field(max_digits=16, decimal_places=2)]
Quantity = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=4)]


# ---------------------------------------------------------------- contracts


class SourceRef(Contract):
    """Originating retained document and its page/sheet/cell, entered by a person."""

    document_id: UUID
    location: Annotated[str, Field(min_length=1, max_length=120)]


class ScopeItem(Contract):
    code: Code
    description: Annotated[str, Field(min_length=1, max_length=500)]
    unit: Annotated[str, Field(min_length=1, max_length=16)]
    quantity: Quantity | None = None


class Requirement(Contract):
    code: Code
    text: Annotated[str, Field(min_length=1, max_length=1000)]
    kind: Literal["eligibility", "technical"]
    mandatory: bool
    expiry_required: bool = False


def _unique(values, label):
    if len(values) != len(set(values)):
        raise ValueError(f"{label} codes must be unique.")


class BasisInput(Contract):
    expected_revision: Annotated[int, Field(ge=0)]
    title: Short
    deliverables: Text = ""
    submission_requirements: Text = ""
    currency: Literal["MYR"] = "MYR"
    tax_basis: Literal["exclusive", "inclusive"]
    budget: Money | None = None
    deadline: AwareDatetime | None = None
    deadline_timezone: Annotated[str, Field(min_length=1, max_length=64)] = "Asia/Kuala_Lumpur"
    evaluation_horizon_years: Annotated[int, Field(ge=1, le=60)] | None = None
    scope_items: Annotated[list[ScopeItem], Field(min_length=1, max_length=200)]
    requirements: Annotated[list[Requirement], Field(max_length=100)] = []
    reviewers: Annotated[list[UUID], Field(max_length=20)] = []
    self_approval: Literal["prohibited", "permitted"]
    addendum_note: Text = ""

    @model_validator(mode="after")
    def check(self):
        _unique([i.code for i in self.scope_items], "Scope item")
        _unique([i.code for i in self.requirements], "Requirement")
        if len(set(self.reviewers)) != len(self.reviewers):
            raise ValueError("Assign each reviewer once.")
        if self.expected_revision > 0 and not self.addendum_note.strip():
            raise ValueError("A changed basis is an addendum: record what changed and why.")
        return self


class Criterion(Contract):
    code: Code
    name: Short
    weight: Annotated[Decimal, Field(gt=0, le=100, max_digits=5, decimal_places=2)]
    direction: Literal["higher_better", "lower_better"]
    scale_min: Annotated[int, Field(ge=0, le=100)]
    scale_max: Annotated[int, Field(ge=1, le=100)]
    mandatory_gate: bool = False
    pass_mark: Annotated[int, Field(ge=0, le=100)] | None = None
    evidence_requirement: Text = ""
    guidance: Text = ""

    @model_validator(mode="after")
    def check(self):
        if self.scale_max <= self.scale_min:
            raise ValueError("Scale maximum must exceed its minimum.")
        if self.mandatory_gate != (self.pass_mark is not None):
            raise ValueError("A mandatory gate needs a pass mark, and only gates have one.")
        if self.pass_mark is not None and not self.scale_min <= self.pass_mark <= self.scale_max:
            raise ValueError("Pass mark must be within the scale.")
        return self


class RubricInput(Contract):
    expected_revision: Annotated[int, Field(ge=0)]
    criteria: Annotated[list[Criterion], Field(min_length=1, max_length=30)]
    missing_score_rule: Literal["not_ranked", "scale_minimum"]
    reviewer_aggregation: Literal["mean", "median"]
    tie_policy: Literal["report_only"] = "report_only"
    change_reason: Text = ""

    @model_validator(mode="after")
    def check(self):
        _unique([c.code for c in self.criteria], "Criterion")
        if sum(c.weight for c in self.criteria) != Decimal(100):
            raise ValueError("Criterion weights must total exactly 100.")
        return self


class RubricLock(Contract):
    expected_revision: Annotated[int, Field(ge=1)]


class SubmissionCreate(Contract):
    bidder_name: Short
    channel: Literal["external_document", "native_upload"]
    supplier_registered: bool = False
    sender: Short
    received_at: AwareDatetime
    receipt_evidence: Annotated[str, Field(min_length=1, max_length=2000)]


class Field_(Contract):
    state: Literal["unconfirmed", "confirmed", "not_provided"] = "unconfirmed"
    source: SourceRef | None = None

    @model_validator(mode="after")
    def check(self):
        if self.state == "confirmed" and self.source is None:
            raise ValueError("A confirmed value needs its source document and page or cell.")
        return self


class MoneyField(Field_):
    value: Money | None = None


class DateField(Field_):
    value: date | None = None


class IntField(Field_):
    value: Annotated[int, Field(ge=0, le=36500)] | None = None


class TextField(Field_):
    value: Text = ""


class TaxField(Field_):
    value: Literal["exclusive", "inclusive", "not_stated"] = "not_stated"


class ConfirmedFields(Contract):
    quoted_total: MoneyField = MoneyField()
    tax_basis: TaxField = TaxField()
    validity_until: DateField = DateField()
    duration_days: IntField = IntField()
    warranty: TextField = TextField()
    exclusions: TextField = TextField()
    annual_maintenance: MoneyField = MoneyField()

    @model_validator(mode="after")
    def values(self):
        for name in ("quoted_total", "validity_until", "duration_days", "annual_maintenance"):
            item = getattr(self, name)
            if item.state == "confirmed" and item.value is None:
                raise ValueError(f"{name}: a confirmed value cannot be empty.")
        return self


class Adjustment(Contract):
    amount: SignedMoney
    reason: Annotated[str, Field(min_length=1, max_length=1000)]
    source: Annotated[str, Field(min_length=1, max_length=500)]


class Line(Contract):
    line_id: UUID
    original_text: Annotated[str, Field(min_length=1, max_length=1000)]
    original_unit: Annotated[str, Field(max_length=16)] = ""
    original_quantity: Quantity | None = None
    original_rate: Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=4)] | None = None
    original_amount: Money | None = None
    source: SourceRef
    scope_code: Code | None = None
    state: Literal["included", "excluded", "optional", "missing", "provisional", "unpriced"]
    mapping_confirmed: bool = False
    mapping_note: Annotated[str, Field(max_length=1000)] = ""
    adjustment: Adjustment | None = None

    @model_validator(mode="after")
    def check(self):
        if self.mapping_confirmed and not self.scope_code and self.state != "optional":
            raise ValueError("Confirm a mapping only after choosing its common scope item.")
        if self.state in ("unpriced", "missing") and self.original_amount is not None:
            raise ValueError("An unpriced or missing line has no quoted amount.")
        return self


class Response_(Contract):
    code: Code
    state: Literal["answered", "absent", "unclear", "not_applicable", "accepted", "rejected"]
    source: SourceRef | None = None
    expiry: date | None = None
    note: Annotated[str, Field(max_length=1000)] = ""

    @model_validator(mode="after")
    def check(self):
        if self.state in ("accepted", "rejected") and self.source is None:
            raise ValueError("Reviewer acceptance or rejection needs a source reference.")
        return self


class SubmissionUpdate(Contract):
    expected_revision: Annotated[int, Field(ge=1)]
    fields: ConfirmedFields
    lines: Annotated[list[Line], Field(max_length=500)] = []
    responses: Annotated[list[Response_], Field(max_length=100)] = []
    withdrawn: bool = False

    @model_validator(mode="after")
    def check(self):
        if len({line.line_id for line in self.lines}) != len(self.lines):
            raise ValueError("Line identifiers must be unique.")
        _unique([r.code for r in self.responses], "Response")
        return self


class SubmissionRevise(Contract):
    expected_revision: Annotated[int, Field(ge=1)]
    reason: Annotated[str, Field(min_length=1, max_length=2000)]
    sender: Short
    received_at: AwareDatetime
    receipt_evidence: Annotated[str, Field(min_length=1, max_length=2000)]


class ScoreItem(Contract):
    criterion: Code
    score: Annotated[int, Field(ge=0, le=100)] | None = None
    rationale: Annotated[str, Field(max_length=4000)] = ""
    source: SourceRef | None = None


class ScoreInput(Contract):
    expected_revision: Annotated[int, Field(ge=0)]
    rubric_revision: Annotated[int, Field(ge=1)]
    conflict: Literal["none", "declared"]
    conflict_note: Annotated[str, Field(max_length=1000)] = ""
    state: Literal["draft", "submitted"]
    scores: Annotated[list[ScoreItem], Field(max_length=30)] = []

    @model_validator(mode="after")
    def check(self):
        _unique([s.criterion for s in self.scores], "Score criterion")
        if self.conflict == "declared":
            if not self.conflict_note.strip():
                raise ValueError("Describe the declared conflict.")
            if self.scores:
                raise ValueError("A reviewer with a declared conflict recuses and cannot score.")
        if self.state == "submitted":
            for item in self.scores:
                if item.score is not None and not item.rationale.strip():
                    raise ValueError(f"{item.criterion}: submitted scores need a rationale.")
        return self


class ClarificationInput(Contract):
    expected_revision: Annotated[int, Field(ge=0)]
    submission_key: UUID | None = None
    question: Annotated[str, Field(min_length=1, max_length=4000)]
    due_date: date | None = None
    state: Literal["open", "answered", "closed"]
    response: Text = ""
    response_received_at: AwareDatetime | None = None
    response_source: Annotated[str, Field(max_length=500)] = ""
    acknowledged_by: Annotated[list[UUID], Field(max_length=50)] = []

    @model_validator(mode="after")
    def check(self):
        if self.state == "answered" and (
            not self.response.strip()
            or self.response_received_at is None
            or not self.response_source.strip()
        ):
            raise ValueError("An answer records the response text, receipt time and source.")
        if self.submission_key and self.acknowledged_by:
            raise ValueError("Acknowledgements apply to a common addendum, not a targeted query.")
        return self


class DecisionSubmit(Contract):
    expected_revision: Annotated[int, Field(ge=0)]
    evaluation_hash: Annotated[str, Field(min_length=64, max_length=64)]
    recommended_submission: UUID
    rationale: Annotated[str, Field(min_length=1, max_length=8000)]
    exception_reason: Text = ""


class DecisionAction(Contract):
    expected_revision: Annotated[int, Field(ge=1)]
    evaluation_hash: Annotated[str, Field(min_length=64, max_length=64)]
    action: Literal["approve", "return", "reject"]
    reason: Annotated[str, Field(min_length=1, max_length=4000)]


class WhatIf(Contract):
    weights: dict[Code, Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)]]

    @model_validator(mode="after")
    def check(self):
        if sum(self.weights.values()) != Decimal(100):
            raise ValueError("What-if weights must total exactly 100.")
        return self


# ---------------------------------------------------------------- storage helpers


def _caps(db, org, pid, user):
    access.require_project(db, org, pid, user, "read_project")
    caps = set(access.project_capabilities(db, org, pid, user))
    if not READ_CAPS & caps:
        # Same unavailable response as a missing project: Studio grants see nothing here.
        raise not_found()
    project = db.get(Project, pid)
    if project.purpose != "developer_decision" or project.archived:
        raise APIError(
            409, "owner_review_purpose", "Owner review needs an active owner-decision project."
        )
    return project, caps


def _require(db, org, pid, user, capability):
    project, caps = _caps(db, org, pid, user)
    access.require_project(db, org, pid, user, capability)
    return project, caps


def _current(db, pid, kind, key):
    return db.scalar(
        select(ReviewEntry)
        .where(ReviewEntry.project_id == pid, ReviewEntry.kind == kind, ReviewEntry.key == key)
        .order_by(ReviewEntry.revision.desc())
        .limit(1)
    )


def _latest(db, pid, kind):
    latest = (
        select(ReviewEntry.key, func.max(ReviewEntry.revision).label("rev"))
        .where(ReviewEntry.project_id == pid, ReviewEntry.kind == kind)
        .group_by(ReviewEntry.key)
        .subquery()
    )
    return db.scalars(
        select(ReviewEntry)
        .join(latest, (ReviewEntry.key == latest.c.key) & (ReviewEntry.revision == latest.c.rev))
        .where(ReviewEntry.project_id == pid, ReviewEntry.kind == kind)
        .order_by(ReviewEntry.created_at, ReviewEntry.key)
    ).all()


def _append(db, pid, kind, key, expected, payload, user):
    row = _current(db, pid, kind, key)
    revision = row.revision if row else 0
    if revision != expected:
        raise APIError(
            409,
            "review_conflict",
            "This record changed since you loaded it. Reload, compare and retry.",
        )
    entry = ReviewEntry(
        project_id=pid,
        kind=kind,
        key=key,
        revision=revision + 1,
        payload=payload,
        created_by=user,
    )
    db.add(entry)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise APIError(
            409, "review_conflict", "Another person saved first. Reload and retry."
        ) from exc
    return entry


def _view(entry):
    if entry is None:
        return None
    return {
        "key": str(entry.key),
        "revision": entry.revision,
        "payload": entry.payload,
        "updated_by": str(entry.created_by),
        "updated_at": entry.created_at.isoformat(),
    }


def _dump(model, exclude=()):
    return model.model_dump(mode="json", exclude=set(exclude))


def _d(value):
    return None if value is None else Decimal(str(value))


def _file_meta(row):
    return {
        "id": str(row.id),
        "submission_key": str(row.submission_key) if row.submission_key else None,
        "purpose": row.purpose,
        "package_version": row.package_version,
        "filename": row.filename,
        "content_type": row.content_type,
        "size_bytes": row.size_bytes,
        "sha256": row.sha256,
        "description": row.description,
        "uploaded_by": str(row.created_by),
        "created_at": row.created_at.isoformat(),
    }


def sniff(content: bytes) -> str:
    """Admit PDF, XLSX and native JSON snapshots by content, never by filename."""
    if not content or len(content) > MAX_FILE_BYTES:
        raise APIError(422, "review_file_size", "Upload a file no larger than 10 MiB.")
    if content.startswith(b"%PDF-"):
        if b"%%EOF" not in content[-2048:]:
            raise APIError(422, "review_file_type", "The PDF is incomplete or truncated.")
        return "application/pdf"
    if content.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                names = set(archive.namelist())
        except zipfile.BadZipFile as exc:
            raise APIError(422, "review_file_type", "The spreadsheet archive is damaged.") from exc
        if "[Content_Types].xml" in names and any(n.startswith("xl/") for n in names):
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        raise APIError(422, "review_file_type", "Only XLSX workbooks are accepted as archives.")
    try:
        if isinstance(json.loads(content.decode("utf-8")), dict):
            return "application/json"
    except (UnicodeDecodeError, ValueError):
        pass
    raise APIError(
        422, "review_file_type", "Upload a PDF, an XLSX workbook or a native JSON snapshot."
    )


def _clean_name(name):
    keep = "".join(c for c in (name or "document") if c.isalnum() or c in " ._-()")
    return (keep.strip() or "document")[:200]


# ---------------------------------------------------------------- evaluation


def _norm(score, criterion, direction):
    span = Decimal(criterion["scale_max"] - criterion["scale_min"])
    offset = score - Decimal(criterion["scale_min"])
    if direction == "lower_better":
        offset = span - offset
    return offset / span


def _aggregate(values, rule):
    if not values:
        return None
    if rule == "median":
        return Decimal(str(median(values))).quantize(FOUR, ROUND_HALF_UP)
    return (Decimal(sum(values)) / Decimal(len(values))).quantize(FOUR, ROUND_HALF_UP)


def evaluate(basis, rubric, submissions, scores, clarifications, weights=None):
    """Pure deterministic evaluation. Inputs are current payload dicts; output is JSON-safe."""
    criteria = rubric["criteria"] if rubric else []
    weight = {
        c["code"]: Decimal(str(weights.get(c["code"], 0) if weights else c["weight"]))
        for c in criteria
    }
    scope = {item["code"]: item for item in basis["scope_items"]} if basis else {}
    requirements = {r["code"]: r for r in basis["requirements"]} if basis else {}
    budget = _d(basis.get("budget")) if basis else None
    horizon = basis.get("evaluation_horizon_years") if basis else None
    results = []
    for key, sub in submissions:
        if sub.get("withdrawn"):
            results.append(
                {
                    "submission_key": key,
                    "bidder_name": sub["bidder_name"],
                    "readiness": "withdrawn",
                    "reasons": ["Withdrawn by recorded update."],
                }
            )
            continue
        reasons = {"ineligible": [], "unpriced": [], "needs_clarification": []}
        fields = sub["fields"]
        if sub.get("confirmed_package_version") != sub["package_version"]:
            reasons["needs_clarification"].append("Revised package not yet re-confirmed.")
        if basis and sub.get("confirmed_basis_revision") != basis["revision"]:
            reasons["needs_clarification"].append("Comparison basis changed since confirmation.")
        for name, item in fields.items():
            if item["state"] == "unconfirmed":
                reasons["needs_clarification"].append(f"Field {name} is not confirmed.")
        quoted = (
            _d(fields["quoted_total"]["value"])
            if fields["quoted_total"]["state"] == "confirmed"
            else None
        )
        if quoted is None:
            reasons["unpriced"].append("No confirmed quoted total.")
        if (
            basis
            and fields["tax_basis"]["state"] == "confirmed"
            and fields["tax_basis"]["value"] not in (basis["tax_basis"],)
        ):
            reasons["needs_clarification"].append(
                f"Tax basis {fields['tax_basis']['value']} differs from basis {basis['tax_basis']}."
            )
        adjustments = Decimal(0)
        mapped = set()
        for line in sub["lines"]:
            if line.get("adjustment"):
                adjustments += Decimal(str(line["adjustment"]["amount"]))
            if line["scope_code"]:
                if line["scope_code"] not in scope:
                    reasons["needs_clarification"].append(
                        f"Line maps to unknown scope item {line['scope_code']}."
                    )
                elif line["state"] in ("included", "provisional"):
                    mapped.add(line["scope_code"])
            if not line["mapping_confirmed"]:
                reasons["needs_clarification"].append(
                    f"Mapping of '{line['original_text'][:60]}' is not confirmed."
                )
            if line["state"] in ("unpriced", "missing") and not line.get("adjustment"):
                reasons["unpriced"].append(
                    f"'{line['original_text'][:60]}' is {line['state']} with no recorded allowance."
                )
        missing_scope = sorted(set(scope) - mapped)
        allowed = {
            line["scope_code"]
            for line in sub["lines"]
            if line["scope_code"]
            and line.get("adjustment")
            and line["state"] in ("missing", "excluded")
        }
        for code in missing_scope:
            if code not in allowed:
                reasons["unpriced"].append(
                    f"Common scope item {code} is not priced or allowed for."
                )
        received = datetime.fromisoformat(sub["received_at"]).date()
        responses = {r["code"]: r for r in sub["responses"]}
        for code, req in requirements.items():
            response = responses.get(code)
            state = response["state"] if response else "absent"
            if state == "rejected" and req["mandatory"]:
                reasons["ineligible"].append(f"Mandatory requirement {code} verified as not met.")
            elif state in ("absent", "unclear") and req["mandatory"]:
                # Missing evidence is not proof of noncompliance (O14-005).
                reasons["needs_clarification"].append(f"Mandatory requirement {code} is {state}.")
            elif state == "answered" and req["mandatory"]:
                reasons["needs_clarification"].append(
                    f"Mandatory requirement {code} answered but not reviewer-confirmed."
                )
            if req.get("expiry_required") and state in ("answered", "accepted"):
                expiry = response.get("expiry")
                if expiry is None:
                    reasons["needs_clarification"].append(f"{code}: expiry date not recorded.")
                elif date.fromisoformat(expiry) < received:
                    reasons["ineligible" if req["mandatory"] else "needs_clarification"].append(
                        f"{code}: document expired before receipt ({expiry})."
                    )
        for clar in clarifications:
            if clar["state"] == "open" and clar.get("submission_key") in (key, None):
                reasons["needs_clarification"].append(
                    f"Open clarification: {clar['question'][:60]}"
                )
        # Scores from submitted, non-recused sheets for this package and locked rubric.
        sheets = [
            s
            for s in scores
            if s["submission_key"] == key and s["state"] == "submitted" and s["conflict"] == "none"
        ]
        stale_sheets = [
            s
            for s in sheets
            if s["package_version"] != sub["package_version"]
            or (rubric and s["rubric_revision"] != rubric["revision"])
        ]
        current = [s for s in sheets if s not in stale_sheets]
        criteria_rows, total, missing_scores, gate_failed = [], Decimal(0), [], False
        for c in criteria:
            values = [
                item["score"]
                for s in current
                for item in s["scores"]
                if item["criterion"] == c["code"] and item["score"] is not None
            ]
            invalid = [v for v in values if not c["scale_min"] <= v <= c["scale_max"]]
            if invalid:
                reasons["needs_clarification"].append(f"{c['code']}: score outside scale.")
                values = [v for v in values if v not in invalid]
            agg = _aggregate(values, rubric["reviewer_aggregation"])
            substituted = False
            if agg is None:
                missing_scores.append(c["code"])
                if rubric["missing_score_rule"] == "scale_minimum":
                    agg, substituted = Decimal(c["scale_min"]), True
            contribution = None
            if agg is not None:
                contribution = (weight[c["code"]] * _norm(agg, c, c["direction"])).quantize(
                    FOUR, ROUND_HALF_UP
                )
                total += contribution
                if c.get("mandatory_gate") and not substituted and agg < Decimal(c["pass_mark"]):
                    gate_failed = True
                    reasons["ineligible"].append(
                        f"Mandatory gate {c['code']} scored {agg} below pass mark {c['pass_mark']}."
                    )
            criteria_rows.append(
                {
                    "criterion": c["code"],
                    "weight": str(weight[c["code"]]),
                    "reviewer_scores": values,
                    "aggregate": None if agg is None else str(agg),
                    "substituted_minimum": substituted,
                    "contribution": None if contribution is None else str(contribution),
                }
            )
        if stale_sheets:
            reasons["needs_clarification"].append(
                f"{len(stale_sheets)} score sheet(s) predate the current package or rubric."
            )
        comparison = None if quoted is None else (quoted + adjustments).quantize(TWO, ROUND_HALF_UP)
        lifecycle = None
        if (
            comparison is not None
            and horizon
            and fields["annual_maintenance"]["state"] == "confirmed"
        ):
            lifecycle = (comparison + _d(fields["annual_maintenance"]["value"]) * horizon).quantize(
                TWO
            )
        readiness = (
            "ineligible"
            if reasons["ineligible"] or gate_failed
            else "unpriced"
            if reasons["unpriced"]
            else "needs_clarification"
            if reasons["needs_clarification"]
            else "comparable"
        )
        scoring_complete = not missing_scores or rubric["missing_score_rule"] == "scale_minimum"
        results.append(
            {
                "submission_key": key,
                "bidder_name": sub["bidder_name"],
                "package_version": sub["package_version"],
                "document_only": sub["channel"] == "external_document",
                "readiness": readiness,
                "reasons": reasons["ineligible"]
                + reasons["unpriced"]
                + reasons["needs_clarification"],
                "quoted_total": None if quoted is None else str(quoted),
                "adjustments_total": str(adjustments.quantize(TWO)),
                "comparison_total": None if comparison is None else str(comparison),
                "budget_gap": None
                if comparison is None or budget is None
                else str(comparison - budget),
                "lifecycle_undiscounted": None if lifecycle is None else str(lifecycle),
                "missing_scope": missing_scope,
                "criteria": criteria_rows,
                "missing_scores": missing_scores,
                "scoring_complete": scoring_complete,
                "reviewer_sheets": len(current),
                "weighted_score": str(total.quantize(TWO, ROUND_HALF_UP))
                if criteria_rows and scoring_complete
                else None,
                "rank": None,
                "tie": False,
            }
        )
    ranked = [
        r
        for r in results
        if r["readiness"] == "comparable"
        and r.get("weighted_score") is not None
        and rubric
        and rubric.get("status") == "locked"
    ]
    ranked.sort(key=lambda r: (-Decimal(r["weighted_score"]), r["submission_key"]))
    previous, rank = None, 0
    for index, row in enumerate(ranked, start=1):
        if row["weighted_score"] != previous:
            rank, previous = index, row["weighted_score"]
        row["rank"] = rank
    for row in ranked:
        row["tie"] = sum(1 for r in ranked if r["rank"] == row["rank"]) > 1
    return results


def _state(db, pid):
    basis_row = _current(db, pid, "basis", pid)
    rubric_row = _current(db, pid, "rubric", pid)
    subs = _latest(db, pid, "submission")
    score_rows = _latest(db, pid, "score")
    clar_rows = _latest(db, pid, "clarification")
    decision_row = _current(db, pid, "decision", pid)
    return basis_row, rubric_row, subs, score_rows, clar_rows, decision_row


def _with_rev(row):
    return None if row is None else {**row.payload, "revision": row.revision}


def compute(db, pid, weights=None):
    basis_row, rubric_row, subs, score_rows, clar_rows, _ = _state(db, pid)
    basis, rubric = _with_rev(basis_row), _with_rev(rubric_row)
    submissions = [(str(row.key), row.payload) for row in subs]
    scores = [row.payload for row in score_rows]
    clarifications = [row.payload for row in clar_rows]
    results = evaluate(basis, rubric, submissions, scores, clarifications, weights)
    inputs = {
        "basis": basis_row.revision if basis_row else 0,
        "rubric": rubric_row.revision if rubric_row else 0,
        "rubric_locked": bool(rubric and rubric.get("status") == "locked"),
        "submissions": {str(r.key): r.revision for r in subs},
        "scores": {str(r.key): r.revision for r in score_rows},
        "clarifications": {str(r.key): r.revision for r in clar_rows},
    }
    canonical = json.dumps(
        {
            "inputs": inputs,
            "results": results,
            "weights": None if weights is None else {k: str(v) for k, v in weights.items()},
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return {
        "official": weights is None and inputs["rubric_locked"],
        "what_if": weights is not None,
        "inputs": inputs,
        "results": results,
        "hash": hashlib.sha256(canonical.encode()).hexdigest(),
        "rule": "Weighted sum of reviewer-aggregated scores normalised to each criterion scale; "
        "weights total 100. Ranking covers comparable, fully scored offers under a locked "
        "rubric only. Ties are reported, not broken. Review support, not approval.",
    }


# ---------------------------------------------------------------- endpoints

BASE = "/projects/{project_id}/owner-review"


@router.get(BASE)
def get_state(organisation_id: UUID, project_id: UUID, user: User, db: DB):
    project, caps = _caps(db, organisation_id, project_id, user)
    basis, rubric, subs, scores, clars, decision = _state(db, project_id)
    files = db.scalars(
        select(ReviewFile)
        .where(ReviewFile.project_id == project_id)
        .order_by(ReviewFile.created_at)
    ).all()
    reviewers = db.scalars(
        select(ProjectGrant.user_id).where(
            ProjectGrant.project_id == project_id,
            ProjectGrant.capabilities.contains(["review_project"]),
        )
    ).all()
    return {
        "project_id": str(project_id),
        "capabilities": sorted(caps),
        "user_id": str(user),
        "eligible_reviewers": sorted(str(r) for r in reviewers),
        "basis": _view(basis),
        "rubric": _view(rubric),
        "submissions": [_view(row) for row in subs],
        "scores": [_view(row) for row in scores],
        "clarifications": [_view(row) for row in clars],
        "decision": _view(decision),
        "files": [_file_meta(row) for row in files],
    }


@router.put(BASE + "/basis")
def save_basis(organisation_id: UUID, project_id: UUID, data: BasisInput, user: User, db: DB):
    _require(db, organisation_id, project_id, user, "review_project")
    eligible = set(
        db.scalars(
            select(ProjectGrant.user_id).where(
                ProjectGrant.project_id == project_id,
                ProjectGrant.capabilities.contains(["review_project"]),
            )
        ).all()
    )
    if not set(data.reviewers) <= eligible:
        raise APIError(422, "reviewer_grant", "Assigned reviewers need a project review grant.")
    entry = _append(
        db,
        project_id,
        "basis",
        project_id,
        data.expected_revision,
        _dump(data, ["expected_revision"]),
        user,
    )
    db.commit()
    return _view(entry)


@router.put(BASE + "/rubric")
def save_rubric(organisation_id: UUID, project_id: UUID, data: RubricInput, user: User, db: DB):
    _require(db, organisation_id, project_id, user, "review_project")
    previous = _current(db, project_id, "rubric", project_id)
    if previous and previous.payload.get("status") == "locked" and not data.change_reason.strip():
        raise APIError(
            409,
            "rubric_locked",
            "The rubric is locked. Record a change reason to open a new draft version.",
        )
    payload = _dump(data, ["expected_revision"])
    payload.update(status="draft", locked_by=None, locked_at=None)
    entry = _append(db, project_id, "rubric", project_id, data.expected_revision, payload, user)
    db.commit()
    return _view(entry)


@router.post(BASE + "/rubric/lock")
def lock_rubric(organisation_id: UUID, project_id: UUID, data: RubricLock, user: User, db: DB):
    _require(db, organisation_id, project_id, user, "review_project")
    previous = _current(db, project_id, "rubric", project_id)
    if previous is None or previous.payload.get("status") == "locked":
        raise APIError(409, "rubric_state", "Only a saved draft rubric can be locked.")
    payload = {
        **previous.payload,
        "status": "locked",
        "locked_by": str(user),
        "locked_at": datetime.now(UTC).isoformat(),
    }
    entry = _append(db, project_id, "rubric", project_id, data.expected_revision, payload, user)
    db.commit()
    return _view(entry)


def _empty_fields():
    return ConfirmedFields().model_dump(mode="json")


@router.post(BASE + "/submissions", status_code=201)
def create_submission(
    organisation_id: UUID, project_id: UUID, data: SubmissionCreate, user: User, db: DB
):
    _require(db, organisation_id, project_id, user, "review_project")
    basis = _current(db, project_id, "basis", project_id)
    if basis is None:
        raise APIError(409, "basis_required", "Save the comparison basis before recording offers.")
    payload = {
        **_dump(data),
        "package_version": 1,
        "basis_revision_received": basis.revision,
        "received_by": str(user),
        "fields": _empty_fields(),
        "lines": [],
        "responses": [],
        "withdrawn": False,
        "confirmed_package_version": None,
        "confirmed_basis_revision": None,
        "revisions": [],
    }
    entry = _append(db, project_id, "submission", uuid4(), 0, payload, user)
    db.commit()
    return _view(entry)


def _submission(db, pid, key):
    row = _current(db, pid, "submission", key)
    if row is None:
        raise not_found()
    return row


def _documents(db, pid, key):
    return {
        str(f.id): f
        for f in db.scalars(
            select(ReviewFile).where(
                ReviewFile.project_id == pid,
                ReviewFile.submission_key == key,
                ReviewFile.purpose == "received",
            )
        ).all()
    }


@router.put(BASE + "/submissions/{key}")
def update_submission(
    organisation_id: UUID, project_id: UUID, key: UUID, data: SubmissionUpdate, user: User, db: DB
):
    _require(db, organisation_id, project_id, user, "review_project")
    row = _submission(db, project_id, key)
    basis = _current(db, project_id, "basis", project_id)
    docs = _documents(db, project_id, key)
    refs = (
        [line.source for line in data.lines]
        + [r.source for r in data.responses if r.source]
        + [getattr(data.fields, n).source for n in ConfirmedFields.model_fields]
    )
    for ref in refs:
        if ref is not None and str(ref.document_id) not in docs:
            raise APIError(
                422, "source_document", "Each source must be a retained document of this offer."
            )
    codes = {r["code"] for r in basis.payload["requirements"]}
    if any(r.code not in codes for r in data.responses):
        raise APIError(422, "unknown_requirement", "Responses must use basis requirement codes.")
    payload = {
        **row.payload,
        **_dump(data, ["expected_revision"]),
        "confirmed_package_version": row.payload["package_version"],
        "confirmed_basis_revision": basis.revision,
    }
    entry = _append(db, project_id, "submission", key, data.expected_revision, payload, user)
    db.commit()
    return _view(entry)


@router.post(BASE + "/submissions/{key}/revise")
def revise_submission(
    organisation_id: UUID, project_id: UUID, key: UUID, data: SubmissionRevise, user: User, db: DB
):
    _require(db, organisation_id, project_id, user, "review_project")
    row = _submission(db, project_id, key)
    history = row.payload.get("revisions", []) + [
        {
            "package_version": row.payload["package_version"],
            "superseded_at": datetime.now(UTC).isoformat(),
            "reason": data.reason,
        }
    ]
    payload = {
        **row.payload,
        "package_version": row.payload["package_version"] + 1,
        "sender": data.sender,
        "received_at": data.received_at.isoformat(),
        "receipt_evidence": data.receipt_evidence,
        "received_by": str(user),
        "revisions": history,
    }
    entry = _append(db, project_id, "submission", key, data.expected_revision, payload, user)
    db.commit()
    return _view(entry)


@router.post(BASE + "/submissions/{key}/file", status_code=201)
def upload_file(
    organisation_id: UUID,
    project_id: UUID,
    key: UUID,
    user: User,
    db: DB,
    file: Annotated[UploadFile, File()],
    description: Annotated[str, Form(min_length=1, max_length=500)],
):
    _require(db, organisation_id, project_id, user, "review_project")
    row = _submission(db, project_id, key)
    content = file.file.read(MAX_FILE_BYTES + 1)
    kind = sniff(content)
    record = ReviewFile(
        project_id=project_id,
        submission_key=key,
        purpose="received",
        package_version=row.payload["package_version"],
        filename=_clean_name(file.filename),
        content_type=kind,
        content=content,
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
        description=description,
        created_by=user,
    )
    db.add(record)
    db.flush()
    result = _file_meta(record)
    db.commit()
    return result


MEMO_RENDERER = "infrashader-react-pdf-decision-memo-v1"


@router.post(BASE + "/decision/memo/file", status_code=201)
def retain_memo(
    organisation_id: UUID,
    project_id: UUID,
    user: User,
    db: DB,
    file: Annotated[UploadFile, File()],
    pack_sha256: Annotated[str, Form(pattern=r"^[0-9a-f]{64}$")],
):
    """O17: retain the readable memorandum rendered from the approved, retained pack.

    The PDF is bound to the decision-pack.json digest it was rendered from. The first
    accepted bytes are kept; later attempts return that record and never overwrite it.
    """
    _, caps = _caps(db, organisation_id, project_id, user)
    if not {"review_project", "issue_developer_brief"}.intersection(caps):
        raise APIError(403, "capability", "Decision capability required.")
    decision = _current(db, project_id, "decision", project_id)
    if decision is None or decision.payload.get("state") != "approved":
        raise APIError(409, "decision_state", "Only an approved decision has a memorandum.")
    source = next(
        (f for f in decision.payload.get("pack", []) if f["filename"] == "decision-pack.json"),
        None,
    )
    if source is None or source["sha256"] != pack_sha256:
        raise APIError(
            409,
            "memo_source",
            "The memorandum must be rendered from the retained decision pack. Reload it.",
        )
    existing = db.scalar(
        select(ReviewFile).where(
            ReviewFile.project_id == project_id,
            ReviewFile.purpose == "decision_memo",
            ReviewFile.package_version == decision.revision,
        )
    )
    if existing is not None:
        return _file_meta(existing)
    content = file.file.read(MAX_FILE_BYTES + 1)
    if sniff(content) != "application/pdf":
        raise APIError(422, "review_file_type", "Retain the memorandum as a complete PDF.")
    record = ReviewFile(
        project_id=project_id,
        submission_key=None,
        purpose="decision_memo",
        package_version=decision.revision,
        filename="decision-memorandum.pdf",
        content_type="application/pdf",
        content=content,
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
        description=(
            f"Decision memorandum rendered from decision-pack.json SHA-256 {pack_sha256}; "
            f"renderer {MEMO_RENDERER}"
        ),
        created_by=user,
    )
    db.add(record)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise APIError(409, "review_conflict", "The memorandum was retained concurrently.") from exc
    result = _file_meta(record)
    db.commit()
    return result


@router.post(BASE + "/files/{file_id}/suggestions")
def file_suggestions(organisation_id: UUID, project_id: UUID, file_id: UUID, user: User, db: DB):
    """O06: unverified, bounded text-layer suggestions from a retained received original."""
    _require(db, organisation_id, project_id, user, "review_project")
    record = db.scalar(
        select(ReviewFile).where(
            ReviewFile.id == file_id,
            ReviewFile.project_id == project_id,
            ReviewFile.purpose == "received",
        )
    )
    if record is None:
        raise not_found()
    if hashlib.sha256(record.content).hexdigest() != record.sha256:
        raise APIError(503, "review_file_integrity", "Retained file failed its integrity check.")
    from app.offer_extraction import extract

    return {
        "document_id": str(record.id),
        "filename": record.filename,
        **extract(record.content, record.content_type),
    }


@router.get(BASE + "/files/{file_id}")
def download_file(organisation_id: UUID, project_id: UUID, file_id: UUID, user: User, db: DB):
    _caps(db, organisation_id, project_id, user)
    record = db.scalar(
        select(ReviewFile).where(ReviewFile.id == file_id, ReviewFile.project_id == project_id)
    )
    if record is None:
        raise not_found()
    if hashlib.sha256(record.content).hexdigest() != record.sha256:
        raise APIError(503, "review_file_integrity", "Retained file failed its integrity check.")
    return Response(
        record.content,
        media_type=record.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{record.filename}"',
            "X-Content-SHA256": record.sha256,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.put(BASE + "/scores/{submission_key}")
def save_score(
    organisation_id: UUID,
    project_id: UUID,
    submission_key: UUID,
    data: ScoreInput,
    user: User,
    db: DB,
):
    _require(db, organisation_id, project_id, user, "review_project")
    basis = _current(db, project_id, "basis", project_id)
    if basis is None or str(user) not in basis.payload["reviewers"]:
        raise APIError(403, "reviewer_assignment", "You are not an assigned reviewer.")
    sub = _submission(db, project_id, submission_key)
    rubric = _current(db, project_id, "rubric", project_id)
    if (
        rubric is None
        or rubric.payload["status"] != "locked"
        or rubric.revision != data.rubric_revision
    ):
        raise APIError(409, "rubric_not_locked", "Score only against the current locked rubric.")
    criteria = {c["code"]: c for c in rubric.payload["criteria"]}
    docs = _documents(db, project_id, submission_key)
    for item in data.scores:
        c = criteria.get(item.criterion)
        if c is None:
            raise APIError(422, "unknown_criterion", f"{item.criterion} is not in the rubric.")
        if item.score is not None and not c["scale_min"] <= item.score <= c["scale_max"]:
            raise APIError(422, "score_range", f"{item.criterion} must be within its scale.")
        if item.source and str(item.source.document_id) not in docs:
            raise APIError(422, "source_document", "Score sources must be this offer's documents.")
    payload = {
        **_dump(data, ["expected_revision"]),
        "submission_key": str(submission_key),
        "reviewer_id": str(user),
        "package_version": sub.payload["package_version"],
    }
    entry = _append(
        db,
        project_id,
        "score",
        uuid5(NAMESPACE_URL, f"{submission_key}:{user}"),
        data.expected_revision,
        payload,
        user,
    )
    db.commit()
    return _view(entry)


@router.put(BASE + "/clarifications/{key}")
def save_clarification(
    organisation_id: UUID,
    project_id: UUID,
    key: UUID,
    data: ClarificationInput,
    user: User,
    db: DB,
):
    _require(db, organisation_id, project_id, user, "review_project")
    if data.submission_key:
        _submission(db, project_id, data.submission_key)
    existing = _current(db, project_id, "clarification", key)
    if existing and existing.payload.get("submission_key") != (
        str(data.submission_key) if data.submission_key else None
    ):
        raise APIError(422, "clarification_target", "A clarification keeps its original target.")
    entry = _append(
        db,
        project_id,
        "clarification",
        key,
        data.expected_revision,
        {**_dump(data, ["expected_revision"]), "raised_by": str(user)},
        user,
    )
    db.commit()
    return _view(entry)


@router.get(BASE + "/evaluation")
def evaluation(organisation_id: UUID, project_id: UUID, user: User, db: DB):
    _caps(db, organisation_id, project_id, user)
    return compute(db, project_id)


@router.post(BASE + "/evaluation/what-if")
def what_if(organisation_id: UUID, project_id: UUID, data: WhatIf, user: User, db: DB):
    _caps(db, organisation_id, project_id, user)
    rubric = _current(db, project_id, "rubric", project_id)
    if rubric is None or set(data.weights) != {c["code"] for c in rubric.payload["criteria"]}:
        raise APIError(422, "what_if_criteria", "Provide a weight for every rubric criterion.")
    result = compute(db, project_id, data.weights)
    result["official"] = False
    result["label"] = "What-if only. The locked rubric and official result are unchanged."
    return result


@router.post(BASE + "/decision")
def submit_decision(
    organisation_id: UUID, project_id: UUID, data: DecisionSubmit, user: User, db: DB
):
    _require(db, organisation_id, project_id, user, "review_project")
    current = _current(db, project_id, "decision", project_id)
    if current and current.payload["state"] in ("submitted", "approved", "rejected"):
        raise APIError(409, "decision_state", "A recommendation is already awaiting or decided.")
    result = compute(db, project_id)
    if not result["official"] or result["hash"] != data.evaluation_hash:
        raise APIError(
            409, "evaluation_stale", "Reload the evaluation; inputs changed or rubric is unlocked."
        )
    row = next(
        (r for r in result["results"] if r["submission_key"] == str(data.recommended_submission)),
        None,
    )
    if row is None:
        raise APIError(422, "recommendation_unknown", "Recommend an offer in this evaluation.")
    if row["rank"] != 1 and not data.exception_reason.strip():
        raise APIError(
            422,
            "recommendation_exception",
            "Recommending an offer that is not ranked first (or not ranked) needs a recorded "
            "exception reason.",
        )
    history = (current.payload.get("history", []) if current else []) + [
        {"action": "submit", "by": str(user), "at": datetime.now(UTC).isoformat()}
    ]
    payload = {
        **_dump(data, ["expected_revision"]),
        "recommended_submission": str(data.recommended_submission),
        "state": "submitted",
        "submitted_by": str(user),
        "submitted_at": datetime.now(UTC).isoformat(),
        "history": history,
        "pack": None,
    }
    entry = _append(db, project_id, "decision", project_id, data.expected_revision, payload, user)
    db.commit()
    return _view(entry)


def _pack(db, project, decision_payload, result, user, approved_at):
    basis, rubric, subs, scores, clars, _ = _state(db, project.id)
    files = db.scalars(
        select(ReviewFile).where(
            ReviewFile.project_id == project.id, ReviewFile.purpose == "received"
        )
    ).all()
    snapshot = {
        "pack_format": "infrashader-owner-decision-pack-v1",
        "project": {"id": str(project.id), "name": project.name, "currency": "MYR"},
        "approved_at": approved_at,
        "approved_by": str(user),
        "decision": decision_payload,
        "basis": _view(basis),
        "rubric": _view(rubric),
        "submissions": [_view(r) for r in subs],
        "score_sheets": [_view(r) for r in scores],
        "clarifications": [_view(r) for r in clars],
        "evaluation": result,
        "source_manifest": [_file_meta(f) for f in files],
        "disclosures": [
            "No AI was used to extract, score, rank or approve.",
            "Ranking is review support; the decision is the recorded human approval.",
            "Comparison totals include recorded comparison-only adjustments and differ from "
            "quoted totals where shown.",
        ],
    }
    body = json.dumps(snapshot, sort_keys=True, indent=1, ensure_ascii=False).encode()
    out = io.StringIO()
    writer = csv_safety.writer(out)
    writer.writerow(
        [
            "submission",
            "bidder",
            "readiness",
            "rank",
            "tie",
            "quoted_total",
            "comparison_total",
            "weighted_score",
            "criterion",
            "weight",
            "aggregate",
            "contribution",
            "reasons",
        ]
    )
    for r in result["results"]:
        for c in r.get("criteria") or [{}]:
            writer.writerow(
                [
                    r["submission_key"],
                    r["bidder_name"],
                    r["readiness"],
                    r.get("rank"),
                    r.get("tie"),
                    r.get("quoted_total"),
                    r.get("comparison_total"),
                    r.get("weighted_score"),
                    c.get("criterion"),
                    c.get("weight"),
                    c.get("aggregate"),
                    c.get("contribution"),
                    " | ".join(r.get("reasons", [])),
                ]
            )
    retained = []
    for name, content, kind in (
        ("decision-pack.json", body, "application/json"),
        ("decision-appendix.csv", out.getvalue().encode("utf-8"), "text/csv"),
    ):
        record = ReviewFile(
            project_id=project.id,
            submission_key=None,
            purpose="decision_pack",
            package_version=0,
            filename=name,
            content_type=kind,
            content=content,
            size_bytes=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
            description="Retained decision pack",
            created_by=user,
        )
        db.add(record)
        db.flush()
        retained.append(_file_meta(record))
    return retained


@router.post(BASE + "/decision/action")
def decision_action(
    organisation_id: UUID, project_id: UUID, data: DecisionAction, user: User, db: DB
):
    project, _ = _require(db, organisation_id, project_id, user, "issue_developer_brief")
    current = _current(db, project_id, "decision", project_id)
    if current is None or current.payload["state"] != "submitted":
        raise APIError(409, "decision_state", "Only a submitted recommendation can be decided.")
    basis = _current(db, project_id, "basis", project_id)
    if basis.payload["self_approval"] == "prohibited" and current.payload["submitted_by"] == str(
        user
    ):
        raise APIError(
            403, "self_approval", "The project basis prohibits approving your own recommendation."
        )
    result = compute(db, project_id)
    changed = result["hash"] != current.payload["evaluation_hash"]
    if data.action == "approve" and changed:
        # Stale-package approval is blocked; the approver may still return or reject.
        raise APIError(
            409,
            "evaluation_stale",
            "Inputs changed after the recommendation was submitted. Return it for re-review.",
        )
    if data.evaluation_hash != result["hash"]:
        raise APIError(409, "evaluation_stale", "Reload the current evaluation before acting.")
    now = datetime.now(UTC).isoformat()
    state = {"approve": "approved", "return": "returned", "reject": "rejected"}[data.action]
    payload = {
        **current.payload,
        "state": state,
        "decided_by": str(user),
        "decided_at": now,
        "decision_reason": data.reason,
        "history": current.payload["history"]
        + [{"action": data.action, "by": str(user), "at": now, "reason": data.reason}],
    }
    if state == "approved":
        payload["pack"] = _pack(db, project, payload, result, user, now)
    entry = _append(db, project_id, "decision", project_id, data.expected_revision, payload, user)
    db.commit()
    return _view(entry)


@router.get(BASE + "/history")
def history(
    organisation_id: UUID,
    project_id: UUID,
    user: User,
    db: DB,
    kind: Literal["basis", "rubric", "submission", "score", "clarification", "decision"],
    key: UUID | None = None,
):
    _caps(db, organisation_id, project_id, user)
    rows = db.scalars(
        select(ReviewEntry)
        .where(
            ReviewEntry.project_id == project_id,
            ReviewEntry.kind == kind,
            ReviewEntry.key == (key or project_id),
        )
        .order_by(ReviewEntry.revision.desc())
        .limit(100)
    ).all()
    return {"items": [_view(r) for r in rows]}


@router.get("/owner-review/dashboard")
def dashboard(organisation_id: UUID, user: User, db: DB):
    access.require_capability(db, organisation_id, user, "review")
    projects = db.scalars(
        select(Project)
        .where(
            Project.organisation_id == organisation_id,
            Project.purpose == "developer_decision",
            Project.archived.is_(False),
            access.project_condition(user),
        )
        .order_by(Project.updated_at.desc())
        .limit(100)
    ).all()
    rows, withheld = [], 0
    for project in projects:
        caps = set(access.project_capabilities(db, organisation_id, project.id, user))
        if not READ_CAPS & caps:
            withheld += 1
            continue
        result = compute(db, project.id)
        basis = _current(db, project.id, "basis", project.id)
        decision = _current(db, project.id, "decision", project.id)
        active = [r for r in result["results"] if r["readiness"] != "withdrawn"]
        counts = {
            k: sum(1 for r in active if r["readiness"] == k)
            for k in ("comparable", "needs_clarification", "unpriced", "ineligible")
        }
        totals = [Decimal(r["comparison_total"]) for r in active if r.get("comparison_total")]
        reviewers = len(basis.payload["reviewers"]) if basis else 0
        expected = reviewers * len(active)
        submitted = sum(r.get("reviewer_sheets", 0) for r in active)
        aging = None
        if decision and decision.payload["state"] == "submitted":
            aging = (
                datetime.now(UTC) - datetime.fromisoformat(decision.payload["submitted_at"])
            ).days
        rows.append(
            {
                "project_id": str(project.id),
                "name": project.name,
                "submissions": len(active),
                "document_only": sum(1 for r in active if r.get("document_only")),
                **counts,
                "budget": basis.payload.get("budget") if basis else None,
                "lowest_comparison_total": str(min(totals)) if totals else None,
                "highest_comparison_total": str(max(totals)) if totals else None,
                "priced_offers": len(totals),
                "reviewer_sheets_submitted": submitted,
                "reviewer_sheets_expected": expected,
                "rubric_locked": result["inputs"]["rubric_locked"],
                "decision_state": decision.payload["state"] if decision else "none",
                "approval_waiting_days": aging,
            }
        )
    return {
        "computed_at": datetime.now(UTC).isoformat(),
        "projects": rows,
        "withheld_projects": withheld,
        "definitions": {
            "comparable": "Confirmed, priced, eligible offer with no open clarification.",
            "comparison_total": "Confirmed quoted total plus recorded comparison-only adjustments.",
            "reviewer_sheets": "Submitted, non-recused score sheets for the current package and "
            "locked rubric, against assigned reviewers x active offers.",
            "partial": "Offers without a confirmed total are excluded from the total range.",
        },
    }
