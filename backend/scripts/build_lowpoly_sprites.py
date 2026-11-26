"""Build the checked-in Low Poly SVGs. The Map Painter substitutes their palette at runtime."""

from math import cos, pi, sin, tau
from pathlib import Path
from random import Random


STYLES = Path(__file__).resolve().parents[1] / "sagacraft" / "map_painter" / "styles"
A, B, C, INK, LIGHT = (f"var(--{role})" for role in ("a", "b", "c", "ink", "light"))


def point(x, y):
    return f"{x:.2f},{y:.2f}"


def polygon(points, material, opacity=1):
    vertices = " ".join(point(x, y) for x, y in points)
    alpha = f' opacity="{opacity:.3g}"' if opacity != 1 else ""
    return f'<polygon points="{vertices}" fill="{material}"{alpha}/>'


class Art:
    def __init__(self, width, height, anchor=(0.5, 0.92)):
        self.width, self.height, self.anchor = width, height, anchor
        self.day, self.night, self.glow = [], [], []

    def face(self, points, material, light=0):
        self.day.append(polygon(points, material))
        if abs(light) >= 0.015:
            self.day.append(polygon(points, "#fff" if light > 0 else "#151c29", abs(light)))

    def shadow(self, x, y, rx, ry):
        for scale, alpha in ((1, .055), (.83, .065), (.62, .08)):
            self.day.append(f'<ellipse cx="{x:g}" cy="{y:g}" rx="{rx * scale:.2f}" ry="{ry * scale:.2f}" '
                            f'fill="#18212b" opacity="{alpha}"/>')

    def rect(self, x, y, w, h, material, light=0):
        self.face(((x, y), (x + w, y), (x + w, y + h), (x, y + h)), material, light)

    def opening(self, x, y, width, height, color=INK, *, lit=False, arch=False):
        top = ((x + width * .23, y), (x + width * .77, y), (x + width, y + width * .36)) if arch else (
            (x, y), (x + width, y))
        points = (*top, (x + width, y + height), (x, y + height))
        if arch:
            points += ((x, y + width * .36),)
        self.face(points, color)
        if lit:
            self.night.append(polygon(points, LIGHT, .82))

    def svg(self):
        ax, ay = self.anchor
        content = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.width} {self.height}" '
                   f'data-anchor="{ax:g} {ay:g}">', *self.day]
        for name, elements in (("night", self.night), ("glow", self.glow)):
            if elements:
                content += [f'<g class="{name}">', *elements, '</g>']
        return "\n".join((*content, '</svg>', ''))


def rock(art, rng, x, y, rx, ry, main=A, shade=B, accent=None, sides=7):
    """A convex rim and raised crown give a rock, canopy, or cloud distinct planes."""
    phase = rng.uniform(-.16, .16)
    angles = [phase + tau * i / sides for i in range(sides)]
    radii = [rng.uniform(.86, 1.12) for _ in angles]
    rim = [(x + cos(t) * rx * r, y + sin(t) * ry * r) for t, r in zip(angles, radii)]
    crown = [(x - rx * .15 + cos(t) * rx * .56, y - ry * .22 + sin(t) * ry * .48) for t in angles]
    art.face(rim, main)
    for i, start in enumerate(angles):
        j = (i + 1) % sides
        midpoint = start + pi / sides
        light = -.24 * cos(midpoint - .45) - .045
        material = shade if light < -.18 else main
        art.face((rim[i], rim[j], crown[j]), material, light * .62)
        art.face((rim[i], crown[j], crown[i]), material, light * .42 + .055)
    core = (x - rx * .24, y - ry * .32)
    for i in range(sides):
        j = (i + 1) % sides
        light = .18 - .12 * cos(angles[i] + pi / sides - .5)
        art.face((core, crown[i], crown[j]), accent or main, light)


def branch(art, start, end, base, tip, material, shade):
    x, y = start
    u, v = end
    length = ((u - x) ** 2 + (v - y) ** 2) ** .5
    dx, dy = (y - v) / length, (u - x) / length
    art.face(((x - dx * base, y - dy * base), (u - dx * tip, v - dy * tip), (u, v), (x, y)), material, .17)
    art.face(((x, y), (u, v), (u + dx * tip, v + dy * tip), (x + dx * base, y + dy * base)), shade, -.12)


