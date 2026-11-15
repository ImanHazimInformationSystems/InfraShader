from datetime import date, timedelta
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app import administration, calculations, issued_files, workspace
from app.errors import APIError
from app.models import AdministrationEvent, Artifact, IssuedFile, Membership, ProjectGrant
from app.pricing_readiness import readiness
from tests.test_pricing import calculate, fixtures
from tests.test_workflow_integration import initialise
from tests.test_workspace import fixture_workspace


def test_validity_count_and_unknown_values_never_claim_value_coverage():
    items, rates = fixtures()
    rates["rate"].update(effective_date="2026-01-01", valid_until="2026-10-30")
    result = calculate(items, rates)
    assert readiness(result, date(2026, 10, 30))["ready"]
    assert readiness(result, date(2026, 10, 31))["warnings"][0]["code"] == "expired_rate"
    assert (
        readiness(result, date(2026, 10, 30), date(2026, 11, 1))["warnings"][0]["code"]
        == "short_validity"
    )
    items.append({**items[0], "id": "missing", "rate_id": None})
    result = readiness(calculate(items, rates), date(2026, 10, 30))
    assert (result["priced_count"], result["scope_count"], result["unpriced_count"]) == (1, 2, 1)
    assert result["value_coverage"] is None and not result["ready"]


def test_zero_future_archive_and_provisional_are_explicit():
    items, rates = fixtures()
    items[0]["pricing_status"] = "provisional"
    rates["rate"].update(effective_date="2099-01-01", amount="0", archived=True)
    result = readiness(calculate(items, rates), date(2026, 10, 30))
    assert {w["code"] for w in result["warnings"]} == {
        "provisional",
        "zero_price",
        "future_rate",
        "archived_rate",
        "unknown_validity",
    }


def test_rate_validity_validation_and_equipment_inclusions():
    with pytest.raises(ValidationError):
        calculations.RateInput(
            code="A",
            description="A",
            unit="h",
            basis="cost",
            amount="2",
            effective_date=date(2026, 10, 30),
            valid_until=date(2026, 10, 29),
            source_note="Fixture",
        )
    from app.domain.pricing import calculate_estimate

    items, rates = fixtures()
    rates["rate"]["includes"] = ["equipment"]
    with pytest.raises(ValueError, match="already included"):
        calculate_estimate(
            items,
            rates,
            currency="MYR",
            method="markup",
            percent=0,
            wastage=0,
            charges=[{"category": "equipment", "amount": "10", "source_note": "Duplicate"}],
        )


def prepared(database, expiry=None):
    org, project, admin, member, foreign = initialise(database, "contractor_proposal")
    with Session(database) as db:
        rate = calculations.create_rate(
            db,
            org,
            admin,
            calculations.RateInput(
                code="CORE",
                description="Fixture cost",
                unit="m2",
                basis="cost",
                amount="10",
                effective_date=date(2020, 1, 1),
                valid_until=expiry,
                source_note="Private source",
            ),
        )
        draft = fixture_workspace()
        draft["scenarios"]["option_a"]["items"][0]["rate_id"] = rate["id"]
        workspace.save_workspace(db, org, project, admin, workspace.WorkspaceInput(**draft))
        estimate = calculations.run_estimate(
            db,
            org,
            project,
            admin,
            calculations.EstimateInput(
                expected_revision=1,
                request_key=uuid4(),
                scenario="option_a",
                method="markup",
                percent=20,
            ),
        )
    issue = calculations.IssueInput(
        request_key=uuid4(),
        estimate_id=estimate["id"],
        expected_project_revision=1,
        preferred_option="option_a",
        criteria=["Scope"],
        review_notes="Reviewed",
        customer_narrative="Client scope",
        assumptions="Site check required",
        exclusions="No numerical shade claims",
        confirmed=True,
        valid_until=date.today() + timedelta(days=30),
        programme="After approval",
        maintenance="Not included",
    )
    return org, project, admin, member, foreign, rate, estimate, issue


