"""Serving uploaded pictures: the file, or a smaller copy for small places (cards, lists, avatars), made once and kept.
Browsers and a CDN cache both (security.cache_headers). See docs/implementation/31-performance-overhaul.md."""
from __future__ import annotations

import io

from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import FileVariant, StoredFile

# The widths asked for (the frontend picks the smallest that covers the box on screen)
WIDTHS = (96, 192, 384, 768, 1536)
QUALITY = 80


def variant_width(file: StoredFile, asked: int | None) -> int | None:
    """The variant to serve for a width asked for, or None (the file itself: no width, wider than the file, a GIF)."""
    if not asked or file.content_type == "image/gif" or not file.width:
        return None
    width = next((w for w in WIDTHS if w >= asked), None)
    if width is None or width >= file.width:
        return None
    return width


def variant(db: Session, file: StoredFile, width: int) -> FileVariant:
    """The file `width` px wide (WebP, keeping transparency), made the first time and kept."""
    found = db.scalar(select(FileVariant).where(FileVariant.file_id == file.id, FileVariant.width == width))
    if found is not None:
        return found
    with Image.open(io.BytesIO(file.data)) as source:
        picture = ImageOps.exif_transpose(source)
        picture = picture.convert("RGBA" if picture.mode in ("RGBA", "LA", "P") else "RGB")
        height = max(1, round(picture.height * width / picture.width))
        picture = picture.resize((width, height), Image.LANCZOS)
        buffer = io.BytesIO()
        picture.save(buffer, "WEBP", quality=QUALITY, method=4)
    data = buffer.getvalue()
    made = FileVariant(file_id=file.id, width=width, content_type="image/webp", size=len(data), data=data)
    db.add(made)
    try:
        db.commit()
    except Exception:  # made at the same moment by another request: use theirs
        db.rollback()
        return db.scalar(select(FileVariant).where(FileVariant.file_id == file.id, FileVariant.width == width)) or made
    return made
