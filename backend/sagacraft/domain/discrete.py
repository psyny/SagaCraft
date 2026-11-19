"""Discrete threshold: show a degree of a counter (e.g. enemy HP) without its value.

4 balls = full, 3 = above A, 2 = above B, 1 = above zero, 0 = down.
A is random in [60, 90] and B in [30, A - 10], seeded per creature with a server secret, so players
can't learn the exact percentages either. See docs/concepts/stages.md.
"""
import hashlib
import hmac
import random

LEVELS = 4


def thresholds(secret: str, seed_key: str) -> tuple[int, int]:
    digest = hmac.new(secret.encode(), f"discrete:{seed_key}".encode(), hashlib.sha256).digest()
    rng = random.Random(int.from_bytes(digest[:8], "big"))
    point_a = rng.randint(60, 90)
    point_b = rng.randint(30, point_a - 10)
    return point_a, point_b


def level(current: float, maximum: float, point_a: int, point_b: int) -> int:
    if current <= 0:
        return 0
    if maximum <= 0 or current >= maximum:
        return LEVELS
    percent = current * 100 / maximum
    if percent > point_a:
        return 3
    if percent > point_b:
        return 2
    return 1