@pytest.mark.integration
def test_issue_gate_override_private_audit_and_versioned_source(database):
    org, project, admin, member, foreign, rate, estimate, issue = prepared(database)
    with Session(database) as db:
        with pytest.raises(APIError, match="price_review"):
            calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        db.rollback()
        reason = "Internal sensitive commercial justification"
        issue.pricing_override_reason = reason
        preview = calculations.issue_snapshot(
            db, org, project, admin, issue, "proposal", preview=True
        )
        assert preview["draft"] and reason not in str(preview)
        assert (
            db.scalar(
                select(AdministrationEvent).where(
                    AdministrationEvent.payload["action"].astext == "pricing_issue_override"
                )
            )
            is None
        )
        issued = calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        assert issued["payload"]["pricing_review"]["exception_reviewed"]
        assert reason not in str(issued)
        event = db.scalar(
            select(AdministrationEvent).where(
                AdministrationEvent.payload["action"].astext == "pricing_issue_override"
            )
        )
        assert event.payload["reason"] == reason
        assert event.actor_id == admin
        assert reason in str(administration.events(db, org, admin))
        assert (
            calculations.issue_snapshot(db, org, project, admin, issue, "proposal")["id"]
            == issued["id"]
        )
        assert issued["payload"]["manifest"]["estimate_id"] == estimate["id"]
        assert (
            issued["payload"]["quantity_schedule"][0]["quantity"]
            == estimate["payload"]["lines"][0]["quantity"]
        )
        with pytest.raises(APIError):
            calculations.estimate_readiness(db, org, project, foreign, UUID(estimate["id"]))
        db.rollback()
        grant = db.get(ProjectGrant, (project, admin))
        grant.capabilities = [c for c in grant.capabilities if c != "internal_pricing"]
        db.commit()
        assert reason not in str(administration.events(db, org, admin))
        with pytest.raises(APIError):
            calculations.issue_snapshot(
                db,
                org,
                project,
                admin,
                issue.model_copy(update={"request_key": uuid4()}),
                "proposal",
            )
        db.rollback()


@pytest.mark.integration
def test_archive_rechecked_at_issue_and_rate_refresh_is_explicit(database):
    org, project, admin, member, foreign, rate, estimate, issue = prepared(
        database, date(2099, 12, 31)
    )
    with Session(database) as db:
        assert calculations.estimate_readiness(db, org, project, admin, UUID(estimate["id"]))[
            "ready"
        ]
        calculations.archive_rate(
            db,
            org,
            admin,
            UUID(rate["id"]),
            calculations.RateArchiveInput(expected_revision=1, archived=True),
        )
        with pytest.raises(APIError, match="price_review"):
            calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        db.rollback()
        assert (
            calculations.estimate_readiness(db, org, project, admin, UUID(estimate["id"]))[
                "warnings"
            ][0]["code"]
            == "archived_rate"
        )
        stored = db.get(Artifact, UUID(estimate["id"]))
        assert stored.payload["lines"][0]["rate"]["archived"] is False
        issue.pricing_override_reason = "Archived version explicitly reviewed"
        first = calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        assert first["payload"]["selling_total"] == estimate["payload"]["selling_total"]


