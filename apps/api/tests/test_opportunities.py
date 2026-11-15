"""S03/L25/O05: owner invitations, contractor acceptance, recipient-safe packages and inbox."""

import hashlib
import io
import threading
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import access, calculations, issued_files, project_deletion
from app import opportunities as op
from app import owner_review as ow
from app.errors import APIError
from app.models import (
    Artifact,
    Membership,
    OpportunityInvitation,
    Project,
    ProjectGrant,
    ReviewFile,
    SubmissionPackage,
)
from tests.test_owner_review import PDF, actors
from tests.test_pricing_readiness import prepared

CONTRACTOR_EMAIL = "contractor.a@example.invalid"
FORBIDDEN_KEYS = {
    "cost",
    "cost_base",
    "cost_total",
    "profit",
    "margin",
    "markup",
    "percent",
    "rate",
    "rate_id",
    "unit_price",
    "estimate_id",
    "pricing_review",
    "pricing_warnings",
    "supplier_name",
    "quote_reference",
    "source_note",
    "lines",
    "manifest",
    "budget",
    "reviewers",
}


def keys(value):
    if isinstance(value, dict):
        for key, item in value.items():
            yield key
            yield from keys(item)
    elif isinstance(value, list):
        for item in value:
            yield from keys(item)


BASIS = dict(
    title="Courtyard landscape works",
    tax_basis="exclusive",
    budget="80000.00",
    evaluation_horizon_years=10,
    self_approval="prohibited",
    scope_items=[{"code": "PAV", "description": "Paving", "unit": "m2", "quantity": "100"}],
    requirements=[
        {"code": "INS", "text": "Insurance certificate", "kind": "eligibility", "mandatory": True}
    ],
)


def owner_setup(database):
    org, pid, admin, member, approver, designer, foreign, spare = actors(database)
    with Session(database) as db:
        ow.save_basis(org, pid, ow.BasisInput(expected_revision=0, **BASIS), admin, db)
    return org, pid, admin, approver, designer


def contractor_setup(database):
    corg, cproject, cadmin, cmember, cforeign, rate, estimate, issue = prepared(
        database, date(2099, 12, 31)
    )
    return corg, cproject, cadmin, cmember, issue


def issue_and_retain(db, corg, cproject, cadmin, issue, *, retain=True, summary=""):
    issue.request_key = uuid4()
    issue.change_summary = summary
    output = calculations.issue_snapshot(db, corg, cproject, cadmin, issue, "proposal")
    oid = UUID(output["id"])
    if retain:
        pending = issued_files.status(db, corg, cproject, cadmin, oid)
        content = b"%PDF-1.7\nfixture issued proposal " + oid.bytes + b"\n%%EOF"
        issued_files.retain(db, corg, cproject, cadmin, oid, content, pending["manifest_hash"])
    return oid


def invite(db, org, pid, admin, email=CONTRACTOR_EMAIL, *, closes_in=timedelta(days=7)):
    draft = op.owner_draft(
        org,
        pid,
        op.DraftInput(
            recipient_email=email,
            closes_at=datetime.now(UTC) + closes_in,
            instructions="Submit one offer for the paving scope.",
            shared_fields=["problem", "site"],
        ),
        admin,
        db,
    )
    return draft


def attach(db, org, pid, admin, iid):
    return op.owner_attach(
        org,
        pid,
        UUID(iid),
        admin,
        db,
        UploadFile(file=io.BytesIO(PDF), filename="drawing.pdf"),
        "Site drawing for tender",
    )


