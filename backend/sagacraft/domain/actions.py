"""Actions: the Saga template's rules that spend some values and give others, on characters, items or groups (a short
rest spends a hit die and gives back HP; a party's long rest runs every member's). Pure rules: parsing and checking
the template's actions, and running one on a world the service provides (services/actions.py).
See docs/implementation/30-actions-and-calculated-variables.md.

An action (template `actions`):
    {"key", "name", "description", "on": character|item|group, "types": [type keys] (empty: all), "who": owner|group|players|admins,
     "notify": user|dm|all (plan 34: who is told it ran; the DM always is; "dm": a player who runs it isn't told the result),
     "costs": [{"source", "variable", "amount", "consume", "required"}],
     "gains": [{"target", "variable", "amount"}],
An amount is fixed (a number), "max" (a gain on a counter: fill it) or {"formula": "level d20 + int"} (plan 33: the
variables of the thing the line is on, dice rolled when the action runs; never below 0).
     "triggers": [{"target", "action", "skip_costs", "skip_gains", "skip_triggers"}]}
"""
from __future__ import annotations

import copy
import random
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Protocol

from domain import calculated

ON = ("character", "item", "group")
WHO = ("owner", "group", "players", "admins")
NOTIFY = ("user", "dm", "all")  # who is told an action ran: who ran it (and the DM), only the DM, everyone
# Where values come from or go, by what the action is on
PLACES = {
    "character": ("self", "group"),
    "item": ("self", "character", "group"),
    "group": ("self", "group_characters"),
}
# The kind of thing a place is, from what the action is on
PLACE_KIND = {"self": None, "character": "character", "group": "group", "group_characters": "character"}
MAX_ACTIONS, MAX_LINES, MAX_DEPTH = 80, 12, 8
VALUE_TYPES = ("number", "counter")


class ActionError(ValueError):
    pass


def place_kind(on: str, place: str) -> str:
    return on if place == "self" else PLACE_KIND[place]


def _slug(name: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:40] or "action"
    key, n = base, 2
    while key in taken:
        key, n = f"{base}_{n}", n + 1
    return key


def _amount(value: Any, label: str, allow_max: bool, variables: dict[str, str] | None = None) -> float | str | dict:
    """A line's amount: a number, "max", or a formula (its variables: numbers and counters of `variables`)."""
    if allow_max and value == "max":
        return "max"
    if isinstance(value, dict) and "formula" in value:
        formula = str(value.get("formula") or "").strip()
        try:
            names = calculated.names_in(formula, dice=True)
        except calculated.CalcError as exc:
            raise ActionError(f"{label}: {exc}") from None
        for name in names:
            if (variables or {}).get(name) not in VALUE_TYPES:
                raise ActionError(f"{label}: '{name}' isn't a number or counter here")
        return {"formula": formula}
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0 or value > 100000:
        raise ActionError(f"{label}: a number from 0{' (or max)' if allow_max else ''}, or a formula")
    return value