@pytest.mark.integration
def test_retained_pdf_identity_retry_manifest_permissions_and_immutability(database):
    org, project, admin, member, foreign, rate, estimate, issue = prepared(
        database, date(2099, 12, 31)
    )
    with Session(database) as db:
        output = calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        oid = UUID(output["id"])
        pending = issued_files.status(db, org, project, member, oid)
        assert not pending["retained"]
        with pytest.raises(APIError, match="not retained"):
            issued_files.download(db, org, project, member, oid)
        with pytest.raises(APIError):
            issued_files.retain(
                db, org, project, member, oid, b"%PDF-fixture\n%%EOF", pending["manifest_hash"]
            )
        db.rollback()
        with pytest.raises(APIError, match="manifest"):
            issued_files.retain(db, org, project, admin, oid, b"%PDF-fixture\n%%EOF", "wrong")
        db.rollback()
        with pytest.raises(APIError, match="complete reviewed PDF"):
            issued_files.retain(db, org, project, admin, oid, b"bad", pending["manifest_hash"])
        db.rollback()
        content = b"%PDF-1.7\nfixture storage bytes, not layout evidence\n%%EOF"
        retained = issued_files.retain(
            db, org, project, admin, oid, content, pending["manifest_hash"]
        )
        assert retained["retained"]
    with Session(database) as db:
        assert issued_files.download(db, org, project, member, oid)[0] == content
        assert (
            issued_files.retain(
                db, org, project, admin, oid, b"different retry bytes", pending["manifest_hash"]
            )["sha256"]
            == retained["sha256"]
        )
        with pytest.raises(APIError):
            issued_files.download(db, org, project, foreign, oid)
        db.rollback()
        with pytest.raises(DBAPIError, match="immutable"):
            db.execute(
                text("UPDATE issued_files SET renderer='replacement' WHERE artifact_id=:id"),
                {"id": oid},
            )
        db.rollback()
        record = db.get(IssuedFile, oid)
        record.content = b"corruption"
        with db.no_autoflush, pytest.raises(APIError, match="integrity"):
            issued_files.download(db, org, project, member, oid)
        db.rollback()
        membership = db.scalar(
            select(Membership).where(
                Membership.organisation_id == org, Membership.user_id == member
            )
        )
        membership.active = False
        db.commit()
        with pytest.raises(APIError):
            issued_files.download(db, org, project, member, oid)


@pytest.mark.integration
def test_fixed_below_cost_is_private_and_missing_price_cannot_be_overridden(database):
    org, project, admin, member, foreign, rate, estimate, issue = prepared(
        database, date(2099, 12, 31)
    )
    with Session(database) as db:
        fixed = calculations.run_estimate(
            db,
            org,
            project,
            admin,
            calculations.EstimateInput(
                expected_revision=1,
                request_key=uuid4(),
                scenario="option_a",
                method="fixed_selling",
                fixed_selling="1",
            ),
        )
        assert fixed["payload"]["readiness"]["warnings"][0]["code"] == "below_cost"
        restricted = calculations.get_artifacts(db, org, project, member)
        assert "below_cost" not in str(restricted) and "cost_base" not in str(restricted)
        issue.estimate_id = UUID(fixed["id"])
        with pytest.raises(APIError):
            calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        db.rollback()
        issue.pricing_override_reason = "Explicit loss approved for fixture"
        issued = calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        assert "below_cost" not in str(issued) and "Explicit loss" not in str(issued)
        draft = fixture_workspace()
        draft["expected_revision"] = 1
        workspace.save_workspace(db, org, project, admin, workspace.WorkspaceInput(**draft))
        incomplete = calculations.run_estimate(
            db,
            org,
            project,
            admin,
            calculations.EstimateInput(
                expected_revision=2, request_key=uuid4(), scenario="option_a", method="markup"
            ),
        )
        issue.estimate_id = UUID(incomplete["id"])
        issue.request_key = uuid4()
        with pytest.raises(APIError, match="issue_not_ready"):
            calculations.issue_snapshot(db, org, project, admin, issue, "proposal")


@pytest.mark.integration
def test_proposal_revision_appendix_retains_previous_total_and_manifest(database):
    org, project, admin, member, foreign, rate, estimate, issue = prepared(
        database, date(2099, 12, 31)
    )
    with Session(database) as db:
        first = calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        revised = issue.model_copy(update={"request_key": uuid4()})
        with pytest.raises(APIError, match="change_summary"):
            calculations.issue_snapshot(db, org, project, admin, revised, "proposal")
        db.rollback()
        revised.change_summary = "No scope changes; clarified maintenance."
        revised.maintenance = "Twelve visits, timing to be agreed."
        second = calculations.issue_snapshot(db, org, project, admin, revised, "proposal")
        assert second["payload"]["version"] == 2
        assert second["payload"]["previous_issue"]["id"] == first["id"]
        assert (
            second["payload"]["previous_issue"]["selling_total"]
            == first["payload"]["selling_total"]
        )
        assert second["payload"]["scope_changes"] == []
        assert db.get(Artifact, UUID(first["id"])).payload["maintenance"] == "Not included"
        # New issues use template v3; older v2 issues keep their own renderer identity.
        assert second["payload"]["manifest"]["renderer"] == "@react-pdf/renderer 4.9.0; template v3"


