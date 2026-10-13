from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import UUID

import pytest
from sqlalchemy.orm import Session

from app import administration as admin
from app.errors import APIError
from tests.test_workflow_integration import initialise


@pytest.mark.integration
def test_settings_profiles_permissions_conflicts_and_last_admin(database):
    org, _, actor, member, foreign = initialise(database, "developer_decision")
    with Session(database) as session:
        config = admin.OrganisationInput(
            expected_revision=1,
            name="Updated organisation",
            settings=admin.OrganisationSettings(default_markup="15.5"),
        )
        with pytest.raises(APIError):
            admin.save_settings(session, org, member, config)
        session.rollback()
        assert admin.save_settings(session, org, actor, config)["revision"] == 2
        with pytest.raises(APIError):
            admin.save_settings(session, org, actor, config)
        session.rollback()
        with pytest.raises(APIError):
            admin.get_settings(session, org, foreign)
        profile = admin.save_profile(
            session, actor, admin.ProfileInput(expected_revision=0, display_name="Operator")
        )
        assert profile == {"display_name": "Operator", "revision": 1}
        assert admin.get_profile(session, member)["display_name"] == ""
        with pytest.raises(APIError):
            admin.save_profile(
                session, actor, admin.ProfileInput(expected_revision=0, display_name="Stale")
            )
        session.rollback()
        rows = admin.list_members(session, org, actor)["items"]
        primary = next(row for row in rows if row["user_id"] == str(actor))
        with pytest.raises(APIError) as last:
            admin.update_member(
                session,
                org,
                actor,
                UUID(primary["id"]),
                admin.MemberInput(expected_revision=1, role="member", active=True),
            )
        assert last.value.code == "last_administrator"
        session.rollback()
        assert len(admin.events(session, org, actor)["items"]) == 1
    with Session(database) as session:
        assert admin.get_settings(session, org, member)["settings"]["default_markup"] == "15.5"


@pytest.mark.integration
def test_two_administrators_cannot_concurrently_remove_the_last_admin(database):
    org, _, actor, member, _ = initialise(database, "developer_decision")
    with Session(database) as session:
        rows = admin.list_members(session, org, actor)["items"]
        primary = next(row for row in rows if row["user_id"] == str(actor))
        secondary = next(row for row in rows if row["user_id"] == str(member))
        promoted = admin.update_member(
            session,
            org,
            actor,
            UUID(secondary["id"]),
            admin.MemberInput(expected_revision=1, role="administrator", active=True),
        )
    barrier = Barrier(2)

    def demote(user, record):
        with Session(database) as session:
            barrier.wait()
            try:
                admin.update_member(
                    session,
                    org,
                    user,
                    UUID(record["id"]),
                    admin.MemberInput(
                        expected_revision=record["revision"], role="member", active=True
                    ),
                )
                return "saved"
            except APIError as error:
                session.rollback()
                return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(demote, actor, primary)
        second = pool.submit(demote, member, promoted)
        assert sorted([first.result(), second.result()]) == ["last_administrator", "saved"]
