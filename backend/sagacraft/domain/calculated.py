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
from typing import Any

OPS = ("sum", "count", "min", "max", "avg", "formula")
OF = {"character": ("inventory", "groups"), "item": ("owner",), "group": ("characters",)}
OF_KIND = {"inventory": "item", "groups": "group", "owner": "character", "characters": "character"}
FUNCTIONS = {"min": min, "max": max, "floor": math.floor, "ceil": math.ceil, "round": round, "abs": abs}
_BINARY = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}
MAX_FORMULA = 200


class CalcError(ValueError):
    pass


def names_in(formula: str) -> set[str]:
    """The variables a formula reads (it must parse: see check)."""
    tree = _parse(formula)
    return {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and n.id not in FUNCTIONS}


def _parse(formula: str) -> ast.Expression:
    if not isinstance(formula, str) or not formula.strip() or len(formula) > MAX_FORMULA:
        raise CalcError(f"A formula is some text (at most {MAX_FORMULA} characters)")
    try:
        tree = ast.parse(formula, mode="eval")
    except SyntaxError:
        raise CalcError(f"'{formula}' isn't a formula") from None
    for node in ast.walk(tree):
        allowed = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.USub, ast.UAdd, ast.Constant, ast.Name, ast.Load, ast.Call,
                   *_BINARY)
        if not isinstance(node, allowed):
            raise CalcError(f"'{formula}': only numbers, variables, + - * /, brackets and {', '.join(FUNCTIONS)}")
        if isinstance(node, ast.Constant) and (isinstance(node.value, bool) or not isinstance(node.value, (int, float))):
            raise CalcError(f"'{formula}': only numbers")
        if isinstance(node, ast.Call) and (not isinstance(node.func, ast.Name) or node.func.id not in FUNCTIONS or node.keywords):
            raise CalcError(f"'{formula}': the functions are {', '.join(FUNCTIONS)}")
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


def evaluate(formula: str, values: dict[str, Any]) -> float | None:
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
            return float(FUNCTIONS[node.func.id](*[walk(a) for a in node.args]))  # type: ignore[union-attr]
        raise CalcError("Unsupported")
    try:
        return tidy(walk(_parse(formula)))
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
