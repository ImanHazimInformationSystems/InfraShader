"""Authorised private photo proxy. Filenames never become storage paths."""

import hashlib
import warnings
from io import BytesIO
from uuid import uuid4

import httpx
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.errors import APIError, not_found, unavailable
from app.models import Evidence
from app.workspace import project_for_workspace

MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 16_000_000


def sanitise_image(content: bytes) -> tuple[bytes, str]:
    if not content or len(content) > MAX_BYTES:
        raise APIError(422, "file_size", "Use a PNG or JPEG photo no larger than 10 MiB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                if image.format not in ("PNG", "JPEG") or image.width * image.height > MAX_PIXELS:
                    raise ValueError("Unsupported photo type or more than 16 million pixels.")
                image.load()
                # Re-encode pixels to remove EXIF/GPS, comments and untrusted trailing bytes.
                cleaned = Image.new("RGB", image.size)
                cleaned.paste(image.convert("RGB"))
                output = BytesIO()
                cleaned.save(output, format="JPEG", quality=90)
                result = output.getvalue()
                if len(result) > MAX_BYTES:
                    raise ValueError("Decoded photo exceeds the permitted file size.")
                return result, "image/jpeg"
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise APIError(
            422, "invalid_photo", "Use a readable PNG/JPEG photo up to 16 million pixels."
        ) from exc


class PrivateStorage:
    def __init__(self, settings: Settings):
        if not settings.supabase_url or not settings.storage_service_key:
            raise unavailable(
                "Private Storage is not configured. Set the server-only STORAGE_SERVICE_KEY."
            )
        self.url = settings.supabase_url + "/storage/v1/object"
        key = settings.storage_service_key.get_secret_value()
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    def put(self, path: str, content: bytes, content_type: str):
        try:
            response = httpx.post(
                f"{self.url}/evidence/{path}",
                content=content,
                headers={**self.headers, "Content-Type": content_type, "x-upsert": "false"},
                timeout=20,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise unavailable(
                "Private photo upload failed. Your project was not changed; retry."
            ) from exc

    def get(self, path: str) -> bytes:
        try:
            content = bytearray()
            with httpx.stream(
                "GET", f"{self.url}/authenticated/evidence/{path}", headers=self.headers, timeout=20
            ) as response:
                response.raise_for_status()
                for chunk in response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_BYTES:
                        raise unavailable("Stored photo exceeds the permitted size.")
            return bytes(content)
        except httpx.HTTPError as exc:
            raise unavailable(
                "Private photo is currently unavailable. Retry or contact the operator."
            ) from exc

    def delete(self, path: str):
        # Compensation only for this newly uploaded object when its metadata transaction failed.
        response = httpx.request(
            "DELETE",
            f"{self.url}/evidence",
            json={"prefixes": [path]},
            headers=self.headers,
            timeout=20,
        )
        response.raise_for_status()


def metadata(record):
    return {
        "id": str(record.id),
        "description": record.description,
        "source_note": record.source_note,
        "content_type": record.content_type,
        "size_bytes": record.size_bytes,
        "sha256": record.sha256,
        "created_at": record.created_at.isoformat(),
    }


def list_evidence(session, org_id, project_id, user_id):
    project_for_workspace(session, org_id, project_id, user_id)
    records = session.scalars(
        select(Evidence)
        .where(Evidence.project_id == project_id)
        .order_by(Evidence.created_at.desc())
        .limit(100)
    ).all()
    return {"items": [metadata(record) for record in records], "limit": 100}


def upload(
    session: Session,
    org_id,
    project_id,
    user_id,
    content,
    description,
    source_note,
    storage: PrivateStorage,
):
    project_for_workspace(session, org_id, project_id, user_id, write=True)
    if (
        not description.strip()
        or not source_note.strip()
        or max(len(description), len(source_note)) > 2000
    ):
        raise APIError(
            422, "file_description", "Enter a description and source note up to 2,000 characters."
        )
    cleaned, content_type = sanitise_image(content)
    identity = uuid4()
    path = f"{org_id}/{project_id}/{identity}.jpg"
    storage.put(path, cleaned, content_type)
    try:
        record = Evidence(
            id=identity,
            project_id=project_id,
            object_path=path,
            content_type=content_type,
            size_bytes=len(cleaned),
            sha256=hashlib.sha256(cleaned).hexdigest(),
            description=description.strip(),
            source_note=source_note.strip(),
            created_by=user_id,
        )
        session.add(record)
        session.flush()
        result = metadata(record)
        session.commit()
        return result
    except Exception:
        session.rollback()
        try:
            storage.delete(path)
        except httpx.HTTPError:
            # No sensitive URI/credentials in logs. A storage reconciliation drill remains a gate.
            pass
        raise


def download(session, org_id, project_id, user_id, evidence_id, storage: PrivateStorage):
    project_for_workspace(session, org_id, project_id, user_id)
    record = session.scalar(
        select(Evidence).where(Evidence.id == evidence_id, Evidence.project_id == project_id)
    )
    if record is None:
        raise not_found()
    content = storage.get(record.object_path)
    if hashlib.sha256(content).hexdigest() != record.sha256:
        raise unavailable("Photo integrity verification failed. Contact the operator.")
    return content, record.content_type
