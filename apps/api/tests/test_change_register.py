"""K03/L26 change register and K02 changed-since-issue impact against real issued proposals."""

from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app import calculations, workspace
from app import change_register as cr
from app.errors import APIError
from app.models import Artifact, Evidence, Membership, ProjectGrant, Workspace
from tests.test_pricing_readiness import prepared
from tests.test_workspace import fixture_workspace, polygon


def test_client_outcome_needs_external_person_date_and_evidence():
    with pytest.raises(ValidationError):
        cr.ChangeTransition(expected_revision=1, state="acknowledged", note="Client said OK")
    with pytest.raises(ValidationError):
        cr.ChangeTransition(expected_revision=1, state="sent", note="Sent")
    with pytest.raises(ValidationError):
        cr.ChangeCreate(
            requester="Client",
            requester_role="client",
            requested_on=date(2026, 11, 1),
            reason="Bigger terrace",
        )


def issue(db, org, pid, user, request, estimate_id, summary=""):
    request.request_key = uuid4()
    request.estimate_id = estimate_id
    request.pricing_override_reason = "Fixture rate dated 2020; reviewed for test"
    request.change_summary = summary
    return calculations.issue_snapshot(db, org, pid, user, request, "proposal")


@pytest.mark.integration
def test_change_request_impact_states_revised_issue_and_prior_issue_unchanged(database):
    org, pid, admin, member, foreign, rate, estimate, request = prepared(database)
    designer = uuid4()
    with Session(database) as db:
        caps = ["studio", "read_project"]
        db.add(Membership(organisation_id=org, user_id=designer, role="member", capabilities=caps))
        db.add(ProjectGrant(project_id=pid, user_id=designer, capabilities=caps))
        db.commit()
        first = issue(db, org, pid, admin, request, estimate["id"])
        first_payload = db.get(Artifact, first["id"]).payload
        assert cr.list_changes(org, pid, admin, db)["impact"]["status"] == "unchanged"

        # Revise the work area: same item id, larger polygon.
        saved = db.get(Workspace, pid).data
        item = saved["scenarios"]["option_a"]["items"][0]
        draft = fixture_workspace()
        draft["expected_revision"] = 1
        changed = draft["scenarios"]["option_a"]["items"][0]
        changed.update(id=item["id"], rate_id=rate["id"])
        changed["geometry"] = polygon(101.6812, 3.1312, 101.6814, 3.1313)
        workspace.save_workspace(db, org, pid, admin, workspace.WorkspaceInput(**draft))
        new_qty = Decimal(
            str(
                db.get(Workspace, pid).data["scenarios"]["option_a"]["items"][0]["quantity"][
                    "value"
                ]
            )
        )
        old_qty = Decimal(first_payload["selected_scope"][0]["quantity"])
        assert new_qty > old_qty * Decimal("1.9")

        result = cr.list_changes(org, pid, admin, db)["impact"]
        assert result["status"] == "changed"
        row = result["items"][0]
        assert row["change"] == "changed" and row["unit_before"] == row["unit_after"] == "m2"
        assert Decimal(row["quantity_delta"]) == new_qty - old_qty
        # No current estimate for the new design: no misleading price difference.
        assert result["price"]["status"] == "estimate_needed" and result["price"]["delta"] is None

        with pytest.raises(APIError):  # Studio read-only grant cannot record
            cr.create_change(
                org,
                pid,
                cr.ChangeCreate(
                    requester="Client",
                    requester_role="client",
                    requested_on=date(2026, 11, 12),
                    reason="Larger paved terrace",
                    proposed_additions="Extend paving east by 1 bay",
                ),
                designer,
                db,
            )
        created = cr.create_change(
            org,
            pid,
            cr.ChangeCreate(
                requester="Client facilities lead",
                requester_role="client",
                requested_on=date(2026, 11, 12),
                reason="Larger paved terrace",
                original_scope="Canopy paving v1",
                proposed_additions="Extend paving east by 1 bay",
                proposed_removals='=HYPERLINK("http://example.invalid")',
                time_effect="+2 working days (contractor estimate)",
                affected_item_ids=[item["id"]],
            ),
            admin,
            db,
        )
        key = created["key"]
        assert created["payload"]["base_issue"]["version"] == 1
        with pytest.raises(APIError) as caught:  # cannot skip internal review
            cr.transition(
                org,
                pid,
                key,
                cr.ChangeTransition(
                    expected_revision=1, state="sent", note="x", sent_method="Email"
                ),
                admin,
                db,
            )
        assert caught.value.code == "change_state"

        current = calculations.run_estimate(
            db,
            org,
            pid,
            admin,
            calculations.EstimateInput(
                expected_revision=2,
                request_key=uuid4(),
                scenario="option_a",
                method="markup",
                percent=20,
            ),
        )
        reviewed = cr.transition(
            org,
            pid,
            key,
            cr.ChangeTransition(expected_revision=1, state="reviewed", note="Quantities checked"),
            admin,
            db,
        )
        snap = reviewed["payload"]["impact_snapshot"]["price"]
        assert snap["status"] == "current"
        assert Decimal(snap["delta"]) == Decimal(snap["current_total"]) - Decimal(
            first_payload["selling_total"]
        )
        assert Decimal(snap["delta"]) > 0
        frozen = reviewed["payload"]["impact_snapshot"]

        with pytest.raises(APIError) as caught:  # stale expected revision
            cr.transition(
                org,
                pid,
                key,
                cr.ChangeTransition(
                    expected_revision=1, state="sent", note="x", sent_method="Email"
                ),
                admin,
                db,
            )
        assert caught.value.code == "change_conflict"
        cr.transition(
            org,
            pid,
            key,
            cr.ChangeTransition(
                expected_revision=2, state="sent", note="Summary sent", sent_method="Email"
            ),
            admin,
            db,
        )
        evidence = Evidence(
            project_id=pid,
            object_path=f"fixture/{uuid4()}",
            content_type="application/pdf",
            size_bytes=10,
            sha256="b" * 64,
            description="Client email reply",
            source_note="Fixture only",
            created_by=admin,
        )
        db.add(evidence)
        db.commit()
        with pytest.raises(APIError):  # evidence from another record id is unavailable
            cr.transition(
                org,
                pid,
                key,
                cr.ChangeTransition(
                    expected_revision=3,
                    state="acknowledged",
                    note="Client agreed",
                    external_person="Client facilities lead",
                    outcome_date=date(2026, 11, 13),
                    evidence_ids=[uuid4()],
                ),
                admin,
                db,
            )
        db.rollback()
        acknowledged = cr.transition(
            org,
            pid,
            key,
            cr.ChangeTransition(
                expected_revision=3,
                state="acknowledged",
                note="Client agreed by email",
                external_person="Client facilities lead",
                outcome_date=date(2026, 11, 13),
                evidence_ids=[evidence.id],
            ),
            admin,
            db,
        )
        assert "not a contract variation" in acknowledged["payload"]["outcome"]["note"]
        assert acknowledged["payload"]["impact_snapshot"] == frozen

        # Explicit revised issue v2; v1 is byte-for-byte unchanged.
        second = issue(
            db, org, pid, admin, request, current["id"], summary="Terrace extended per change"
        )
        second_payload = db.get(Artifact, second["id"]).payload
        assert second_payload["previous_issue"]["version"] == 1
        with pytest.raises(APIError):
            cr.link_issue(
                org, pid, key, cr.IssueLink(expected_revision=4, proposal_id=first["id"]), admin, db
            )
        linked = cr.link_issue(
            org, pid, key, cr.IssueLink(expected_revision=4, proposal_id=second["id"]), admin, db
        )
        assert linked["payload"]["revised_issue"]["version"] == 2
        assert db.get(Artifact, first["id"]).payload == first_payload
        assert cr.list_changes(org, pid, admin, db)["impact"]["status"] == "unchanged"
        exported = cr.export(org, pid, member, db).body.decode()
        assert "acknowledged" in exported and "Larger paved terrace" in exported
        # S09: client-supplied text cannot become a spreadsheet formula on export.
        assert "'=HYPERLINK" in exported and "'+2 working days" in exported
        assert "cost" not in exported.lower().split("\n")[0]
        with pytest.raises(APIError) as caught:
            cr.list_changes(org, pid, foreign, db)
        assert caught.value.status_code == 404
        history = db.scalars(
            select(Artifact).where(Artifact.project_id == pid, Artifact.kind == "proposal")
        ).all()
        assert len(history) == 2
    with Session(database) as db, pytest.raises(DBAPIError):
        db.execute(text("UPDATE change_requests SET payload = '{}'::jsonb"))
        db.commit()
    assert date.today() + timedelta(days=1) > date.today()