def cone(art, x, y, radius, height, material, shade, lean=0):
    tip = (x + lean, y - height)
    base = [(x - radius, y - radius * .08), (x - radius * .47, y + radius * .18),
            (x + radius * .25, y + radius * .22), (x + radius * .76, y + radius * .07), (x + radius, y - radius * .12)]
    art.face((tip, *base), material)
    for i, (color, light) in enumerate(((material, .23), (material, .035), (shade, .08), (shade, -.2))):
        art.face((tip, base[i], base[i + 1]), color, light)


def tree(kind, n, rng):
    art = Art(76, 96, (.5, .938))
    x = 38
    lean = (-3, 4, 0)[n - 1]
    art.shadow(x + 3, 90, 20 if kind == "broadleaf" else 14, 4)
    if kind in ("pine", "redwood"):
        wide, tiers = ((28, 25, 30)[n - 1], (4, 3, 4)[n - 1]) if kind == "pine" else ((19, 21)[n - 1], 5)
        branch(art, (x, 90), (x + lean, 29), 4.8 if kind == "pine" else 6, 1.3, C, C)
        for i in range(tiers):
            y = 75 - i * 12 + rng.uniform(-1, 1)
            cone(art, x + i * lean / tiers, y, wide * (1 - i * .13) * rng.uniform(.9, 1.04),
                 (37 if kind == "pine" else 27) - i, A, B, lean)
    elif kind == "broadleaf":
        branch(art, (x, 90), (x + lean, 29), 6.1, 2, C, C)
        branch(art, (38, 68), (21, 43), 4, 1.6, C, C)
        branch(art, (39, 66), (57, 40), 3.7, 1.6, C, C)
        crowns = (
            ((20, 33, 15, 15), (54, 34, 15, 16), (38, 24, 20, 19), (51, 48, 18, 16), (19, 48, 15, 15), (35, 42, 19, 16)),
            ((24, 29, 15, 16), (52, 35, 16, 17), (40, 20, 17, 17), (55, 48, 13, 15), (24, 49, 16, 16), (38, 38, 17, 18)),
            ((22, 37, 17, 13), (54, 37, 16, 14), (31, 27, 20, 17), (53, 47, 16, 14), (19, 50, 16, 12), (35, 44, 19, 16)),
        )
        for cx, cy, rx, ry in crowns[n - 1]:
            rock(art, rng, cx + rng.uniform(-2, 2), cy + rng.uniform(-2, 2), rx, ry, sides=6)
        art.face(((38, 80), (33, 88), (23, 93), (33, 92), (39, 89)), C, .13)
        art.face(((40, 81), (44, 88), (52, 92), (42, 91), (38, 88)), C, -.27)
    elif kind == "dead":
        rock(art, rng, 29, 89, 10, 3, C, B, sides=5)
        branch(art, (x, 90), (x + lean, 55), 6, 3.6, A, B)
        branch(art, (x + lean, 56), (35 + lean, 12), 3.7, 1, A, B)
        branch(art, (36 + lean, 19), (42 + lean, 6 + n), 1.7, .25, A, B)
        for sx, sy, ex, ey, tx, ty in ((36, 59, 19, 32, 12, 19), (39, 52, 54, 40, 59, 24),
                                       (37, 41, 25, 22, 25, 13)):
            branch(art, (sx + lean, sy), (ex + lean, ey + n * 2), 2.6, 1.25, A, B)
            branch(art, (ex + lean, ey + n * 2), (tx + lean, ty), 1.4, .18, A, B)
    else:
        x = 38 + lean
        bend = 7 if n == 1 else -6
        branch(art, (38, 90), (x + bend * .25, 56), 4.9, 3.1, C, C)
        branch(art, (x + bend * .25, 56), (x + bend, 28), 3.2, 2.8, C, C)
        x += bend
        for dx, dy in ((-22, -15), (13, -21), (28, -3), (-32, 3), (23, 15), (-18, 20), (2, 15)):
            bend = (x + dx * .58, 28 + dy * .65 - 5)
            end = (x + dx, 28 + dy + rng.uniform(-4, 4))
            art.face(((x, 28), (bend[0], bend[1] - 4), end, bend), A, .24 if dx < 0 else .09)
            art.face(((x, 28), bend, end, (bend[0] - dx * .17, bend[1] + 7)), B, .07)
    return art


