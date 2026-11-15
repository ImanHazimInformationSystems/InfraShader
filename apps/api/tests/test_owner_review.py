"""D1B owner review: hand-worked scores, readiness, permissions, revisions and retained pack."""

import hashlib
import io
import json
import zipfile
from uuid import uuid4

import pytest
from fastapi import UploadFile
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app import owner_review as ow
from app.errors import APIError
from app.models import Membership, ProjectGrant
from tests.test_workflow_integration import initialise

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
RECEIVED = "2026-11-10T10:00:00+08:00"


def xlsx():
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("xl/workbook.xml", "<workbook/>")
    return out.getvalue()


def criterion(code, weight, **extra):
    return {
        "code": code,
        "name": code,
        "weight": weight,
        "direction": "higher_better",
        "scale_min": 0,
        "scale_max": 10,
        **extra,
    }


# ------------------------------------------------------------------ pure / validation


def test_sniff_admits_pdf_xlsx_json_by_content_and_rejects_others():
    assert ow.sniff(PDF) == "application/pdf"
    assert ow.sniff(xlsx()).endswith("spreadsheetml.sheet")
    assert ow.sniff(b'{"proposal": 1}') == "application/json"
    for bad in (b"", b"%PDF-1.4 truncated", b"PK\x03\x04broken", b"MZ\x90\x00", b"[1,2]"):
        with pytest.raises(APIError):
            ow.sniff(bad)
    plain_zip = io.BytesIO()
    with zipfile.ZipFile(plain_zip, "w") as z:
        z.writestr("readme.txt", "x")
    with pytest.raises(APIError):
        ow.sniff(plain_zip.getvalue())
    with pytest.raises(APIError):
        ow.sniff(PDF + b"0" * ow.MAX_FILE_BYTES)


def test_policy_has_no_silent_defaults_and_rejects_invalid_rubrics():
    base = {"expected_revision": 0, "criteria": [criterion("A", "60"), criterion("B", "40")]}
    with pytest.raises(ValidationError):  # missing-score rule and aggregation are explicit
        ow.RubricInput(**base)
    ok = {**base, "missing_score_rule": "not_ranked", "reviewer_aggregation": "mean"}
    ow.RubricInput(**ok)
    with pytest.raises(ValidationError):
        ow.RubricInput(**{**ok, "criteria": [criterion("A", "60"), criterion("B", "39.99")]})
    with pytest.raises(ValidationError):
        ow.RubricInput(**{**ok, "criteria": [criterion("A", "100", scale_min=5, scale_max=5)]})
    with pytest.raises(ValidationError):  # gate without pass mark
        ow.RubricInput(**{**ok, "criteria": [criterion("A", "100", mandatory_gate=True)]})
    with pytest.raises(ValidationError):  # tie breaking is not an available policy
        ow.RubricInput(**{**ok, "tie_policy": "lowest_price"})
    basis = {
        "expected_revision": 0,
        "title": "Basis",
        "tax_basis": "exclusive",
        "scope_items": [{"code": "PAV", "description": "Paving", "unit": "m2"}],
    }
    with pytest.raises(ValidationError):  # self-approval policy has no default
        ow.BasisInput(**basis)
    with pytest.raises(ValidationError):  # changed basis must be an explicit addendum
        ow.BasisInput(**{**basis, "self_approval": "prohibited", "expected_revision": 1})
    with pytest.raises(ValidationError):
        ow.ScoreInput(
            expected_revision=0,
            rubric_revision=1,
            conflict="declared",
            conflict_note="Related party",
            state="submitted",
            scores=[{"criterion": "A", "score": 5, "rationale": "x"}],
        )
    with pytest.raises(ValidationError):
        ow.ScoreInput(
            expected_revision=0,
            rubric_revision=1,
            conflict="none",
            state="submitted",
            scores=[{"criterion": "A", "score": 5}],
        )
    with pytest.raises(ValidationError):  # confirmed value needs a source
        ow.MoneyField(state="confirmed", value="10")
    with pytest.raises(ValidationError):  # no invented price on an unpriced line
        ow.Line(
            line_id=uuid4(),
            original_text="Planting",
            source={"document_id": uuid4(), "location": "p1"},
            state="unpriced",
            original_amount="10",
        )


