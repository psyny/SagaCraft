/**
 * Continuous surfaces (plan 32): a style's material worked out on the graphics card from each point's place on the
 * die (in the die's own frame, so it turns with it), instead of painted face by face into the atlas. Faces, edges and
 * corners show one unbroken material: gel, nebulae, metal finishes, weave, stone, amber, facets, a beetle's shell.
 *
 * The atlas still holds the numbers; `uInk` says where they are (green), a clear patch around them (red) and their
 * outline (blue), and numbers stay solid, matte and unbent. Every die (surface or not) gets the numbers' shader:
 * numbers catch no highlight, and an outline darkens what's under it by half (a darken filter, not a painted line).
 * Each kind gives GLSL for its relief (`height`, or `shape`: how the normal bends, in the die's frame) and its look
 * (`look`: colour, gloss, metal, glow, opacity), built on shared noise (`sNoise`, `sFbm`), cells (`sCells`, `sSparks`),
 * a colour ramp (`sRamp`, over `uC`) and a frame along the surface (`sFrame`, for weaves and brushing).
 */
import * as THREE from 'three'

export interface Surface {
  kind: SurfaceKind
  /** Colours the kind reads (uC[0..5]; missing ones repeat the last). */
  colors: string[]
  /** Numbers the kind reads (uP.xyzw). */
  params?: number[]
  /** See-through (the body's opacity; numbers stay solid). */
  alpha?: number
}

interface Kind {
  /** Helpers for the others. */
  lib?: string
  /** `float sHeight(vec3 p, vec3 n)`: a relief, turned into a bent normal (finite differences, `step` apart). */
  height?: string
  step?: number
  /** `vec3 sShape(vec3 p, vec3 n)`: the normal's bend directly (flat facets). */
  shape?: string
  /** `void sLook(vec3 p, vec3 n, float ndv, inout vec3 col, inout float rough, inout float metal, inout vec3 glow,
   *  inout float alpha)`: p the point (the die's circumradius is 1), n its normal, ndv how much it faces the eye. */
  look: string
}