def ridge(art, rng, x, base, width, height, kind):
    left = (x - width * .5, base - height * .08)
    right = (x + width * .5, base - height * .13)
    summit = (x + width * rng.uniform(-.16, .08), base - height)
    flat = kind == "hill"
    left_slope = ((x - width * .39, base - height * .38),
                  (summit[0] - width * (.19 if flat else .11), base - height * (.84 if flat else .70)))
    right_slope = ((summit[0] + width * (.19 if flat else .12), base - height * (.89 if flat else .68)),
                   (x + width * .37, base - height * rng.uniform(.29, .44)))
    fore = [(x - width * .33, base + 1), (x - width * .11, base + 3),
            (x + width * .15, base + 2), (x + width * .34, base - 1)]
    knees = [(x - width * .31, base - height * rng.uniform(.28, .44)),
             (x - width * .12, base - height * rng.uniform(.48, .61)),
             (x + width * .075, base - height * rng.uniform(.47, .56)),
             (x + width * .27, base - height * rng.uniform(.25, .39))]
    art.face((left, *left_slope, summit, *right_slope, right, *reversed(fore)), A)
    front = [left, *fore, right]
    upper = [left, *knees, right]
    for i, (a, b) in enumerate(zip(upper, upper[1:])):
        bright = (.27, .15, .035, -.13, -.24)[i]
        material = A if i < 3 else B
        if i == 0:
            art.face((summit, *reversed(left_slope), a, b), material, bright)
        elif i == 4:
            art.face((summit, a, b, *reversed(right_slope)), material, bright)
        else:
            art.face((summit, a, b), material, bright)
        bed = C if kind in ("hill", "mountain") else material
        art.face((a, b, front[i + 1], front[i]), bed, bright - .035)
        if i in (1, 3):
            art.face((a, front[i + 1], front[i]), bed, bright - .14)
    if kind == "peak":
        cap = [left_slope[-1], *[(summit[0] + (p[0] - summit[0]) * f, summit[1] + (p[1] - summit[1]) * f)
                                 for p, f in zip(knees, (.63, .91, .70, .43))], right_slope[0]]
        for i, (a, b) in enumerate(zip(cap, cap[1:])):
            art.face((summit, a, b), C, (.10, .025, -.08, -.22, -.38)[i])


def landform(kind, n, rng):
    art = Art(116, 82 if kind != "hill" else 47, (.5, .915 if kind != "hill" else .875))
    base = art.height * .89 if kind != "hill" else 40
    if kind == "volcano":
        rim = [(39, 23), (47, 16), (65, 14), (77, 19), (73, 27), (53, 29)]
        left, middle, right = (5, 68), (51, 76), (112, 67)
        art.face((left, *rim, right, middle), A)
        art.face((left, rim[0], rim[5], (32, 71)), A, .2)
        art.face((rim[5], rim[4], (72, 74), middle), A, -.08)
        art.face((rim[3], rim[4], (72, 74), right), B, -.13)
        art.face((rim[4], (90, 53), right, (72, 74)), B, .12)
        pool = ((43, 22), (49, 18), (65, 16), (73, 20), (68, 24), (54, 27))
        art.face(rim, B, -.18)
        art.glow.append(polygon(pool, C))
        art.glow.append(polygon(((47, 21), (64, 17), (69, 20), (56, 24)), '#fff2ab', .85))
        if n == 1:
            art.glow.append(polygon(((55, 25), (60, 24), (48, 39), (49, 46), (34, 60),
                                      (44, 45), (42, 38)), C))
        else:
            art.glow.append(polygon(((66, 23), (70, 22), (72, 35), (82, 44), (69, 37)), C))
        return art
    height = 34 if kind == "hill" else (62 if kind == "mountain" else 67)
    width = (77, 74, 68)[n - 1]
    art.shadow(59, base - 1, 41, 4)
    ridge(art, rng, (74, 40, 86)[n - 1], base - 5, 54, height * .67, kind)
    ridge(art, rng, (48, 65, 53)[n - 1], base - 1, width, height, kind)
    ridge(art, rng, (83, 32, 31)[n - 1], base + 1, (44, 44, 36)[n - 1], height * .41, kind)
    return art


def block(art, x, y, w, h, depth, material, light=0):
    top, right, rise = y - h, x + w, depth * .52
    art.rect(x, top, w, h, material, light)
    art.face(((right, y), (right + depth, y - rise), (right + depth, top - rise), (right, top)), material, -.27 + light)
    art.face(((x, top), (x + depth, top - rise), (right + depth, top - rise), (right, top)), material, .24 + light)