def _sub(bidder, quoted, lines=(), channel="external_document"):
    fields = ow.ConfirmedFields().model_dump(mode="json")
    for name in fields:
        fields[name]["state"] = "not_provided"
    src = {"document_id": str(uuid4()), "location": "p1"}
    fields["quoted_total"] = {"state": "confirmed", "value": quoted, "source": src}
    fields["tax_basis"] = {"state": "confirmed", "value": "exclusive", "source": src}
    return {
        "bidder_name": bidder,
        "channel": channel,
        "received_at": RECEIVED,
        "package_version": 1,
        "confirmed_package_version": 1,
        "confirmed_basis_revision": 1,
        "fields": fields,
        "lines": list(lines)
        or [
            {
                "line_id": str(uuid4()),
                "original_text": "All work",
                "scope_code": "PAV",
                "state": "included",
                "mapping_confirmed": True,
                "adjustment": None,
            }
        ],
        "responses": [],
        "withdrawn": False,
    }


def _sheet(key, scores, reviewer="r1"):
    return {
        "submission_key": key,
        "reviewer_id": reviewer,
        "state": "submitted",
        "conflict": "none",
        "package_version": 1,
        "rubric_revision": 1,
        "scores": [{"criterion": c, "score": s} for c, s in scores.items()],
    }


def test_hand_worked_median_lower_better_minimum_substitution_and_tie():
    basis = {
        "revision": 1,
        "tax_basis": "exclusive",
        "budget": "1000.00",
        "evaluation_horizon_years": 5,
        "scope_items": [{"code": "PAV"}],
        "requirements": [],
    }
    rubric = {
        "revision": 1,
        "status": "locked",
        "missing_score_rule": "scale_minimum",
        "reviewer_aggregation": "median",
        "criteria": [
            criterion("Q", "70"),
            criterion("RISK", "30", direction="lower_better", scale_min=1, scale_max=5),
        ],
    }
    subs = [("a", _sub("A", "900.00")), ("b", _sub("B", "800.00")), ("c", _sub("C", "700.00"))]
    scores = [
        # A: Q median(6,8,9)=8 -> 0.8*70=56; RISK median(2,4,5)=4 -> (5-4)/4=0.25*30=7.5 => 63.50
        _sheet("a", {"Q": 6, "RISK": 2}, "r1"),
        _sheet("a", {"Q": 8, "RISK": 4}, "r2"),
        _sheet("a", {"Q": 9, "RISK": 5}, "r3"),
        # B: Q 8 -> 56; RISK 4 -> 7.5 => 63.50 (tie with A)
        _sheet("b", {"Q": 8, "RISK": 4}),
        # C: Q missing -> scale minimum 0 (labelled); RISK 1 -> 1.0*30 = 30 => 30.00
        _sheet("c", {"RISK": 1}),
    ]
    results = {r["submission_key"]: r for r in ow.evaluate(basis, rubric, subs, scores, [])}
    assert results["a"]["weighted_score"] == "63.50"
    assert results["b"]["weighted_score"] == "63.50"
    assert results["a"]["rank"] == results["b"]["rank"] == 1
    assert results["a"]["tie"] and results["b"]["tie"]
    assert results["c"]["rank"] == 3 and results["c"]["missing_scores"] == ["Q"]
    assert results["c"]["criteria"][0]["substituted_minimum"] is True
    assert results["c"]["budget_gap"] == "-300.00"
    # With not_ranked the incomplete (and cheapest) offer is never ranked.
    rubric["missing_score_rule"] = "not_ranked"
    results = {r["submission_key"]: r for r in ow.evaluate(basis, rubric, subs, scores, [])}
    assert results["c"]["rank"] is None and results["c"]["weighted_score"] is None
    # An unlocked rubric produces no ranking at all.
    rubric["status"] = "draft"
    assert all(r["rank"] is None for r in ow.evaluate(basis, rubric, subs, scores, []))


# ------------------------------------------------------------------ integration


def actors(database):
    org, pid, admin, member, foreign = initialise(database, "developer_decision")
    approver, designer, spare = uuid4(), uuid4(), uuid4()
    with Session(database) as db:
        for user, caps in (
            (spare, ["review", "read_project", "review_project"]),
            (approver, ["review", "read_project", "issue_developer_brief"]),
            (designer, ["studio", "read_project", "edit_project", "edit_geometry"]),
        ):
            db.add(Membership(organisation_id=org, user_id=user, role="member", capabilities=caps))
            db.add(ProjectGrant(project_id=pid, user_id=user, capabilities=caps))
        db.commit()
    return org, pid, admin, member, approver, designer, foreign, spare