const HEADER = /* glsl */ `
varying vec3 vSurfPos;
varying vec3 vSurfNormal;
varying vec3 vSurfUp;
uniform vec3 uC[6];
uniform vec4 uP;
uniform float uAlpha;
uniform vec3 uAxis;
uniform sampler2D uInk;
uniform mat3 normalMatrix;
uniform vec2 uPlainUv;
float sHalo; // around the numbers (0..1): kinds keep it clear (Hellish's cracks)
float sEdge; // 1 on the die's rounded edges and corners (and faces without a number): they all read the plain cell's centre
vec3 sUp; // the face's up (its number's top; blended over edges and corners): flames climb it
float sUpSure; // 1 on faces; less on edges and corners where the faces around point their ups different ways

vec3 sHash(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
float sCorner(vec3 i, vec3 f, vec3 o) { return dot(sHash(i + o) * 2.0 - 1.0, f - o); }
// Smooth gradient noise, about -0.7..0.7
float sNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sCorner(i, f, vec3(0.0, 0.0, 0.0)), sCorner(i, f, vec3(1.0, 0.0, 0.0)), u.x),
                 mix(sCorner(i, f, vec3(0.0, 1.0, 0.0)), sCorner(i, f, vec3(1.0, 1.0, 0.0)), u.x), u.y),
             mix(mix(sCorner(i, f, vec3(0.0, 0.0, 1.0)), sCorner(i, f, vec3(1.0, 0.0, 1.0)), u.x),
                 mix(sCorner(i, f, vec3(0.0, 1.0, 1.0)), sCorner(i, f, vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z);
}
// Octaves of noise, 0..1 (about 0.5)
float sFbm(vec3 p, int octaves) {
  float sum = 0.0, amp = 0.5, total = 0.0;
  for (int o = 0; o < 6; o++) {
    if (o >= octaves) break;
    sum += sNoise(p) * amp; total += amp; amp *= 0.5;
    p = p * 2.03 + vec3(3.1, 1.7, 5.3);
  }
  return clamp(0.5 + sum / total, 0.0, 1.0);
}
// Cells around scattered points: x the distance to the nearest, y to the second, zw random numbers of the nearest
// (named by id)
vec4 sCells(vec3 p, out vec3 id) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  id = i;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = o + sHash(i + o) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = i + o; } else if (d < d2) { d2 = d; }
  }
  vec3 h = sHash(id + 19.19);
  return vec4(sqrt(d1), sqrt(d2), h.x, h.y);
}
// Points of light (sparkles, stars, bubbles): share of the cells hold one, size its radius (in cells)
float sSparks(vec3 p, float share, float size) {
  vec3 id;
  vec4 c = sCells(p, id);
  float r = size * (0.35 + 0.65 * c.w);
  return step(1.0 - share, c.z) * smoothstep(r, r * 0.25, c.x);
}
// Along the colours uC[0..count-1]
vec3 sRamp(float t, int count) {
  t = clamp(t, 0.0, 1.0) * float(count - 1);
  int i = int(min(floor(t), float(count - 2)));
  return mix(uC[i], uC[i + 1], t - float(i));
}
// Two directions along the surface (weaves, brushing), turning around uAxis (a corner of the die): continuous over
// faces and edges
void sFrame(vec3 n, out vec3 t1, out vec3 t2) {
  vec3 c = cross(n, uAxis);
  t1 = c / max(length(c), 1e-4);
  t2 = cross(n, t1);
}
// Fades a pattern finer than a pixel (it would shimmer): x the pattern's coordinate
float sFine(float x) { return 1.0 - smoothstep(0.35, 0.9, fwidth(x)); }
// The bend of a relief worked out once per point, from how it changes across the screen (cheap; for costly reliefs)
vec3 sBendOnScreen(vec3 p, vec3 n, float h) {
  vec3 dpdx = dFdx(p), dpdy = dFdy(p);
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  if (abs(det) < 1e-9) return vec3(0.0);
  return -(r1 * dFdx(h) + r2 * dFdy(h)) / det;
}
`

const bendOf = (step: number) => /* glsl */ `
vec3 sShape(vec3 p, vec3 n) {
  float h = sHeight(p, n), e = ${step.toFixed(4)};
  vec3 g = vec3(sHeight(p + vec3(e, 0.0, 0.0), n) - h, sHeight(p + vec3(0.0, e, 0.0), n) - h, sHeight(p + vec3(0.0, 0.0, e), n) - h) / e;
  return -(g - dot(g, n) * n);
}`

/** Before the lighting: the surface replaces the colour, gloss, metal, glow, opacity and normal, but on the numbers. */
const APPLY = /* glsl */ `
{
  vec3 sp = vSurfPos, sn = normalize(vSurfNormal);
  vec4 inkTex = texture2D(uInk, vMapUv);
  float ink = inkTex.g;
  sHalo = inkTex.r;
  sEdge = 1.0 - step(1e-4, distance(vMapUv, uPlainUv));
  sUp = normalize(vSurfUp);
  sUpSure = smoothstep(0.3, 0.9, length(vSurfUp));
  vec3 bend = sShape(sp, sn) * (1.0 - ink);
  if (dot(bend, bend) > 0.0) {
    vec3 b = normalMatrix * bend;
    b -= dot(b, normal) * normal;
    float bl = length(b);
    if (bl > 0.8) b *= 0.8 / bl;
    normal = normalize(normal + b);
  }
  float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  vec3 col = uC[0], glow = vec3(0.0);
  float rough = roughnessFactor, metal = metalnessFactor, alpha = uAlpha;
  sLook(sp, sn, ndv, col, rough, metal, glow, alpha);
  diffuseColor.rgb = mix(col, diffuseColor.rgb, ink);
  diffuseColor.a = mix(alpha, 1.0, ink);
  roughnessFactor = mix(rough, 1.0, ink);
  metalnessFactor = mix(metal, 0.0, ink);
  totalEmissiveRadiance += glow * (1.0 - ink);
}
`

