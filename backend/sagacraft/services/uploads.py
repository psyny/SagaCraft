"""Upload limits (system settings) and picture uploads, checked on the server.

The browser already crops, resizes and compresses pictures to the limits; the server never trusts that:
it checks the size, decodes the file to make sure it is a real image of an allowed format, and checks
its pixel dimensions.
"""
import io

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from domain import permissions as perms
from domain.uploads import CATEGORIES, IMAGE_TYPES, PILLOW_FORMATS, LimitError, merge_limits, validate_limits
from infrastructure.config.settings import settings
from models import SagaMember, StoredFile, SystemSetting, User
from services.access import require_permission
from services.errors import BadRequest, Forbidden
from services.security import signed_file_url

LIMITS_KEY = "upload_limits"
# Refuse absurd images before decoding them (decompression bombs)
Image.MAX_IMAGE_PIXELS = 8192 * 8192 * 2


def get_limits(db: Session) -> dict:
    row = db.get(SystemSetting, LIMITS_KEY)
    limits = merge_limits(row.value if row else None, settings.max_upload_mb)
    return {
        "ceiling_mb": settings.max_upload_mb,
        "categories": {k: {"label": CATEGORIES[k], **v} for k, v in limits.items()},
    }


def update_limits(db: Session, user: User, changes: dict) -> dict:
    require_permission(user, perms.SYSTEM_SETTINGS_MANAGE)
    try:
        cleaned = validate_limits(changes, settings.max_upload_mb)
    except LimitError as exc:
        raise BadRequest(str(exc)) from None
    row = db.get(SystemSetting, LIMITS_KEY)
    if row is None:
        row = SystemSetting(key=LIMITS_KEY, value={})
        db.add(row)
    row.value = {**(row.value or {}), **cleaned}
    row.updated_by_user_id = user.id
    db.commit()
    return get_limits(db)


def inspect_image(data: bytes) -> tuple[str, int, int]:
    """Decode the file: returns (content type from the real format, width, height)."""
    try:
        with Image.open(io.BytesIO(data)) as image:
            image_format = image.format
            width, height = image.size
            image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError, ValueError):
        raise BadRequest("This file isn't a picture we can read") from None
    content_type = PILLOW_FORMATS.get(image_format or "")
    if content_type is None:
        raise BadRequest("Only PNG, JPEG, WebP and GIF pictures")
    return content_type, width, height


def upload_file(db: Session, member: SagaMember, category: str, content_type: str, data: bytes) -> dict:
    if member.role == "viewer":
        raise Forbidden("Viewers can't upload files")
    if category not in CATEGORIES:
        raise BadRequest(f"Unknown upload category '{category}'")
    if content_type not in IMAGE_TYPES:
        raise BadRequest("Only PNG, JPEG, WebP and GIF pictures")
    if not data:
        raise BadRequest("Empty file")
    limit = get_limits(db)["categories"][category]
    max_bytes = int(limit["max_mb"] * 1024 * 1024)
    if len(data) > max_bytes:
        raise BadRequest(f"{limit['label']} can have at most {limit['max_mb']} MB")
    real_type, width, height = inspect_image(data)
    if max(width, height) > limit["max_px"]:
        raise BadRequest(f"{limit['label']} can be at most {limit['max_px']} px on the longest side")
    file = StoredFile(saga_id=member.saga_id, category=category, content_type=real_type, size=len(data),
                      width=width, height=height, data=data, created_by_member_id=member.id)
    db.add(file)
    db.commit()
    return {"id": file.id, "url": signed_file_url(file.id), "content_type": real_type, "size": len(data),
            "width": width, "height": height, "category": category}
