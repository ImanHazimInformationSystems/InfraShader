"""Operator-only provisioning: no public endpoint or authentication bypass."""

import argparse
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import engine_for
from app.models import Membership, Organisation


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Provision one organisation for an existing auth user"
    )
    parser.add_argument("--organisation", required=True)
    parser.add_argument(
        "--user-id", required=True, type=UUID, help="Existing Supabase auth.users UUID"
    )
    args = parser.parse_args()
    name = args.organisation.strip()
    if not name or len(name) > 160:
        parser.error("Organisation name must be 1–160 characters")
    settings = get_settings()
    if not settings.database_url:
        parser.error("Set DATABASE_URL in the operator environment")
    with Session(engine_for(settings.database_url)) as session, session.begin():
        organisation = Organisation(name=name)
        session.add(organisation)
        session.flush()
        session.add(
            Membership(
                organisation_id=organisation.id,
                user_id=args.user_id,
                role="administrator",
                capabilities=[],
                active=True,
            )
        )
    print(f"Provisioned organisation {organisation.id}; existing auth user must sign in normally.")


if __name__ == "__main__":
    main()
