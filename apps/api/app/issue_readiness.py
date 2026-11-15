"""One read-only issue policy, shared by readiness, preview and issue.

Only public, actionable descriptions leave this boundary. Never return rate records or
the contents of a private commercial warning to a project reader.
"""

from datetime import date

from sqlalchemy import select

from app import access
from app.brief_checkpoint import snapshot
from app.models import Artifact, Evidence, Workspace


def context_issues(project, kind):
    issues = []

    def add(code, message, group, fix, why, field=None):
        issues.append(
            dict(
                code=code,
                message=message,
                severity="blocks_issue",
                group=group,
                fix=fix,
                why=why,
                field=field,
                item_id=None,
            )
        )

    if (kind == "developer_brief") != (project.purpose == "developer_decision"):
        add(
            "output_purpose",
            "Choose the document type for this project's purpose.",
            "Brief",
            "brief",
            "Client proposals and owner decision briefs have different audiences.",
            "purpose",
        )
    if project.archived:
        add(
            "project_archived",
            "Restore this archived project before issuing.",
            "Brief",
            "project",
            "Archived projects cannot create new issued versions.",
        )
    return issues


def evaluate(db, org_id, project, user_id, data, kind):
    from app.calculations import estimate_readiness

    issues = context_issues(project, kind)

    def add(code, message, group, fix, why, field=None, item_id=None):
        issues.append(
            dict(
                code=code,
                message=message,
                severity="blocks_issue",
                group=group,
                fix=fix,
                why=why,
                field=field,
                item_id=item_id,
            )
        )

    caps = access.project_capabilities(db, org_id, project.id, user_id)
    required = "issue_developer_brief" if kind == "developer_brief" else "issue_proposal"
    if required not in caps:
        add(
            "issue_permission",
            "Ask a project issuer to issue this document.",
            "Approvals",
            "access",
            "Your account can review this project but cannot issue this document.",
        )
    workspace = db.get(Workspace, project.id)
    if workspace is None:
        add(
            "workspace_missing",
            "Save the site and design first.",
            "Site",
            "save",
            "The proposal uses saved site information.",
        )
    else:
        for row in workspace.data["targets"] + [
            item for scenario in workspace.data["scenarios"].values() for item in scenario["items"]
        ]:
            if row.get("reference_review_required"):
                add(
                    "reference_review",
                    "Check this shape against the replacement plan.",
                    "Site",
                    "reference",
                    "The plan used to trace it has changed.",
                    item_id=row["id"],
                )
    if not workspace or not workspace.data["targets"]:
        add(
            "target_zone",
            "Mark the area this proposal covers.",
            "Site",
            "target",
            "The proposal's site plan needs at least one marked area.",
        )
    if project.revision != data.expected_project_revision:
        add(
            "stale_brief",
            "Reload and review the updated project brief.",
            "Brief",
            "reload",
            "Someone changed the brief since you opened it.",
        )
    checkpoint = snapshot(db, project)
    if checkpoint["status"] != "acknowledged" and checkpoint["issue_policy"] == "draft_only":
        add(
            "brief_not_confirmed",
            "Review the brief agreement before issuing.",
            "Approvals",
            "checkpoint",
            "This brief currently permits drafts only.",
        )
    for field, label in (
        ("problem", "the problem to solve"),
        ("intended_users", "who will use the site"),
        ("desired_outcome", "the intended outcome"),
        ("use_periods", "when the site will be used"),
    ):
        if not getattr(project, field):
            add(
                "brief_incomplete",
                f"Complete {label} in the brief.",
                "Brief",
                "brief",
                "The client needs to understand the purpose of the work.",
                field,
            )
    estimate = (
        db.scalar(
            select(Artifact).where(
                Artifact.id == data.estimate_id,
                Artifact.project_id == project.id,
                Artifact.kind == "estimate",
            )
        )
        if data.estimate_id
        else None
    )
    if data.preferred_option not in ("option_a", "option_b"):
        add(
            "preferred_option",
            "Choose Option A or Option B to propose.",
            "Prices",
            "option",
            "The existing site is a baseline, not proposed work.",
        )
    if estimate is None:
        add(
            "estimate_missing",
            "Calculate and select a saved total for this option.",
            "Prices",
            "estimate",
            "An issued proposal needs a saved estimate.",
            "estimate_id",
        )
    else:
        if estimate.payload["scenario"] != data.preferred_option:
            add(
                "estimate_option",
                "Select a total for the option being proposed.",
                "Prices",
                "estimate",
                "The total and design must describe the same option.",
                "estimate_id",
            )
        if (
            not workspace
            or estimate.workspace_revision != workspace.revision
            or estimate.project_revision != project.revision
        ):
            add(
                "estimate_stale",
                "The total is out of date: recalculate it.",
                "Prices",
                "estimate",
                "A saved design or brief change makes earlier totals out of date.",
            )
        if not estimate.payload["complete"]:
            add(
                "estimate_incomplete",
                "Price all missing work, then recalculate the total.",
                "Prices",
                "pricing",
                "A partial subtotal cannot be issued as a complete quotation.",
            )
    if estimate and not estimate.payload["complete"]:
        # Names/IDs are public project scope, not supplier or internal price records.
        for missing in estimate.payload.get("missing_rates", []):
            add(
                "unpriced_item",
                f"{missing['name']}: add a compatible price or specification.",
                "Prices",
                "pricing",
                "This work is missing from the priced total.",
                item_id=missing["item_id"],
            )
    if kind == "proposal":
        if not data.valid_until or data.valid_until < date.today():
            add(
                "proposal_validity",
                "Enter a proposal validity date today or later.",
                "Proposal wording",
                "proposal",
                "The client needs to know when this offer expires.",
                "valid_until",
            )
        for field, label in (
            ("customer_narrative", "Scope for the client"),
            ("programme", "Programme"),
            ("maintenance", "Maintenance"),
        ):
            if not getattr(data, field).strip():
                add(
                    "proposal_fields",
                    f"{label}: explain what you are offering or excluding.",
                    "Proposal wording",
                    "proposal",
                    "This wording is part of the client's issued document.",
                    field,
                )
        if estimate:
            pricing = estimate_readiness(
                db, org_id, project.id, user_id, estimate.id, data.valid_until
            )
            if pricing["warnings"] and (
                not data.pricing_override_reason.strip() or "internal_pricing" not in caps
            ):
                add(
                    "price_review",
                    "Ask an authorised pricing reviewer to resolve the pricing warnings.",
                    "Approvals",
                    "pricing_review",
                    "Pricing exceptions need an authorised, recorded reason.",
                    "pricing_override_reason",
                )
        if (
            db.scalar(
                select(Artifact.id)
                .where(Artifact.project_id == project.id, Artifact.kind == "proposal")
                .limit(1)
            )
            and not data.change_summary.strip()
        ):
            add(
                "change_summary",
                "Describe what changed since the last issued proposal.",
                "Proposal wording",
                "proposal",
                "Earlier issued versions stay locked and readers need to understand changes.",
                "change_summary",
            )
        for index, task in enumerate(data.maintenance_plan):
            for field in ("task", "frequency"):
                if not getattr(task, field).strip():
                    add(
                        "maintenance_checklist",
                        f"Complete {field} in maintenance row {index + 1}.",
                        "Proposal wording",
                        "proposal",
                        "Every added maintenance row needs a task and frequency.",
                        f"maintenance_plan.{index}.{field}",
                    )
    for field, label in (
        ("criteria", "Review criteria"),
        ("review_notes", "Review notes"),
        ("assumptions", "Assumptions"),
        ("exclusions", "Exclusions"),
    ):
        value = getattr(data, field)
        if not value or (isinstance(value, str) and not value.strip()):
            add(
                "required_text",
                f"{label}: not provided yet.",
                "Proposal wording",
                "proposal",
                "This explains the basis and limits of your proposal.",
                field,
            )
    if data.pricing_override_reason and "internal_pricing" not in caps:
        add(
            "pricing_permission",
            "Ask an authorised pricing reviewer to record the exception.",
            "Approvals",
            "access",
            "Only accounts with internal pricing access may approve pricing exceptions.",
        )
    if data.evidence_ids:
        found = db.scalars(
            select(Evidence.id).where(
                Evidence.project_id == project.id,
                Evidence.id.in_(data.evidence_ids),
                Evidence.archived.is_(False),
            )
        ).all()
        if len(set(found)) != len(set(data.evidence_ids)):
            add(
                "evidence_unavailable",
                "Choose available evidence for this project.",
                "Site",
                "proposal",
                "An attached record was removed or is no longer available.",
                "evidence_ids",
            )
    if not data.confirmed:
        add(
            "issue_confirmation",
            "Review the proposal before confirming issue.",
            "Approvals",
            "proposal",
            "Issuing creates a locked version.",
            "confirmed",
        )
    return issues


def refusal_code(code):
    # Preserve the established HTTP error codes for existing callers.
    if code == "evidence_unavailable":
        return "not_found"
    if code in {
        "target_zone",
        "workspace_missing",
        "estimate_missing",
        "estimate_stale",
        "estimate_incomplete",
        "estimate_option",
        "preferred_option",
    }:
        return "issue_not_ready"
    return code