@pytest.mark.integration
def test_owner_invites_contractor_accepts_submits_revises_and_withdraws(database):
    org, pid, admin, approver, designer = owner_setup(database)
    corg, cproject, cadmin, cmember, issue = contractor_setup(database)
    with Session(database) as db:
        # Only owner reviewers prepare opportunities; approvers/designers cannot.
        for outsider in (approver, designer):
            with pytest.raises(APIError):
                invite(db, org, pid, outsider)
            db.rollback()
        draft = invite(db, org, pid, admin)
        iid = draft["id"]
        attach(db, org, pid, admin, iid)
        preview = op.owner_brief_preview(org, pid, UUID(iid), admin, db)
        assert preview["frozen"] is False
        brief_keys = set(keys(preview["brief"]))
        assert {"budget", "reviewers", "self_approval", "evaluation_horizon_years"}.isdisjoint(
            brief_keys
        )
        assert "intended_users" not in preview["brief"] and "problem" in preview["brief"]

        issued = op.owner_issue(org, pid, UUID(iid), op.IssueInput(expected_revision=1), admin, db)
        token = issued["token"]
        row = db.get(OpportunityInvitation, UUID(iid))
        assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()
        assert token not in str(row.brief_snapshot) and row.token_hash != token
        with pytest.raises(APIError) as frozen:  # files are frozen once issued
            attach(db, org, pid, admin, iid)
        assert frozen.value.code == "opportunity_frozen"
        db.rollback()

        # Wrong account, wrong organisation and the owner's own organisation are rejected.
        with pytest.raises(APIError) as wrong:
            op.recipient_accept(
                op.AcceptInput(token=token, contractor_organisation_id=corg),
                cadmin,
                "someone.else@example.invalid",
                db,
            )
        assert wrong.value.code == "wrong_recipient"
        db.rollback()
        with pytest.raises(APIError) as same:
            op.recipient_accept(
                op.AcceptInput(token=token, contractor_organisation_id=org),
                cadmin,
                CONTRACTOR_EMAIL,
                db,
            )
        assert same.value.code == "same_organisation"
        db.rollback()
        seen = op.recipient_preview(op.TokenInput(token=token), cadmin, CONTRACTOR_EMAIL, db)
        assert [o["id"] for o in seen["eligible_organisations"]] == [str(corg)]
        assert seen["files"][0]["filename"] == "drawing.pdf"
        accepted = op.recipient_accept(
            op.AcceptInput(token=token, contractor_organisation_id=corg),
            cadmin,
            CONTRACTOR_EMAIL,
            db,
        )
        assert accepted["state"] == "accepted"
        # Acceptance never joins the owner tenant or grants owner-project access.
        assert (
            db.scalar(
                select(Membership).where(
                    Membership.organisation_id == org, Membership.user_id == cadmin
                )
            )
            is None
        )
        assert db.get(ProjectGrant, (pid, cadmin)) is None
        with pytest.raises(APIError):
            ow.get_state(org, pid, cadmin, db)
        db.rollback()
        # Replay by the same recipient is idempotent; a different organisation is refused.
        again = op.recipient_accept(
            op.AcceptInput(token=token, contractor_organisation_id=corg),
            cadmin,
            CONTRACTOR_EMAIL,
            db,
        )
        assert again["id"] == iid

        # Owner cannot read the contractor's private project.
        with pytest.raises(APIError):
            access.require_project(db, corg, cproject, admin)
        db.rollback()

        op.contractor_link(
            corg, UUID(iid), op.LinkInput(expected_revision=3, project_id=cproject), cadmin, db
        )
        first = issue_and_retain(db, corg, cproject, cadmin, issue, retain=False)
        # A non-issued id (the draft estimate) can never be submitted.
        estimate_id = db.scalar(
            select(Artifact.id).where(Artifact.project_id == cproject, Artifact.kind == "estimate")
        )
        with pytest.raises(APIError) as draft_refused:
            op.contractor_submit(
                corg,
                UUID(iid),
                op.SubmitInput(artifact_id=estimate_id, idempotency_key=uuid4(), confirmed=True),
                cadmin,
                db,
            )
        assert draft_refused.value.code == "issued_proposal_required"
        db.rollback()
        # Not received until the issued PDF is durably retained.
        with pytest.raises(APIError) as not_retained:
            op.contractor_submit(
                corg,
                UUID(iid),
                op.SubmitInput(artifact_id=first, idempotency_key=uuid4(), confirmed=True),
                cadmin,
                db,
            )
        assert not_retained.value.code == "submission_blocked"
        db.rollback()
        pending = issued_files.status(db, corg, cproject, cadmin, first)
        pdf_bytes = b"%PDF-1.7\nfirst issued proposal\n%%EOF"
        issued_files.retain(db, corg, cproject, cadmin, first, pdf_bytes, pending["manifest_hash"])
        # Reading/editing the project is not commercial authority to submit.
        with pytest.raises(APIError) as no_authority:
            op.contractor_submit(
                corg,
                UUID(iid),
                op.SubmitInput(artifact_id=first, idempotency_key=uuid4(), confirmed=True),
                cmember,
                db,
            )
        assert no_authority.value.status_code == 403
        db.rollback()

        key = uuid4()
        receipt = op.contractor_submit(
            corg,
            UUID(iid),
            op.SubmitInput(artifact_id=first, idempotency_key=key, confirmed=True),
            cadmin,
            db,
        )
        assert receipt["receipt_id"].startswith("RCPT-") and receipt["version"] == 1
        retry = op.contractor_submit(
            corg,
            UUID(iid),
            op.SubmitInput(artifact_id=first, idempotency_key=key, confirmed=True),
            cadmin,
            db,
        )
        assert retry["receipt_id"] == receipt["receipt_id"]
        assert (
            len(
                db.scalars(
                    select(SubmissionPackage).where(SubmissionPackage.invitation_id == UUID(iid))
                ).all()
            )
            == 1
        )

        # The owner inbox has one native submission with byte-identical retained files.
        state = ow.get_state(org, pid, admin, db)
        native = [
            s for s in state["submissions"] if s["payload"]["channel"] == "native_infrashader"
        ]
        assert len(native) == 1
        submission = native[0]["payload"]
        assert submission["native"]["receipt_id"] == receipt["receipt_id"]
        assert submission["confirmed_package_version"] is None  # never auto-verified
        files = [f for f in state["files"] if f["submission_key"] == native[0]["key"]]
        assert len(files) == 2
        stored_pdf = db.get(ReviewFile, UUID(receipt["pdf_file_id"]))
        assert stored_pdf.content == pdf_bytes
        package = op.owner_package(org, pid, UUID(iid), 1, admin, db)["package"]
        assert FORBIDDEN_KEYS.isdisjoint(set(keys(package)))
        assert package["proposal"]["selling_total"]
        assert package["scope"] and "source_note" not in package["scope"][0]

        # Sender edits after submission never change the received package or bytes.
        db.get(Project, cproject).name = "Renamed after submission"
        db.commit()
        assert op.owner_package(org, pid, UUID(iid), 1, admin, db)["package"] == package
        assert db.get(ReviewFile, UUID(receipt["pdf_file_id"])).content == pdf_bytes

        # Resubmitting the same issued version is refused; a revision needs a reason.
        with pytest.raises(APIError):
            op.contractor_submit(
                corg,
                UUID(iid),
                op.SubmitInput(artifact_id=first, idempotency_key=uuid4(), confirmed=True),
                cadmin,
                db,
            )
        db.rollback()
        second = issue_and_retain(db, corg, cproject, cadmin, issue, summary="Revised paving")
        with pytest.raises(APIError) as reason:
            op.contractor_submit(
                corg,
                UUID(iid),
                op.SubmitInput(artifact_id=second, idempotency_key=uuid4(), confirmed=True),
                cadmin,
                db,
            )
        assert reason.value.code == "revision_reason"
        db.rollback()
        revised = op.contractor_submit(
            corg,
            UUID(iid),
            op.SubmitInput(
                artifact_id=second,
                idempotency_key=uuid4(),
                confirmed=True,
                reason="Paving quantity corrected",
            ),
            cadmin,
            db,
        )
        assert revised["version"] == 2 and revised["supersedes_id"] == receipt["id"]
        entry = ow._current(db, pid, "submission", UUID(native[0]["key"]))
        assert entry.payload["package_version"] == 2
        assert entry.payload["revisions"][0]["reason"] == "Paving quantity corrected"
        assert len(ow._documents(db, pid, UUID(native[0]["key"]))) == 4  # v1 files retained
        assert db.get(ReviewFile, UUID(receipt["pdf_file_id"])).content == pdf_bytes

        withdrawn = op.contractor_withdraw(
            corg,
            UUID(iid),
            op.WithdrawInput(idempotency_key=uuid4(), confirmed=True, reason="Capacity changed"),
            cadmin,
            db,
        )
        assert withdrawn["kind"] == "withdrawal"
        entry = ow._current(db, pid, "submission", UUID(native[0]["key"]))
        assert entry.payload["withdrawn"] is True
        assert entry.payload["contractor_withdrawal"]["reason"] == "Capacity changed"

        # Owner revocation stops future actions but keeps everything received.
        op.owner_revoke(
            org, pid, UUID(iid), op.RevisionInput(expected_revision=row.revision), admin, db
        )
        third = issue_and_retain(db, corg, cproject, cadmin, issue, summary="Third")
        with pytest.raises(APIError) as revoked:
            op.contractor_submit(
                corg,
                UUID(iid),
                op.SubmitInput(
                    artifact_id=third, idempotency_key=uuid4(), confirmed=True, reason="x"
                ),
                cadmin,
                db,
            )
        assert revoked.value.code == "submission_blocked"
        db.rollback()
        assert len(op.owner_list(org, pid, admin, db)["items"][0]["packages"]) == 3
        # Both projects are protected from deletion while the records exist.
        assert project_deletion.protection(db, db.get(Project, pid))
        assert project_deletion.protection(db, db.get(Project, cproject))