def clean_actions(raw: Any, variables: Callable[[str], dict[str, str]], types: Callable[[str], set[str]]) -> list[dict]:
    """The template's actions, checked: what they're on, who runs them, their variables (numbers and counters of the
    right kind: `variables(kind)` gives {key: type}), the actions they trigger (on the right kind)."""
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > MAX_ACTIONS:
        raise ActionError(f"actions: a list of at most {MAX_ACTIONS}")
    out: list[dict] = []
    keys: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            raise ActionError("An action is an object")
        name = str(item.get("name") or "").strip()[:60]
        if not name:
            raise ActionError("An action needs a name")
        key = str(item.get("key") or _slug(name, keys))[:60]
        if key in keys:
            raise ActionError(f"Two actions are '{key}'")
        keys.add(key)
        on = item.get("on")
        if on not in ON:
            raise ActionError(f"{name}: on one of {list(ON)}")
        who = item.get("who", "owner")
        if who not in WHO:
            raise ActionError(f"{name}: who is one of {list(WHO)}")
        notify = item.get("notify", "user")
        if notify not in NOTIFY:
            raise ActionError(f"{name}: notify is one of {list(NOTIFY)}")
        only = [str(t) for t in item.get("types") or []]
        if on == "group" and only:
            raise ActionError(f"{name}: groups have no types")
        if not set(only) <= types(on):
            raise ActionError(f"{name}: unknown type in {only}")

        def line(raw_line: Any, kind: str) -> dict:
            if not isinstance(raw_line, dict):
                raise ActionError(f"{name}: each {kind} is an object")
            place = raw_line.get("source" if kind == "cost" else "target", "self")
            if place not in PLACES[on]:
                raise ActionError(f"{name}: a {kind} is on one of {list(PLACES[on])}")
            out_line: dict[str, Any] = {("source" if kind == "cost" else "target"): place}
            if kind != "trigger":
                variable = str(raw_line.get("variable") or "")
                there = variables(place_kind(on, place))
                found = there.get(variable)
                if found not in VALUE_TYPES:
                    raise ActionError(f"{name}: '{variable}' isn't a number or counter of {place_kind(on, place)}s")
                out_line["variable"] = variable
                out_line["amount"] = _amount(raw_line.get("amount", 1), f"{name}: amount", kind == "gain" and found == "counter", there)
                if kind == "cost":
                    out_line["consume"] = bool(raw_line.get("consume", True))
                    out_line["required"] = bool(raw_line.get("required", True))
            else:
                out_line["action"] = str(raw_line.get("action") or "")
                for flag in ("skip_costs", "skip_gains", "skip_triggers"):
                    out_line[flag] = bool(raw_line.get(flag, False))
            return out_line

        lines = {}
        for part, kind in (("costs", "cost"), ("gains", "gain"), ("triggers", "trigger")):
            values = item.get(part) or []
            if not isinstance(values, list) or len(values) > MAX_LINES:
                raise ActionError(f"{name}: {part}: a list of at most {MAX_LINES}")
            lines[part] = [line(v, kind) for v in values]
        out.append({"key": key, "name": name, "description": str(item.get("description") or "").strip()[:500], "on": on,
                    "types": only, "who": who, "notify": notify, **lines})
    # Triggers: an action on the target's kind
    by_key = {a["key"]: a for a in out}
    for action in out:
        for trigger in action["triggers"]:
            target = by_key.get(trigger["action"])
            if target is None:
                raise ActionError(f"{action['name']}: it triggers an unknown action '{trigger['action']}'")
            if target["on"] != place_kind(action["on"], trigger["target"]):
                raise ActionError(f"{action['name']}: '{target['name']}' isn't on {place_kind(action['on'], trigger['target'])}s")
    return out


def new_action(actions: list[dict], name: str, on: str) -> dict:
    return {"key": _slug(name or "Action", {a["key"] for a in actions}), "name": (name or "Action").strip()[:60] or "Action",
            "description": "", "on": on, "types": [], "who": "owner", "notify": "user", "costs": [], "gains": [],
            "triggers": []}


# -- running ------------------------------------------------------------------


@dataclass
class Thing:
    """A character, item or group being changed: its values (a working copy) and, per variable, its type."""
    kind: str
    id: int
    name: str
    type: str | None
    values: dict
    types: dict[str, str]
    before: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.before = copy.deepcopy(self.values)

    @property
    def ref(self) -> tuple[str, int]:
        return (self.kind, self.id)

    def get(self, key: str) -> float | None:
        kind = self.types.get(key)
        value = self.values.get(key)
        if kind == "counter":
            return float((value or {}).get("current", 0)) if isinstance(value, dict) or value is None else None
        if kind == "number":
            return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else 0.0
        return None

    def cap(self, key: str) -> float | None:
        value = self.values.get(key)
        return float((value or {}).get("max", 0)) if self.types.get(key) == "counter" and isinstance(value, dict) else None

    def set(self, key: str, number: float) -> None:
        number = int(number) if float(number).is_integer() else round(number, 4)
        if self.types.get(key) == "counter":
            value = dict(self.values.get(key) or {"current": 0, "max": 0})
            value["current"] = number
            self.values[key] = value
        else:
            self.values[key] = number