def upload(db, org, pid, key, user, content, name):
    return ow.upload_file(
        org,
        pid,
        key,
        user,
        db,
        UploadFile(file=io.BytesIO(content), filename=name),
        "Original received document",
    )


def fields(src, quoted):
    out = {name: {"state": "not_provided"} for name in ow.ConfirmedFields.model_fields}
    out["quoted_total"] = {"state": "confirmed", "value": quoted, "source": src}
    out["tax_basis"] = {"state": "confirmed", "value": "exclusive", "source": src}
    out["annual_maintenance"] = {"state": "confirmed", "value": "1000.00", "source": src}
    return out


def line(src, code, state, amount=None, adjustment=None):
    return {
        "line_id": str(uuid4()),
        "original_text": f"{code} works as quoted",
        "original_unit": "m2",
        "original_amount": amount,
        "source": src,
        "scope_code": code,
        "state": state,
        "mapping_confirmed": True,
        "adjustment": adjustment,
    }


def accepted(src):
    return [
        {"code": "INS", "state": "accepted", "source": src, "expiry": "2027-01-01"},
        {"code": "MTH", "state": "accepted", "source": src},
    ]


def sheet(rev, scores):
    return ow.ScoreInput(
        expected_revision=rev,
        rubric_revision=2,
        conflict="none",
        state="submitted",
        scores=[
            {"criterion": c, "score": s, "rationale": f"{c} evidence reviewed"}
            for c, s in scores.items()
        ],
    )


