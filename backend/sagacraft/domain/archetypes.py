"""Archetypes (plan 33): what a character is besides its type, each adding variables, level by level. A race, a
class, a talent: an archetype in a category the Saga template names ("Race", "Class", "Talent"). A character has any
number of archetypes, each at a level; an archetype's variable comes with a level, and the character has it from that
level on ("Warrior 4" has the Warrior's level 1 to 4 variables). Pure rules: parsing the template's archetypes and
checking a character's (services/resources.py stores them on the character).

In a template:
    "archetype_categories": [{"key", "name"}],
    "archetypes": [{"key", "name", "category", "description", "max_level", "variables": [{...a variable, "level",
                                                                                     "by_level"}]}]
A character: [{"key": archetype, "level": n}].

A variable can **change by level** (`by_level`: [{"level", "value"}], only the levels where it changes, after the one
it comes at): a number, text, yes/no or choice takes the value; a counter's value is its **max** (Superiority dice: 4
at level 3, 5 at 7, 6 at 15). A character gets a variable's value for its level when it gains the archetype, and
again whenever its level crosses a change (a counter keeps what was spent: its current moves with its max); values
changed by hand stay until then (`apply_levels`).
"""
from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from typing import Any

# The variables an archetype adds (no calculated or dates: a character's numbers, words and choices)
TYPES = ("text", "rich_text", "number", "boolean", "choice", "counter")
MAX_CATEGORIES, MAX_ARCHETYPES, MAX_LEVEL, MAX_PER_CHARACTER = 20, 200, 30, 20
_KEY = re.compile(r"^[a-z][a-z0-9_]{0,59}$")


class ArchetypeError(ValueError):
    pass


@dataclass
class ArchetypeDef:
    key: str
    name: str
    category: str
    description: str
    max_level: int
    variables: list = field(default_factory=list)  # AttributeDefs, each with its archetype and level

    def to_dict(self) -> dict:
        return {"key": self.key, "name": self.name, "category": self.category, "description": self.description,
                "max_level": self.max_level, "variables": [v.to_dict() for v in self.variables]}


def parse(ruleset_key: str, data: dict, taken: set[str]) -> tuple[list[dict], dict[str, ArchetypeDef]]:
    """The template's categories and archetypes, checked. `taken`: the character variables' keys (an archetype's
    variable never shares one)."""
    from domain.ruleset import RulesetError, _attribute

    categories: list[dict] = []
    raw_categories = data.get("archetype_categories") or []
    if not isinstance(raw_categories, list) or len(raw_categories) > MAX_CATEGORIES:
        raise RulesetError(f"{ruleset_key}: archetype_categories: a list of at most {MAX_CATEGORIES}")
    for c in raw_categories:
        key, name = str((c or {}).get("key") or ""), str((c or {}).get("name") or "").strip()[:40]
        if not _KEY.match(key) or not name or any(x["key"] == key for x in categories):
            raise RulesetError(f"{ruleset_key}: an archetype category needs a key (once) and a name")
        categories.append({"key": key, "name": name})
    archetypes: dict[str, ArchetypeDef] = {}
    raw_archetypes = data.get("archetypes") or []
    if not isinstance(raw_archetypes, list) or len(raw_archetypes) > MAX_ARCHETYPES:
        raise RulesetError(f"{ruleset_key}: archetypes: a list of at most {MAX_ARCHETYPES}")
    keys = set(taken)
    for raw in raw_archetypes:
        key, name = str((raw or {}).get("key") or ""), str((raw or {}).get("name") or "").strip()[:60]
        if not _KEY.match(key) or not name or key in archetypes:
            raise RulesetError(f"{ruleset_key}: an archetype needs a key (once) and a name")
        category = raw.get("category")
        if not any(c["key"] == category for c in categories):
            raise RulesetError(f"{ruleset_key}: archetype {name!r} is in an unknown category {category!r}")
        max_level = raw.get("max_level", 1)
        if isinstance(max_level, bool) or not isinstance(max_level, int) or not 1 <= max_level <= MAX_LEVEL:
            raise RulesetError(f"{ruleset_key}: archetype {name!r}: its levels go from 1 to 1..{MAX_LEVEL}")
        variables = []
        for v in raw.get("variables") or []:
            if (v or {}).get("type") not in TYPES:
                raise RulesetError(f"{ruleset_key}: archetype {name!r}: a variable is one of {list(TYPES)}")
            attr = _attribute(ruleset_key, v)
            level = v.get("level", 1)
            if isinstance(level, bool) or not isinstance(level, int) or not 1 <= level <= max_level:
                raise RulesetError(f"{ruleset_key}: archetype {name!r}: {attr.name} comes at a level from 1 to {max_level}")
            if attr.key in keys:
                raise RulesetError(f"{ruleset_key}: archetype {name!r}: a variable {attr.key!r} already exists")
            keys.add(attr.key)
            attr.archetype, attr.level = key, level
            try:
                attr.by_level = _by_level(attr, v.get("by_level"), max_level)
            except ArchetypeError as exc:
                raise RulesetError(f"{ruleset_key}: archetype {name!r}: {exc}") from None
            variables.append(attr)
        archetypes[key] = ArchetypeDef(key, name, category, str(raw.get("description") or "").strip()[:500], max_level, variables)
    return categories, archetypes


