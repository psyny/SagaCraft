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


def signed_file_url(file_id: int) -> str:
    """Short-lived URL, only handed to members allowed to see the file (so <img> tags work)."""
    # Round the expiry so the URL stays stable for a while (browser cache, no flicker on refresh)
    step = 600
    expires = (int(time.time()) // step + 1) * step + settings.file_url_minutes * 60
    return f"/api/files/{file_id}?e={expires}&s={_file_signature(file_id, expires)}"


def verify_file_signature(file_id: int, expires: int, signature: str) -> bool:
    if expires < time.time():
        return False
    return hmac.compare_digest(_file_signature(file_id, expires), signature)
