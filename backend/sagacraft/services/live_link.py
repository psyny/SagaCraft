"""The live link: /live/<token> shows the Saga's live Stage, as a viewer, to anyone who has the link (a TV, a
tablet, a second screen), with no sign-in and nothing else of the app. The DM turns it on and off and can replace
it (the old address stops working). See docs/concepts/stages.md ("The live link").

The token is the Saga's secret (sagas.live_token; None: off), shown only to its admins.
"""
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Saga, SagaMember
from services.access import get_saga, guest_viewer, require_admin
from services.errors import NotFound


def _new_token() -> str:
    return secrets.token_urlsafe(16)  # 22 characters, ~128 bits


def set_live_link(db: Session, member: SagaMember, on: bool) -> str | None:
    """Turn it on (a new token the first time) or off. Returns the token (None: off)."""
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    if on and not saga.live_token:
        saga.live_token = _new_token()
    elif not on:
        saga.live_token = None
    db.commit()
    return saga.live_token


def replace_live_link(db: Session, member: SagaMember) -> str:
    """A new address: screens on the old one stop."""
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    saga.live_token = _new_token()
    db.commit()
    return saga.live_token


def saga_for_token(db: Session, token: str) -> Saga:
    saga = db.scalar(select(Saga).where(Saga.live_token == token)) if token else None
    if saga is None or saga.is_archived:
        raise NotFound("This live link doesn't work (any more)")
    return saga


def guest_view(db: Session, saga: Saga) -> dict | None:
    """The live Stage as the live link's guest (a viewer) sees it."""
    from services.stages import render_stage
    from models import Stage

    stage = db.get(Stage, saga.live_stage_id) if saga.live_stage_id else None
    if stage is None or stage.saga_id != saga.id:
        return None
    return render_stage(db, stage, guest_viewer(db, saga.id), saga.live_stage_id)


def live_screen(db: Session, token: str) -> dict:
    """What the live screen needs: the Saga's name and calendar, and the live Stage."""
    from services.calendars import calendar_of, story_date

    saga = saga_for_token(db, token)
    return {"saga": {"id": saga.id, "name": saga.name, "calendar": calendar_of(db, saga), "story_date": story_date(saga)},
            "stage": guest_view(db, saga)}
