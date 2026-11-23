"""Calculated variables (type `calculated`): values worked out, never typed. Pure rules: checking a calculation
(`calc`) and working it out from what the service gathers (services/calculated.py).

    {"op": sum|count|min|max|avg, "of": inventory|groups (characters), owner (items), characters (groups),
     "variable": key, "times": key (optional: each one's variable is multiplied by this one, e.g. quantity)}
    {"op": "formula", "formula": "strength * 15 + 10"}   # the thing's own numbers and counters (a counter: its current)

See docs/implementation/30-actions-and-calculated-variables.md.
"""
from __future__ import annotations

import ast
import math
import operator
import re
from typing import Any, Callable

OPS = ("sum", "count", "min", "max", "avg", "formula")
OF = {"character": ("inventory", "groups"), "item": ("owner",), "group": ("characters",)}
OF_KIND = {"inventory": "item", "groups": "group", "owner": "character", "characters": "character"}
FUNCTIONS = {"min": min, "max": max, "floor": math.floor, "ceil": math.ceil, "round": round, "abs": abs}
_BINARY = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}
MAX_FORMULA = 200
# Dice in action formulas (plan 33): "2d6", "level d20" (a variable's worth of d20s), "d20"; rolled when the action runs.
# Calculated variables have no dice (a value worked out must stay the same).
MAX_DICE, MAX_SIDES = 100, 1000
_DICE_N = re.compile(r"\b(\d+)\s*[dD]\s*(\d+)\b")
_DICE_VAR = re.compile(r"\b([A-Za-z_]\w*)\s+[dD](\d+)\b")
_DICE_ONE = re.compile(r"(?<![\w.])[dD](\d+)\b")


def with_dice(formula: str) -> str:
    """A formula's dice written as roll(count, sides) calls: "level d20 + int" -> "roll(level, 20) + int"."""
    out = _DICE_N.sub(r"roll(\1, \2)", formula)
    out = _DICE_VAR.sub(r"roll(\1, \2)", out)
    return _DICE_ONE.sub(r"roll(1, \1)", out)


class CalcError(ValueError):
    pass


def names_in(formula: str, dice: bool = False) -> set[str]:
    """The variables a formula reads (it must parse: see check)."""
    tree = _parse(formula, dice)
    return {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and n.id not in FUNCTIONS and n.id != "roll"}


def _parse(formula: str, dice: bool = False) -> ast.Expression:
    if not isinstance(formula, str) or not formula.strip() or len(formula) > MAX_FORMULA:
        raise CalcError(f"A formula is some text (at most {MAX_FORMULA} characters)")
    text = with_dice(formula) if dice else formula
    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError:
        raise CalcError(f"'{formula}' isn't a formula") from None
    names = {*FUNCTIONS, *(("roll",) if dice else ())}
    for node in ast.walk(tree):
        allowed = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.USub, ast.UAdd, ast.Constant, ast.Name, ast.Load, ast.Call,
                   *_BINARY)
        if not isinstance(node, allowed):
            raise CalcError(f"'{formula}': only numbers, variables, + - * /, brackets{', dice (2d6, level d20)' if dice else ''}"
                            f" and {', '.join(FUNCTIONS)}")
        if isinstance(node, ast.Constant) and (isinstance(node.value, bool) or not isinstance(node.value, (int, float))):
            raise CalcError(f"'{formula}': only numbers")
        if isinstance(node, ast.Call) and (not isinstance(node.func, ast.Name) or node.func.id not in names or node.keywords):
            raise CalcError(f"'{formula}': the functions are {', '.join(FUNCTIONS)}")
        if isinstance(node, ast.Call) and node.func.id == "roll" and len(node.args) != 2:  # type: ignore[union-attr]
            raise CalcError(f"'{formula}': dice are written like 2d6 or level d20")
    return tree


def check(calc: Any, kind: str, variables: dict[str, dict[str, str]]) -> dict:
    """A calculation, checked for a variable of `kind`: `variables[kind]` gives {key: type} per kind."""
    if not isinstance(calc, dict):
        raise CalcError("A calculated variable needs its calculation")
    op = calc.get("op", "sum")
    if op not in OPS:
        raise CalcError(f"op: one of {list(OPS)}")
    if op == "formula":
        formula = str(calc.get("formula") or "")
        own = variables.get(kind, {})
        for name in names_in(formula):
            if own.get(name) not in ("number", "counter"):
                raise CalcError(f"'{name}' isn't a number or counter of {kind}s")
        return {"op": "formula", "formula": formula.strip()}
    of = calc.get("of", OF[kind][0])
    if of not in OF[kind]:
        raise CalcError(f"of: one of {list(OF[kind])} for {kind}s")
    target = variables.get(OF_KIND[of], {})
    out: dict[str, Any] = {"op": op, "of": of}
    if op != "count":
        variable = str(calc.get("variable") or "")
        if target.get(variable) not in ("number", "counter", "calculated"):
            raise CalcError(f"'{variable}' isn't a number or counter of {OF_KIND[of]}s")
        out["variable"] = variable
    if calc.get("times"):
        times = str(calc["times"])
        if target.get(times) not in ("number", "counter"):
            raise CalcError(f"'{times}' isn't a number of {OF_KIND[of]}s")
        out["times"] = times
    return out


def number(value: Any) -> float | None:
    """A value as a number: a number, a counter's current, else None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, dict) and isinstance(value.get("current"), (int, float)):
        return float(value["current"])
    return None


def evaluate(formula: str, values: dict[str, Any], roll: Callable[[int, int], int] | None = None) -> float | None:
    """A formula's value from a thing's values; with `roll` (count, sides -> their total), its dice are rolled."""
    def walk(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return walk(node.body)
        if isinstance(node, ast.Constant):
            return float(node.value)
        if isinstance(node, ast.Name):
            return number(values.get(node.id)) or 0.0
        if isinstance(node, ast.UnaryOp):
            return -walk(node.operand) if isinstance(node.op, ast.USub) else walk(node.operand)
        if isinstance(node, ast.BinOp):
            left, right = walk(node.left), walk(node.right)
            if isinstance(node.op, ast.Div) and right == 0:
                return 0.0
            return _BINARY[type(node.op)](left, right)
        if isinstance(node, ast.Call):
            if node.func.id == "roll":  # type: ignore[union-attr]
                count, sides = (int(round(walk(a))) for a in node.args)
                count, sides = max(0, min(MAX_DICE, count)), max(2, min(MAX_SIDES, sides))
                return float(roll(count, sides)) if roll else 0.0
            return float(FUNCTIONS[node.func.id](*[walk(a) for a in node.args]))  # type: ignore[union-attr]
        raise CalcError("Unsupported")
    try:
        return tidy(walk(_parse(formula, dice=roll is not None)))
    except (CalcError, TypeError, ValueError, OverflowError):
        return None


def aggregate(calc: dict, rows: list[dict[str, Any]]) -> float | int | None:
    """A list's calculation over its things' values (each a dict of values)."""
    op = calc["op"]
    if op == "count":
        return len(rows)
    numbers = []
    for row in rows:
        value = number(row.get(calc["variable"]))
        if value is None:
            continue
        if calc.get("times"):
            value *= number(row.get(calc["times"])) if number(row.get(calc["times"])) is not None else 1.0
        numbers.append(value)
    if not numbers:
        return 0 if op == "sum" else None
    result = {"sum": sum, "min": min, "max": max, "avg": lambda xs: sum(xs) / len(xs)}[op](numbers)
    return tidy(result)


def tidy(value: float) -> float:
    return int(value) if float(value).is_integer() else round(value, 2)
