"""Draw the colored-ink world-map pack from the StoryBook art direction."""

from math import cos, sin, tau
from random import Random

from build_lowpoly_sprites import A, B, C, INK, Art, STYLES, point, polygon, sprite


class InkArt(Art):
    def path(self, d, fill='none', width=0.72, opacity=1):
        stroke = f' stroke="{INK}" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round"' if width else ''
        self.day.append(f'<path d="{d}" fill="{fill}"{stroke} opacity="{opacity}"/>')

    def face(self, points, material, light=0):
        self.day.append(polygon(points, material))
        if abs(light) >= .015:
            self.day.append(polygon(points, 'url(#paper-wash)' if light > 0 else 'url(#ink-wash)', min(abs(light), .48)))
        if light < -.12 and material not in (INK, '#151c29'):
            self.hatch(points, 3.6, .34, .45)

    def opening(self, x, y, width, height, color=INK, *, lit=False, arch=False):
        super().opening(x, y, width, height, color, lit=lit, arch=arch)
        d = f'M{x:.2f} {y+height:.2f}V{y+width*.36:.2f}Q{x+width*.5:.2f} {y-width*.39:.2f} {x+width:.2f} {y+width*.36:.2f}V{y+height:.2f}' if arch else (
            f'M{x:.2f} {y+height:.2f}V{y:.2f}h{width:.2f}v{height:.2f}')
        self.path(d, width=.62, opacity=.81)

    def hatch(self, points, spacing, opacity, width):
        # Clip each diagonal stroke against the colored face so hatching stays off the silhouette.
        slope = .43
        levels = [x - y * slope for x, y in points]
        low, high = min(levels), max(levels)
        if high - low < spacing * 1.15:
            return
        segments = []
        for i in range(int((high - low) / spacing)):
            level = low + (i + .55) * spacing
            hits = []
            for a, b, la, lb in zip(points, (*points[1:], points[0]), levels, (*levels[1:], levels[0])):
                if min(la, lb) <= level < max(la, lb):
                    t = (level - la) / (lb - la)
                    hits.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
            hits.sort(key=lambda p: p[1])
            for a, b in zip(hits[::2], hits[1::2]):
                length = b[1] - a[1]
                if length < 2.1:
                    continue
                start, end = .12 + (i % 3) * .07, .78 + (i % 2) * .11
                segments.append('M' + point(a[0] + length * slope * start, a[1] + length * start)
                                + 'L' + point(a[0] + length * slope * end, a[1] + length * end))
        if segments:
            self.path(' '.join(segments), width=width, opacity=opacity)

    def svg(self):
        width, height = self.width, self.height
        ax, ay = self.anchor
        fade = f' data-foot-fade="{self.foot_fade:g}"' if self.foot_fade else ''
        ink_height = height if ay < .6 else ay * height - min(3.5, height * .055)
        weight = min(.92, height * .012)
        # Expand only the outside edge of the completed color drawing. The ink stops above the foot.
        outline = (
            '<defs><linearGradient id="paper-wash" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#ffefc7"/>'
            '<stop offset="1" stop-color="#ffefc7" stop-opacity=".16"/></linearGradient>'
            '<linearGradient id="ink-wash" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#392337" stop-opacity=".32"/>'
            '<stop offset="1" stop-color="#392337"/></linearGradient>'
            f'<filter id="silhouette" x="-10%" y="-10%" width="120%" height="120%" primitiveUnits="userSpaceOnUse">'
            f'<feMorphology in="SourceAlpha" operator="dilate" radius="{weight:.2f}" result="wide"/>'
            '<feComposite in="wide" in2="SourceAlpha" operator="out" result="rim"/>'
            f'<feFlood x="0" y="0" width="{width}" height="{ink_height:.2f}" flood-color="{INK}" flood-opacity=".92" result="ink"/>'
            '<feComposite in="ink" in2="rim" operator="in" result="outline"/>'
            '<feMerge><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
        )
        content = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" data-anchor="{ax:g} {ay:g}"{fade}>',
                   outline, '<g filter="url(#silhouette)">', *self.day, '</g>']
        for name, elements in (('night', self.night), ('glow', self.glow)):
            if elements:
                content += [f'<g class="{name}">', *elements, '</g>']
        return '\n'.join((*content, '</svg>', ''))


