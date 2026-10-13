"""Tenant-scoped administration with serialized last-administrator protection."""

from decimal import Decimal
from typing import Literal

from pydantic import Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert

from app.errors import APIError, not_found
from app.models import AdministrationEvent, Membership, Organisation, UserProfile
from app.projects import require_membership
from app.schemas import Capability, Contract, ProjectCreate


class OrganisationSettings(Contract):
    timezone: str = "Asia/Kuala_Lumpur"
    currency: Literal["MYR"] = "MYR"
    units: Literal["metric"] = "metric"
    default_markup: Decimal = Field(
        default=Decimal("0"), ge=0, le=1000, max_digits=8, decimal_places=4
    )

    @field_validator("timezone")
    @classmethod
    def timezone_valid(cls, value):
        return ProjectCreate.valid_timezone(value)


class OrganisationInput(Contract):
    expected_revision: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=160)
    settings: OrganisationSettings


class MemberInput(Contract):
    expected_revision: int = Field(ge=1)
    role: Literal["administrator", "member"]
    active: bool
    capabilities: list[Capability] = Field(default_factory=list, max_length=5)


class ProfileInput(Contract):
    expected_revision: int = Field(ge=0)
    display_name: str = Field(max_length=160)


def admin(session, org_id, user_id, lock=False):
    if lock:
        session.scalar(select(Organisation).where(Organisation.id == org_id).with_for_update())
    membership = require_membership(session, org_id, user_id)
    if membership.role != "administrator":
        raise APIError(
            403, "administrator_required", "An organisation administrator must make this change."
        )
    return membership


def get_settings(session, org_id, user_id):
    require_membership(session, org_id, user_id)
    org = session.get(Organisation, org_id)
    return {
        "id": str(org.id),
        "name": org.name,
        "revision": org.revision,
        "settings": OrganisationSettings(**org.settings).model_dump(mode="json"),
    }


def save_settings(session, org_id, user_id, data):
    admin(session, org_id, user_id, True)
    org = session.get(Organisation, org_id)
    if org.revision != data.expected_revision:
        raise APIError(
            409, "settings_conflict", "Settings changed. Reload and compare your changes."
        )
    before = {"name": org.name, "settings": org.settings}
    org.name = data.name
    org.settings = data.settings.model_dump(mode="json")
    org.revision += 1
    session.add(
        AdministrationEvent(
            organisation_id=org_id,
            actor_id=user_id,
            payload={
                "action": "settings",
                "before": before,
                "after": {"name": org.name, "settings": org.settings},
            },
        )
    )
    session.flush()
    response = get_settings(session, org_id, user_id)
    session.commit()
    return response


def member_data(row):
    return {
        "id": str(row.id),
        "user_id": str(row.user_id),
        "role": row.role,
        "active": row.active,
        "capabilities": row.capabilities,
        "revision": row.revision,
    }


def list_members(session, org_id, user_id):
    admin(session, org_id, user_id)
    rows = session.scalars(
        select(Membership)
        .where(Membership.organisation_id == org_id)
        .order_by(Membership.created_at, Membership.id)
    ).all()
    return {"items": [member_data(row) for row in rows]}


def update_member(session, org_id, user_id, member_id, data):
    admin(session, org_id, user_id, True)
    row = session.scalar(
        select(Membership)
        .where(Membership.organisation_id == org_id, Membership.id == member_id)
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise not_found()
    if row.revision != data.expected_revision:
        raise APIError(409, "member_conflict", "Membership changed. Reload before retrying.")
    if (
        row.role == "administrator"
        and row.active
        and (not data.active or data.role != "administrator")
    ):
        count = session.scalar(
            select(func.count())
            .select_from(Membership)
            .where(
                Membership.organisation_id == org_id,
                Membership.role == "administrator",
                Membership.active.is_(True),
            )
        )
        if count <= 1:
            raise APIError(409, "last_administrator", "Keep at least one active administrator.")
    before = member_data(row)
    row.role = data.role
    row.active = data.active
    row.capabilities = sorted(set(data.capabilities))
    row.revision += 1
    session.add(
        AdministrationEvent(
            organisation_id=org_id,
            actor_id=user_id,
            payload={"action": "membership", "before": before, "after": member_data(row)},
        )
    )
    result = member_data(row)
    session.commit()
    return result


def get_profile(session, user_id):
    row = session.get(UserProfile, user_id)
    return {"display_name": row.display_name if row else "", "revision": row.revision if row else 0}


def save_profile(session, user_id, data):
    if data.expected_revision == 0:
        result = session.execute(
            insert(UserProfile)
            .values(user_id=user_id, display_name=data.display_name, revision=1)
            .on_conflict_do_nothing()
            .returning(UserProfile.user_id)
        ).scalar_one_or_none()
    else:
        result = session.execute(
            update(UserProfile)
            .where(UserProfile.user_id == user_id, UserProfile.revision == data.expected_revision)
            .values(display_name=data.display_name, revision=data.expected_revision + 1)
            .returning(UserProfile.user_id)
        ).scalar_one_or_none()
    if result is None:
        raise APIError(409, "profile_conflict", "Profile changed. Reload before retrying.")
    session.commit()
    return get_profile(session, user_id)


def events(session, org_id, user_id):
    admin(session, org_id, user_id)
    rows = session.scalars(
        select(AdministrationEvent)
        .where(AdministrationEvent.organisation_id == org_id)
        .order_by(AdministrationEvent.created_at.desc())
        .limit(100)
    ).all()
    return {
        "items": [
            {
                "id": str(row.id),
                "actor_id": str(row.actor_id),
                "created_at": row.created_at.isoformat(),
                "payload": row.payload,
            }
            for row in rows
        ]
    }