class World(Protocol):
    def related(self, thing: Thing, place: str) -> Iterable[Thing]: ...


@dataclass
class Change:
    thing: Thing
    key: str
    before: float
    after: float


_rng = random.SystemRandom()


def amount_of(amount: float | str | dict, thing: Thing, log: list | None = None, rng: random.Random | None = None) -> float:
    """A line's amount on a thing: its number, or its formula worked out from the thing's values (dice rolled, each
    roll noted in `log`); never below 0. ("max" is the caller's.)"""
    if not isinstance(amount, dict):
        return float(amount)
    rolls: list[dict] = []

    def roll(count: int, sides: int) -> int:
        results = [(rng or _rng).randint(1, sides) for _ in range(count)]
        rolls.append({"count": count, "sides": sides, "results": results})
        return sum(results)

    value = calculated.evaluate(amount["formula"], thing.values, roll)
    value = max(0.0, float(value or 0))
    if log is not None:
        log.append({"ref": thing.ref, "thing": thing.name, "formula": amount["formula"], "rolls": rolls, "value": calculated.tidy(value)})
    return value


def run(actions: dict[str, dict], key: str, thing: Thing, world: World, *, skip_costs: bool = False, skip_gains: bool = False,
        skip_triggers: bool = False, depth: int = 0, chain: frozenset = frozenset(), log: list | None = None,
        rng: random.Random | None = None) -> None:
    """Run an action on a thing, its triggers too (all on working copies: the caller saves them, or nothing on an
    error). A loop (the same action on the same thing again) stops; at most MAX_DEPTH deep. Formulas' rolls go to
    `log`."""
    action = actions.get(key)
    if action is None:
        raise ActionError(f"Unknown action '{key}'")
    if depth > MAX_DEPTH or (key, thing.ref) in chain:
        return
    chain = chain | {(key, thing.ref)}
    if not skip_costs:
        for cost in action["costs"]:
            for other in world.related(thing, cost["source"]):
                have = other.get(cost["variable"])
                amount = amount_of(cost["amount"], other, log, rng)
                if have is None:
                    if cost["required"]:
                        raise ActionError(f"{other.name} has no {cost['variable']}")
                    continue
                if cost["required"] and have < amount:
                    raise ActionError(f"{action['name']}: {other.name} hasn't enough {cost['variable']} ({_n(have)} of {_n(amount)})")
                if cost["consume"]:
                    other.set(cost["variable"], max(0.0, have - amount))
    if not skip_gains:
        for gain in action["gains"]:
            for other in world.related(thing, gain["target"]):
                have = other.get(gain["variable"])
                if have is None:
                    continue
                top = other.cap(gain["variable"])
                after = top if gain["amount"] == "max" else have + amount_of(gain["amount"], other, log, rng)
                if top is not None:
                    after = min(top, after)
                other.set(gain["variable"], max(have, after) if gain["amount"] == "max" else after)
    if not skip_triggers:
        for trigger in action["triggers"]:
            for other in world.related(thing, trigger["target"]):
                run(actions, trigger["action"], other, world, skip_costs=trigger["skip_costs"], skip_gains=trigger["skip_gains"],
                    skip_triggers=trigger["skip_triggers"], depth=depth + 1, chain=chain, log=log, rng=rng)


def changes(things: Iterable[Thing]) -> list[Change]:
    out = []
    for thing in things:
        for key in thing.types:
            if thing.types[key] not in VALUE_TYPES:
                continue
            before = Thing.get(Thing(thing.kind, thing.id, thing.name, thing.type, thing.before, thing.types), key)
            after = thing.get(key)
            if before is not None and after is not None and before != after:
                out.append(Change(thing, key, before, after))
    return out


def _n(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(round(value, 2))


def applies(action: dict, kind: str, type_key: str | None) -> bool:
    return action["on"] == kind and (not action["types"] or type_key in action["types"])