def gable(art, x, y, w, h, depth, roof=B, wall=A, peak=None):
    peak = peak if peak is not None else x + w * .48
    eave, ridge = y - h, (peak, y - h * 1.65)
    block(art, x, y, w, h, depth, wall)
    art.face(((x, eave), ridge, (x + w, eave)), wall, .085)
    dx, dy = depth + 2, -(depth + 2) * .52
    art.face(((ridge[0], ridge[1] - 2), (ridge[0] + dx, ridge[1] + dy - 2),
              (x + w + dx + 2, eave + dy), (x + w + 3, eave + 2)), roof, -.10)
    art.face(((ridge[0], ridge[1] - 2), (x + w + 3, eave + 2), (x + w + 3, eave + 4),
              (ridge[0], ridge[1] + 2), (x - 3, eave + 4), (x - 3, eave + 2)), roof, .23)
    art.face(((ridge[0] + dx * .53, ridge[1] + dy * .53 - 2), (ridge[0] + dx, ridge[1] + dy - 2),
              (x + w + dx + 2, eave + dy), (x + w + dx * .53 + 3, eave + dy * .53 + 2)), roof, -.23)


def battlements(art, x, y, width, depth, count):
    block(art, x, y, width, 3.5, depth, A, .08)
    step = width / (count - .45)
    for i in range(count):
        block(art, x + i * step, y - 3, step * .53, 5.2, depth * .4, A, .07)


def banner(art, x, y, width, height):
    art.face(((x, y), (x + width, y), (x + width, y + height),
              (x + width * .49, y + height * .82), (x, y + height)), C, -.13)
    art.face(((x, y), (x + width * .42, y), (x + width * .49, y + height * .82), (x, y + height)), C, .14)


def turret(art, x, y, w, h, *, roof=B, material=A, crenels=False, flag=False):
    depth = w * .38
    block(art, x, y, w, h, depth, material)
    block(art, x - 1, y, w + 2, h * .12, depth, material, -.12)
    block(art, x - 1, y - h + 2, w + 2, 3.7, depth, material, .09)
    if crenels:
        battlements(art, x - 1, y - h + 1, w + 2, depth, 3)
    else:
        cone(art, x + w * .59, y - h - 1, w * .72, w * .87, roof, roof, w * .06)
    art.opening(x + w * .22, y - h * .66, w * .16, h * .14, lit=True, arch=True)
    if flag:
        banner(art, x + w * .56, y - h * .68, w * .24, h * .29)


def house(kind, n):
    town = kind == 'townhouse'
    art = Art(76 if kind in ('farmhouse', 'barn') else 68, 92 if town else 68, (.5, .89))
    y, w = art.height * .89, (28, 29, 23)[n - 1] if town else (30, 27, 28)[n - 1]
    h = (37, 41, 32)[n - 1] if town else (27, 29, 23)[n - 1]
    if kind in ('farmhouse', 'barn'):
        w, h = ((39, 24) if kind == 'farmhouse' else (41, 28))
    x, d = (art.width - w) * .44, 13 + n
    art.shadow(art.width *.51, y, art.width * .38, 5)
    if kind == 'farmhouse':
        gable(art, 9, y - 3, 21, 19, 9)
    if kind != 'barn' and n != 3:
        block(art, x + w * .63, y - h - 6, 6, 13, 4, A, -.09)
    gable(art, x, y, w, h, d)
    art.opening(x + w * .43, y - h * .41, w * .20, h * .41, C if not town else INK, arch=n != 2)
    if kind == 'barn':
        art.opening(x + w * .3, y - h * .54, w * .4, h * .54, C)
        art.face(((x + w * .32, y - h * .52), (x + w * .36, y - h * .52),
                  (x + w * .67, y - 1), (x + w * .62, y - 1)), C, .29)
    else:
        windows = ((.18, .65), (.71, .65), (.18, .88), (.71, .88)) if town else ((.15, .67), (.74, .67))
        for col, row in windows:
            art.opening(x + w * col, y - h * row, w * .13, h * .13, lit=True)
    if town or n == 2:
        art.rect(x, y - h * .48, w, 1.7, A, -.28)
    return art


