"""L01: real persistence, isolation, revision conflicts and clean duplication."""

from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import project_hub as hub
from app import projects, workspace
from app.access import ALL_CAPABILITIES
from app.errors import APIError
from app.models import (
    HubRecordRevision,
    Membership,
    Organisation,
    Project,
    ProjectGrant,
    ProjectRevision,
    Workspace,
)
from app.schemas import Opportunity, ProjectCreate, ProjectUpdate
from tests.test_object_palette import object_item
from tests.test_terrain import grid
from tests.test_workspace import fixture_workspace


def test_opportunity_contract_and_copy_sanitization():
    assert Opportunity(tags=[" a ", "a", "b"]).tags == ["a", "b"]
    for value in [
        {"due_date": "2026-02-30"},
        {"tags": [""]},
        {"stage": "approved"},
        {"tags": ["x"] * 21},
        {"client": {"name": "Client", "email": "bad"}},
    ]:
        with pytest.raises(ValidationError):
            Opportunity(**value)
    raw = fixture_workspace()
    raw["scenarios"]["option_a"]["items"].append(object_item())
    raw["scenarios"]["option_a"]["terrain"] = grid()
    original = workspace.validate_workspace(
        workspace.WorkspaceInput(**raw), [101.68, 3.13, 101.69, 3.14]
    )
    original["plan_reference"] = {"evidence_id": str(uuid4())}
    original["targets"][0]["reference_calibration"] = "a" * 64
    before = deepcopy(original)
    draft = hub.duplicate_design(original)
    assert draft.plan_reference is None
    assert draft.targets[0].reference_calibration is None
    assert original == before
    assert draft.scenarios["option_a"].terrain.size == 9
    assert draft.scenarios["option_a"].items[1].object_instance.asset_id == "bench"
    assert (
        workspace.validate_workspace(draft, [101.68, 3.13, 101.69, 3.14])["scenarios"]["option_a"][
            "items"
        ][0]["quantity"]["value"]
        > 0
    )


def seed(session):
    user, other = uuid4(), uuid4()
    org = Organisation(name="Hub test")
    session.add(org)
    session.flush()
    for member in [user, other]:
        session.add(
            Membership(
                organisation_id=org.id, user_id=member, role="member", capabilities=ALL_CAPABILITIES
            )
        )
    session.commit()
    return org.id, user, other


@pytest.mark.integration
def test_personal_contacts_templates_history_isolation_and_conflicts(database):
    with Session(database) as session:
        org, user, other = seed(session)
        contact = hub.create_record(
            org,
            hub.RecordInput(
                kind="contact", data={"name": "Customer", "email": "a@example.invalid"}
            ),
            user,
            session,
        )
        template = hub.create_record(
            org,
            hub.RecordInput(kind="template", data={"name": "Courtyard", "problem": "Access"}),
            user,
            session,
        )
        assert hub.list_records(org, other, session, "contact")["items"] == []
        for stranger_org, stranger in [(org, other), (uuid4(), user)]:
            with pytest.raises(APIError) as failure:
                hub.record_history(stranger_org, contact.id, stranger, session)
            assert failure.value.status_code == 404
        patch = hub.RecordUpdate(
            kind="contact", data={"name": "Updated customer"}, expected_revision=1
        )
        updated = hub.update_record(org, contact.id, patch, user, session)
        assert updated.revision == 2
        with pytest.raises(APIError) as failure:
            hub.update_record(org, contact.id, patch, user, session)
        assert failure.value.status_code == 409
        history = hub.record_history(org, contact.id, user, session)["items"]
        assert [r["revision"] for r in history] == [2, 1]
        assert history[-1]["data"]["data"]["name"] == "Customer"
        hub.update_record(
            org,
            contact.id,
            hub.RecordUpdate(kind="contact", data=updated.data, expected_revision=2, archived=True),
            user,
            session,
        )
        assert hub.list_records(org, user, session, "contact")["total"] == 0
        assert hub.list_records(org, user, session, "contact", True)["total"] == 1
        hub.update_record(
            org,
            contact.id,
            hub.RecordUpdate(
                kind="contact", data=updated.data, expected_revision=3, archived=False
            ),
            user,
            session,
        )
        with pytest.raises(APIError):
            hub.create_record(
                org,
                hub.RecordInput(kind="template", data={"name": "Bad", "cost": "secret"}),
                user,
                session,
            )
        assert hub.list_records(org, user, session, "template")["items"][0].id == template.id
    with Session(database) as session:
        assert (
            hub.list_records(org, user, session, "contact")["items"][0].data["name"]
            == "Updated customer"
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(HubRecordRevision)
                .where(HubRecordRevision.record_id == contact.id)
            )
            == 4
        )