@pytest.mark.integration
def test_two_contractors_are_separate_and_cannot_see_each_other(database):
    org, pid, admin, _, _ = owner_setup(database)
    a_org, a_project, a_admin, _, a_issue = contractor_setup(database)
    b_org, b_project, b_admin, _, b_issue = contractor_setup(database)
    with Session(database) as db:
        ids = {}
        for name, corg, cproject, cadmin, issue, email in (
            ("a", a_org, a_project, a_admin, a_issue, "a@example.invalid"),
            ("b", b_org, b_project, b_admin, b_issue, "b@example.invalid"),
        ):
            draft = invite(db, org, pid, admin, email)
            token = op.owner_issue(
                org, pid, UUID(draft["id"]), op.IssueInput(expected_revision=1), admin, db
            )["token"]
            op.recipient_accept(
                op.AcceptInput(token=token, contractor_organisation_id=corg), cadmin, email, db
            )
            op.contractor_link(
                corg,
                UUID(draft["id"]),
                op.LinkInput(expected_revision=3, project_id=cproject),
                cadmin,
                db,
            )
            artifact = issue_and_retain(db, corg, cproject, cadmin, issue)
            op.contractor_submit(
                corg,
                UUID(draft["id"]),
                op.SubmitInput(artifact_id=artifact, idempotency_key=uuid4(), confirmed=True),
                cadmin,
                db,
            )
            ids[name] = draft["id"]
        state = ow.get_state(org, pid, admin, db)
        native = [
            s for s in state["submissions"] if s["payload"]["channel"] == "native_infrashader"
        ]
        assert len(native) == 2
        # Two separate inbox entries, one per contractor invitation (fixture orgs share a name).
        assert {s["payload"]["native"]["invitation_id"] for s in native} == set(ids.values())
        assert len({s["key"] for s in native}) == 2
        # B cannot read A's opportunity, receipts or files, even with A's identifiers.
        with pytest.raises(APIError):
            op.contractor_detail(b_org, UUID(ids["a"]), b_admin, db)
        db.rollback()
        with pytest.raises(APIError):
            op.contractor_package(b_org, UUID(ids["a"]), 1, b_admin, db)
        db.rollback()
        with pytest.raises(APIError):
            op.contractor_package(a_org, UUID(ids["a"]), 1, b_admin, db)
        db.rollback()
        listed = op.contractor_list(b_org, b_admin, db)["items"]
        assert [item["id"] for item in listed] == [ids["b"]]
        # A linked project from another tenant can never be linked.
        with pytest.raises(APIError):
            op.contractor_link(
                b_org,
                UUID(ids["b"]),
                op.LinkInput(expected_revision=4, project_id=a_project),
                b_admin,
                db,
            )
        db.rollback()