const KINDS = {
  // A gel: smoky shades (uC 0..3), glowing sparkles (uC 4); uP.x how big the smoke is
  jelly: {
    look: `
      float t = sFbm(p * uP.x + sNoise(p * 3.2) * 0.6, 5);
      col = sRamp(t * 1.4 - 0.2, 4);
      float s = sSparks(p * 16.0, 0.35, 0.22);
      col = mix(col, uC[4], s);
      glow = uC[4] * s;`,
  },
  // Deep space: nebulae (uC 0..4), small stars and a few bright ones with a halo
  cosmic: {
    look: `
      float t = sFbm(p * uP.x + sNoise(p * 3.2) * 0.6, 5);
      col = sRamp(t * 1.4 - 0.2, 5);
      vec3 id;
      vec4 c = sCells(p * 30.0, id);
      float small = step(0.7, c.z) * smoothstep(0.2 * (0.4 + 0.6 * c.w), 0.03, c.x) * (0.35 + 0.65 * c.w);
      c = sCells(p * 7.0 + 11.0, id);
      float big = step(0.86, c.z);
      float star = max(small, big * smoothstep(0.1, 0.02, c.x));
      float halo = big * exp(-c.x * c.x * 70.0) * 0.45;
      col = mix(col, vec3(1.0), clamp(star + halo, 0.0, 1.0));
      glow = vec3(1.0) * (star + halo);`,
  },
  // Charoite: swirling, silky fibres of the colour (uC 0..2 deep to light), white (uC 3) and black (uC 4) streaks
  charoite: {
    look: `
      vec3 w = vec3(sFbm(p * 1.3, 4), sFbm(p * 1.3 + 5.2, 4), sFbm(p * 1.3 + 9.7, 4)) - 0.5;
      vec3 q = p * 1.8 + w * 3.4;
      float big = sFbm(q, 4);
      float fib = 0.5 + 0.5 * sin(dot(q, vec3(1.0, 0.6, 0.3)) * 44.0 + sNoise(q * 3.0) * 2.5);
      fib = mix(0.5, fib, sFine(dot(q, vec3(1.0, 0.6, 0.3)) * 7.0));
      col = sRamp(big * 1.6 - 0.3, 3) * (0.62 + 0.6 * fib);
      float white = smoothstep(0.6, 0.72, sFbm(q * 1.4 + 3.0, 4));
      col = mix(col, uC[3], white * (0.5 + 0.5 * fib));
      float black = smoothstep(0.7, 0.78, sFbm(q * 2.6 + 11.0, 3));
      col = mix(col, uC[4], black * 0.85);
      col *= 1.0 + 0.6 * pow(1.0 - ndv, 2.0) * fib; // chatoyant: the fibres shine as the stone turns`,
  },
  // Amber: low-contrast flows (uC 0..2), a few tiny bubbles (uC 3), a warm light inside
  amber: {
    look: `
      float t = sFbm(p * 1.4 + sNoise(p * 2.6) * 0.5, 4);
      vec3 tone = sRamp(t * 1.5 - 0.25, 3);
      col = tone * mix(0.45, 0.9, ndv);
      float b = sSparks(p * 12.0, 0.12, 0.25);
      col = mix(col, uC[3], b * 0.6);
      glow = tone * (0.08 + 0.4 * ndv * ndv) + uC[3] * b * 0.25; // light through it: most where it faces the eye
      alpha = mix(0.95, alpha, ndv);
      alpha = mix(alpha, 0.95, b);`,
  },
  // A cut stone: flat facets around the die's centre (uP.x of them, spread evenly over a sphere: straight edges),
  // each tilted out its own way; facets turned to the eye flash (uC 1). No lines between facets: only the light tells
  // them apart
  crystal: {
    lib: `
      vec3 sFacet; // the facet's direction
      void sFacets(vec3 p) {
        vec3 d = normalize(p);
        float n = uP.x, best = -2.0;
        vec2 turn = vec2(cos(2.39996), sin(2.39996)), r = vec2(1.0, 0.0);
        sFacet = vec3(0.0, 1.0, 0.0);
        for (int i = 0; i < 400; i++) {
          if (float(i) >= n) break;
          float y = 1.0 - 2.0 * (float(i) + 0.5) / n, s = sqrt(1.0 - y * y);
          vec3 dir = vec3(r.x * s, y, r.y * s);
          float k = dot(d, dir);
          if (k > best) { best = k; sFacet = dir; }
          r = vec2(r.x * turn.x - r.y * turn.y, r.x * turn.y + r.y * turn.x);
        }
      }`,
    shape: `
      if (sEdge > 0.5) return vec3(0.0); // the edges: smooth, so they draw the die's shape
      sFacets(p);
      vec3 twist = sHash(sFacet * 31.0) * 2.0 - 1.0;
      return (sFacet - n) * 1.6 + twist * 0.12;`,
    look: `
      if (sEdge > 0.5) {
        // The edges: polished, a mirror tinted a little lighter, almost solid: they outline the die (halfway between the
        // faces and a full mirror)
        col = mix(uC[0], uC[1], 0.2);
        rough = 0.025;
        metal = 0.85;
        alpha = 0.9;
        return;
      }
      col = uC[0] * (0.92 + 0.16 * sHash(sFacet * 17.0).x);
      float flash = pow(ndv, 30.0);
      glow = uC[1] * flash * 0.8 + uC[0] * 0.04;
      alpha = mix(alpha, 1.0, flash);`,
  },
  // A beetle's shell: the colour (uC 0) turning to other hues (uC 1, 2) as the surface turns away; fine pits
  iridescent: {
    height: `
      vec3 id;
      vec4 c = sCells(p * 48.0, id);
      float fine = 1.0 - smoothstep(0.35, 0.9, length(fwidth(p * 48.0))); // gone when finer than a pixel
      return c.x * c.x * 0.0004 * fine;`,
    step: 0.002,
    look: `
      float t = 1.0 - ndv * ndv;
      col = t < 0.5 ? mix(uC[0], uC[1], t * 2.0) : mix(uC[1], uC[2], t * 2.0 - 1.0);
      // Sparkles (in most cells), each turning through the hues faster than the shell, from its own start
      vec3 id;
      vec4 c = sCells(p * 15.0, id);
      float r = 0.26 * (0.35 + 0.65 * c.w);
      float s = step(0.2, c.z) * smoothstep(r, r * 0.25, c.x);
      float ts = 1.0 - abs(fract((1.0 - ndv) * 1.7 + c.z * 2.0) * 2.0 - 1.0);
      vec3 hue = ts < 0.5 ? mix(uC[0], uC[1], ts * 2.0) : mix(uC[1], uC[2], ts * 2.0 - 1.0);
      vec3 spark = mix(hue, vec3(1.0), 0.45);
      col = mix(col, spark, s);
      metal = mix(metal, 0.0, s);
      glow = spark * s * 1.3;`,
  },
  // Hellish: very dark purple marble (uC 0..2) cracked with veins glowing in the colour (uC 3, their core uC 4);
  // no cracks around the numbers (sHalo)
  hellish: {
    lib: `
      // Cracks: marble veins (bands warped by noise), jagged; near: the glow spreading around them
      float sCracks(vec3 p, out float near) {
        float t = sFbm(p * 2.2, 5) * 7.0 + sNoise(p * 18.0) * 0.3;
        float along = dot(p, vec3(0.78, 0.35, 0.52)) * 5.0;
        float d = abs(sin(along + t)), d2 = abs(sin(along * 1.7 + t * 1.3 + 2.0));
        near = max(smoothstep(0.4, 0.0, d), smoothstep(0.25, 0.0, d2) * 0.7) * (1.0 - sHalo);
        return max(smoothstep(0.08, 0.0, d), smoothstep(0.045, 0.0, d2) * 0.85) * (1.0 - sHalo);
      }`,
    height: `float near; return -sCracks(p, near) * 0.004;`,
    step: 0.002,
    look: `
      float near;
      float c = sCracks(p, near);
      col = sRamp(sFbm(p * 1.6 + 3.0, 4) * 1.4 - 0.2, 3);
      col = mix(col, uC[4], c);
      glow = uC[3] * (c * 1.6 + near * near * 0.35);
      rough = mix(rough, 0.6, c);`,
  },
  // Fire: a charred body (uC 0) with tongues of flame climbing each face towards its number's top (so a result's flames
  // rise up the screen), in the colour (uC 1) turning hotter (uC 2) to white-hot cores (uC 3); embers glowing in the
  // char; the flames leave the numbers a clear patch (sHalo). Still: fixed to the die
  fire: {
    look: `
      float along = dot(p, sUp);
      vec3 side = p - sUp * along;
      // Stretched up into tongues (rounder where the faces around disagree on up: no streaks on edges)
      vec3 q = side * mix(3.2, 4.2, sUpSure) + sUp * along * mix(3.2, 0.9, sUpSure);
      q += vec3(sNoise(q * 0.9 + 3.1), sNoise(q * 0.9 + 8.7), sNoise(q * 0.9 + 1.9)) * 0.7;
      // Each face burns from its bottom edge up towards its number's top (along is 0 at a face's middle): thick at the
      // bottom, tongues licking up, thinning out to tips
      float body = sFbm(q, 4) - along * 0.36 * sUpSure;
      float keep = 1.0 - sHalo;
      float flame = smoothstep(0.5, 0.74, body) * keep;
      float core = smoothstep(0.72, 0.95, body) * keep;
      float tip = smoothstep(0.5, 0.58, body) * (1.0 - smoothstep(0.58, 0.7, body)) * keep; // the flames' outer licks
      vec3 char = uC[0] * (0.7 + 0.5 * sFbm(p * 6.0, 3));
      vec3 hot = core > 0.0 ? mix(uC[2], uC[3], core) : uC[1];
      vec3 fl = mix(uC[1], hot, smoothstep(0.55, 0.8, body));
      float ember = sSparks(p * 22.0, 0.25, 0.25) * (0.4 + 0.6 * sNoise(p * 3.0)) * (1.0 - flame);
      col = mix(char, fl, flame);
      glow = fl * (flame * 1.0 + tip * 0.4) + uC[1] * max(ember, 0.0) * 0.8;
      rough = mix(0.85, 0.6, flame);`,
  },
  // Orcish: a mottled, scratched hide of the colour (uC 0), stained with old dried splatter (uC 2) and splashed with
  // fresh, wet liquid (uC 1): glossy, raised, darker at its rim, drips running down (the die's -y), droplets around
  orcish: {
    lib: `
      vec4 sWet; // fresh: x the splash, y its middle; z the old stain
      // Splashes, placed by direction from the die's centre (so each lands on the surface, whatever the shape): a
      // blob with spikes flung out, a drip running down from most (towards the die's -y); x the splash, y its middle
      vec2 sSplat(vec3 p, int count, float seed, float size) {
        vec3 a = normalize(p);
        vec2 m = vec2(0.0);
        for (int k = 0; k < 12; k++) {
          if (k >= count) break;
          vec3 h = sHash(vec3(float(k) * 7.31 + seed, seed * 1.7 + 0.5, 3.3));
          vec3 h2 = sHash(vec3(float(k) * 3.17 + seed, 9.1, seed + 0.7));
          vec3 cd = normalize(h * 2.0 - 1.0 + 1e-3);
          vec3 down = vec3(0.0, -1.0, 0.0) + cd * cd.y;
          down = length(down) > 1e-3 ? normalize(down) : vec3(1.0, 0.0, 0.0);
          vec3 right = cross(cd, down);
          vec2 uv = vec2(dot(a - cd, right), dot(a - cd, down));
          if (dot(a, cd) < 0.0) continue;
          float dist = length(uv);
          vec2 dir = uv / max(dist, 1e-4);
          float spikes = pow(max(0.0, sNoise(vec3(dir * 3.0, h2.x * 17.0))), 1.5) * 2.6 + sNoise(vec3(dir * 7.0, h2.y * 5.0)) * 0.15;
          float r = (0.12 + 0.1 * h2.x) * size * (1.0 + spikes);
          m.x = max(m.x, smoothstep(r, r * 0.88, dist));
          m.y = max(m.y, smoothstep(r * 0.7, r * 0.3, dist));
          if (h2.y > 0.3) {
            float len = (0.25 + 0.35 * h2.z) * size, w = (0.018 + 0.012 * h2.x) * size;
            float drip = step(0.0, uv.y) * smoothstep(len, len - 0.05, uv.y) * smoothstep(w, w * 0.6, abs(uv.x));
            float drop = smoothstep(w * 1.8, w * 1.35, length(vec2(uv.x, uv.y - len)));
            m.x = max(m.x, max(drip, drop));
            m.y = max(m.y, max(drip * 0.6, drop));
          }
        }
        return m;
      }
      // Gouges: short straight hacks in some cells
      float sGouges(vec3 p) {
        vec3 q = p * 3.5;
        vec3 i = floor(q), f = fract(q);
        float g = 0.0;
        for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec3 o = vec3(float(x), float(y), float(z));
          vec3 h = sHash(i + o + 41.0);
          if (h.x > 0.35) continue;
          vec3 c = o + h - f;
          vec3 dir = normalize(sHash(i + o + 7.0) * 2.0 - 1.0);
          float along = clamp(dot(-c, dir), -0.35, 0.35);
          g = max(g, smoothstep(0.035, 0.0, length(-c - dir * along)));
        }
        return g;
      }`,
    shape: `
      vec2 fresh = sSplat(p, 8, 0.0, 1.0);
      float drops = sSparks(p * 9.0, 0.3, 0.32) * step(0.4, sFbm(p * 1.7 + 4.0, 2));
      fresh.x = max(fresh.x, drops);
      fresh.y = max(fresh.y, drops);
      vec2 old = sSplat(p, 6, 9.0, 1.4);
      sWet = vec4(fresh, old.x, 0.0);
      return sBendOnScreen(p, n, fresh.y * 0.01); // the middle bulges (a soft rise: a hard edge would glint pixel by pixel)`,
    look: `
      float mottle = sFbm(p * 3.0, 4);
      vec3 hide = uC[0] * (0.7 + 0.45 * mottle);
      hide *= 1.0 - 0.5 * sGouges(p);
      col = mix(hide, uC[2] * (0.8 + 0.3 * mottle), sWet.z * 0.85);
      rough = mix(0.92, 0.7, sWet.z);
      vec3 wet = mix(uC[1] * 0.45, uC[1], sWet.y); // darker at the rim, where it's thin
      col = mix(col, wet, sWet.x);
      rough = mix(rough, 0.06, sWet.x);`,
  },
  // Metals in the colour (uC 0)
  metal_matte: {
    look: `
      col = uC[0] * (0.95 + 0.1 * sFbm(p * 14.0, 2));
      rough = 0.58 + 0.12 * sFbm(p * 9.0 + 4.0, 2);`,
  },
  metal_satin: {
    look: `
      col = uC[0] * (0.98 + 0.04 * sFbm(p * 5.0, 3));
      rough = 0.32 + 0.05 * sFbm(p * 4.0 + 2.0, 3);`,
  },
  metal_polished: {
    look: `rough = 0.09;`,
  },
  metal_hammered: {
    height: `
      vec3 id;
      vec4 c = sCells(p * 4.2, id);
      return c.x * c.x * 0.03;`,
    step: 0.002,
    look: `
      vec3 id;
      vec4 c = sCells(p * 4.2, id);
      col = uC[0] * (0.88 + 0.16 * (1.0 - c.x) + 0.05 * c.z);
      rough = 0.16 + 0.16 * smoothstep(0.3, 0.9, c.x);`,
  },
  metal_brushed: {
    lib: `
      // Streaks along the frame's first direction: fine ones (faded when finer than a pixel) and broader ones
      float sStreaks(vec3 p, vec3 n) {
        vec3 t1, t2;
        sFrame(n, t1, t2);
        float a = dot(p, t1), b = dot(p, t2);
        return sNoise(vec3(b * 70.0, a * 2.0, 0.0)) * 0.6 * sFine(b * 70.0) + sNoise(vec3(b * 24.0, a * 1.2, 5.0)) * 0.4;
      }`,
    height: `return sStreaks(p, n) * 0.002;`,
    step: 0.0015,
    look: `
      float line = 0.5 + sStreaks(p, n);
      col = uC[0] * (0.84 + 0.22 * line);
      rough = 0.18 + 0.18 * line;`,
  },
  // Rust (uC 1..3, dark to light) eating the metal (uC 0): raised, rough, not metal; the metal pitted around it
  metal_rusted: {
    lib: `
      float sRust(vec3 p) { return smoothstep(0.5, 0.6, sFbm(p * 2.4, 5) + 0.12 * sNoise(p * 16.0)); }`,
    height: `
      float m = sRust(p);
      return m * (0.008 + 0.01 * sFbm(p * 20.0, 3)) - (1.0 - m) * 0.002 * sFbm(p * 30.0, 2);`,
    step: 0.002,
    look: `
      float m = sRust(p);
      float near = smoothstep(0.36, 0.5, sFbm(p * 2.4, 5));
      float r = sFbm(p * 8.0 + 2.0, 4);
      vec3 rust = r < 0.5 ? mix(uC[1], uC[2], r * 2.0) : mix(uC[2], uC[3], r * 2.0 - 1.0);
      col = mix(uC[0] * (1.0 - 0.35 * near), rust, m);
      rough = mix(0.3 + 0.25 * near, 0.95, m);
      metal = 1.0 - m;`,
  },
  // Carbon fiber: a 2x2 twill of tows in the colour (uP.x tows across the die's radius), each a rounded ridge diving
  // under the next; tows lit by how they lie to the light
  carbon: {
    lib: `
      float sWeave(vec3 p, vec3 n, out float warp) {
        vec3 t1, t2;
        sFrame(n, t1, t2);
        vec2 uv = vec2(dot(p, t1), dot(p, t2)) * uP.x;
        vec2 cell = floor(uv), f = fract(uv);
        float k = mod(cell.x + cell.y, 4.0);
        warp = k < 2.0 ? 1.0 : 0.0;
        float across = warp > 0.5 ? f.x : f.y;
        float along = (mod(k, 2.0) + (warp > 0.5 ? f.y : f.x)) * 0.5;
        float ridge = sqrt(max(0.0, 1.0 - pow(2.0 * across - 1.0, 2.0)));
        float ends = smoothstep(0.0, 0.25, along) * smoothstep(1.0, 0.75, along);
        return ridge * (0.5 + 0.5 * ends);
      }`,
    height: `float w; return sWeave(p, n, w) * 0.01;`,
    step: 0.002,
    look: `
      float w;
      float h = sWeave(p, n, w);
      vec3 t1, t2;
      sFrame(n, t1, t2);
      vec3 d = normalize(normalMatrix * (w > 0.5 ? t2 : t1));
      float sheen = abs(d.x * 0.6 + d.y * 0.8);
      col = uC[0] * (0.25 + 0.6 * sheen) * (0.3 + 0.7 * h) * (w > 0.5 ? 1.0 : 0.75);`,
  },
} satisfies Record<string, Kind>

