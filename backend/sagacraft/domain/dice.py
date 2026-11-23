"""Dice rules (pure): roll types and how their dice are read. See docs/concepts/stages.md ("Dice roller").

A roll type: {id, name, dice: [{count, sides}], read, x, modifier}
- read: sum (all dice), highest, lowest, sum_above (dice above x), sum_below (dice below x)
- modifier: added to the result (e.g. +5)
A d100 is one die (1..100); it's drawn as two d10s (tens and units).
"""
import random
import re
from typing import Any

SIDES = (2, 4, 6, 8, 10, 12, 20, 100)  # a d2 is a coin
READS = ("sum", "highest", "lowest", "sum_above", "sum_below")
MAX_TYPES, MAX_DICE_PER_TYPE, MAX_NAME = 24, 12, 40
_ID = re.compile(r"^[a-z0-9_-]{1,24}$")


class DiceError(ValueError):
    pass


def _int(value: Any, label: str, low: int, high: int) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or int(value) != value:
        raise DiceError(f"{label} must be a whole number")
    value = int(value)
    if not low <= value <= high:
        raise DiceError(f"{label}: {low} to {high}")
    return value


def clean_roll_type(raw: Any, index: int = 0) -> dict:
    if not isinstance(raw, dict):
        raise DiceError("A roll type is an object")
    name = " ".join(str(raw.get("name") or "").split())[:MAX_NAME]
    if not name:
        raise DiceError("Give the roll a name")
    dice_raw = raw.get("dice")
    if not isinstance(dice_raw, list) or not dice_raw:
        raise DiceError(f"{name}: give it dice")
    dice = []
    for d in dice_raw:
        if not isinstance(d, dict):
            raise DiceError(f"{name}: each line is {{count, sides}}")
        sides = d.get("sides")
        if sides not in SIDES:
            raise DiceError(f"{name}: dice have {', '.join(f'd{s}' for s in SIDES)}")
        dice.append({"count": _int(d.get("count", 1), f"{name}: count", 1, MAX_DICE_PER_TYPE), "sides": sides})
    if sum(d["count"] for d in dice) > MAX_DICE_PER_TYPE:
        raise DiceError(f"{name}: at most {MAX_DICE_PER_TYPE} dice")
    read = raw.get("read", "sum")
    if read not in READS:
        raise DiceError(f"{name}: read as one of {list(READS)}")
    rid = str(raw.get("id") or f"r{index + 1}")
    if not _ID.match(rid):
        raise DiceError("A roll type's id: letters, digits, - and _")
    return {"id": rid, "name": name, "dice": dice, "read": read,
            "x": _int(raw.get("x", 0), f"{name}: X", 0, 100) if read in ("sum_above", "sum_below") else 0,
            "modifier": _int(raw.get("modifier", 0), f"{name}: modifier", -100, 100)}


def clean_roll_types(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        raise DiceError("Roll types are a list")
    if len(raw) > MAX_TYPES:
        raise DiceError(f"At most {MAX_TYPES} roll types")
    out = [clean_roll_type(r, i) for i, r in enumerate(raw)]
    ids = [r["id"] for r in out]
    if len(set(ids)) != len(ids):
        raise DiceError("Two roll types have the same id")
    return out


def counted(read: str, x: int, values: list[int]) -> list[bool]:
    """Which dice count for the result (shown standing out)."""
    if not values:
        return []
    if read == "highest":
        best = values.index(max(values))
        return [i == best for i in range(len(values))]
    if read == "lowest":
        best = values.index(min(values))
        return [i == best for i in range(len(values))]
    if read == "sum_above":
        return [v > x for v in values]
    if read == "sum_below":
        return [v < x for v in values]
    return [True] * len(values)


def read_result(roll_type: dict, values: list[int]) -> int:
    marks = counted(roll_type["read"], roll_type.get("x", 0), values)
    return sum(v for v, m in zip(values, marks) if m) + roll_type.get("modifier", 0)


def roll_value(sides: int, rng: random.Random | None = None) -> int:
    return (rng or _rng).randint(1, sides)


_rng = random.SystemRandom()


def label(roll_type: dict) -> str:
    """"2d6+3", "2d20 (highest)": what the roll is, in short."""
    dice = " + ".join(f"{d['count']}d{d['sides']}" for d in roll_type["dice"])
    read = {"sum": "", "highest": " (highest)", "lowest": " (lowest)",
            "sum_above": f" (above {roll_type.get('x', 0)})", "sum_below": f" (below {roll_type.get('x', 0)})"}[roll_type["read"]]
    mod = roll_type.get("modifier", 0)
    return f"{dice}{read}{f' {mod:+d}' if mod else ''}"


def default_roll_types() -> list[dict]:
    """When a Saga template names none: the usual polyhedral set."""
    return clean_roll_types([{"id": f"d{s}", "name": f"d{s}", "dice": [{"count": 1, "sides": s}]} for s in SIDES])