@pytest.mark.integration
def test_three_offer_owner_review_to_retained_decision_pack(database):
    org, pid, admin, member, approver, designer, foreign, spare = actors(database)
    with Session(database) as db:
        # Studio-only and foreign-tenant identities cannot see owner review records.
        for outsider in (designer, foreign):
            with pytest.raises(APIError) as caught:
                ow.get_state(org, pid, outsider, db)
            assert caught.value.status_code == 404
        with pytest.raises(APIError) as caught:  # approver lacks preparation capability
            ow.save_basis(
                org,
                pid,
                ow.BasisInput(
                    expected_revision=0,
                    title="x",
                    tax_basis="exclusive",
                    self_approval="prohibited",
                    scope_items=[{"code": "PAV", "description": "Paving", "unit": "m2"}],
                ),
                approver,
                db,
            )
        assert caught.value.status_code == 403
        with pytest.raises(APIError) as caught:  # offers need a basis first
            ow.create_submission(
                org,
                pid,
                ow.SubmissionCreate(
                    bidder_name="Early",
                    channel="external_document",
                    sender="x",
                    received_at=RECEIVED,
                    receipt_evidence="email",
                ),
                admin,
                db,
            )
        assert caught.value.code == "basis_required"

        basis_input = dict(
            title="Courtyard landscape works",
            tax_basis="exclusive",
            budget="80000.00",
            evaluation_horizon_years=10,
            self_approval="prohibited",
            scope_items=[
                {"code": "PAV", "description": "Paving", "unit": "m2", "quantity": "100"},
                {"code": "PLT", "description": "Planting", "unit": "nr", "quantity": "20"},
            ],
            requirements=[
                {
                    "code": "INS",
                    "text": "Insurance certificate",
                    "kind": "eligibility",
                    "mandatory": True,
                    "expiry_required": True,
                },
                {
                    "code": "MTH",
                    "text": "Method statement",
                    "kind": "technical",
                    "mandatory": True,
                },
            ],
            reviewers=[admin, member],
        )
        with pytest.raises(APIError) as caught:  # reviewers need a project review grant
            ow.save_basis(
                org,
                pid,
                ow.BasisInput(expected_revision=0, **{**basis_input, "reviewers": [designer]}),
                admin,
                db,
            )
        assert caught.value.code == "reviewer_grant"
        ow.save_basis(org, pid, ow.BasisInput(expected_revision=0, **basis_input), admin, db)

        rubric = dict(
            missing_score_rule="not_ranked",
            reviewer_aggregation="mean",
            criteria=[
                criterion("PRICE", "50", evidence_requirement="Confirmed comparison total"),
                criterion("TECH", "30"),
                criterion("SAFE", "20", mandatory_gate=True, pass_mark=5),
            ],
        )
        ow.save_rubric(org, pid, ow.RubricInput(expected_revision=0, **rubric), admin, db)
        with pytest.raises(APIError) as caught:  # scoring needs a locked rubric
            ow.save_score(org, pid, uuid4(), sheet(0, {}), admin, db)
        locked = ow.lock_rubric(org, pid, ow.RubricLock(expected_revision=1), admin, db)
        assert locked["revision"] == 2 and locked["payload"]["status"] == "locked"
        with pytest.raises(APIError) as caught:
            ow.save_rubric(org, pid, ow.RubricInput(expected_revision=2, **rubric), admin, db)
        assert caught.value.code == "rubric_locked"

        keys, srcs = {}, {}
        for bidder, channel, content, name in (
            ("Native Landscapes", "native_upload", b'{"proposal": "native"}', "native.json"),
            ("Workbook Builders", "external_document", xlsx(), "offer.xlsx"),
            ("Unregistered Paving", "external_document", PDF, "offer.pdf"),
        ):
            created = ow.create_submission(
                org,
                pid,
                ow.SubmissionCreate(
                    bidder_name=bidder,
                    channel=channel,
                    sender=f"{bidder} estimator",
                    received_at=RECEIVED,
                    receipt_evidence="Email received by owner inbox",
                ),
                admin,
                db,
            )
            keys[bidder] = created["key"]
            meta = upload(db, org, pid, created["key"], admin, content, name)
            assert meta["sha256"] == hashlib.sha256(content).hexdigest()
            srcs[bidder] = {"document_id": meta["id"], "location": "page 2 / sheet BOQ"}
        a, b, c = keys.values()
        sa, sb, sc = srcs.values()

        with pytest.raises(APIError) as caught:  # sources must be this offer's own documents
            ow.update_submission(
                org,
                pid,
                a,
                ow.SubmissionUpdate(expected_revision=1, fields=fields(sb, "70000.00")),
                admin,
                db,
            )
        assert caught.value.code == "source_document"
        ow.update_submission(
            org,
            pid,
            a,
            ow.SubmissionUpdate(
                expected_revision=1,
                fields=fields(sa, "70000.00"),
                lines=[
                    line(sa, "PAV", "included", "50000.00"),
                    line(sa, "PLT", "included", "20000.00"),
                ],
                responses=accepted(sa),
            ),
            admin,
            db,
        )
        allowance = {
            "amount": "8000.00",
            "reason": "Planting excluded; owner comparison allowance",
            "source": "Basis PLT quantity x owner reference allowance (comparison only)",
        }
        ow.update_submission(
            org,
            pid,
            b,
            ow.SubmissionUpdate(
                expected_revision=1,
                fields=fields(sb, "65000.00"),
                lines=[
                    line(sb, "PAV", "included", "65000.00"),
                    line(sb, "PLT", "excluded", adjustment=allowance),
                ],
                responses=accepted(sb),
            ),
            admin,
            db,
        )
        ow.update_submission(
            org,
            pid,
            c,
            ow.SubmissionUpdate(
                expected_revision=1,
                fields=fields(sc, "50000.00"),
                lines=[line(sc, "PAV", "included", "50000.00"), line(sc, "PLT", "missing")],
                responses=[{"code": "INS", "state": "absent"}],
            ),
            admin,
            db,
        )
        with pytest.raises(APIError) as caught:  # stale expected revision
            ow.update_submission(
                org,
                pid,
                c,
                ow.SubmissionUpdate(expected_revision=1, fields=fields(sc, "1.00")),
                member,
                db,
            )
        assert caught.value.code == "review_conflict"

        with pytest.raises(APIError) as caught:  # approver cannot prepare or score
            ow.save_score(org, pid, a, sheet(0, {"PRICE": 5}), approver, db)
        assert caught.value.status_code == 403
        with pytest.raises(APIError) as caught:  # granted but unassigned reviewer
            ow.save_score(org, pid, a, sheet(0, {"PRICE": 5}), spare, db)
        assert caught.value.code == "reviewer_assignment"
        with pytest.raises(APIError) as caught:
            ow.save_score(org, pid, a, sheet(0, {"PRICE": 11}), admin, db)
        assert caught.value.code == "score_range"
        # Hand-worked: A PRICE mean(8,6)=7 ->35; TECH mean(9,10)=9.5 ->28.5; SAFE 7 ->14 = 77.50
        #              B PRICE 9 ->45; TECH mean(6,7)=6.5 ->19.5; SAFE 5 (pass) ->10 = 74.50
        for user, sa_, sb_ in (
            (admin, {"PRICE": 8, "TECH": 9, "SAFE": 6}, {"PRICE": 9, "TECH": 6, "SAFE": 5}),
            (member, {"PRICE": 6, "TECH": 10, "SAFE": 8}, {"PRICE": 9, "TECH": 7, "SAFE": 5}),
        ):
            ow.save_score(org, pid, a, sheet(0, sa_), user, db)
            ow.save_score(org, pid, b, sheet(0, sb_), user, db)
        ow.save_score(
            org,
            pid,
            c,
            ow.ScoreInput(
                expected_revision=0,
                rubric_revision=2,
                conflict="declared",
                conflict_note="Former employer",
                state="submitted",
            ),
            member,
            db,
        )

        result = ow.evaluation(org, pid, admin, db)
        rows = {r["submission_key"]: r for r in result["results"]}
        assert result["official"] is True
        assert rows[a]["weighted_score"] == "77.50" and rows[a]["rank"] == 1
        assert rows[b]["weighted_score"] == "74.50" and rows[b]["rank"] == 2
        assert rows[b]["quoted_total"] == "65000.00"
        assert rows[b]["comparison_total"] == "73000.00"  # visibly differs from quoted
        assert rows[a]["lifecycle_undiscounted"] == "80000.00"
        assert rows[a]["budget_gap"] == "-10000.00"
        # The cheapest offer is external, unregistered and incomplete: never silently best.
        assert rows[c]["readiness"] == "unpriced" and rows[c]["rank"] is None
        assert rows[c]["document_only"] is True
        assert any("PLT" in reason for reason in rows[c]["reasons"])
        assert any("INS is absent" in reason for reason in rows[c]["reasons"])
        assert ow.evaluation(org, pid, member, db)["hash"] == result["hash"]  # reproducible
        what_if = ow.what_if(
            org, pid, ow.WhatIf(weights={"PRICE": "80", "TECH": "10", "SAFE": "10"}), admin, db
        )
        assert what_if["official"] is False and what_if["hash"] != result["hash"]
        assert ow.evaluation(org, pid, admin, db)["hash"] == result["hash"]

        with pytest.raises(APIError) as caught:  # not first-ranked needs a recorded exception
            ow.submit_decision(
                org,
                pid,
                ow.DecisionSubmit(
                    expected_revision=0,
                    evaluation_hash=result["hash"],
                    recommended_submission=b,
                    rationale="Prefer B",
                ),
                admin,
                db,
            )
        assert caught.value.code == "recommendation_exception"
        ow.submit_decision(
            org,
            pid,
            ow.DecisionSubmit(
                expected_revision=0,
                evaluation_hash=result["hash"],
                recommended_submission=a,
                rationale="Highest weighted score; complete scope; within budget",
            ),
            admin,
            db,
        )
        with pytest.raises(APIError) as caught:  # self-approval prohibited by basis
            ow.decision_action(
                org,
                pid,
                ow.DecisionAction(
                    expected_revision=1,
                    evaluation_hash=result["hash"],
                    action="approve",
                    reason="Agree",
                ),
                admin,
                db,
            )
        assert caught.value.code == "self_approval"
        with pytest.raises(APIError) as caught:  # reviewer without approval capability
            ow.decision_action(
                org,
                pid,
                ow.DecisionAction(
                    expected_revision=1,
                    evaluation_hash=result["hash"],
                    action="approve",
                    reason="Agree",
                ),
                member,
                db,
            )
        assert caught.value.status_code == 403

        # A revised package after submission blocks stale approval and stales its scores.
        ow.revise_submission(
            org,
            pid,
            b,
            ow.SubmissionRevise(
                expected_revision=2,
                reason="Bidder corrected arithmetic",
                sender="Workbook Builders estimator",
                received_at="2026-11-11T09:00:00+08:00",
                receipt_evidence="Clarification response email",
            ),
            admin,
            db,
        )
        fresh = ow.evaluation(org, pid, admin, db)
        assert fresh["hash"] != result["hash"]
        assert {r["submission_key"]: r for r in fresh["results"]}[b]["readiness"] == (
            "needs_clarification"
        )
        with pytest.raises(APIError) as caught:
            ow.decision_action(
                org,
                pid,
                ow.DecisionAction(
                    expected_revision=1,
                    evaluation_hash=fresh["hash"],
                    action="approve",
                    reason="Agree",
                ),
                approver,
                db,
            )
        assert caught.value.code == "evaluation_stale"
        returned = ow.decision_action(
            org,
            pid,
            ow.DecisionAction(
                expected_revision=1,
                evaluation_hash=fresh["hash"],
                action="return",
                reason="Re-review revised package B",
            ),
            approver,
            db,
        )
        assert returned["payload"]["state"] == "returned"
        ow.save_clarification(
            org,
            pid,
            uuid4(),
            ow.ClarificationInput(
                expected_revision=0,
                submission_key=c,
                question="Confirm planting price and insurance certificate",
                state="open",
            ),
            admin,
            db,
        )
        current = ow.evaluation(org, pid, admin, db)
        ow.submit_decision(
            org,
            pid,
            ow.DecisionSubmit(
                expected_revision=2,
                evaluation_hash=current["hash"],
                recommended_submission=a,
                rationale="A remains highest of comparable, fully scored offers",
            ),
            admin,
            db,
        )
        approved = ow.decision_action(
            org,
            pid,
            ow.DecisionAction(
                expected_revision=3,
                evaluation_hash=current["hash"],
                action="approve",
                reason="Approved within delegated authority",
            ),
            approver,
            db,
        )
        assert approved["payload"]["state"] == "approved"
        pack = {f["filename"]: f for f in approved["payload"]["pack"]}
        response = ow.download_file(org, pid, pack["decision-pack.json"]["id"], member, db)
        assert hashlib.sha256(response.body).hexdigest() == pack["decision-pack.json"]["sha256"]
        snapshot = json.loads(response.body)
        assert snapshot["evaluation"]["hash"] == current["hash"]
        assert snapshot["decision"]["rationale"].startswith("A remains")
        assert len(snapshot["source_manifest"]) == 3
        assert "No AI" in snapshot["disclosures"][0]
        appendix = ow.download_file(org, pid, pack["decision-appendix.csv"]["id"], member, db)
        assert b"77.50" in appendix.body
        with pytest.raises(APIError) as caught:  # foreign tenant cannot fetch retained files
            ow.download_file(org, pid, pack["decision-pack.json"]["id"], foreign, db)
        assert caught.value.status_code == 404

        # O17 memorandum: bound to the retained pack digest, PDF only, first bytes kept.
        memo_pdf = b"%PDF-1.4\n% decision memo fixture\n%%EOF\n"
        source = pack["decision-pack.json"]["sha256"]

        def memo(content, digest, who=approver):
            upload = UploadFile(file=io.BytesIO(content), filename="memo.pdf")
            return ow.retain_memo(org, pid, who, db, upload, digest)

        for content, digest, code in (
            (memo_pdf, "0" * 64, "memo_source"),
            (b"not a pdf", source, "review_file_type"),
        ):
            with pytest.raises(APIError) as caught:
                memo(content, digest)
            assert caught.value.code == code
        with pytest.raises(APIError) as caught:  # Studio-only membership is not a reviewer
            memo(memo_pdf, source, designer)
        assert caught.value.status_code in (403, 404)
        kept = memo(memo_pdf, source)
        assert kept["purpose"] == "decision_memo" and source in kept["description"]
        again = memo(b"%PDF-1.4\n% different\n%%EOF\n", source)
        assert again["id"] == kept["id"] and again["sha256"] == kept["sha256"]
        body = ow.download_file(org, pid, kept["id"], member, db).body
        assert body == memo_pdf

        board = ow.dashboard(org, approver, db)
        row = next(p for p in board["projects"] if p["project_id"] == str(pid))
        assert row["submissions"] == 3 and row["document_only"] == 2
        assert row["comparable"] == 1 and row["unpriced"] == 1
        assert row["decision_state"] == "approved" and row["lowest_comparison_total"] == "50000.00"
        assert row["reviewer_sheets_expected"] == 6
        with pytest.raises(APIError):  # Studio-only membership has no Review dashboard
            ow.dashboard(org, designer, db)
    with Session(database) as db, pytest.raises(DBAPIError):
        db.execute(text("UPDATE review_entries SET payload = '{}'::jsonb"))
        db.commit()
    with Session(database) as db, pytest.raises(DBAPIError):
        db.execute(text("UPDATE review_files SET content = 'x'"))
        db.commit()
