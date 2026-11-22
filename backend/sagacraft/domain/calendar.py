"""In-world calendars and dates. Pure rules.

A Saga's calendar: the real (Gregorian) one, a predefined fantasy one, or the DM's own (months with their
lengths, a year label). A date is stored as one integer, `year * 10000 + month * 100 + day` (months and days
count from 1): it sorts in date order whatever the calendar, works for negative years, and keeps its meaning
when the DM renames months. See docs/concepts/events.md.
"""
import copy
import re
from typing import Any

MAX_MONTHS, MAX_DAYS, NAME_LENGTH = 24, 99, 40
MIN_YEAR, MAX_YEAR = -99999, 99999


class CalendarError(ValueError):
    pass


_GREGORIAN_MONTHS = [("January", 31), ("February", 28), ("March", 31), ("April", 30), ("May", 31), ("June", 30),
                     ("July", 31), ("August", 31), ("September", 30), ("October", 31), ("November", 30),
                     ("December", 31)]
# Our own (no calendar copied from a published setting)
_TWELVE_MOONS = ["Frostmoon", "Thawmoon", "Seedmoon", "Bloommoon", "Brightmoon", "Highsun", "Goldmoon", "Harvestmoon",
                 "Emberfall", "Leaffall", "Mistmoon", "Longnight"]

PRESETS: dict[str, dict] = {
    "gregorian": {"preset": "gregorian", "name": "Gregorian", "real": True, "year_label": "",
                  "months": [{"name": n, "days": d} for n, d in _GREGORIAN_MONTHS]},
    "twelve_moons": {"preset": "twelve_moons", "name": "Twelve Moons", "real": False, "year_label": "",
                     "months": [{"name": n, "days": 30} for n in _TWELVE_MOONS]},
}
DEFAULT_PRESET = "twelve_moons"


def preset(key: str) -> dict:
    if key not in PRESETS:
        raise CalendarError(f"Unknown calendar '{key}'")
    return copy.deepcopy(PRESETS[key])


def normalize(raw: Any) -> dict:
    """A calendar from the DM (or a file): a preset's key, or {name, months: [{name, days}], year_label}."""
    if isinstance(raw, str):
        return preset(raw)
    if not isinstance(raw, dict):
        raise CalendarError("A calendar is a preset or months with their days")
    if raw.get("preset") in PRESETS and not raw.get("months"):
        return preset(raw["preset"])
    real = raw.get("preset") == "gregorian" or bool(raw.get("real"))
    if real:
        return {**preset("gregorian"), "year_label": _text(raw.get("year_label"), 12)}
    months = raw.get("months")
    if not isinstance(months, list) or not 1 <= len(months) <= MAX_MONTHS:
        raise CalendarError(f"A calendar has 1 to {MAX_MONTHS} months")
    cleaned = []
    for i, m in enumerate(months):
        m = m if isinstance(m, dict) else {}
        days = m.get("days")
        if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= MAX_DAYS:
            raise CalendarError(f"Month {i + 1}: 1 to {MAX_DAYS} days")
        cleaned.append({"name": _text(m.get("name"), NAME_LENGTH) or f"Month {i + 1}", "days": days})
    return {"preset": None, "name": _text(raw.get("name"), NAME_LENGTH) or "Our calendar", "real": False,
            "year_label": _text(raw.get("year_label"), 12), "months": cleaned}


def _text(value: Any, limit: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def is_leap(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def days_in(calendar: dict, year: int, month: int) -> int:
    days = calendar["months"][month - 1]["days"]
    if calendar.get("real") and month == 2 and is_leap(year):
        return 29
    return days


def split(key: int) -> tuple[int, int, int]:
    year, rest = divmod(int(key), 10000)
    month, day = divmod(rest, 100)
    return year, month, day


def join(year: int, month: int, day: int) -> int:
    return year * 10000 + month * 100 + day


def check_shape(value: Any, label: str = "Date") -> int:
    """Any calendar: an integer whose month and day are 1..99. (The Saga's calendar is checked by `check`.)"""
    if isinstance(value, bool) or not isinstance(value, int):
        raise CalendarError(f"{label} must be a date")
    year, month, day = split(value)
    if not (MIN_YEAR <= year <= MAX_YEAR and 1 <= month <= MAX_MONTHS and 1 <= day <= MAX_DAYS):
        raise CalendarError(f"{label} is not a date")
    return value


def check(calendar: dict, value: Any, label: str = "Date") -> int:
    """A date valid in this calendar."""
    value = check_shape(value, label)
    year, month, day = split(value)
    if month > len(calendar["months"]):
        raise CalendarError(f"{label}: this calendar has {len(calendar['months'])} months")
    if day > days_in(calendar, year, month):
        raise CalendarError(f"{label}: {calendar['months'][month - 1]['name']} has {days_in(calendar, year, month)} days")
    return value


def fmt(calendar: dict, key: int | None) -> str:
    """"3 Frostmoon 300": for names the server writes (an event made from a relationship)."""
    if key is None:
        return "always"
    year, month, day = split(key)
    months = calendar["months"]
    name = months[month - 1]["name"] if 1 <= month <= len(months) else f"Month {month}"
    label = f" {calendar['year_label']}" if calendar.get("year_label") else ""
    return f"{day} {name} {year}{label}"