@pytest.mark.integration
def test_retention_concurrent_first_writer_preserves_one_file(database):
    from concurrent.futures import ThreadPoolExecutor

    org, project, admin, member, foreign, rate, estimate, issue = prepared(
        database, date(2099, 12, 31)
    )
    with Session(database) as db:
        issued = calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        oid = UUID(issued["id"])
        digest = issued_files.status(db, org, project, admin, oid)["manifest_hash"]

    def retain(index):
        with Session(database) as db:
            return issued_files.retain(
                db, org, project, admin, oid, f"%PDF-1.7\nfixture {index}\n%%EOF".encode(), digest
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(retain, [1, 2]))
    assert results[0]["sha256"] == results[1]["sha256"]
    with Session(database) as db:
        assert issued_files.download(db, org, project, member, oid)[1] == results[0]["sha256"]


@pytest.mark.integration
def test_explicit_photo_copy_is_frozen_and_integrity_checked(database):
    import hashlib
    from io import BytesIO

    from PIL import Image

    from app.models import Evidence

    org, project, admin, member, foreign, rate, estimate, issue = prepared(
        database, date(2099, 12, 31)
    )
    buffer = BytesIO()
    Image.new("RGB", (1200, 800), (50, 150, 70)).save(buffer, format="JPEG")
    content = buffer.getvalue()

    class Storage:
        def get(self, path):
            assert path == "fixture/photo"
            return content

    with Session(database) as db:
        photo = Evidence(
            project_id=project,
            object_path="fixture/photo",
            content_type="image/jpeg",
            size_bytes=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
            description="Synthetic green photo",
            source_note="Test image owned by fixture",
            created_by=admin,
        )
        db.add(photo)
        db.commit()
        issue.evidence_ids = [photo.id]
        no_photo = calculations.issue_snapshot(
            db, org, project, admin, issue, "proposal", preview=True
        )
        assert "image_data" not in no_photo["site_evidence"][0]
        issue.include_evidence_images = True
        with pytest.raises(APIError, match="storage is unavailable"):
            calculations.issue_snapshot(db, org, project, admin, issue, "proposal", preview=True)
        db.rollback()
        issued = calculations.issue_snapshot(
            db, org, project, admin, issue, "proposal", storage=Storage()
        )
        copied = issued["payload"]["site_evidence"][0]
        assert copied["image_data"].startswith("data:image/jpeg;base64,")
        assert copied["image_sha256"] and copied["sha256"] == photo.sha256
        photo.archived = True
        db.commit()
        assert db.get(Artifact, UUID(issued["id"])).payload["site_evidence"][0] == copied
        photo.archived = False
        db.commit()
        issue.change_summary = "Photo integrity test revision"
        content = b"corrupted"
        issue.request_key = uuid4()
        with pytest.raises(APIError, match="integrity"):
            calculations.issue_snapshot(
                db, org, project, admin, issue, "proposal", storage=Storage()
            )


@pytest.mark.integration
def test_exception_reason_cannot_imply_review_without_internal_permission(database):
    org, project, admin, member, foreign, rate, estimate, issue = prepared(
        database, date(2099, 12, 31)
    )
    with Session(database) as db:
        grant = db.get(ProjectGrant, (project, admin))
        grant.capabilities = [cap for cap in grant.capabilities if cap != "internal_pricing"]
        db.commit()
        issue.pricing_override_reason = "Attempted review without grant"
        with pytest.raises(APIError):
            calculations.issue_snapshot(db, org, project, admin, issue, "proposal")
        db.rollback()
        issue.pricing_override_reason = ""
        assert (
            calculations.issue_snapshot(db, org, project, admin, issue, "proposal")["kind"]
            == "proposal"
        )
