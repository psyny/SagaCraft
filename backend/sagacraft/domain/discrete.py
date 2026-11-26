"""Discrete threshold (plan 57): a counter shown as a few icons (1 to 10), never its value.

The counter's range (min to max) is cut by breakpoints: the min, `icons - 1` points between, the max. An icon shows
for each breakpoint under the value, the min's included: any value above the min shows at least one icon, none at
the min or below. Where the points between sit is the element's logic:
- precise: evenly (range 100, 4 icons: 25, 50, 75; at 76, 4 icons; at 75, 3; at 0, none),
- full_variant: each moved by a random whole amount up to K = int(0.4 * range / icons) either way (0.4 keeps them in
  order and off the ends),
- soft_variant: the same, but the breakpoint at half the range stays put (4 icons: 0, 25, 50, 75, 100, and 50
  never moves). With an odd number of icons no breakpoint falls at half (3: 0, 33, 67, 100): it's full_variant.
The moves are seeded per creature and value with a server secret: the same on every screen and for every viewer,
different between creatures, and players can't work them out. See docs/concepts/stages.md.
"""
import hashlib
import hmac
import math
import random

LOGICS = ("precise", "full_variant", "soft_variant")
DEFAULT_LOGIC = "full_variant"
MIN_ICONS, MAX_ICONS, DEFAULT_ICONS = 1, 10, 4
REACH = 0.4  # how far a point may move, in shares of the range per icon


def _rng(secret: str, seed_key: str) -> random.Random:
    digest = hmac.new(secret.encode(), f"discrete:{seed_key}".encode(), hashlib.sha256).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def breakpoints(minimum: float, maximum: float, icons: int, logic: str, secret: str, seed_key: str) -> list[float]:
    """The points between the min and the max, in order (icons - 1 of them)."""
    icons = max(MIN_ICONS, min(MAX_ICONS, int(icons)))
    span = maximum - minimum
    points = [minimum + span * i / icons for i in range(1, icons)]
    reach = int(REACH * span / icons) if span > 0 else 0
    if logic not in ("full_variant", "soft_variant") or reach <= 0:
        return points
    rng = _rng(secret, seed_key)
    middle = icons // 2 if logic == "soft_variant" and icons % 2 == 0 else None
    moved = []
    for i, point in enumerate(points, start=1):
        shift = rng.randint(-reach, reach)  # drawn for every point: a point's move doesn't depend on the logic
        moved.append(point if i == middle else point + shift)
    return moved


def level(current: float, minimum: float, maximum: float, points: list[float]) -> int:
    """How many icons show: one per breakpoint under the value (the min's included)."""
    if current <= minimum:
        return 0
    if maximum <= minimum:
        return len(points) + 1
    return 1 + sum(1 for point in points if current > point)


def level_for(current: float, minimum: float, maximum: float, icons: int, logic: str, secret: str, seed_key: str) -> int:
    return level(current, minimum, maximum, breakpoints(minimum, maximum, icons, logic, secret, seed_key))


def percent(current: float, minimum: float, maximum: float) -> int:
    """From the min (0) to the max (100), whole; never 0 above the min nor 100 below the max."""
    span = maximum - minimum
    if span <= 0:
        return 100 if current >= maximum else 0
    value = max(0, min(100, math.floor((current - minimum) * 100 / span + 0.5)))
    if value == 0 and current > minimum:
        return 1
    if value == 100 and current < maximum:
        return 99
    return value