export type SurfaceKind = keyof typeof KINDS
export const SURFACE_KINDS = Object.keys(KINDS) as SurfaceKind[]

/** The GLSL a kind adds to the fragment shader (before main) and where it applies it. */
export function surfaceChunks(kind: SurfaceKind): { pars: string; apply: string } {
  const k: Kind = KINDS[kind]
  const parts = [HEADER, k.lib ?? '']
  if (k.height) parts.push(`float sHeight(vec3 p, vec3 n) {${k.height}\n}`, bendOf(k.step ?? 0.003))
  else parts.push(`vec3 sShape(vec3 p, vec3 n) {${k.shape ?? 'return vec3(0.0);'}\n}`)
  parts.push(`void sLook(vec3 p, vec3 n, float ndv, inout vec3 col, inout float rough, inout float metal, inout vec3 glow, inout float alpha) {${k.look}\n}`)
  return { pars: parts.join('\n'), apply: APPLY }
}

/** After the material's lighting set-up: the numbers get no specular (no highlight from the lights or the room). */
const NUMBERS = /* glsl */ `
{
  float numberMask = texture2D(uInk, vMapUv).g;
  material.specularColor *= 1.0 - numberMask;
  material.specularF90 *= 1.0 - numberMask;
}
`

/** At the very end (all light added up): an outline darkens what's under it by half. */
const OUTLINE = /* glsl */ `
{
  vec4 outlineTex = texture2D(uInk, vMapUv);
  outgoingLight *= 1.0 - 0.5 * outlineTex.b * (1.0 - outlineTex.g);
}
`