def crown(art, rng, x, y, rx, ry, count, color):
    lobes = []
    for i in range(count):
        angle = i / count * tau
        radius = rng.uniform(.86, 1.09)
        lobes.append((x + cos(angle) * rx * radius, y + sin(angle) * ry * radius))
    d = 'M' + point(*lobes[0])
    for i, (px, py) in enumerate(lobes):
        qx, qy = lobes[(i + 1) % count]
        cx, cy = (px + qx) * .5, (py + qy) * .5
        d += 'Q' + point(cx + (cx - x) * .22, cy + (cy - y) * .27) + ' ' + point(qx, qy)
    art.path(d + 'Z', color, .66)
    for i in (1, 3, 6):
        tx, ty = x + rx * (i / 5 - .63), y + ry * rng.uniform(-.13, .51)
        art.path(f'M{tx:.2f},{ty:.2f}q2 -2 4 -1.8m-1 2q1 -1 2 -.8', width=.54, opacity=.64)


def broadleaf(variant, rng):
    art = InkArt(90, 100, (.5, .925))
    bend = (-6, 3, 8)[variant - 1]
    art.path(f'M32 92 Q41 83 40 63 Q37 51 {24+bend} 40 L30 37 Q40 47 45 51 Q48 43 {54+bend} 37 L60 40 '
             'Q52 54 52 67 Q52 83 61 91 L68 94 L57 93 Q49 89 45 87 Q41 92 31 94 L21 94 Z', C, 0)
    art.path('M29 92 Q46 85 44 63 Q42 52 32 44 M40 91 Q48 79 47 64 Q49 55 55 48 M54 88 Q50 80 51 72', width=.91)
    layout = ((18, 55, 14, 11), (69, 54, 17, 14), (22, 34, 17, 13), (39, 21, 17, 16),
              (62, 27, 17, 14), (46, 46, 22, 14), (30, 39, 15, 11), (62, 44, 15, 11), (43, 34, 17, 14))
    for i, (x, y, rx, ry) in enumerate(layout):
        crown(art, rng, x + rng.uniform(-2.1, 2.1) + bend * .43, y + rng.uniform(-3, 3), rx, ry, 11, B if i < 2 or i == 5 else A)
    for x, y in ((24, 91), (66, 93), (73, 90)):
        art.path(f'M{x} {y}q-3 -2 -4 -4q3 1 4 3q1 -5 3 -5q-1 3 -1 4q3 -3 5 -2l-4 4', A, .59)
    return art


def evergreen(kind, variant):
    art = InkArt(72, 100, (.5, .92))
    x = 36 + (-3, 3, 0)[variant - 1]
    base = 87 if kind == 'redwood' else 81
    art.path(f'M32 91 Q35 72 {x-2} 55L{x+4} 55Q38 73 42 91L47 93L39 92L30 94L24 94Z', C, 0)
    art.path('M35 92Q38 86 37 75M40 92Q41 84 39 79', width=.75)
    for i in range(5 if kind == 'redwood' else 4):
        y = base - i * 12
        w = (20 if kind == 'redwood' else 27) * (1 - i * .14)
        h = (34 if kind == 'redwood' else 42) - i * 2.1
        art.path(f'M{x} {y-h:.2f}Q{x-w*.19:.2f} {y-h*.35:.2f} {x-w:.2f} {y-1}'
                 f'q{w*.14:.2f} 2 {w*.26:.2f} .5l{-w*.11:.2f} 3'
                 f'Q{x-w*.54:.2f} {y+4} {x-w*.27:.2f} {y+1}l{-w*.10:.2f} 3'
                 f'Q{x+w*.15:.2f} {y+3} {x+w*.30:.2f} {y}l{w*.09:.2f} 2'
                 f'Q{x+w*.61:.2f} {y+4} {x+w:.2f} {y-1}Q{x+w*.24:.2f} {y-h*.38:.2f} {x} {y-h:.2f}Z', B, .74)
        art.path(f'M{x} {y-h+3:.2f}Q{x-7} {y-h*.40:.2f} {x-w+3:.2f} {y-2}q7 -1 11 -6q-3 4 -1 5'
                 f'Q{x-2} {y-7} {x+2} {y-17}l-2 8Q{x+7} {y-14} {x} {y-h+3:.2f}Z', A, 0)
        art.path(f'M{x+w*.08:.2f} {y-12}q{w*.13:.2f} 5 {w*.31:.2f} 8M{x-w*.48:.2f} {y-4}q{w*.17:.2f} -2 {w*.22:.2f} -6', width=.55, opacity=.72)
    return art


