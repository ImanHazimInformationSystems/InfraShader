"""Explicitly selected, sanitised thumbnail copies for immutable audience outputs."""

import base64
import hashlib
from io import BytesIO

from PIL import Image, UnidentifiedImageError

from app.errors import APIError


def freeze_images(records, storage):
    if storage is None:
        raise APIError(
            503,
            "output_images",
            "Private evidence storage is unavailable; retry or omit photo copies.",
        )
    result = {}
    for record in records:
        content = storage.get(record.object_path)
        if len(content) > 10 * 1024 * 1024 or hashlib.sha256(content).hexdigest() != record.sha256:
            raise APIError(
                409,
                "output_image_integrity",
                "Selected evidence bytes failed their integrity check.",
            )
        try:
            with Image.open(BytesIO(content)) as photo:
                if photo.width * photo.height > 16_000_000 or photo.format not in ("PNG", "JPEG"):
                    raise ValueError("Unsupported image")
                photo.load()
                # Upload strips metadata; output retains a separate bounded pixel copy.
                image = Image.new("RGB", photo.size)
                image.paste(photo.convert("RGB"))
                image.thumbnail((960, 640))
                buffer = BytesIO()
                image.save(buffer, format="JPEG", quality=70)
                thumbnail = buffer.getvalue()
                if len(thumbnail) > 512 * 1024:
                    raise ValueError("Photo copy exceeds limit")
        except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
            raise APIError(
                422,
                "output_image",
                "Selected evidence cannot be rendered safely. Review or omit that photo.",
            ) from exc
        result[str(record.id)] = {
            "image_data": "data:image/jpeg;base64," + base64.b64encode(thumbnail).decode(),
            "image_sha256": hashlib.sha256(thumbnail).hexdigest(),
        }
    return result
