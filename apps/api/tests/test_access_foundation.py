from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import access, administration, onboarding, projects
from app.auth import current_user
from app.db import database_session
from app.errors import APIError
from app.main import app
from app.models import AdministrationEvent, Invitation, Membership, Organisation, ProjectGrant
from app.schemas import ProjectCreate


def create_org(db, user, mode=("studio", "review"), name="Independent team"):
    return (
        onboarding.create(
            onboarding.CreateOrganisation(name=name, workspaces=list(mode)),
            user,
            "owner@example.invalid",
            db,
        )
        .organisations[-1]
        .id
    )


def create_project(db, org, user):
    return projects.create_project(
        db,
        org,
        user,
        ProjectCreate(
            name="Private plan",
            stakeholder="Team",
            purpose="contractor_proposal",
            site={"bounds": [101.68, 3.13, 101.69, 3.14]},
        ),
    )


@pytest.mark.parametrize("mode", [("studio",), ("review",), ("studio", "review")])
def test_creator_has_explicit_grants_and_duplicate_name_is_a_new_tenant(database, mode):
    user, other = uuid4(), uuid4()
    with Session(database) as db:
        org = create_org(db, user, mode)
        other_org = create_org(db, other, mode)
        assert other_org != org
        member = access.membership(db, org, user)
        assert "manage_members" in member.capabilities
        assert set(access.workspaces(db, org, member)) == set(mode)
        assert not db.get(Organisation, org).workspace_setup_required
        with pytest.raises(APIError):
            access.membership(db, other_org, user)
        assert ("internal_pricing" in member.capabilities) == ("studio" in mode)


def test_invitation_recipient_expiry_revocation_replay_and_no_automatic_project_access(database):
    owner, recipient = uuid4(), uuid4()
    with Session(database) as db:
        org = create_org(db, owner)
        project = create_project(db, org, owner)
        data = onboarding.InviteInput(
            email="Person@Example.invalid", capabilities=access.ROLE_TEMPLATES["designer"]
        )
        invite = onboarding.invite(org, data, owner, db)
        assert "token" not in onboarding.invitations(org, owner, db)["items"][0]
        row = db.get(Invitation, UUID(invite["id"]))
        assert row.token_hash != invite["token"]
        with pytest.raises(APIError):
            onboarding.invite(org, data, owner, db)
        db.rollback()
        token = onboarding.AcceptInput(token=invite["token"])
        with pytest.raises(APIError):
            onboarding.accept(token, recipient, "wrong@example.invalid", db)
        db.rollback()
        onboarding.accept(token, recipient, "person@example.invalid", db)
        assert projects.list_projects(db, org, recipient, False, 50, 0).total == 0
        with pytest.raises(APIError):
            projects.get_project(db, org, project.id, recipient)
        with pytest.raises(APIError):
            onboarding.accept(token, recipient, "person@example.invalid", db)
        db.rollback()
        with pytest.raises(APIError):
            onboarding.invite(org, data, recipient, db)
        db.rollback()
        for state in ("revoked", "expired"):
            issued = onboarding.invite(
                org,
                onboarding.InviteInput(
                    email=f"{state}@example.invalid", capabilities=["studio", "read_project"]
                ),
                owner,
                db,
            )
            if state == "revoked":
                onboarding.revoke(org, UUID(issued["id"]), owner, db)
            else:
                db.get(Invitation, UUID(issued["id"])).expires_at = datetime.now(UTC) - timedelta(
                    seconds=1
                )
                db.commit()
            with pytest.raises(APIError):
                onboarding.accept(
                    onboarding.AcceptInput(token=issued["token"]),
                    uuid4(),
                    f"{state}@example.invalid",
                    db,
                )
            db.rollback()
        payloads = [str(r.payload) for r in db.scalars(select(AdministrationEvent))]
        assert all(invite["token"] not in p for p in payloads)


def test_concurrent_acceptance_has_only_one_winner(database):
    owner, user = uuid4(), uuid4()
    with Session(database) as db:
        org = create_org(db, owner)
        invitation = onboarding.invite(
            org,
            onboarding.InviteInput(
                email="once@example.invalid", capabilities=["review", "read_project"]
            ),
            owner,
            db,
        )
    barrier = Barrier(2)

    def accept():
        with Session(database) as db:
            barrier.wait()
            try:
                onboarding.accept(
                    onboarding.AcceptInput(token=invitation["token"]),
                    user,
                    "once@example.invalid",
                    db,
                )
                return "accepted"
            except APIError:
                return "denied"

    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(lambda _: accept(), range(2))) == ["accepted", "denied"]