@pytest.mark.integration
def test_search_filter_duplicate_permissions_fresh_history_and_design(database):
    with Session(database) as session:
        org, user, other = seed(session)
        original = projects.create_project(
            session,
            org,
            user,
            ProjectCreate(
                name="Hub source",
                purpose="contractor_proposal",
                stakeholder="Sponsor",
                site={"bounds": [101.68, 3.13, 101.69, 3.14]},
                details={
                    "budget": "1234.50",
                    "opportunity": {
                        "owner": "Planner",
                        "stage": "won",
                        "due_date": "2026-12-01",
                        "tags": ["urgent"],
                        "source": "referral",
                        "client": {"name": "Client"},
                    },
                },
            ),
        )
        for term in ["Planner", "urgent", "referral", "Client"]:
            assert (
                projects.list_projects(
                    session, org, user, False, 100, 0, query=term, opportunity="won"
                ).total
                == 1
            )
        assert (
            projects.list_projects(session, org, other, False, 100, 0, query="Planner").total == 0
        )
        assert (
            projects.list_projects(session, org, user, False, 100, 0, opportunity="lost").total == 0
        )
        workspace.save_workspace(
            session, org, original.id, user, workspace.WorkspaceInput(**fixture_workspace())
        )
        args = hub.DuplicateInput(
            name="Copy", expected_revision=1, include_design=True, expected_workspace_revision=1
        )
        with pytest.raises(APIError) as denied:
            hub.duplicate_project(org, original.id, args, other, session)
        assert denied.value.status_code == 404
        session.add(
            ProjectGrant(project_id=original.id, user_id=other, capabilities=["read_project"])
        )
        session.commit()
        with pytest.raises(APIError) as denied:
            hub.duplicate_project(org, original.id, args, other, session)
        assert denied.value.status_code == 403
        with pytest.raises(APIError) as stale:
            hub.duplicate_project(
                org,
                original.id,
                args.model_copy(update={"expected_workspace_revision": 0}),
                user,
                session,
            )
        assert stale.value.status_code == 409
        copied = hub.duplicate_project(org, original.id, args, user, session)
        assert copied.id != original.id and copied.revision == 1 and not copied.archived
        assert copied.details.opportunity.stage == "enquiry"
        assert (
            copied.details.opportunity.owner == "" and copied.details.opportunity.due_date is None
        )
        assert copied.details.opportunity.client.name == "Client"
        assert (
            session.scalar(
                select(func.count())
                .select_from(ProjectRevision)
                .where(ProjectRevision.project_id == copied.id)
            )
            == 1
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(ProjectGrant)
                .where(ProjectGrant.project_id == copied.id)
            )
            == 1
        )
        assert (
            session.get(Workspace, copied.id).data["scenarios"]["option_a"]["items"][0]["quantity"][
                "value"
            ]
            > 0
        )
        assert session.get(Project, original.id).revision == 1
        projects.update_project(
            session, org, copied.id, user, ProjectUpdate(expected_revision=1, archived=True)
        )
        restored = projects.update_project(
            session, org, copied.id, user, ProjectUpdate(expected_revision=2, archived=False)
        )
        assert restored.revision == 3
        assert (
            projects.list_projects(session, org, user, False, 100, 0, sort="due").items[0].id
            == original.id
        )
    with Session(database) as session:
        assert projects.get_project(session, org, copied.id, user).name == "Copy"
        assert workspace.get_workspace(session, org, copied.id, user)["revision"] == 1