def fortress(kind, n):
    if kind in ('castle-tower', 'tower', 'tower-house', 'ruin-tower'):
        art = Art(60, 97, (.5, .90))
        art.shadow(30, 87, 19, 4.5)
        if kind == 'ruin-tower':
            art.face(((12, 84), (12, 32), (21, 35), (22, 24), (32, 22), (34, 33), (42, 41), (42, 84)), A, .06)
            art.face(((42, 41), (51, 35), (51, 79), (42, 84)), B, -.12)
            art.face(((22, 24), (32, 22), (36, 18), (25, 20)), A, .31)
            art.opening(24, 51, 7, 11, INK, arch=True)
            art.face(((14, 84), (21, 68), (27, 75), (30, 84)), C, -.10)
        else:
            turret(art, 14, 87, 26 if kind != 'tower-house' else 23, 60 if kind != 'tower-house' else 52,
                   crenels=(kind == 'castle-tower' or kind == 'tower' and n == 2),
                   roof='#a94a31' if kind == 'castle-tower' else B, flag=kind != 'castle-tower')
            art.opening(23, 67, 6, 20, INK, arch=True)
            if kind == 'tower' and n == 2:
                art.rect(26, 17, 3, 5, C, .13)
                art.night.append(polygon(((25, 20), (27, 15), (30, 19), (29, 22)), LIGHT))
        return art
    art = Art(116, 100, (.5, .89))
    art.shadow(58, 88, 49, 6)
    if kind == 'castle-gate':
        # The wall shader joins these shoulders on either side.
        turret(art, 11, 88, 20, 56, roof='#a94a31', crenels=True)
        turret(art, 78, 88, 20, 56, roof='#a94a31', crenels=True)
        block(art, 28, 88, 55, 42, 10, A)
        battlements(art, 29, 47, 55, 9, 6)
        art.opening(48, 59, 22, 29, INK, arch=True)
        art.opening(36, 62, 5, 7, INK, lit=True)
        art.opening(74, 62, 5, 7, INK, lit=True)
    else:
        turret(art, 37, 76, 27, 50 if n == 1 else 46, roof=B, flag=True)
        turret(art, 67, 74, 19, 36 if n == 1 else 45, roof=B, flag=True)
        turret(art, 15, 84, 21, 43 if n == 1 else 38, roof=B)
        turret(art, 84, 83, 16, 36, roof=B, crenels=n == 2)
        block(art, 29, 89, 56, 31, 12, A)
        battlements(art, 29, 58, 56, 9, 6)
        art.opening(48, 66, 17, 23, INK, arch=True)
        for x in (37, 71):
            banner(art, x, 66, 6, 14)
            art.opening(x, 61, 3.5, 5, lit=True)
    return art


def landmark(kind, n):
    art = Art(100, 100, (.5, .89))
    if kind == 'church':
        art.shadow(52, 89, 40, 6)
        gable(art, 28, 89, 39, 32, 20)
        art.opening(45, 72, 9, 17, lit=True, arch=True)
        turret(art, 16, 89, 19, 60, roof=C)
        art.opening(21, 69, 5, 9, lit=True, arch=True)
    elif kind == 'temple':
        art = Art(116 if n == 1 else 98, 91, (.5, .89))
        art.shadow(art.width / 2, 82, art.width * .37, 5)
        if n == 1:
            for i in range(3):
                block(art, 14 + i * 3, 82 - 3 * i, 77 - 6 * i, 3, 12, A)
            block(art, 27, 72, 55, 35, 18, B, -.2)
            for x in (25, 42, 61, 79):
                block(art, x, 72, 6, 33, 4, A)
            gable(art, 22, 39, 63, 10, 20, B)
            art.face(((49, 29), (54, 25), (59, 29), (54, 33)), C, .16)
        else:
            block(art, 23, 81, 42, 39, 19, A)
            block(art, 20, 47, 48, 7, 19, A, .1)
            cone(art, 52, 37, 33, 22, B, B)
            cone(art, 53, 16, 6, 11, C, C)
            art.opening(35, 52, 17, 29, INK, lit=True, arch=True)
    elif kind == 'windmill':
        art = Art(69, 100, (.5, .94))
        art.shadow(34, 94, 24, 4)
        art.face(((14, 94), (19, 39), (42, 39), (47, 93)), A, .1)
        art.face(((42, 39), (51, 35), (57, 86), (47, 93)), A, -.25)
        cone(art, 35, 37, 22, 30, C, C)
        art.opening(24, 76, 9, 18, INK, arch=True)
        art.opening(23, 47, 5, 8, INK, lit=True)
    else:  # Lighthouse
        art = Art(60, 110, (.5, .91))
        art.shadow(29, 100, 21, 5)
        for i in range(5):
            y = 99 - i * 13
            left, right = 10 + i * 1.3, 43 - i * .8
            color = A if i % 2 == 0 else B
            art.face(((left, y), (left + 1.3, y - 13), (right - 5.8, y - 13), (right - 5, y)), color, .11)
            art.face(((right - 5, y), (right + 7, y - 4), (right + 6.2, y - 17), (right - 5.8, y - 13)), color, -.29)
        block(art, 15, 37, 26, 5, 7, A)
        block(art, 19, 32, 18, 13, 6, INK)
        cone(art, 30, 18, 18, 14, B, B)
        art.night.append(polygon(((21, 21), (35, 21), (35, 30), (21, 30)), C))
        art.opening(20, 84, 7, 14, INK, arch=True)
    return art


