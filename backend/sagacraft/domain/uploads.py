"""Upload limits per picture category. System admins edit them; MAX_UPLOAD_MB is the hard ceiling.

The frontend crops, resizes and compresses pictures to fit these limits before uploading; the server
checks them again (size, real image, pixel dimensions).
"""

CATEGORIES: dict[str, str] = {
    "character": "Character pictures",
    "icon": "Icons",
    "item": "Item pictures",
    "document": "Document images",
    "map": "Location map pictures",
}

# max_count: how many pictures of the category one resource holds (a gallery; a location's map pictures)
DEFAULT_LIMITS: dict[str, dict[str, float | int]] = {
    "character": {"max_mb": 1.0, "max_px": 1024, "max_count": 8},
    "icon": {"max_mb": 0.2, "max_px": 256, "max_count": 1},
    "item": {"max_mb": 0.5, "max_px": 768, "max_count": 4},
    "document": {"max_mb": 3.0, "max_px": 2560, "max_count": 12},
    "map": {"max_mb": 8.0, "max_px": 4096, "max_count": 24},
}

MIN_MB, MIN_PX, MAX_PX = 0.05, 64, 8192
MAX_COUNT = 100
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
PILLOW_FORMATS = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp", "GIF": "image/gif"}


class LimitError(ValueError):
    pass


def merge_limits(stored: dict | None, ceiling_mb: float) -> dict[str, dict[str, float | int]]:
    """Defaults, overridden by stored values, capped by the hard ceiling."""
    result = {}
    for category, default in DEFAULT_LIMITS.items():
        value = {**default, **((stored or {}).get(category) or {})}
        result[category] = {
            "max_mb": round(min(float(value["max_mb"]), ceiling_mb), 2),
            "max_px": int(value["max_px"]),
            "max_count": int(value.get("max_count") or default["max_count"]),
        }
    return result


def validate_limits(changes: dict, ceiling_mb: float) -> dict[str, dict[str, float | int]]:
    cleaned: dict[str, dict[str, float | int]] = {}
    for category, value in (changes or {}).items():
        if category not in CATEGORIES:
            raise LimitError(f"Unknown category '{category}'")
        try:
            max_mb = float(value["max_mb"])
            max_px = int(value["max_px"])
            max_count = int(value.get("max_count", DEFAULT_LIMITS[category]["max_count"]))
        except (KeyError, TypeError, ValueError):
            raise LimitError(f"{CATEGORIES[category]}: give max_mb and max_px") from None
        if not MIN_MB <= max_mb <= ceiling_mb:
            raise LimitError(f"{CATEGORIES[category]}: size must be between {MIN_MB} and {ceiling_mb} MB")
        if not MIN_PX <= max_px <= MAX_PX:
            raise LimitError(f"{CATEGORIES[category]}: pixels must be between {MIN_PX} and {MAX_PX}")
        if not 1 <= max_count <= MAX_COUNT:
            raise LimitError(f"{CATEGORIES[category]}: the number of pictures must be between 1 and {MAX_COUNT}")
        cleaned[category] = {"max_mb": round(max_mb, 2), "max_px": max_px, "max_count": max_count}
    return cleaned