def mountains(kind, variant, rng):
    height = 53 if kind == 'hill' else 91
    art = InkArt(128, height, (.5, .93))
    def peak(x, floor, w, h):
        top = x + rng.uniform(-.12, .1) * w
        crest = ((top, floor - h), (top - w*.19, floor - h*.71), (x - w*.34, floor - h*.40), (x - w*.5, floor - 1))
        right = ((top + w*.11, floor - h*.76), (x + w*.29, floor - h*.51), (x + w*.35, floor - h*.27), (x + w*.5, floor - 1))
        toe = ((x+w*.26, floor+1), (x+w*.08, floor-1), (x-w*.09, floor+2), (x-w*.29, floor+1))
        art.face((*reversed(crest), *right, *toe), A, .10)
        spine = ((top+w*.035, floor-h*.73), (top+w*.10, floor-h*.59), (top+w*.04, floor-h*.40), (x+w*.17, floor-3))
        art.face((crest[0], *right, *toe[:2], *reversed(spine)), B, -.19)
        art.path('M'+'L'.join(point(*p) for p in (crest[0], *spine[:-1], (spine[-1][0]-2, floor-9))), width=.86)
        for j in (1, 2):
            px, py = crest[j]
            art.path(f'M{px:.2f} {py:.2f}l{w*.055:.2f} {-h*.018:.2f}l{-w*.14:.2f} {h*.28:.2f}', width=.55, opacity=.77)
        if kind == 'peak':
            snow = (crest[0], right[0], (right[0][0]+w*.035, right[0][1]+h*.095), (top+w*.085, floor-h*.63),
                    (top+w*.015, floor-h*.74), (top-w*.10, floor-h*.57), crest[1])
            art.face(snow, C, .16)
            art.path('M'+'L'.join(point(*p) for p in (crest[0], spine[0], spine[1])), width=.63)
        elif kind == 'hill':
            art.path(f'M{x-w*.37:.2f} {floor-3}Q{x-w*.2:.2f} {floor-11} {x-w*.07:.2f} {floor-6}T{x+w*.37:.2f} {floor}', C, 0)
        art.hatch((crest[2], (x-w*.11,floor-h*.40), (x-w*.14,floor-7), (x-w*.36,floor-5)), 3.2, .33, .53)
    floor = height - 9
    peak((87, 34, 91)[variant-1], floor-4, 57, height*.62)
    peak((48, 69, 53)[variant-1], floor, 71, height*(.69 if kind == 'hill' else .83))
    peak((86, 31, 33)[variant-1], floor+4, 40, height*.35)
    return art


def illustrated(name):
    group, separator, index = name.rpartition('-')
    rng = Random(name)
    if separator and index.isdigit():
        n = int(index)
        if group == 'broadleaf':
            return broadleaf(n, rng)
        if group in ('pine', 'redwood'):
            return evergreen(group, n)
        if group in ('hill', 'mountain', 'peak'):
            return mountains(group, n, rng)
    art = sprite(name, InkArt)
    if name.startswith(('keep-', 'tower-', 'castle-', 'house-', 'townhouse-')):
        # Interior ink marks suggest masonry or beams while the ground-facing contour stays open.
        if name.startswith('keep-'):
            art.path('M27 70l3 1m4 12h4m-5 1v3m6-7h4m20 6l5-.4m4-3l6 .3m2 6h4m3-8l3-2m5 0l4-2M44 42l4 1m16 12l4-2m14 5l3-1', width=.72, opacity=.64)
            art.path('M47 94v-9q0-9 10-15q10 4 10 15v9M51 94v-9q0-6 6-10q6 4 6 10v9', width=.76, opacity=.79)
        elif 'castle-gate' == name:
            art.path('M37 91h5m-2-7h4m-8-3h3m-2-5h5m31 12h5m-2-5h3m-3-7h4M46 94V81q0-8 13-17q13 7 13 17v13', width=.75, opacity=.69)
        elif art.height < 95:
            x = art.width * .33
            y = art.height * .67
            art.path(f'M{x:.2f} {y:.2f}h5m-3 1.8v2m12 6h3m1 4.5h2m-18 1h3', width=.60, opacity=.65)
        else:
            art.path('M22 44h5m-2 1v2m7 7h4m-15 7h4m7 8h4m-10 6h3m3 5h4', width=.66, opacity=.62)
    return art


if __name__ == '__main__':
    folder = STYLES / 'storybook' / 'sprites'
    for path in sorted(folder.glob('*.svg')):
        path.write_text(illustrated(path.stem).svg(), encoding='utf-8', newline='\n')