def mill_sails():
    art = Art(100, 100, (.5, .5))
    for i in range(4):
        angle = pi / 7 + i * pi / 2

        def rotate(x, y):
            return 50 + x * cos(angle) - y * sin(angle), 50 + x * sin(angle) + y * cos(angle)

        art.face([rotate(x, y) for x, y in ((-1, 0), (2, 0), (2, 47), (-1, 47))], B, -.22)
        art.face([rotate(x, y) for x, y in ((1, 12), (12, 16), (10, 45), (1, 47))], B, .33)
        art.face([rotate(x, y) for x, y in ((1, 12), (5, 28), (10, 45), (1, 47))], A, .17)
    art.face(((46, 46), (52, 44), (56, 49), (53, 55), (47, 55), (44, 51)), B, .16)
    return art


def tent(art, x, y, w, h, variant):
    far = (x + w * .25, y - h * .23)
    peak = (x + w * (.45 if variant == 1 else .36), y - h)
    roof = (peak[0] + w * .31, peak[1] - h * .18)
    right = (x + w, y)
    back = (x + w * 1.24, y - h * .27)
    art.face((far, roof, peak, (x, y)), A, .24)
    art.face((peak, roof, back, right), A, -.13)
    art.face((peak, right, (x, y)), A, .095)
    art.face(((peak[0], peak[1] + h * .2), (peak[0] + w * .19, y), (peak[0] - w * .16, y)), B, -.24)
    art.face(((peak[0], peak[1] + h * .2), (peak[0] + w * .08, y), (peak[0] + w * .19, y)), B, .2)


def fire_pit(art, rng, x, y, size):
    for i in range(7):
        angle = tau * i / 7
        art.face([(x + size * cos(angle + a) * r, y + size * .43 * sin(angle + a) * r)
                  for a, r in ((-.4, .76), (-.31, 1.07), (.29, 1.07), (.4, .75))], B, rng.uniform(-.14, .22))
    art.glow += [polygon(((x - size * .45, y), (x - size * .12, y - size * .27), (x + size * .41, y - size * .12),
                          (x + size * .3, y + size * .12), (x - size * .26, y + size * .16)), C)]


def campsite(kind, n, rng):
    if kind == 'bonfire':
        art = Art(50, 50, (.5, .85))
        art.shadow(25, 42, 17, 5)
        fire_pit(art, rng, 25, 39.5, 14)
    elif kind == 'camp':
        art = Art(106, 61, (.5, .9))
        art.shadow(43, 54, 38, 4)
        tent(art, 37, 43, 32, 25, 2)
        tent(art, 8, 54, 37, 31, 1)
        fire_pit(art, rng, 91, 51.5, 9)
    else:
        art = Art(77, 69, (.5, .88))
        art.shadow(36, 61, 32, 5)
        tent(art, 8 if n == 1 else 14, 60, 47 if n == 1 else 41, 40 if n == 1 else 47, n)
        if n == 1:
            art.night.append(polygon(((29, 36), (34, 60), (25, 60)), LIGHT, .67))
    return art


