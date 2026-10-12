"""Provisioning must report success after commit without accessing detached ORM state."""

import sys
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import bootstrap
from app.config import Settings
from app.models import Membership, Organisation


@pytest.mark.integration
def test_bootstrap_commits_membership_and_reports_success(database, monkeypatch, capsys):
    user_id = uuid4()
    monkeypatch.setattr(
        sys, "argv", ["bootstrap", "--organisation", "Operator fixture", "--user-id", str(user_id)]
    )
    monkeypatch.setattr(bootstrap, "get_settings", lambda: Settings(database_url=str(database.url)))
    monkeypatch.setattr(bootstrap, "engine_for", lambda url: database)

    bootstrap.main()

    with Session(database) as session:
        organisation = session.scalars(select(Organisation)).one()
        membership = session.scalars(select(Membership)).one()
        assert organisation.name == "Operator fixture"
        assert membership.organisation_id == organisation.id
        assert membership.user_id == user_id
        assert membership.role == "administrator"
        assert membership.active
        assert f"Provisioned organisation {organisation.id}" in capsys.readouterr().out

    bootstrap.main()
    assert "Already provisioned: 1" in capsys.readouterr().out
    with Session(database) as session:
        assert len(session.scalars(select(Organisation)).all()) == 1
        membership = session.scalars(select(Membership)).one()
        membership.active = False
        session.commit()

    bootstrap.main()
    with Session(database) as session:
        assert not session.scalars(select(Membership)).one().active