def test_api_project_files_exports_and_admin_have_no_bypass(database):
    owner, designer, administrator, foreign = [uuid4() for _ in range(4)]
    with Session(database) as db:
        org = create_org(db, owner)
        project = create_project(db, org, owner)
        other_org = create_org(db, foreign)
        other_project = create_project(db, other_org, foreign)
        db.add_all(
            [
                Membership(
                    organisation_id=org,
                    user_id=designer,
                    role="member",
                    capabilities=access.ROLE_TEMPLATES["designer"],
                ),
                Membership(
                    organisation_id=org,
                    user_id=administrator,
                    role="administrator",
                    capabilities=["manage_members", "studio"],
                ),
            ]
        )
        db.commit()
        onboarding.save_grant(
            org,
            project.id,
            onboarding.GrantInput(
                user_id=designer,
                capabilities=["read_project", "edit_geometry", "edit_evidence", "analyse"],
            ),
            owner,
            db,
        )
    identity = [designer]

    def database_override():
        with Session(database) as db:
            yield db

    app.dependency_overrides[database_session] = database_override
    app.dependency_overrides[current_user] = lambda: identity[0]
    try:
        client = TestClient(app)
        endpoint = f"/api/v1/organisations/{org}/projects/{project.id}"
        assert client.get(endpoint).status_code == 200
        assert "internal_pricing" not in client.get(endpoint).json()["capabilities"]
        assert (
            client.get(f"/api/v1/organisations/{org}/projects/{other_project.id}").status_code
            == 404
        )
        for suffix in ("", "/workspace", "/evidence", "/artifacts", "/reviews", "/history"):
            identity[0] = administrator
            assert client.get(endpoint + suffix).status_code == 404
        identity[0] = designer
        assert client.get(endpoint + "/reviews").status_code == 403
        assert (
            client.patch(endpoint, json={"expected_revision": 1, "name": "Forbidden"}).status_code
            == 403
        )
        assert (
            client.put(
                endpoint + "/access",
                json={
                    "user_id": str(designer),
                    "capabilities": ["read_project", "internal_pricing"],
                },
            ).status_code
            == 403
        )
        assert (
            client.post(
                f"/api/v1/organisations/{org}/invitations",
                json={"email": "x@example.invalid", "capabilities": []},
            ).status_code
            == 403
        )
        with Session(database) as db:
            member = access.membership(db, org, designer)
            member.active = False
            db.commit()
        for suffix in ("", "/workspace", "/evidence", "/artifacts"):
            assert client.get(endpoint + suffix).status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_removing_last_admin_still_denied_and_read_only_grants_do_not_escalate(database):
    owner, reviewer = uuid4(), uuid4()
    with Session(database) as db:
        org = create_org(db, owner)
        member = access.membership(db, org, owner)
        with pytest.raises(APIError, match="last_administrator"):
            administration.update_member(
                db,
                org,
                owner,
                member.id,
                administration.MemberInput(expected_revision=1, role="member", active=True),
            )
        db.rollback()
        project = create_project(db, org, owner)
        db.add(
            Membership(
                organisation_id=org,
                user_id=reviewer,
                capabilities=access.ROLE_TEMPLATES["reviewer"],
            )
        )
        db.add(
            ProjectGrant(
                project_id=project.id, user_id=reviewer, capabilities=access.PROJECT_CAPABILITIES
            )
        )
        db.commit()
        with pytest.raises(APIError):
            access.require_project(db, org, project.id, reviewer, "issue_developer_brief")
        with pytest.raises(APIError):
            access.require_project(db, org, project.id, reviewer, "internal_pricing")


@pytest.mark.parametrize("invalid", ["unconfirmed", "wrong_user", "anonymous"])
def test_verified_recipient_rejects_untrusted_account(monkeypatch, invalid):
    from fastapi.security import HTTPAuthorizationCredentials
    from pydantic import SecretStr

    from app.config import Settings

    user = uuid4()
    account = {
        "id": str(user),
        "email": "recipient@example.invalid",
        "email_confirmed_at": datetime.now(UTC).isoformat(),
        "is_anonymous": False,
    }
    if invalid == "unconfirmed":
        account["email_confirmed_at"] = None
    elif invalid == "wrong_user":
        account["id"] = str(uuid4())
    else:
        account["is_anonymous"] = True

    class Response:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return account

    monkeypatch.setattr(onboarding.httpx, "get", lambda *args, **kwargs: Response())
    with pytest.raises(APIError) as error:
        onboarding.verified_email(
            user,
            HTTPAuthorizationCredentials(scheme="Bearer", credentials="fixture"),
            Settings(
                supabase_url="http://127.0.0.1:54331",
                storage_service_key=SecretStr("fixture-only"),
                _env_file=None,
            ),
        )
    assert error.value.status_code == 403


def test_legacy_backfill_preserves_records_and_previous_access(database):
    from pathlib import Path

    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text

    owner, member = uuid4(), uuid4()
    with Session(database) as db:
        org = create_org(db, owner)
        project = create_project(db, org, owner)
        project_id = project.id
        db.add(
            Membership(
                organisation_id=org, user_id=member, role="member", capabilities=[], active=True
            )
        )
        db.commit()
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "migrations"))
    with database.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0010")
        connection.execute(text("UPDATE memberships SET capabilities = '[]'::jsonb"))
        command.upgrade(config, "head")
    with Session(database) as db:
        assert access.require_project(db, org, project_id, owner).name == "Private plan"
        assert access.require_project(db, org, project_id, member).name == "Private plan"
        assert "internal_pricing" in access.membership(db, org, owner).capabilities
        assert "internal_pricing" not in access.membership(db, org, member).capabilities
        assert db.get(Organisation, org).workspace_setup_required
        with pytest.raises(APIError):
            access.require_project(db, org, project_id, member, "issue_proposal")