def stonework(kind, n, rng):
    if kind in ('mine', 'cave'):
        art = Art(103, 68, (.5, .91))
        art.shadow(52, 61, 44, 4)
        rock(art, rng, 53, 36, 36, 26, A, A if kind == 'mine' else B)
        rock(art, rng, 22, 48, 17, 13, A, A if kind == 'mine' else B, sides=5)
        rock(art, rng, 79, 47, 17, 14, A, A if kind == 'mine' else B, sides=5)
        art.opening(34, 29, 34, 32, C, arch=True)
        if kind == 'mine':
            art.rect(33, 31, 6, 31, B, .13)
            art.rect(64, 31, 6, 31, B, -.20)
            art.rect(29, 29, 45, 6, B, .24)
            art.night.append(polygon(((54, 43), (57, 43), (57, 47), (54, 47)), LIGHT))
        return art
    if kind == 'obelisk':
        art = Art(55, 102, (.5, .9))
        art.shadow(27, 91, 23, 5)
        block(art, 8, 92, 34, 9, 8, A)
        block(art, 13, 83, 26, 7, 6, A, -.05)
        art.face(((17, 76), (20, 24), (27, 5), (30, 22), (30, 76)), A, .23)
        art.face(((30, 76), (30, 22), (27, 5), (38, 22), (39, 72)), B, -.05)
        art.face(((20, 24), (27, 5), (30, 22)), C, .22)
        art.face(((23, 40), (27, 35), (29, 40), (26, 46)), C, .04)
        return art
    if kind == 'statue':
        art = Art(58, 101, (.5, .9))
        art.shadow(29, 91, 23, 5)
        block(art, 9, 91, 34, 10, 8, A)
        block(art, 16, 81, 22, 13, 6, A, -.09)
        art.face(((20, 68), (22, 51), (18, 33), (25, 24), (37, 26), (45, 37), (38, 46), (38, 66)), A, .15)
        art.face(((30, 31), (37, 26), (45, 37), (38, 46), (38, 66), (30, 68)), B, .02)
        rock(art, rng, 31, 19, 8.5, 11, A, B, sides=6)
        art.face(((16, 45), (39, 29), (42, 32), (18, 49)), C, .18)
        return art
    art = Art(100, 69, (.5, .89))
    art.shadow(50, 61, 43, 6)
    if kind == 'stones':
        for x, y, rx, ry in ((47, 39, 12, 20), (73, 45, 14, 16), (23, 44, 11, 17), (58, 56, 10, 5)):
            rock(art, rng, x, y, rx, ry, A, B, sides=6)
            art.face(((x - rx * .7, y + ry * .5), (x - rx * .18, y + ry * .72),
                      (x - rx * .2, y + ry * .98), (x - rx * .61, y + ry * .81)), C, -.19)
    elif kind == 'rubble':
        for x, y, rx, ry in ((33, 42, 24, 17), (65, 40, 24, 15), (50, 52, 24, 11), (77, 54, 13, 7)):
            rock(art, rng, x, y, rx, ry, A, B, sides=5)
    else:
        y = 61
        for x, w, h in ((12, 23, 28), (32, 12, 19), (61, 24, 36 if n == 1 else 25)):
            art.face(((x, y), (x, y - h), (x + w * .25, y - h - 6),
                      (x + w * .64, y - h + 3), (x + w, y - h - 3), (x + w, y)), A, .1)
            art.face(((x + w, y), (x + w + 8, y - 5), (x + w + 8, y - h - 8), (x + w, y - h - 3)), B, -.11)
        if n == 1:
            block(art, 31, 40, 34, 10, 7, A)
        rock(art, rng, 48, 59, 12, 5, C, B, sides=5)
        rock(art, rng, 71, 60, 9, 5, A, B, sides=5)
    return art


def portal():
    art = Art(83, 100, (.5, .91))
    art.shadow(41, 90, 30, 5)
    block(art, 12, 91, 54, 8, 7, B)
    left = ((16, 85), (14, 44), (26, 19), (41, 10), (43, 23), (34, 33), (27, 47), (28, 85))
    right = ((41, 10), (63, 20), (72, 46), (66, 85), (54, 85), (58, 48), (51, 33), (43, 23))
    art.face(left, A, .19)
    art.face(right, B, -.10)
    art.face(((14, 44), (26, 19), (37, 15), (29, 29), (23, 42)), A, .37)
    art.face(((54, 85), (58, 48), (51, 33), (58, 37), (63, 48), (61, 83)), A, -.17)
    art.glow.append(polygon(((27, 83), (27, 48), (34, 33), (42, 22), (52, 33), (58, 49), (54, 83)), C, .66))
    art.glow.append(polygon(((27, 67), (47, 31), (53, 37), (35, 77)), C))
    art.glow.append(polygon(((39, 73), (56, 49), (53, 67), (46, 81)), '#fff', .37))
    return art


