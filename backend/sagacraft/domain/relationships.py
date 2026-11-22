"""Relationships: pure rules. The app's predefined relationship types, labels, and "active at a date".

Relationship types are user data, not ruleset: these predefined ones help everyone start; each member group
adds its own (services/relationships.py). `kinds` only rank suggestions (who usually links to what), never
block. See docs/concepts/relationships.md.
"""
import re
from typing import Any

LABEL_LENGTH, NOTE_LENGTH = 60, 300
MAX_GROUP_TYPES = 100
MAX_HOPS = 3

# key, label, inverse (read from the other side; "" for undirected), directed, (from kinds, to kinds)
_PREDEFINED = [
    ("killed", "killed", "killed by", True, ("character",), ("character",)),
    ("parent_of", "parent of", "child of", True, ("character",), ("character",)),
    ("sibling", "sibling of", "", False, ("character",), ("character",)),
    ("married", "married to", "", False, ("character",), ("character",)),
    ("ally", "ally of", "", False, ("character",), ("character",)),
    ("enemy", "enemy of", "", False, ("character",), ("character",)),
    ("knows", "knows", "", False, ("character",), ("character",)),
    ("loves", "loves", "loved by", True, ("character",), ("character",)),
    ("hates", "hates", "hated by", True, ("character",), ("character",)),
    ("serves", "serves", "served by", True, ("character",), ("character",)),
    ("member_of", "member of", "has member", True, ("character",), ("character", "location")),
    ("lives_in", "lives in", "home of", True, ("character",), ("location",)),
    ("born_in", "born in", "birthplace of", True, ("character",), ("location",)),
    ("owns", "owns", "owned by", True, ("character",), ("item", "location", "document")),
    ("created", "created", "created by", True, ("character",), ("item", "location", "document")),
    ("located_in", "located in", "contains", True, ("location", "item", "character"), ("location",)),
    ("about", "is about", "written about in", True, ("document",), ("character", "location", "item", "event")),
    ("took_part_in", "took part in", "involved", True, ("character",), ("event",)),
]

PREDEFINED: dict[str, dict] = {
    key: {"key": key, "label": label, "inverse": inverse, "directed": directed,
          "from_kinds": list(fk), "to_kinds": list(tk), "predefined": True}
    for key, label, inverse, directed, fk, tk in _PREDEFINED
}


class RelationshipError(ValueError):
    pass


def clean_label(raw: Any, what: str = "A type") -> str:
    label = re.sub(r"\s+", " ", str(raw or "")).strip()[:LABEL_LENGTH]
    if not label:
        raise RelationshipError(f"{what} needs a label")
    return label


def clean_note(raw: Any) -> str:
    return re.sub(r"[ \t]+", " ", str(raw or "")).strip()[:NOTE_LENGTH]


def check_dates(start: int | None, end: int | None) -> None:
    if start is not None and end is not None and end < start:
        raise RelationshipError("It can't end before it starts")


def active_at(start: int | None, end: int | None, at: int | None) -> bool:
    """Active at that in-world date: start <= at <= end, "always" (None) being open on its side."""
    if at is None:
        return True
    return (start is None or start <= at) and (end is None or at <= end)


def phrase(type_def: dict, forward: bool) -> str:
    """How the link reads from one side: "killed" from A, "killed by" from B (undirected: the same)."""
    if forward or not type_def.get("directed"):
        return type_def["label"]
    return type_def.get("inverse") or f"{type_def['label']} (by)"


def neighbours(edges: list[tuple[Any, Any]], start: set, hops: int) -> set:
    """The nodes reached from `start` in at most `hops` steps along edges (either way)."""
    reached = set(start)
    frontier = set(start)
    for _ in range(max(0, min(hops, MAX_HOPS))):
        nxt = set()
        for a, b in edges:
            if a in frontier and b not in reached:
                nxt.add(b)
            if b in frontier and a not in reached:
                nxt.add(a)
        if not nxt:
            break
        reached |= nxt
        frontier = nxt
    return reached