@pytest.mark.integration
def test_expiry_revocation_deadline_and_concurrent_acceptance(database):
    org, pid, admin, _, _ = owner_setup(database)
    corg, cproject, cadmin, _, issue = contractor_setup(database)
    with Session(database) as db:
        past = invite(db, org, pid, admin, closes_in=timedelta(seconds=-5))
        with pytest.raises(APIError) as closing:
            op.owner_issue(
                org, pid, UUID(past["id"]), op.IssueInput(expected_revision=1), admin, db
            )
        assert closing.value.code == "closing_time"
        db.rollback()

        expired = invite(db, org, pid, admin)
        token = op.owner_issue(
            org, pid, UUID(expired["id"]), op.IssueInput(expected_revision=1), admin, db
        )["token"]
        db.get(OpportunityInvitation, UUID(expired["id"])).expires_at = datetime.now(UTC)
        db.commit()
        with pytest.raises(APIError) as stale:
            op.recipient_accept(
                op.AcceptInput(token=token, contractor_organisation_id=corg),
                cadmin,
                CONTRACTOR_EMAIL,
                db,
            )
        assert stale.value.code == "invitation_expired"
        db.rollback()

        revoked = invite(db, org, pid, admin)
        revoked_token = op.owner_issue(
            org, pid, UUID(revoked["id"]), op.IssueInput(expected_revision=1), admin, db
        )["token"]
        op.owner_revoke(
            org, pid, UUID(revoked["id"]), op.RevisionInput(expected_revision=2), admin, db
        )
        with pytest.raises(APIError) as gone:
            op.recipient_accept(
                op.AcceptInput(token=revoked_token, contractor_organisation_id=corg),
                cadmin,
                CONTRACTOR_EMAIL,
                db,
            )
        assert gone.value.code == "invitation_revoked"
        db.rollback()
        with pytest.raises(APIError) as unknown:
            op.recipient_preview(op.TokenInput(token="x" * 43), cadmin, CONTRACTOR_EMAIL, db)
        assert unknown.value.code == "invitation_unavailable"
        db.rollback()

        # Two simultaneous acceptances by the recipient (run below in separate sessions).
        racing = invite(db, org, pid, admin)
        race_token = op.owner_issue(
            org, pid, UUID(racing["id"]), op.IssueInput(expected_revision=1), admin, db
        )["token"]

        # The deadline closes submissions after acceptance.
        deadline = invite(db, org, pid, admin)
        deadline_token = op.owner_issue(
            org, pid, UUID(deadline["id"]), op.IssueInput(expected_revision=1), admin, db
        )["token"]
        op.recipient_accept(
            op.AcceptInput(token=deadline_token, contractor_organisation_id=corg),
            cadmin,
            CONTRACTOR_EMAIL,
            db,
        )
        op.contractor_link(
            corg,
            UUID(deadline["id"]),
            op.LinkInput(expected_revision=3, project_id=cproject),
            cadmin,
            db,
        )
        artifact = issue_and_retain(db, corg, cproject, cadmin, issue)
        db.get(OpportunityInvitation, UUID(deadline["id"])).closes_at = datetime.now(UTC)
        db.commit()
        with pytest.raises(APIError) as closed:
            op.contractor_submit(
                corg,
                UUID(deadline["id"]),
                op.SubmitInput(artifact_id=artifact, idempotency_key=uuid4(), confirmed=True),
                cadmin,
                db,
            )
        assert closed.value.code == "submission_blocked"
        assert "closing time has passed" in closed.value.message
        db.rollback()

    results = []
    barrier = threading.Barrier(2)

    def accept_once():
        with Session(database) as session:
            barrier.wait()
            try:
                op.recipient_accept(
                    op.AcceptInput(token=race_token, contractor_organisation_id=corg),
                    cadmin,
                    CONTRACTOR_EMAIL,
                    session,
                )
                results.append("ok")
            except APIError as exc:
                session.rollback()
                results.append(exc.code)

    threads = [threading.Thread(target=accept_once) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    # Same recipient and organisation: the second call sees the accepted row and is idempotent;
    # the row lock guarantees a single acceptance record either way.
    assert results.count("ok") >= 1 and set(results) <= {"ok", "already_accepted"}
    with Session(database) as db:
        row = db.get(OpportunityInvitation, UUID(racing["id"]))
        assert row.state == "accepted" and row.contractor_organisation_id == corg


@pytest.mark.integration
def test_failure_mid_submission_leaves_nothing_half_received(database, monkeypatch):
    org, pid, admin, _, _ = owner_setup(database)
    corg, cproject, cadmin, _, issue = contractor_setup(database)
    with Session(database) as db:
        draft = invite(db, org, pid, admin)
        token = op.owner_issue(
            org, pid, UUID(draft["id"]), op.IssueInput(expected_revision=1), admin, db
        )["token"]
        op.recipient_accept(
            op.AcceptInput(token=token, contractor_organisation_id=corg),
            cadmin,
            CONTRACTOR_EMAIL,
            db,
        )
        op.contractor_link(
            corg,
            UUID(draft["id"]),
            op.LinkInput(expected_revision=3, project_id=cproject),
            cadmin,
            db,
        )
        artifact = issue_and_retain(db, corg, cproject, cadmin, issue)
        key = uuid4()

        def broken(*args, **kwargs):
            raise APIError(503, "service_unavailable", "Simulated inbox failure")

        monkeypatch.setattr(op.owner_review, "_append", broken)
        with pytest.raises(APIError):
            op.contractor_submit(
                corg,
                UUID(draft["id"]),
                op.SubmitInput(artifact_id=artifact, idempotency_key=key, confirmed=True),
                cadmin,
                db,
            )
        monkeypatch.undo()
    with Session(database) as db:
        assert db.scalars(select(SubmissionPackage)).all() == []
        assert db.scalars(select(ReviewFile).where(ReviewFile.project_id == pid)).all() == []
        assert db.get(OpportunityInvitation, UUID(draft["id"])).submission_key is None
        # The same request key then succeeds exactly once.
        receipt = op.contractor_submit(
            corg,
            UUID(draft["id"]),
            op.SubmitInput(artifact_id=artifact, idempotency_key=key, confirmed=True),
            cadmin,
            db,
        )
        assert receipt["version"] == 1
        assert len(db.scalars(select(ReviewFile).where(ReviewFile.project_id == pid)).all()) == 2


def stage(db, corg, iid, user, name="insurance.pdf", content=PDF):
    return op.contractor_attach(
        corg,
        UUID(iid),
        user,
        db,
        UploadFile(file=io.BytesIO(content), filename=name),
        "Insurance certificate",
    )


@pytest.mark.integration
def test_attachments_criteria_names_suggestions_and_linkable_projects(database):
    org, pid, admin, _, _ = owner_setup(database)
    a_org, a_project, a_admin, a_member, a_issue = contractor_setup(database)
    b_org, b_project, b_admin, _, b_issue = contractor_setup(database)
    with Session(database) as db:
        ow.save_rubric(
            org,
            pid,
            ow.RubricInput(
                expected_revision=0,
                criteria=[
                    {
                        "code": "PRICE",
                        "name": "Price",
                        "weight": "100",
                        "direction": "lower_better",
                        "scale_min": 0,
                        "scale_max": 10,
                    }
                ],
                missing_score_rule="not_ranked",
                reviewer_aggregation="mean",
            ),
            admin,
            db,
        )
        # Criteria are shared only by explicit opt-in, and never scores or reviewers.
        plain = invite(db, org, pid, admin, "a@example.invalid")
        assert (
            "criteria"
            not in op.owner_brief_preview(org, pid, UUID(plain["id"]), admin, db)["brief"]
        )
        with_criteria = op.owner_draft(
            org,
            pid,
            op.DraftInput(
                recipient_email="b@example.invalid",
                closes_at=datetime.now(UTC) + timedelta(days=3),
                shared_fields=["criteria"],
            ),
            admin,
            db,
        )
        shared = op.owner_brief_preview(org, pid, UUID(with_criteria["id"]), admin, db)["brief"]
        assert shared["criteria"]["items"] == [
            {
                "code": "PRICE",
                "name": "Price",
                "weight": "100",
                "direction": "lower_better",
                "scale_min": 0,
                "scale_max": 10,
            }
        ]

        ids = {}
        for name, corg, cadmin, cproject, email, draft in (
            ("a", a_org, a_admin, a_project, "a@example.invalid", plain),
            ("b", b_org, b_admin, b_project, "b@example.invalid", with_criteria),
        ):
            token = op.owner_issue(
                org, pid, UUID(draft["id"]), op.IssueInput(expected_revision=1), admin, db
            )["token"]
            op.recipient_accept(
                op.AcceptInput(token=token, contractor_organisation_id=corg), cadmin, email, db
            )
            # The full linkable list comes from the server, not one loaded page.
            linkable = op.contractor_linkable(corg, UUID(draft["id"]), cadmin, db)["items"]
            assert str(cproject) in [item["id"] for item in linkable]
            op.contractor_link(
                corg,
                UUID(draft["id"]),
                op.LinkInput(expected_revision=3, project_id=cproject),
                cadmin,
                db,
            )
            ids[name] = draft["id"]

        # Attachments: sender authority, size/type sniffing, limit, and isolation per invitation.
        with pytest.raises(APIError):
            stage(db, a_org, ids["a"], a_member)
        db.rollback()
        with pytest.raises(APIError):
            stage(db, a_org, ids["a"], a_admin, "virus.exe", b"MZ\x90\x00")
        db.rollback()
        staged = stage(db, a_org, ids["a"], a_admin)
        b_staged = stage(db, b_org, ids["b"], b_admin)
        artifact = issue_and_retain(db, a_org, a_project, a_admin, a_issue)
        with pytest.raises(APIError) as foreign:  # B's file cannot ride on A's submission
            op.contractor_submit(
                a_org,
                UUID(ids["a"]),
                op.SubmitInput(
                    artifact_id=artifact,
                    idempotency_key=uuid4(),
                    confirmed=True,
                    attachment_ids=[UUID(b_staged["id"])],
                ),
                a_admin,
                db,
            )
        assert foreign.value.code == "attachment_unavailable"
        db.rollback()
        preview = op.contractor_package_preview(
            a_org,
            UUID(ids["a"]),
            op.PreviewInput(artifact_id=artifact, attachment_ids=[UUID(staged["id"])]),
            a_admin,
            db,
        )
        assert preview["package"]["documents"]["attachments"][0]["filename"] == "insurance.pdf"
        receipt = op.contractor_submit(
            a_org,
            UUID(ids["a"]),
            op.SubmitInput(
                artifact_id=artifact,
                idempotency_key=uuid4(),
                confirmed=True,
                attachment_ids=[UUID(staged["id"])],
            ),
            a_admin,
            db,
        )
        key = db.get(OpportunityInvitation, UUID(ids["a"])).submission_key
        docs = ow._documents(db, pid, key)
        assert len(docs) == 3  # PDF, package JSON and the contractor attachment
        assert any(d.content == PDF and "attachment" in d.description for d in docs.values())
        listed = op.contractor_attachments(a_org, UUID(ids["a"]), a_admin, db)["items"]
        assert listed[0]["submitted"] is True
        with pytest.raises(APIError) as kept:  # a submitted document stays with its receipt
            op.contractor_detach(a_org, UUID(ids["a"]), UUID(staged["id"]), a_admin, db)
        assert kept.value.code == "attachment_submitted"
        db.rollback()

        # Owner suggestions read the declared total from the package as unverified.
        suggestion = ow.file_suggestions(org, pid, UUID(receipt["package_file_id"]), admin, db)
        assert suggestion["status"] == "ok"
        assert suggestion["suggestions"][0]["location"] == "package proposal.selling_total"
        assert "not a verified figure" in suggestion["notice"]

        # Two contractor organisations with the same name are told apart for the owner.
        b_artifact = issue_and_retain(db, b_org, b_project, b_admin, b_issue)
        op.contractor_submit(
            b_org,
            UUID(ids["b"]),
            op.SubmitInput(artifact_id=b_artifact, idempotency_key=uuid4(), confirmed=True),
            b_admin,
            db,
        )
        names = sorted(
            s["payload"]["bidder_name"]
            for s in ow.get_state(org, pid, admin, db)["submissions"]
            if s["payload"]["channel"] == "native_infrashader"
        )
        assert len(set(names)) == 2 and any("(b@example.invalid)" in n for n in names)


@pytest.mark.integration
def test_recipient_sees_pending_invitation_without_link_and_lost_link_can_be_reissued(database):
    org, pid, admin, _, _ = owner_setup(database)
    corg, cproject, cadmin, _, _ = contractor_setup(database)
    other_org, _, other_admin, _, _ = contractor_setup(database)
    with Session(database) as db:
        draft = invite(db, org, pid, admin)
        iid = draft["id"]
        # A draft is never visible to the recipient.
        assert op.recipient_pending(cadmin, CONTRACTOR_EMAIL, db)["items"] == []
        first = op.owner_issue(org, pid, UUID(iid), op.IssueInput(expected_revision=1), admin, db)
        pending = op.recipient_pending(cadmin, CONTRACTOR_EMAIL, db)["items"]
        assert [item["id"] for item in pending] == [iid]
        # Only the verified intended email sees it, and by id learns nothing otherwise.
        assert op.recipient_pending(other_admin, "someone.else@example.invalid", db)["items"] == []
        with pytest.raises(APIError) as hidden:
            op.recipient_preview(
                op.TokenInput(invitation_id=UUID(iid)),
                other_admin,
                "someone.else@example.invalid",
                db,
            )
        assert hidden.value.code == "invitation_unavailable"
        db.rollback()
        with pytest.raises(ValueError):  # exactly one of token / id
            op.TokenInput(token=first["token"], invitation_id=UUID(iid))
        with pytest.raises(ValueError):
            op.TokenInput()

        # The lost link is replaced: the old token stops working, the id path still works.
        second = op.owner_reissue(
            org, pid, UUID(iid), op.RevisionInput(expected_revision=2), admin, db
        )
        assert second["token"] != first["token"]
        with pytest.raises(APIError) as old:
            op.recipient_preview(op.TokenInput(token=first["token"]), cadmin, CONTRACTOR_EMAIL, db)
        assert old.value.code == "invitation_unavailable"
        db.rollback()
        preview = op.recipient_preview(
            op.TokenInput(invitation_id=UUID(iid)), cadmin, CONTRACTOR_EMAIL, db
        )
        assert preview["state"] == "pending" and preview["brief"]["project_name"]
        accepted = op.recipient_accept(
            op.AcceptInput(invitation_id=UUID(iid), contractor_organisation_id=corg),
            cadmin,
            CONTRACTOR_EMAIL,
            db,
        )
        assert accepted["state"] == "accepted"
        assert op.recipient_pending(cadmin, CONTRACTOR_EMAIL, db)["items"] == []
        # An accepted invitation cannot get a new link.
        with pytest.raises(APIError) as accepted_state:
            op.owner_reissue(org, pid, UUID(iid), op.RevisionInput(expected_revision=4), admin, db)
        assert accepted_state.value.code == "opportunity_state"