def clean(archetypes: dict[str, ArchetypeDef], raw: Any) -> list[dict]:
    """A character's archetypes, checked: each known, once, at a level it has; in the order given."""
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > MAX_PER_CHARACTER:
        raise ArchetypeError(f"Archetypes: a list of at most {MAX_PER_CHARACTER}")
    out: list[dict] = []
    for item in raw:
        key = (item or {}).get("key") if isinstance(item, dict) else None
        found = archetypes.get(key) if isinstance(key, str) else None
        if found is None:
            raise ArchetypeError(f"Unknown archetype {key!r}")
        if any(x["key"] == key for x in out):
            raise ArchetypeError(f"{found.name} is there twice")
        level = item.get("level", 1)
        if isinstance(level, bool) or not isinstance(level, int) or not 1 <= level <= found.max_level:
            raise ArchetypeError(f"{found.name}: a level from 1 to {found.max_level}")
        out.append({"key": key, "level": level})
    return out


def variables_for(archetypes: dict[str, ArchetypeDef], picked: list[dict] | None) -> list:
    """The variables a character's archetypes give it: each archetype's, up to its level (unknown ones skipped)."""
    out = []
    for item in picked or []:
        found = archetypes.get((item or {}).get("key"))
        if found is None:
            continue
        level = item.get("level", 1)
        out.extend(v for v in found.variables if v.level <= level)
    return out


# -- changing by level -------------------------------------------------------


def check_value(attr: Any, value: Any) -> Any:
    """A level's value for a variable: a number (a counter: its max), words, yes/no, one of a choice's options."""
    if attr.type in ("number", "counter"):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or (attr.type == "counter" and value < 0):
            raise ArchetypeError(f"{attr.name}: a {'max from 0' if attr.type == 'counter' else 'number'} at each level")
        return value
    if attr.type in ("text", "rich_text"):
        return str(value or "")[:200 if attr.type == "text" else 2000]
    if attr.type == "boolean":
        return bool(value)
    if attr.type == "choice":
        if value not in attr.options:
            raise ArchetypeError(f"{attr.name}: one of its options at each level")
        return value
    raise ArchetypeError(f"{attr.name} can't change by level")


def _by_level(attr: Any, raw: Any, max_level: int) -> list[dict]:
    """A variable's changes by level, checked: after the level it comes at, up to the archetype's, each level once."""
    if not raw:
        return []
    if not isinstance(raw, list):
        raise ArchetypeError(f"{attr.name}: its changes by level are a list")
    out: list[dict] = []
    for item in raw:
        level = (item or {}).get("level") if isinstance(item, dict) else None
        if isinstance(level, bool) or not isinstance(level, int) or not attr.level < level <= max_level:
            raise ArchetypeError(f"{attr.name}: it changes at a level after {attr.level} (it comes then) and up to {max_level}")
        if any(x["level"] == level for x in out):
            raise ArchetypeError(f"{attr.name}: level {level} is there twice")
        out.append({"level": level, "value": check_value(attr, item.get("value"))})
    return sorted(out, key=lambda x: x["level"])


def _max_of(value: Any) -> float:
    top = value.get("max", 0) if isinstance(value, dict) else 0
    return top if isinstance(top, (int, float)) and not isinstance(top, bool) else 0


def value_at(attr: Any, level: int) -> Any:
    """What a variable is at a level of its archetype (None before it comes): its starting value, then each change up
    to the level. A counter's is its max."""
    if level < (attr.level or 1):
        return None
    value = _max_of(attr.default) if attr.type == "counter" else attr.default
    for change in attr.by_level or []:
        if change["level"] <= level:
            value = change["value"]
    return value


def granted(attr: Any, level: int) -> Any:
    """A variable's value when a character gains it at a level: its starting value, with the level's changes."""
    if attr.type != "counter":
        return copy.deepcopy(value_at(attr, level))
    start = attr.default if isinstance(attr.default, dict) else {"current": 0, "max": 0}
    top = value_at(attr, level) or 0
    current = start.get("current", 0) + (top - start.get("max", 0))
    return {"current": max(0, min(top, current)), "max": top}


def apply_levels(archetypes: dict[str, ArchetypeDef], before: list[dict] | None, after: list[dict] | None,
                 values: dict) -> dict:
    """A character's values after its archetypes changed: a variable it gains gets its level's value (unless it kept
    one, from a time it had the archetype); one it had, whose value differs between the old level and the new, gets
    the new level's (a counter: its new max, its current moved as much, within 0 and the max)."""
    out = dict(values)
    old = {(p or {}).get("key"): (p or {}).get("level", 1) for p in before or []}
    for picked in after or []:
        found = archetypes.get(picked.get("key"))
        if found is None:
            continue
        level, was = picked.get("level", 1), old.get(picked.get("key"), 0)
        for attr in found.variables:
            if attr.level > level:
                continue
            if attr.level > was:  # gained now
                if out.get(attr.key) is None:
                    out[attr.key] = granted(attr, level)
                continue
            then, now = value_at(attr, was), value_at(attr, level)
            if then == now:
                continue
            if attr.type == "counter":
                stored = out.get(attr.key) if isinstance(out.get(attr.key), dict) else granted(attr, was)
                current = stored.get("current", 0) + (now - then)
                out[attr.key] = {"current": max(0, min(now, current)), "max": now}
            else:
                out[attr.key] = copy.deepcopy(now)
    return out
