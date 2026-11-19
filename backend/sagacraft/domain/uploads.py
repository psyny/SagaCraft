"""Upload limits per picture category. System admins edit them; MAX_UPLOAD_MB is the hard ceiling.

The frontend crops, resizes and compresses pictures to fit these limits before uploading; the server
checks them again (size, real image, pixel dimensions).
"""

CATEGORIES: dict[str, str] = {
    "character": "Character pictures",
    "item": "Item pictures",
    "document": "Document images",
    "map": "Maps",
}

DEFAULT_LIMITS: dict[str, dict[str, float | int]] = {
    "character": {"max_mb": 1.0, "max_px": 1024},
    "item": {"max_mb": 0.5, "max_px": 768},
    "document": {"max_mb": 3.0, "max_px": 2560},
    "map": {"max_mb": 8.0, "max_px": 4096},
}

MIN_MB, MIN_PX, MAX_PX = 0.05, 128, 8192
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
        except (KeyError, TypeError, ValueError):
            raise LimitError(f"{CATEGORIES[category]}: give max_mb and max_px") from None
        if not MIN_MB <= max_mb <= ceiling_mb:
            raise LimitError(f"{CATEGORIES[category]}: size must be between {MIN_MB} and {ceiling_mb} MB")
        if not MIN_PX <= max_px <= MAX_PX:
            raise LimitError(f"{CATEGORIES[category]}: pixels must be between {MIN_PX} and {MAX_PX}")
        cleaned[category] = {"max_mb": round(max_mb, 2), "max_px": max_px}
    return cleaned
