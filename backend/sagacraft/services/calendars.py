"""The Saga's in-world calendar and "today in the story" (the default date of new events). Set on the Saga
page (Calendar). See domain/calendar.py and docs/concepts/events.md."""
from typing import Any

from sqlalchemy.orm import Session

from domain import calendar as cal
from models import Saga, SagaMember
from services.access import get_saga, require_admin
from services.errors import BadRequest

DEFAULT_STORY_DATE = cal.join(1, 1, 1)


def calendar_of(db: Session, saga: Saga) -> dict:
    """The Saga's calendar: its own, else its Saga template's starting one, else Twelve Moons."""
    if saga.calendar:
        return saga.calendar
    from services.resources import ruleset_for

    return ruleset_for(db, saga.id).saga_template.get("calendar") or cal.preset(cal.DEFAULT_PRESET)


def story_date(saga: Saga) -> int:
    return saga.story_date if saga.story_date is not None else DEFAULT_STORY_DATE


def check_date(db: Session, saga_id: int, value: Any, label: str = "Date") -> int | None:
    """A date valid in the Saga's calendar (None: no date / always)."""
    if value is None:
        return None
    try:
        return cal.check(calendar_of(db, get_saga(db, saga_id)), value, label)
    except cal.CalendarError as exc:
        raise BadRequest(str(exc)) from None


def view(db: Session, saga: Saga) -> dict:
    return {"calendar": calendar_of(db, saga), "story_date": story_date(saga),
            "presets": [{"key": k, "name": p["name"], "real": p["real"]} for k, p in cal.PRESETS.items()]}


def set_calendar(db: Session, member: SagaMember, raw: Any) -> dict:
    """Changing the calendar keeps every date's year, month and day (dates past a shorter month stay readable)."""
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    try:
        saga.calendar = cal.normalize(raw)
    except cal.CalendarError as exc:
        raise BadRequest(str(exc)) from None
    db.commit()
    return view(db, saga)


def set_story_date(db: Session, member: SagaMember, value: Any) -> dict:
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    saga.story_date = check_date(db, saga.id, value, "Today in the story")
    db.commit()
    return view(db, saga)
