"""Private bounded issued bytes, atomically retained with their immutable source manifest.

The authorised issuer supplies the reviewed browser rendering. This is retention,
not a digital signature or a proof that arbitrary supplied PDF content is correct.
"""

import hashlib
import json

from sqlalchemy import select

from app import access
from app.errors import APIError, not_found
from app.models import Artifact, IssuedFile

MAX_BYTES = 10 * 1024 * 1024
RENDERER = "infrashader-react-pdf-v2"


def renderer_for(artifact):
    """Record the template the issued payload declares; older issues stay v2."""
    template = artifact.payload.get("template", 2)
    return f"infrashader-react-pdf-v{template}"


def source(session, org_id, project_id, user_id, artifact_id, write=False):
    access.require_project(session, org_id, project_id, user_id, "read_project")
    statement = select(Artifact).where(
        Artifact.id == artifact_id,
        Artifact.project_id == project_id,
        Artifact.kind.in_(["proposal", "developer_brief"]),
    )
    if write:
        statement = statement.with_for_update()
    artifact = session.scalar(statement)
    if artifact is None:
        raise not_found()
    if write:
        access.require_project(
            session,
            org_id,
            project_id,
            user_id,
            "issue_proposal" if artifact.kind == "proposal" else "issue_developer_brief",
        )
    elif artifact.kind == "developer_brief":
        caps = access.project_capabilities(session, org_id, project_id, user_id)
        if not {"review_project", "issue_developer_brief"}.intersection(caps):
            raise not_found()
    return artifact


def manifest_hash(artifact):
    return hashlib.sha256(
        json.dumps(
            artifact.payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
    ).hexdigest()


def metadata(record):
    return {
        "retained": True,
        "sha256": record.sha256,
        "size_bytes": record.size_bytes,
        "manifest_hash": record.manifest_hash,
        "renderer": record.renderer,
        "retained_at": record.created_at.isoformat(),
    }


def status(session, org_id, project_id, user_id, artifact_id):
    artifact = source(session, org_id, project_id, user_id, artifact_id)
    record = session.get(IssuedFile, artifact_id)
    return (
        metadata(record)
        if record
        else {"retained": False, "manifest_hash": manifest_hash(artifact)}
    )


def retain(session, org_id, project_id, user_id, artifact_id, content, supplied_manifest):
    artifact = source(session, org_id, project_id, user_id, artifact_id, write=True)
    digest = manifest_hash(artifact)
    if supplied_manifest != digest:
        raise APIError(
            409,
            "output_manifest",
            "Output source manifest changed or does not match. Reload the issued snapshot.",
        )
    previous = session.get(IssuedFile, artifact_id)
    if previous:
        # Never overwrite the first accepted bytes, including retry after a lost response.
        return metadata(previous)
    if (
        not content
        or len(content) > MAX_BYTES
        or not content.startswith(b"%PDF-")
        or b"%%EOF" not in content[-1024:]
    ):
        raise APIError(422, "output_pdf", "Retain a complete reviewed PDF no larger than 10 MiB.")
    record = IssuedFile(
        artifact_id=artifact_id,
        content=content,
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
        manifest_hash=digest,
        renderer=renderer_for(artifact),
        created_by=user_id,
    )
    session.add(record)
    session.flush()
    result = metadata(record)
    session.commit()
    return result


def download(session, org_id, project_id, user_id, artifact_id):
    artifact = source(session, org_id, project_id, user_id, artifact_id)
    record = session.get(IssuedFile, artifact_id)
    if not record:
        raise APIError(
            409,
            "output_pending",
            (
                "The issued snapshot exists but its PDF is not retained. An "
                "issuer must complete PDF retention."
            ),
        )
    if (
        hashlib.sha256(record.content).hexdigest() != record.sha256
        or manifest_hash(artifact) != record.manifest_hash
    ):
        raise APIError(
            503, "output_integrity", "Retained output integrity check failed; contact the operator."
        )
    return record.content, record.sha256
