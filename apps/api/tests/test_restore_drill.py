"""S04/S06 joint restore drill: database records and their retained private bytes together.

Runs only against the disposable `_test` database schema created by the `database` fixture.
Populates through application paths, takes a pg_dump of that schema, drops the schema
(simulated loss), restores it with pg_restore and verifies every retained file by SHA-256
through the same authorised download paths. Photo evidence in Supabase Storage is outside
this drill (it lives in a separate object store).
"""

import hashlib
import io
import os
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import UploadFile
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app import calculations, issued_files
from app import change_register as cr
from app import owner_review as ow
from app.models import IssuedFile, ReviewFile
from tests.test_owner_review import PDF, RECEIVED, criterion
from tests.test_pricing_readiness import prepared
from tests.test_workflow_integration import initialise

ROOT = Path(__file__).resolve().parents[3]


def tool(name):
    local = ROOT / ".local/tools/pgsql/bin" / f"{name}.exe"
    found = shutil.which(name) or (str(local) if local.exists() else None)
    if not found:
        pytest.skip(f"{name} not available: restore drill not run")
    return found


def libpq(url):
    parsed = make_url(url).set(drivername="postgresql")
    return parsed.render_as_string(hide_password=False)


@pytest.mark.integration
def test_joint_database_and_retained_file_restore(database, tmp_path):
    pg_dump, pg_restore = tool("pg_dump"), tool("pg_restore")
    url = libpq(os.environ["TEST_DATABASE_URL"])
    with database.connect() as connection:
        schema = connection.execute(text("SELECT current_schema()")).scalar_one()
    assert schema.startswith("infrashader_test_")  # never the development database

    # 1. Contractor proposal with retained PDF bytes.
    org, pid, admin, member, foreign, rate, estimate, request = prepared(database)
    proposal_pdf = b"%PDF-1.4\n% restore drill proposal\n%%EOF\n"
    with Session(database) as db:
        request.pricing_override_reason = "Fixture rate reviewed"
        issued = calculations.issue_snapshot(db, org, pid, admin, request, "proposal")
        digest = issued_files.manifest_hash(db.get(calculations.Artifact, issued["id"]))
        issued_files.retain(db, org, pid, admin, issued["id"], proposal_pdf, digest)
        change = cr.create_change(
            org,
            pid,
            cr.ChangeCreate(
                requester="Client",
                requester_role="client",
                requested_on="2026-11-12",
                reason="Restore drill change",
                proposed_additions="Extra bay",
            ),
            admin,
            db,
        )

    # 2. Owner review: received original, locked rubric, score, approved decision pack.
    oorg, opid, oadmin, omember, _ = initialise(database, "developer_decision")
    with Session(database) as db:
        ow.save_basis(
            oorg,
            opid,
            ow.BasisInput(
                expected_revision=0,
                title="Drill basis",
                tax_basis="exclusive",
                self_approval="permitted",
                reviewers=[oadmin],
                scope_items=[{"code": "PAV", "description": "Paving", "unit": "m2"}],
            ),
            oadmin,
            db,
        )
        ow.save_rubric(
            oorg,
            opid,
            ow.RubricInput(
                expected_revision=0,
                criteria=[criterion("Q", "100")],
                missing_score_rule="not_ranked",
                reviewer_aggregation="mean",
            ),
            oadmin,
            db,
        )
        ow.lock_rubric(oorg, opid, ow.RubricLock(expected_revision=1), oadmin, db)
        sub = ow.create_submission(
            oorg,
            opid,
            ow.SubmissionCreate(
                bidder_name="Drill bidder",
                channel="external_document",
                sender="Bidder",
                received_at=RECEIVED,
                receipt_evidence="Inbox",
            ),
            oadmin,
            db,
        )
        meta = ow.upload_file(
            oorg,
            opid,
            sub["key"],
            oadmin,
            db,
            UploadFile(file=io.BytesIO(PDF), filename="offer.pdf"),
            "Original",
        )
        src = {"document_id": meta["id"], "location": "p1"}
        fields = {n: {"state": "not_provided"} for n in ow.ConfirmedFields.model_fields}
        fields["quoted_total"] = {"state": "confirmed", "value": "100.00", "source": src}
        fields["tax_basis"] = {"state": "confirmed", "value": "exclusive", "source": src}
        line = {
            "line_id": str(uuid4()),
            "original_text": "Paving",
            "original_amount": "100.00",
            "source": src,
            "scope_code": "PAV",
            "state": "included",
            "mapping_confirmed": True,
        }
        ow.update_submission(
            oorg,
            opid,
            sub["key"],
            ow.SubmissionUpdate(expected_revision=1, fields=fields, lines=[line]),
            oadmin,
            db,
        )
        ow.save_score(
            oorg,
            opid,
            sub["key"],
            ow.ScoreInput(
                expected_revision=0,
                rubric_revision=2,
                conflict="none",
                state="submitted",
                scores=[{"criterion": "Q", "score": 7, "rationale": "Reviewed"}],
            ),
            oadmin,
            db,
        )
        evaluated = ow.evaluation(oorg, opid, oadmin, db)
        ow.submit_decision(
            oorg,
            opid,
            ow.DecisionSubmit(
                expected_revision=0,
                evaluation_hash=evaluated["hash"],
                recommended_submission=sub["key"],
                rationale="Only comparable offer",
            ),
            oadmin,
            db,
        )
        approved = ow.decision_action(
            oorg,
            opid,
            ow.DecisionAction(
                expected_revision=1,
                evaluation_hash=evaluated["hash"],
                action="approve",
                reason="Drill approval",
            ),
            oadmin,
            db,
        )
        expected = {
            "proposal": hashlib.sha256(proposal_pdf).hexdigest(),
            "original": meta["sha256"],
            **{f["filename"]: f["sha256"] for f in approved["payload"]["pack"]},
        }
        counts = {
            "issued": db.query(IssuedFile).count(),
            "review": db.query(ReviewFile).count(),
        }

    # 3. Backup, simulated loss, restore.
    dump = tmp_path / "drill.dump"
    subprocess.run(
        [pg_dump, "--format=custom", f"--schema={schema}", f"--file={dump}", f"--dbname={url}"],
        check=True,
        capture_output=True,
        timeout=120,
    )
    database.dispose()
    with database.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    database.dispose()
    with database.connect() as connection:
        assert (
            connection.execute(
                text("SELECT count(*) FROM pg_tables WHERE schemaname = :s"), {"s": schema}
            ).scalar_one()
            == 0
        )
    restored = subprocess.run(
        [pg_restore, "--clean", "--if-exists", "--no-owner", f"--dbname={url}", str(dump)],
        capture_output=True,
        timeout=120,
        text=True,
    )
    assert restored.returncode == 0, restored.stderr[-2000:]
    database.dispose()

    # 4. Verify through the same authorised paths.
    with Session(database) as db:
        assert db.query(IssuedFile).count() == counts["issued"]
        assert db.query(ReviewFile).count() == counts["review"]
        content, sha = issued_files.download(db, org, pid, member, issued["id"])
        assert content == proposal_pdf and sha == expected["proposal"]
        original = ow.download_file(oorg, opid, meta["id"], omember, db)
        assert hashlib.sha256(original.body).hexdigest() == expected["original"]
        for item in approved["payload"]["pack"]:
            body = ow.download_file(oorg, opid, item["id"], omember, db).body
            assert hashlib.sha256(body).hexdigest() == expected[item["filename"]]
        assert ow.evaluation(oorg, opid, oadmin, db)["hash"] == evaluated["hash"]
        assert cr.list_changes(org, pid, admin, db)["items"][0]["key"] == change["key"]
    with Session(database) as db, pytest.raises(DBAPIError):  # immutability survived restore
        db.execute(text("UPDATE review_files SET description = 'x'"))
        db.commit()
    with Session(database) as db, pytest.raises(DBAPIError):
        db.execute(text("UPDATE issued_files SET sha256 = 'x'"))
        db.commit()