/** A die's shader: numbers out of every highlight (`ink`: the numbers' mask, white on black; red around them) and, for
 *  a continuous style, its surface (`axis`: a corner's direction, where the surface's frame turns). */
export function applyDieShader(material: THREE.MeshPhysicalMaterial, ink: THREE.Texture, surface: Surface | undefined, axis: THREE.Vector3,
  plainUv = new THREE.Vector2(-1, -1)) {
  const uniforms: Record<string, THREE.IUniform> = { uInk: { value: ink }, uPlainUv: { value: plainUv } }
  if (surface) {
    const p = surface.params ?? []
    Object.assign(uniforms, {
      uC: { value: Array.from({ length: 6 }, (_, i) => new THREE.Color(surface.colors[Math.min(i, surface.colors.length - 1)])) },
      uP: { value: new THREE.Vector4(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0) },
      uAlpha: { value: surface.alpha ?? 1 },
      uAxis: { value: axis },
    })
  }
  const chunks = surface ? surfaceChunks(surface.kind) : { pars: 'uniform sampler2D uInk;', apply: '' }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    if (surface) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 surfUp;\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNormal;\nvarying vec3 vSurfUp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfPos = position;\nvSurfNormal = objectNormal;\nvSurfUp = surfUp;')
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${chunks.pars}`)
      .replace('#include <lights_physical_fragment>', `${chunks.apply}\n#include <lights_physical_fragment>\n${NUMBERS}`)
      .replace('#include <opaque_fragment>', `${OUTLINE}\n#include <opaque_fragment>`)
  }
  // One program per kind (the colours are uniforms), not one shared by every kind
  material.customProgramCacheKey = () => `die-${surface?.kind ?? 'painted'}`
  if (surface?.alpha !== undefined && surface.alpha < 1) material.transparent = true
}