def small_sprite(kind, n, rng):
    if kind == 'bird':
        art = Art(84, 54, (.5, .5))
        tips = ((3, 5), (80, 8)) if n == 1 else ((4, 43), (80, 45))
        for side, (x, y) in zip((-1, 1), tips):
            elbow = (42 + side * 19, y * .56 + 14)
            art.face(((41, 25), elbow, (x, y), (x - side * 4, y + 7), (42 + side * 16, elbow[1] + 9), (42, 34)), A, .13 if side < 0 else -.23)
            art.face(((42, 31), elbow, (x, y), (42 + side * 16, elbow[1] + 9)), B, .1)
        art.face(((34, 32), (37, 21), (42, 17), (48, 23), (53, 27), (45, 28), (43, 36)), A, .04)
        art.face(((48, 23), (55, 26), (49, 27)), C, .05)
    elif kind == 'cloud':
        art = Art(127, 55, (.5, .5))
        for x, y, rx, ry in ((28, 33, 24, 15), (61, 24, 29, 19), (95, 28, 25, 19), (54, 37, 32, 14),
                             ((90 if n == 1 else 100), 39, 24, 11)):
            rock(art, rng, x, y, rx, ry, A, B, C, sides=6)
    elif kind == 'haystack':
        art = Art(72, 58, (.5, .87))
        art.shadow(35, 49, 27, 5)
        rock(art, rng, 35, 34, 27, 17, '#c3a154', '#96733e', '#dbbc73', sides=7)
        art.face(((15, 36), (39, 16), (47, 19), (28, 42)), '#f4d58b', .10)
        art.face(((27, 46), (46, 31), (51, 33), (38, 48)), '#d2b367', .04)
    else:
        art = Art(70, 62, (.5, .9))
        art.shadow(35, 55, 24, 4)
        caps = [(33, 26, 19)] if n == 2 else [(24, 27, 18), (49, 38, 13)]
        for x, y, r in caps:
            branch(art, (x, 54), (x + 1, y), r * .2, r * .14, B, B)
            points = ((x - r, y + 3), (x - r * .58, y - r * .58), (x, y - r * .82),
                      (x + r * .51, y - r * .55), (x + r, y + 1), (x + r * .36, y + 7), (x - r * .32, y + 7))
            art.face(points, A, .04)
            art.face((points[0], points[1], points[2], (x + 1, y + 3)), A, .26)
            art.face(((x + 1, y + 3), points[3], points[4], points[5]), A, -.21)
            art.glow.append(polygon(((x - r * .58, y + 3), (x + r * .53, y + 3), points[5], points[6]), C, .82))
    return art


def sprite(name):
    rng = Random(name)
    prefix, _, last = name.rpartition('-')
    kind, n = (prefix, int(last)) if last.isdigit() else (name, 1)
    if kind in ('pine', 'redwood', 'broadleaf', 'dead', 'palm'):
        return tree(kind, n, rng)
    if kind in ('hill', 'mountain', 'peak', 'volcano'):
        return landform(kind, n, rng)
    if kind in ('house', 'townhouse', 'farmhouse', 'barn'):
        return house(kind, n)
    if kind in ('tower', 'keep', 'tower-house', 'castle-tower', 'castle-gate', 'ruin-tower'):
        return fortress(kind, n)
    if kind in ('church', 'temple', 'windmill', 'lighthouse'):
        return landmark(kind, n)
    if kind in ('camp', 'bonfire', 'tent'):
        return campsite(kind, n, rng)
    if kind in ('mine', 'cave', 'obelisk', 'statue', 'stones', 'rubble', 'ruin'):
        return stonework(kind, n, rng)
    if kind in ('bird', 'cloud', 'mushroom', 'haystack'):
        return small_sprite(kind, n, rng)
    if kind == 'portal':
        return portal()
    if kind == 'windmill-sails':
        return mill_sails()
    raise ValueError(f'Missing Low Poly sprite recipe for {name}')


if __name__ == '__main__':
    output = STYLES / 'lowpoly' / 'sprites'
    output.mkdir(parents=True, exist_ok=True)
    names = sorted(p.stem for p in (STYLES / 'storybook' / 'sprites').glob('*.svg'))
    for name in names:
        (output / f'{name}.svg').write_text(sprite(name).svg(), encoding='utf-8', newline='\n')
    print(f'Wrote {len(names)} Low Poly sprites')
