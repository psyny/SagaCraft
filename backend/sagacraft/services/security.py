"""Passwords, login tokens and signed file URLs."""
import hashlib
import hmac
import time
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from infrastructure.config.settings import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(hours=settings.token_hours)}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def decode_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def _file_signature(file_id: int, expires: int) -> str:
    message = f"file:{file_id}:{expires}".encode()
    return hmac.new(settings.jwt_secret_key.encode(), message, hashlib.sha256).hexdigest()[:32]


def url_expiry(now: float | None = None) -> int:
    """When a signed picture URL made now stops working. The same for a whole window (file_url_window_hours), so
    a picture keeps one URL that browsers and a CDN cache, then file_url_minutes more (a page open at the window's
    end keeps working)."""
    step = max(1, settings.file_url_window_hours) * 3600
    now = time.time() if now is None else now
    return (int(now) // step + 1) * step + settings.file_url_minutes * 60


def cache_headers(expires: int, etag: str) -> dict[str, str]:
    """A signed picture never changes: anyone may cache it (browsers, a CDN) until its URL stops working."""
    left = max(0, int(expires - time.time()))
    return {"Cache-Control": f"public, max-age={left}, immutable", "ETag": etag}


def signed_file_url(file_id: int) -> str:
    """A URL only handed to members allowed to see the file (so <img> tags work); stable for a window."""
    expires = url_expiry()
    return f"/api/files/{file_id}?e={expires}&s={_file_signature(file_id, expires)}"


def verify_file_signature(file_id: int, expires: int, signature: str) -> bool:
    if expires < time.time():
        return False
    return hmac.compare_digest(_file_signature(file_id, expires), signature)
