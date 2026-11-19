from fastapi import Depends, Header
from sqlalchemy.orm import Session

from db.session import get_db
from models import SagaMember, User
from services.access import get_member
from services.errors import Unauthorized
from services.security import decode_token


def user_from_token(db: Session, token: str | None) -> User:
    user_id = decode_token(token or "")
    user = db.get(User, user_id) if user_id else None
    if user is None or not user.is_active:
        raise Unauthorized("Please sign in")
    return user


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    token = authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None
    return user_from_token(db, token)


def current_member(saga_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> SagaMember:
    return get_member(db, saga_id, user)
