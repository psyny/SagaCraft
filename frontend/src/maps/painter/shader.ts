/**
 * The map painter's ground pass (plans 47, 48): the terrain (grounds and water), the routes (roads and rivers) and the
 * walls of walled scenery, for the part of the map in view, into a texture the map shader puts under the pictures.
 * Scenery and features are sprites drawn over it (painter/sprites.ts). What each type looks like is data: the style's
 * JSON picks and tunes the patterns and looks below, through the palette texture (painter/data.ts, `encodeArt`).
 *
 * Perspective (plan 51): the map is seen tilted like its standing things (trees, mountains, buildings: drawn from the
 * front, a little from above), so what lies on the ground is foreshortened: its height on the screen is FORE times its
 * width. Lying patterns, the grounds' patches, region borders and water are worked out in ground space (y / FORE);
 * standing marks (grass strokes, reeds, tufts) stay upright; stones show their near side in shade; roads and rivers
 * are thinner where they run across the screen; the far bank of rivers and shores (facing us) shows.
 *
 * Per pixel: the 3 × 3 tiles around the pixel's tile are read once (terrain, random byte) into globals.
 * Terrain borders are one system for every pair: the point is wobbled by noise and the nearest tile centre wins (the
 * Voronoi of the centres is the grid itself, square or hex); near the border with the nearest tile of another terrain
 * the two blend in a dithered band. Water against land is a sharp shore in the water's shoreline colour.
 *
 * Built for Direct3D's compiler (Windows browsers: ANGLE to HLSL, then FXC), which inlines every call and unrolls every
 * loop that reads no texture: big code is here once, in loops that read a texture (ANGLE keeps those as loops): the
 * two regions' grounds (one loop), a ground's two patterns (one loop), the routes (a loop over the 3 × 3 tiles). Texture
 * reads stay at most one call deep (deeper ones overflowed Direct3D's translator, see maps/shader.ts). `make gpu-check`
 * reports the build's time.
 */

export const PAINT_VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

/** Shared GLSL: noise, the grid, signed distances. */
export const COMMON = `
const float SQRT3 = 1.7320508;
uniform float uGridType;  // 1 square, 2 hex
uniform float uSize;      // tile size, map px
uniform vec2 uOrigin;
uniform float uStyle;     // the style (built as a constant: see painter/renderer.ts)
uniform float uTime;      // seconds (0: still)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + vec2(19.19, 7.31))); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Simplex noise (2D), about -1..1: smooth, no grid shows (lakes' surfaces: it read more like water than Perlin noise)
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865, 0.366025404, -0.577350269, 0.024390244);
  vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec2 x1 = x0 + C.xx - i1; vec2 x2 = x0 + C.zz;
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
  m = m * m; m = m * m;
  float a0 = hash(i) * 6.2831853; float a1 = hash(i + i1) * 6.2831853; float a2 = hash(i + 1.0) * 6.2831853;
  vec3 g = vec3(dot(vec2(cos(a0), sin(a0)), x0), dot(vec2(cos(a1), sin(a1)), x1), dot(vec2(cos(a2), sin(a2)), x2));
  return 70.0 * dot(m, g);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return v;
}
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a; vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h);
}
// The distance to a quadratic Bezier curve from A to C pulled toward B, and where along it the nearest point is (0..1)
// (Inigo Quilez's closed form; a straight one is a segment)
vec2 sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C) {
  vec2 a = B - A; vec2 b = A - 2.0 * B + C; vec2 c = a * 2.0; vec2 d = A - pos;
  if (dot(b, b) < 1.0e-4 * max(dot(a, a), 1.0e-6)) {
    vec2 ac = C - A;
    float h = clamp(dot(pos - A, ac) / max(dot(ac, ac), 0.0001), 0.0, 1.0);
    return vec2(length(pos - A - ac * h), h);
  }
  float kk = 1.0 / dot(b, b);
  float kx = kk * dot(a, b);
  float ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0;
  float kz = kk * dot(d, a);
  float pp = ky - kx * kx;
  float q = kx * (2.0 * kx * kx - 3.0 * ky) + kz;
  float h = q * q + 4.0 * pp * pp * pp;
  float res; float tt;
  if (h >= 0.0) {
    h = sqrt(h);
    vec2 x = (vec2(h, -h) - q) / 2.0;
    vec2 uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0));
    tt = clamp(uv.x + uv.y - kx, 0.0, 1.0);
    vec2 qq = d + (c + b * tt) * tt;
    res = dot(qq, qq);
  } else {
    float z = sqrt(-pp);
    float v = acos(clamp(q / (pp * z * 2.0), -1.0, 1.0)) / 3.0;
    float m = cos(v); float n = sin(v) * 1.732050808;
    vec2 t2 = clamp(vec2(m + m, -n - m) * z - kx, 0.0, 1.0);
    vec2 q1 = d + (c + b * t2.x) * t2.x; float d1 = dot(q1, q1);
    vec2 q2 = d + (c + b * t2.y) * t2.y; float d2 = dot(q2, q2);
    if (d1 < d2) { res = d1; tt = t2.x; } else { res = d2; tt = t2.y; }
  }
  return vec2(sqrt(res), tt);
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
vec2 centerOf(vec2 t) {
  if (uGridType < 1.5) return uOrigin + (t + 0.5) * uSize;
  float R = uSize / SQRT3;
  return uOrigin + vec2(uSize * (t.x + 0.5 + 0.5 * mod(t.y, 2.0)), R + t.y * 1.5 * R);
}
vec2 tileOf(vec2 p) {
  if (uGridType < 1.5) return floor((p - uOrigin) / uSize);
  float R = uSize / SQRT3;
  vec2 rel = p - uOrigin - vec2(uSize * 0.5, R);
  float q = (SQRT3 / 3.0 * rel.x - rel.y / 3.0) / R;
  float r = (2.0 / 3.0 * rel.y) / R;
  float x = q; float z = r; float y = -x - z;
  float rx = floor(x + 0.5); float ry = floor(y + 0.5); float rz = floor(z + 0.5);
  float dx = abs(rx - x); float dy = abs(ry - y); float dz = abs(rz - z);
  if (dx > dy && dx > dz) { rx = -ry - rz; } else if (dy <= dz) { rz = -rx - ry; }
  return vec2(rx + (rz - mod(rz, 2.0)) / 2.0, rz);
}
// Ink: dark, a little warm
const vec3 INK = vec3(0.12, 0.10, 0.09);
// The ground's foreshortening (see the top): a height on the ground is this much of a width on the screen
const float FORE = 0.62;
`

export const PAINT_FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform vec4 uView;       // the part of the map the canvas covers (map px)
uniform vec2 uCount;      // columns, rows
uniform sampler2D uTiles; // per tile: terrain, roads, rivers, river out
uniform sampler2D uKinds; // per tile: road kind, river kind, a random byte, where its river falls (directions)
uniform sampler2D uPalette;
uniform vec3 uBackground;
uniform vec3 uTint;       // the hour's light (1, 1, 1 at noon: painter/daylight.ts)
uniform float uNight;     // 0 by day .. 1 at night: the night's lights
uniform vec2 uWind;       // where the wind blows (map px direction, its length its strength: the weather's)
${COMMON}
const float ROWS = 8.0;   // the palette texture's rows (painter/data.ts)

// The 3 x 3 tiles around the pixel's tile, read once in main
vec2 gT0;
float gTer[9]; float gRnd[9];
float gPx; // one canvas pixel, in map px (anti-aliasing, ink)
float gStars; // stars mirrored on the water here (lit after the night's grading)
vec3 gEmit;   // light of its own (lava): added after the night's grading, never dimmed
vec2 gShore;  // from the region here toward the nearest other one (shores: which way the land lies)
float gWeight; // how much of the region being drawn shows here (its light counts as much)

vec2 offsetOf(int k) { return vec2(float(k - (k / 3) * 3) - 1.0, float(k / 3) - 1.0); }
float row(float r) { return (r + 0.5) / ROWS; }

// Region borders wobble: two octaves of noise, about a third of a tile (on the ground: foreshortened)
vec2 warp(vec2 p) {
  vec2 g = vec2(p.x, p.y / FORE);
  vec2 a = g / (uSize * 0.6);
  vec2 b = g / (uSize * 0.17);
  vec2 o = (vec2(noise(a), noise(a + 7.7)) - 0.5) * uSize * 0.5 + (vec2(noise(b + 3.1), noise(b + 9.3)) - 0.5) * uSize * 0.16;
  return vec2(o.x, o.y * FORE);
}

// The terrain region at a point: x the nearest centre's terrain, y the nearest other terrain, z the distance to the
// border between them (map px, positive inside x), w the nearest centre's random byte
vec4 regionAt(vec2 q) {
  vec2 w = q + warp(q);
  float dA = 1.0e9; float idA = 0.0; vec2 cA = vec2(0.0); float rA = 0.0;
  for (int k = 0; k < 9; k++) {
    vec2 c = centerOf(gT0 + offsetOf(k));
    float d = distance(w, c);
    if (d < dA) { dA = d; idA = max(gTer[k], 0.0); cA = c; rA = gRnd[k]; }
  }
  float dB = 1.0e9; float idB = idA; vec2 cB = cA;
  for (int k = 0; k < 9; k++) {
    vec2 c = centerOf(gT0 + offsetOf(k));
    float d = distance(w, c);
    float id = max(gTer[k], 0.0);
    if (id != idA && d < dB) { dB = d; idB = id; cB = c; }
  }
  float e = dB > 1.0e8 ? 1.0e6 : (dB * dB - dA * dA) / (2.0 * max(length(cB - cA), 0.001));
  gShore = normalize(cB - cA + vec2(0.0001, 0.0));
  return vec4(idA, idB, e, rA);
}

float inkLine(float d, float w) { return 1.0 - smoothstep(w - gPx * 0.6, w + gPx * 0.6, abs(d)); }
float fill(float d) { return 1.0 - smoothstep(-gPx * 0.6, gPx * 0.6, d); }

// -- ground patterns (the style's JSON: kind, colour, scale in tiles, density, size, strength) ------------------------
// 1 strokes, 2 stipple, 3 cracks, 4 flecks, 5 drifts, 6 sparkle, 7 puddles, 8 reeds, 9 fields, 10 tufts, 11 dunes,
// 12 cobbles, 13 tiles, 14 bricks, 15 lava (cracks glowing with lava), 16 ice (hairline cracks, a sheen)
vec3 pattern(float kind, vec2 p, vec3 col, vec3 c, vec3 A, vec3 B, vec3 C, float scale, float density, float size, float strength) {
  float s = uSize;
  // what lies on the ground is foreshortened; standing marks (strokes, reeds, tufts) stand upright
  if (!(kind < 1.5 || (kind > 7.5 && kind < 8.5) || (kind > 9.5 && kind < 10.5))) p.y /= FORE;
  float cs = max(scale, 0.02) * s;                 // a cell, map px
  vec2 cell = floor(p / cs); vec2 f = fract(p / cs); vec2 j = hash2(cell + kind * 7.31);
  if (kind < 1.5) {                                 // strokes: short V strokes
    if (j.x < density) {
      vec2 q = (f - 0.3 - j * 0.4) * cs; float h = size * cs;
      float d = min(sdSegment(q, vec2(-0.86, 0.0) * h, vec2(0.0, -1.0) * h), sdSegment(q, vec2(0.0, -1.0) * h, vec2(0.86, 0.0) * h));
      col = mix(col, c, inkLine(d, s * 0.006) * strength);
    }
  } else if (kind < 2.5) {                          // stipple: dots
    if (j.y < density) col = mix(col, c, fill(length(p - (cell + 0.2 + 0.6 * j) * cs) - size * cs) * strength);
  } else if (kind < 4.5 || (kind > 11.5 && kind < 12.5) || kind > 14.5) {   // cracks (3), flecks (4), cobbles (12), lava (15), ice (16): cells
    vec2 g = p / cs + (vec2(noise(p / (cs * 0.7)), noise(p / (cs * 0.7) + 3.3)) - 0.5) * (kind > 11.5 ? 0.15 : 0.4);
    vec2 gi = floor(g); float d1 = 9.0; float d2 = 9.0; vec2 n1 = vec2(0.0); vec2 n2 = vec2(0.0); vec2 v1 = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)); vec2 q = o + hash2(gi + o) - fract(g);
      float d = dot(q, q);
      if (d < d1) { d2 = d1; n2 = n1; d1 = d; n1 = gi + o; v1 = q; } else if (d < d2) { d2 = d; n2 = gi + o; }
    }
    // (v1: from here to its cell's middle; v1.y < 0: on the cell's near side, the one facing us)
    float nearSide = smoothstep(0.1, 0.45, -v1.y);
    if (kind < 3.5) {
      // plates in slightly different tones, cracks of varying width between them (some edges left out)
      col = mix(col, mix(col, C, 0.5), (hash(n1) - 0.5) * 0.5 * strength);
      col *= 1.0 - 0.1 * nearSide * strength;
      float edge = sqrt(d2) - sqrt(d1);
      float w = size * 0.14 * (0.45 + noise(p / (cs * 0.35)));
      float keep = step(1.0 - density, hash(n1 + n2));
      col = mix(col, c, (1.0 - smoothstep(0.0, w, edge)) * strength * keep);
      col = mix(col, C, (smoothstep(w, w * 1.6, edge) - smoothstep(w * 1.6, w * 2.6, edge)) * 0.35 * keep);
    } else if (kind < 4.5) {
      col = mix(col, c, smoothstep(size * 0.5, 0.0, d1) * strength * step(1.0 - density, hash(n1 + 5.0)));
    } else if (kind > 15.5) {
      // ice: smooth plates in barely different tones, hairline cracks (closed: no gap, no shadow), soft streaks of
      // reflected sky across it
      col = mix(col, mix(col, C, 0.4), hash(n1) * 0.3);
      float edge = sqrt(d2) - sqrt(d1);
      col = mix(col, c, (1.0 - smoothstep(0.0, size * 0.025 + gPx / cs, edge)) * step(1.0 - density, hash(n1 + n2)) * strength * 0.75);
      float sheen = noise(vec2(p.x / (cs * 3.0), p.y / (cs * 0.45)) + 7.0);
      col = mix(col, C, smoothstep(0.55, 0.85, sheen) * 0.45 * strength);
    } else if (kind > 14.5) {
      // lava: dark crust plates, molten cracks between them (glowing, pulsing slowly)
      col = mix(col, col * 0.8, hash(n1) * 0.35);
      col *= 1.0 - 0.16 * nearSide;
      float edge = sqrt(d2) - sqrt(d1);
      float w = size * 0.22 * (0.5 + noise(p / (cs * 0.4)));
      float crack = (1.0 - smoothstep(0.0, w, edge)) * step(1.0 - density, hash(n1 + n2));
      float halo = (1.0 - smoothstep(w, w * 3.5, edge)) * 0.35 * step(1.0 - density, hash(n1 + n2));
      float pulse = uTime > 0.0 ? 0.75 + 0.25 * sin(uTime * 1.4 + hash(n1) * 6.0) : 1.0;
      col = mix(col, c, crack * strength);
      col = mix(col, mix(col, c, 0.5), halo * strength);
      gEmit += c * (crack * 0.9 + halo * 0.4) * strength * pulse * gWeight;
    } else {
      // cobbles: rounded stones in their own tones (darker toward the rim), the grout between them
      vec3 stone = mix(A, C, hash(n1) * 0.6 * density);
      stone = mix(stone, stone * 0.78, smoothstep(0.15, 0.6, sqrt(d1)) * strength);
      // seen from the front, a little from above: lit on its top (far side), its near side in shade
      stone *= 1.0 + (0.14 * smoothstep(0.05, 0.4, v1.y) - 0.24 * nearSide) * strength;
      col = mix(c, stone, smoothstep(size * 0.1, size * 0.1 + 0.07, sqrt(d2) - sqrt(d1)));
    }
  } else if (kind < 5.5) {                          // drifts: soft patches (snow shadows, dunes)
    float n = fbm(p / cs + 2.0);
    col = mix(col, c, smoothstep(1.0 - density, 1.0 - density + 0.05 + size * 0.7, n) * strength);
  } else if (kind < 6.5) {                          // sparkle: rare bright points (they twinkle when animated)
    if (j.x < density) {
      float tw = uTime > 0.0 ? 0.55 + 0.45 * sin(uTime * 2.6 + j.y * 40.0) : 1.0;
      col = mix(col, c, fill(length(p - (cell + j) * cs) - size * cs) * strength * tw);
    }
  } else if (kind < 7.5) {                          // puddles: water in hollows, inked
    float w = fbm(p / cs + 4.0);
    float t = 1.0 - density;
    col = mix(col, c, smoothstep(t - 0.02, t + 0.02, w) * strength);
    col = mix(col, INK, inkLine(w - t, 0.004) * 0.5 * strength);
  } else if (kind < 8.5) {                          // reeds: little strokes
    if (j.x < density) {
      vec2 q = p - (cell + vec2(0.5, 0.8)) * cs;
      float h = size * cs;
      float d = min(sdSegment(q, vec2(0.0), vec2(-0.2, -1.0) * h), sdSegment(q, vec2(0.0), vec2(0.23, -0.85) * h));
      col = mix(col, c, inkLine(d, s * 0.006) * strength);
    }
  } else if (kind < 9.5) {                          // fields: patches in two tones, furrows, hedges
    vec2 g = p / cs + vec2(fbm(p / s) * 0.6);
    vec2 gi = floor(g); vec2 gf = fract(g);
    float h = hash(gi);
    col = mix(A, mix(A, B, 0.45), step(0.5, h));
    float stripes = abs(fract((h > 0.5 ? gf.x : gf.y) * 7.0) - 0.5);
    col = mix(col, c, (1.0 - smoothstep(0.08, 0.16, stripes)) * 0.35 * strength);
    float edge = min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y));
    col = mix(col, C, (1.0 - smoothstep(0.03, 0.06, edge)) * strength);
  } else if (kind > 10.5 && kind < 11.5) {          // dunes: long wavy ridges, a shaded slope after each crest
    vec2 q = p / cs;
    float w = q.y + sin(q.x * 0.8 + fbm(q * 0.3) * 4.0) * 0.55 + fbm(q * 0.45) * 1.4;
    float ph = fract(w);
    col = mix(col, c, smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.06, 0.5, ph)) * strength * density);
    col = mix(col, C, smoothstep(0.6, 0.8, ph) * (1.0 - smoothstep(0.85, 1.0, ph)) * 0.4 * strength);
    col = mix(col, mix(c, INK, 0.35), inkLine(min(ph, 1.0 - ph) * cs, s * 0.003) * size * 0.8);
  } else if (kind > 12.5 && kind < 13.5) {          // tiles: squares in their own tones, grout lines, a checker
    vec2 g = p / cs; vec2 gi = floor(g); vec2 gf = fract(g);
    col = mix(A, C, hash(gi) * 0.35);
    col = mix(col, mix(col, B, 0.45), mod(gi.x + gi.y, 2.0) * density);
    // each tile's near edge (its thickness) in shade, its far edge catching the light
    col = mix(col, col * 0.72, smoothstep(0.8, 0.96, gf.y) * strength);
    col = mix(col, mix(col, vec3(1.0), 0.22), (1.0 - smoothstep(0.03, 0.12, gf.y)) * strength);
    float edge = min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y));
    col = mix(col, c, (1.0 - smoothstep(size * 0.05, size * 0.05 + 0.03, edge)) * strength);
  } else if (kind > 13.5 && kind < 14.5) {          // bricks: rows half a brick apart, mortar between
    float row = floor(p.y / (cs * 0.5));
    vec2 g = vec2(p.x / cs + 0.5 * mod(row, 2.0), p.y / (cs * 0.5));
    vec2 gi = floor(g); vec2 gf = fract(g);
    col = mix(A, mix(A, C, 0.5), hash(gi) * density);
    col = mix(col, col * 0.74, smoothstep(0.72, 0.92, gf.y) * strength);                   // each brick's near face
    col = mix(col, mix(col, vec3(1.0), 0.18), (1.0 - smoothstep(0.08, 0.22, gf.y)) * strength);
    float mortar = max(1.0 - smoothstep(size * 0.05, size * 0.05 + 0.03, min(gf.x, 1.0 - gf.x)),
                       1.0 - smoothstep(size * 0.1, size * 0.1 + 0.06, min(gf.y, 1.0 - gf.y)));
    col = mix(col, c, mortar * strength);
  } else {                                          // tufts: grass tufts (they sway when animated)
    if (j.x < density) {
      vec2 q = p - (cell + vec2(0.2 + 0.6 * j.y, 0.75)) * cs;
      float h = s * size * 0.1 * (0.8 + 0.4 * j.x);
      float sway = uTime > 0.0 ? sin(uTime * 1.6 + p.x * 0.05) * 0.25 : 0.0;
      float d = min(sdSegment(q, vec2(0.0), vec2(-0.45 + sway, -1.0) * h), min(sdSegment(q, vec2(0.0), vec2(sway, -1.25) * h), sdSegment(q, vec2(0.0), vec2(0.45 + sway, -1.0) * h)));
      col = mix(col, c, inkLine(d, s * 0.006) * strength);
    }
  }
  return col;
}

// A ground: its colour in patches (the first and third colours), then its two patterns (read from the palette here:
// one loop, so pattern() is in the code once)
vec3 ground(float id, vec2 p, vec3 A, vec3 B, vec3 C, float patches, float rnd) {
  float n = fbm(vec2(p.x, p.y / FORE) / (uSize * 0.9) + rnd * 3.0);
  vec3 col = mix(A, C, smoothstep(0.55, 0.85, n) * patches);
  for (int i = 0; i < 2; i++) {
    float r0 = 4.0 + float(i) * 2.0;
    vec4 pa = texture2D(uPalette, vec2((id + 0.5) / 256.0, row(r0)));
    vec4 pb = texture2D(uPalette, vec2((id + 0.5) / 256.0, row(r0 + 1.0)));
    float kind = floor(pa.r * 255.0 + 0.5);
    if (kind < 0.5) continue;
    float role = floor(pa.g * 255.0 + 0.5);
    vec3 c = role < 0.5 ? A : role < 1.5 ? B : C;
    col = pattern(kind, p, col, c, A, B, C, pa.b, pa.a, pb.r, pb.g);
  }
  return col;
}

// -- liquids ---------------------------------------------------------------------------------------------------------
// Colours: A the liquid, B the deep (its foam: a lighter B; lava: its crust), C the shoreline (drawn in main); depth: how
// far from the shore it gets deep (tiles); waves: how much foam; style: 0 ocean (waves moving with the wind), 1 lake
// (calm ripples), 2 lava (crust plates over glowing molten lava)
vec3 water(vec2 p, vec3 A, vec3 B, vec3 C, float shore, float depth, float waves, float style) {
  float s = uSize;
  vec2 pg = vec2(p.x, p.y / FORE);                 // on the ground (foreshortened)
  float t = uTime;
  bool lava = style > 1.5;
  // (lava's colours: A molten, B its crust, C the shoreline)
  vec3 foam = lava ? mix(A, vec3(1.0, 0.92, 0.62), 0.55) : mix(B, vec3(1.0), 0.62);
  float deep = smoothstep(s * 0.05, s * max(depth, 0.1), shore);
  vec3 col = lava ? mix(A, A * 0.7, deep * 0.55) : mix(A, B, deep * 0.7);
  if (!lava) {
    // ripples along the shore
    float r = abs(fract((shore - t * s * 0.02) / (s * 0.09)) - 0.5);
    col = mix(col, mix(B, INK, 0.3), (1.0 - smoothstep(0.03, 0.08, r)) * (1.0 - smoothstep(s * 0.12, s * 0.3, shore)) * 0.6);
  }
  float open = smoothstep(s * 0.08, s * 0.35, shore);
  if (style < 0.5) {
    // the ocean: long crests across the wind, moving with it (bent by noise), whitecaps breaking along them
    vec2 wd = normalize(uWind + vec2(0.0001, 0.0));
    float strength = clamp(length(uWind), 0.15, 1.5);
    vec2 q = vec2(dot(pg, wd), dot(pg, vec2(-wd.y, wd.x))) / (s * 0.24);
    float ph = q.x - t * (0.2 + 0.45 * strength) + fbm(vec2(q.x * 0.25, q.y * 0.45)) * 2.2;
    float w = fract(ph);
    col = mix(col, mix(A, B, 0.85), smoothstep(0.45, 1.0, w) * 0.22 * open);          // the wave's back, darker
    float cap = smoothstep(0.55 - 0.25 * waves * strength, 0.8, noise(vec2(q.y * 1.3 + floor(ph) * 7.0, ph * 0.5)));
    col = mix(col, foam, (1.0 - smoothstep(0.0, 0.07, w)) * cap * open * 0.85);        // whitecaps on the crest
    float fine = abs(noise(pg / (s * 0.09) + wd * t * 0.8) - noise(pg / (s * 0.13) - wd * t * 0.5 + 3.0));
    col = mix(col, foam, (1.0 - smoothstep(0.0, 0.04, fine)) * 0.12 * open);           // the surface's small ripples
  } else if (lava) {
    // lava (plan 53; A molten, B its highlights, C its crust and shoreline): thin bright wavy lines (where a noise warped
    // by another crosses a level, slowly drifting and changing), crust drifting over it in solid patches with sharp
    // edges; only the molten part lights itself
    vec2 q = pg / (s * 0.22);
    vec2 warpq = vec2(noise(q * 0.7 + vec2(t * 0.11, 0.0)), noise(q * 0.7 + vec2(3.7, -t * 0.09))) - 0.5;
    float n1 = noise(q + warpq * 1.6 + vec2(t * 0.05, t * 0.03));
    float n2 = noise(q * 1.9 - warpq * 1.2 + vec2(-t * 0.04, 5.1));
    float lines = (1.0 - smoothstep(0.0, 0.045 + gPx / (s * 0.22) * 0.5, abs(n1 - 0.5))) * 0.6
                + (1.0 - smoothstep(0.0, 0.035 + gPx / (s * 0.12) * 0.5, abs(n2 - 0.52))) * 0.35;
    col = mix(col, B, lines * 0.8);
    float crust = smoothstep(0.62, 0.62 + 0.01 + gPx / (s * 0.22), n1) * 0.94;
    col = mix(col, C * (0.9 + 0.25 * n2), crust);
    gEmit += col * (1.0 - crust) * 0.55 * gWeight;
    return col;
  } else {
    // a lake (plan 53): calm water, simplex noise in two octaves drifting slowly, fine and in strong contrast: lighter
    // swells and darker troughs
    vec2 q = pg / (s * 0.15);
    float n = snoise(q + vec2(t * 0.05, t * 0.03)) * 0.65 + snoise(q * 2.1 + vec2(-t * 0.04, 3.7)) * 0.35;
    col = mix(mix(col, B, 0.5), mix(col, foam, 0.4), smoothstep(-0.5, 0.5, n) * open + 0.5 * (1.0 - open));
  }
  // at night the stars shine on it
  if (uNight > 0.01) {
    vec2 sc = floor(p / (s * 0.085)); vec2 sj = hash2(sc + 31.0);
    if (sj.x > 0.88) {
      float tw = uTime > 0.0 ? 0.55 + 0.45 * sin(uTime * 2.4 + sj.y * 40.0) : 0.8;
      gStars = max(gStars, (1.0 - smoothstep(0.0, s * 0.006 + gPx * 0.8, length(p - (sc + sj) * s * 0.085))) * tw);
    }
  }
  return col;
}

// The direction index from a tile to its neighbour at offset o (-1: not one; painter/data.ts directions)
float dirOf(vec2 o, float rowParity) {
  if (uGridType < 1.5) {
    if (o.y < -0.5) return o.x < -0.5 ? 5.0 : o.x > 0.5 ? 7.0 : 6.0;
    if (o.y > 0.5) return o.x < -0.5 ? 3.0 : o.x > 0.5 ? 1.0 : 2.0;
    return o.x > 0.5 ? 0.0 : o.x < -0.5 ? 4.0 : -1.0;
  }
  float s = rowParity;
  if (abs(o.y) < 0.5) return o.x > 0.5 ? 0.0 : o.x < -0.5 ? 3.0 : -1.0;
  if (o.y > 0.5) return abs(o.x - s) < 0.5 ? 1.0 : abs(o.x - (s - 1.0)) < 0.5 ? 2.0 : -1.0;
  return abs(o.x - (s - 1.0)) < 0.5 ? 4.0 : abs(o.x - s) < 0.5 ? 5.0 : -1.0;
}
bool hasBit(float mask, float bit) { return bit >= 0.0 && mod(floor(mask / pow(2.0, bit)), 2.0) > 0.5; }
// The offset from a tile to its neighbour in direction dir (painter/data.ts directions; none: x > 50)
vec2 dirOffset(int dir, float par) {
  if (uGridType < 1.5) {
    return dir == 0 ? vec2(1.0, 0.0) : dir == 1 ? vec2(1.0, 1.0) : dir == 2 ? vec2(0.0, 1.0) : dir == 3 ? vec2(-1.0, 1.0)
      : dir == 4 ? vec2(-1.0, 0.0) : dir == 5 ? vec2(-1.0, -1.0) : dir == 6 ? vec2(0.0, -1.0) : vec2(1.0, -1.0);
  }
  if (dir > 5) return vec2(99.0);
  return dir == 0 ? vec2(1.0, 0.0) : dir == 1 ? vec2(par, 1.0) : dir == 2 ? vec2(par - 1.0, 1.0) : dir == 3 ? vec2(-1.0, 0.0)
    : dir == 4 ? vec2(par - 1.0, -1.0) : vec2(par, -1.0);
}

void main() {
  float q = uRes.x / uView.z;                      // canvas pixels per map px
  vec2 p = uView.xy + vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / q;
  gPx = 1.0 / q;
  gStars = 0.0;
  gEmit = vec3(0.0);
  gWeight = 1.0;
  gT0 = tileOf(p);
  for (int k = 0; k < 9; k++) {
    vec2 t = gT0 + offsetOf(k);
    // Past the map's edge the edge tiles' terrain goes on (no shore along the border)
    vec2 tc = clamp(t, vec2(0.0), uCount - 1.0);
    gTer[k] = floor(texture2D(uTiles, (tc + 0.5) / uCount).r * 255.0 + 0.5);
    gRnd[k] = texture2D(uKinds, (tc + 0.5) / uCount).b;
  }

  // Terrain: this region and the nearest other one
  vec4 reg = regionAt(p);
  float idA = reg.x; float idB = reg.y; float e = reg.z;
  vec4 hA = idA < 0.5 ? vec4(0.0) : texture2D(uPalette, vec2((idA + 0.5) / 256.0, row(0.0))) * 255.0;
  vec4 hB = idB < 0.5 ? vec4(0.0) : texture2D(uPalette, vec2((idB + 0.5) / 256.0, row(0.0))) * 255.0;
  float kA = floor(hA.r + 0.5); float kB = floor(hB.r + 0.5);   // 1 ground, 2 water
  bool waterA = kA > 1.5 && kA < 2.5; bool waterB = kB > 1.5 && kB < 2.5;
  float band = uSize * 0.14;
  float f = smoothstep(-band, band, e);              // 1: fully this region
  // two different liquids (a lake and the sea, lava and water): a smooth gradient through swirling noise (noise warped
  // by noise, drifting), like blood spreading in water
  bool liquids = waterA && waterB && idA != idB;
  if (liquids) {
    vec2 sq = vec2(p.x, p.y / FORE) / (uSize * 0.4);
    float sw = fbm(sq + vec2(fbm(sq * 1.7 + uTime * 0.03), fbm(sq * 1.7 + 5.2 - uTime * 0.03)) * 1.6);
    // (the swirl moves the border one way seen from either side: the two sides of it agree)
    f = smoothstep(-band * 1.8, band * 1.8, e + (sw - 0.5) * uSize * 0.7 * (idA < idB ? 1.0 : -1.0));
  }
  // Each region's ground (this one; the other where they blend). One loop: ground() and water() are in the code once.
  vec3 colA = uBackground; vec3 colB = uBackground;
  vec3 shoreline = INK;                              // the water's third colour
  for (int i = 0; i < 2; i++) {
    bool second = i == 1;
    float k = second ? kB : kA;
    if (k < 0.5 || k > 2.5 || (second && f >= 0.999)) continue;
    float id = second ? idB : idA;
    vec3 C1 = texture2D(uPalette, vec2((id + 0.5) / 256.0, row(1.0))).rgb;
    vec3 C2 = texture2D(uPalette, vec2((id + 0.5) / 256.0, row(2.0))).rgb;
    vec3 C3 = texture2D(uPalette, vec2((id + 0.5) / 256.0, row(3.0))).rgb;
    vec4 art = texture2D(uPalette, vec2((id + 0.5) / 256.0, row(4.0)));
    vec3 c;
    gWeight = second ? 1.0 - f : f;
    // (its distance to the shore: none where it meets another liquid)
    float shoreAt = second ? (waterA ? 1.0e5 : -e) : (waterB ? 1.0e5 : e);
    if (k > 1.5) { c = water(p, C1, C2, C3, shoreAt, art.r, art.g, floor(art.b * 255.0 + 0.5)); shoreline = C3; }
    else c = ground(id, p, C1, C2, C3, (second ? hB.g : hA.g) / 255.0, reg.w);
    if (second) colB = c; else colA = c;
  }
  // a stippled, wobbly fade (any pair the same way)
  float dither = (hash(floor(p / max(gPx * 2.0, uSize * 0.012))) - 0.5) * 0.6;
  if (!liquids) f = smoothstep(0.35, 0.65, f + dither * (1.0 - abs(f - 0.5) * 2.0));
  if (waterA != waterB) f = step(0.0, e);           // shores are sharp
  vec3 col = mix(colB, colA, f);
  if (waterA && !waterB) {
    // the far shore: where the land lies up the screen from the water, its edge faces us: a strip of its ground in
    // shade just inside the water, a waterline at its foot
    float facing = clamp(-gShore.y, 0.0, 1.0);
    float bw = uSize * 0.05 * facing;
    float bank = (1.0 - smoothstep(bw - gPx * 0.6, bw + gPx * 0.6, e)) * step(0.15, facing);
    col = mix(col, colB * 0.64, bank);
    col = mix(col, mix(shoreline, INK, 0.5), inkLine(e - bw, gPx * 0.5) * step(0.15, facing) * 0.6);
  }
  if (waterA != waterB) col = mix(col, shoreline, inkLine(e, gPx * 0.9 + uSize * 0.008));

  // Routes: rivers, then roads. A tile with two connections of a kind draws one curve between those edges' middles
  // (pulled toward its centre); otherwise arms from its centre to them (junctions, ends). The 3 x 3 tiles around are
  // joined smoothly. Old looks wobble (noise in world space, so they still meet their neighbours), modern ones don't.
  vec2 wob = (vec2(noise(p / (uSize * 0.35)), noise(p / (uSize * 0.35) + 5.0)) - 0.5) * uSize * 0.16
           + (vec2(noise(p / (uSize * 0.11) + 2.0), noise(p / (uSize * 0.11) + 8.0)) - 0.5) * uSize * 0.04;
  float dRiver = 1.0e9; float kRiver = 0.0; float flow = 0.0; float rSide = 0.0; vec2 rTan = vec2(1.0, 0.0);
  float dRoad = 1.0e9; float kRoad = 0.0; float alongRoad = 0.0; vec2 dTan = vec2(1.0, 0.0);
  // (their widths on the ground, foreshortened by their direction on the screen: blended between the curves near by)
  vec2 rMul = vec2(0.0); vec2 dMul = vec2(0.0);
  for (int k = 0; k < 9; k++) {
    vec2 t = gT0 + offsetOf(k);
    if (t.x < 0.0 || t.y < 0.0 || t.x >= uCount.x || t.y >= uCount.y) continue;   // none past the map's edge
    vec4 a = floor(texture2D(uTiles, (t + 0.5) / uCount) * 255.0 + 0.5);            // terrain, roads, rivers, out
    if (a.g < 0.5 && a.b < 0.5) continue;
    vec4 kk = floor(texture2D(uKinds, (t + 0.5) / uCount) * 255.0 + 0.5);           // road kind, river kind, -, falls
    float wobRoad = texture2D(uPalette, vec2((kk.r + 0.5) / 256.0, row(4.0))).b;
    float wobRiver = texture2D(uPalette, vec2((kk.g + 0.5) / 256.0, row(4.0))).b;
    vec2 c = centerOf(t);
    float par = mod(t.y, 2.0);
    // where its river falls over a boundary it doesn't wobble: the waterfall sits on its centre, joining its two parts
    float calm = 1.0;
    vec2 pr = p + wob * wobRoad;
    float nRoad = 0.0; float nRiver = 0.0;
    vec2 road1 = c; vec2 road2 = c; vec2 river1 = c; vec2 river2 = c; float out1 = 0.0; float out2 = 0.0;
    float armRoad = 1.0e9; float armRiver = 1.0e9; float armAlong = 0.0; float armFlow = 0.0; float armSide = 0.0;
    vec2 armRiverTan = vec2(1.0, 0.0); vec2 armRoadTan = vec2(1.0, 0.0);
    for (int dir = 0; dir < 8; dir++) {
      float bit = pow(2.0, float(dir));
      bool river = mod(floor(a.b / bit), 2.0) > 0.5;
      bool road = mod(floor(a.g / bit), 2.0) > 0.5;
      if (!river && !road) continue;
      vec2 o = dirOffset(dir, par);
      if (o.x > 50.0) continue;
      vec2 mid = (c + centerOf(t + o)) * 0.5;
      vec2 ab = mid - c; vec2 abn = ab / max(length(ab), 0.0001);
      if (river) {
        nRiver += 1.0;
        float outBit = mod(floor(a.a / bit), 2.0);
        if (nRiver < 1.5) { river1 = mid; out1 = outBit; } else { river2 = mid; out2 = outBit; }
        // (the neighbour's bit for this edge: read here, a texture read keeps this loop a loop on Direct3D, small)
        float nbFalls = floor(texture2D(uKinds, (t + o + 0.5) / uCount).a * 255.0 + 0.5);
        float back = mod(float(dir) + (uGridType < 1.5 ? 4.0 : 3.0), uGridType < 1.5 ? 8.0 : 6.0);
        float ca = hasBit(nbFalls, back) ? smoothstep(uSize * 0.05, uSize * 0.42, distance(p, mid)) : 1.0;
        calm = min(calm, ca);
        vec2 pa = p + wob * wobRiver * ca;
        float d = sdSegment(pa, c, mid);
        if (d < armRiver) {
          float sgn = outBit > 0.5 ? 1.0 : -1.0;
          armFlow = sgn * dot(pa - c, abn);
          armRiverTan = abn * sgn;
          armSide = (abn.x * (pa - c).y - abn.y * (pa - c).x) * sgn;
        }
        armRiver = min(armRiver, d);
      }
      if (road) {
        nRoad += 1.0;
        if (nRoad < 1.5) road1 = mid; else road2 = mid;
        float d = sdSegment(pr, c, mid);
        if (d < armRoad) { armAlong = dot(pr - c, abn) + dot(c, vec2(0.37, 0.61)); armRoadTan = abn; }
        armRoad = min(armRoad, d);
      }
    }
    if (nRiver > 0.5) {
      float d = armRiver; float fl = armFlow; vec2 tn = armRiverTan; float sd = armSide;
      vec2 pv = p + wob * wobRiver * calm;
      if (abs(nRiver - 2.0) < 0.5) {                 // one curve through the tile
        vec2 bz = sdBezier(pv, river1, c, river2);
        float len = distance(river1, c) + distance(c, river2);
        float sgn = out2 > 0.5 || out1 < 0.5 ? 1.0 : -1.0;   // toward river2, unless it flows out to river1
        float u = bz.y;
        d = bz.x; fl = sgn > 0.0 ? u * len : (1.0 - u) * len;
        vec2 bp = (1.0 - u) * (1.0 - u) * river1 + 2.0 * (1.0 - u) * u * c + u * u * river2;
        tn = normalize(2.0 * (1.0 - u) * (c - river1) + 2.0 * u * (river2 - c) + vec2(0.0001, 0.0)) * sgn;
        sd = tn.x * (pv - bp).y - tn.y * (pv - bp).x;
      }
      if (d < dRiver) { kRiver = kk.g; flow = fl; rTan = tn; rSide = sd; }
      float wr = exp(-d / (uSize * 0.05));
      rMul += vec2(sqrt(FORE * FORE * tn.x * tn.x + tn.y * tn.y), 1.0) * wr;
      dRiver = smin(dRiver, d, uSize * 0.06);
    }
    if (nRoad > 0.5) {
      float d = armRoad; float al = armAlong; vec2 tn = armRoadTan;
      if (abs(nRoad - 2.0) < 0.5) {
        vec2 bz = sdBezier(pr, road1, c, road2);
        float u = bz.y;
        d = bz.x; al = u * (distance(road1, c) + distance(c, road2)) + dot(c, vec2(0.37, 0.61));
        tn = normalize(2.0 * (1.0 - u) * (c - road1) + 2.0 * u * (road2 - c) + vec2(0.0001, 0.0));
      }
      if (d < dRoad) { kRoad = kk.r; alongRoad = al; dTan = tn; }
      float wq = exp(-d / (uSize * 0.05));
      dMul += vec2(sqrt(FORE * FORE * tn.x * tn.x + tn.y * tn.y), 1.0) * wq;
      dRoad = smin(dRoad, d, uSize * 0.05);
    }
  }
  // Water and land here: how far into the land (map px; negative in the water)
  float landDist = waterA == waterB ? (waterA ? -1.0e5 : 1.0e5) : (waterA ? -e : e);
  float shoreW = gPx * 0.9 + uSize * 0.008;
  float onRiver = 0.0;
  if (dRiver < uSize * 0.45) {
    vec3 R1 = texture2D(uPalette, vec2((kRiver + 0.5) / 256.0, row(1.0))).rgb;
    vec3 R2 = texture2D(uPalette, vec2((kRiver + 0.5) / 256.0, row(2.0))).rgb;
    vec3 R3 = texture2D(uPalette, vec2((kRiver + 0.5) / 256.0, row(3.0))).rgb;
    vec4 art = texture2D(uPalette, vec2((kRiver + 0.5) / 256.0, row(4.0)));
    // it widens into the lake or the sea it meets, and stops at its shore (never drawn over water)
    float mouth = 1.0 - smoothstep(0.0, uSize * 0.35, landDist);
    float w = art.g * 0.2 * uSize * (0.85 + 0.3 * noise(p / (uSize * 0.8))) * (1.0 + 1.4 * mouth) * rMul.x / max(rMul.y, 1.0e-6);
    float rlook = floor(art.r * 255.0 + 0.5);       // 7 river, 8 lava
    // lava's banks are sharp: jagged rock, angular teeth of varying size along each side
    if (rlook > 7.5) {
      float tooth = abs(fract(flow / (uSize * 0.09) + noise(p / (uSize * 0.15)) * 2.2 + step(0.0, rSide) * 0.37) * 2.0 - 1.0);
      w *= 1.0 + (tooth - 0.5) * 0.32 * (0.35 + noise(vec2(flow / (uSize * 0.3), step(0.0, rSide) * 5.0)));
    }
    float shown = smoothstep(-shoreW * 2.5, 0.0, landDist);
    float d = dRiver - w;
    vec3 wc = R1;
    onRiver = fill(d);
    if (rlook > 7.5) {
      // lava: crusts floating on it, riding its flow, molten lava between them (bright in the middle), its banks crusted
      // dark; the molten part lights itself
      vec2 lq = vec2(flow - uTime * uSize * 0.05, rSide) / (uSize * vec2(0.05, 0.028));
      lq += (vec2(noise(lq * 0.6), noise(lq * 0.6 + 3.0)) - 0.5) * 0.9;
      float cn = noise(lq) * 0.65 + noise(lq * 2.3 + 7.0) * 0.35;
      // (its far bank, facing us, a wider face of rock)
      float facing = clamp(-sign(rSide) * rTan.x, 0.0, 1.0);
      float bank = smoothstep(w * (0.73 - 0.15 * facing), w * (0.85 - 0.15 * facing), dRiver);
      float crust = smoothstep(0.6, 0.64, cn) * (1.0 - bank);   // small pieces floating, its molten colour darkened
      vec3 molten = mix(R1, R3, (1.0 - smoothstep(0.0, w * 0.5, dRiver)) * 0.45);
      wc = mix(molten, R1 * 0.62, crust);
      wc = mix(wc, R2 * (0.85 + 0.3 * noise(lq * 3.0)), bank);
      gEmit += molten * (1.0 - crust * 0.6) * (1.0 - bank) * onRiver * shown * 0.9;
    } else {
      // the flow: small chevrons pointing downstream (moving with it when animated; still, they still show its way)
      float ph = (flow + dRiver * 1.3 - uTime * uSize * 0.15) / (uSize * 0.14) + noise(p / (uSize * 0.25)) * 0.25;
      float keep = step(0.3, hash(vec2(floor(ph), kRiver)));
      float mark = (1.0 - smoothstep(0.05, 0.12, abs(fract(ph) - 0.5))) * (1.0 - smoothstep(w * 0.25, w * 0.75, dRiver)) * keep;
      wc = mix(wc, R3, mark * 0.75 * (1.0 - mouth));
      // its far bank (the side facing us: up the screen): a strip of earth in shade along its edge
      float facing = clamp(-sign(rSide) * rTan.x, 0.0, 1.0) * (1.0 - mouth);
      wc = mix(wc, col * 0.66, smoothstep(w * (1.0 - 0.4 * facing) - gPx, w * (1.0 - 0.4 * facing) + gPx, dRiver) * step(0.1, facing));
      gEmit *= 1.0 - onRiver * shown;               // water over lava ground: its glow stays under it
    }
    col = mix(col, wc, onRiver * shown);
    col = mix(col, R2, inkLine(d, gPx * 0.7 + uSize * 0.004) * shown * (1.0 - mouth * 0.7));
  }
  if (dRoad < uSize * 0.3) {
    vec3 R1 = texture2D(uPalette, vec2((kRoad + 0.5) / 256.0, row(1.0))).rgb;
    vec3 R2 = texture2D(uPalette, vec2((kRoad + 0.5) / 256.0, row(2.0))).rgb;
    vec3 R3 = texture2D(uPalette, vec2((kRoad + 0.5) / 256.0, row(3.0))).rgb;
    vec4 art = texture2D(uPalette, vec2((kRoad + 0.5) / 256.0, row(4.0)));
    float look = floor(art.r * 255.0 + 0.5);      // 1 dirt, 2 paved, 3 trail, 4 highway, 5 rail, 6 light
    float w = max(art.g * 0.2 * uSize * dMul.x / max(dMul.y, 1.0e-6), gPx * 1.2);
    float d = dRoad - w;
    // Over water (a river, a lake, the sea): a bridge, its shadow on the water, railings
    float bridge = max(onRiver, 1.0 - smoothstep(-shoreW, shoreW, landDist));
    if (bridge > 0.01) {
      col = mix(col, col * 0.62, fill(dRoad - w * 1.7) * bridge * 0.6);
      if (look < 3.5) {
        vec3 deck = mix(R1, vec3(0.55, 0.42, 0.28), 0.55);
        float plank = 1.0 - smoothstep(0.1, 0.2, abs(fract(alongRoad / (uSize * 0.022)) - 0.5));
        col = mix(col, mix(deck, deck * 0.7, plank), fill(dRoad - w * 1.15) * bridge);
      }
      col = mix(col, INK, inkLine(dRoad - w * 1.2, gPx * 0.6 + uSize * 0.003) * bridge);
    }
    float onLand = 1.0 - bridge;
    if (look > 2.5 && look < 3.5) {                // trail: dashes
      float dash = step(0.45, fract(alongRoad / (uSize * 0.07)));
      col = mix(col, R1, fill(d) * dash * onLand);
    } else if (look > 3.5 && look < 4.5) {         // highway: asphalt, white edge lines, a dashed middle line
      col = mix(col, R1, fill(d));
      col = mix(col, R3, inkLine(dRoad - w * 0.72, gPx * 0.5 + w * 0.05) * fill(d));
      col = mix(col, R3, inkLine(dRoad, gPx * 0.5 + w * 0.05) * step(0.5, fract(alongRoad / (uSize * 0.06))));
      col = mix(col, R2, inkLine(d, gPx * 0.6 + uSize * 0.002));
    } else if (look > 4.5 && look < 5.5) {         // railway: a bed, sleepers across, two rails
      col = mix(col, R1, fill(d) * 0.85);
      float sleeper = 1.0 - smoothstep(0.18, 0.26, abs(fract(alongRoad / (uSize * 0.035)) - 0.5));
      col = mix(col, R3, sleeper * fill(dRoad - w * 0.82));
      col = mix(col, R2, inkLine(dRoad - w * 0.45, gPx * 0.55 + w * 0.06));
    } else if (look > 5.5 && look < 6.5) {         // light road: dark, glowing edges, pulses running along
      col = mix(col, R1, fill(d));
      float glow = exp(-abs(d) / (gPx + w * 0.25));
      col = mix(col, R2, clamp(glow, 0.0, 1.0));
      float pulse = smoothstep(0.85, 1.0, fract(alongRoad / (uSize * 0.4) - uTime * 0.6)) * fill(dRoad - w * 0.35);
      col = mix(col, R3, pulse);
    } else {
      vec3 rc = R1;
      if (look > 1.5) {                            // paved: joints between stones
        vec2 st = fract((p + wob * art.b) / (uSize * 0.035));
        rc = mix(rc, R3, (1.0 - smoothstep(0.0, 0.18, min(st.x, st.y))) * 0.6);
      } else {                                     // dirt: ruts
        rc = mix(rc, R3, (1.0 - smoothstep(0.0, w * 0.25, abs(dRoad - w * 0.45))) * 0.5);
      }
      col = mix(col, rc, fill(d) * onLand);
      col = mix(col, R2, inkLine(d, gPx * 0.6 + uSize * 0.003) * onLand);
    }
    gEmit *= 1.0 - fill(d);                         // a road over lava ground covers its glow
  }

  // paper grain
  float grain = noise(p / (uSize * 0.02)) * 0.5 + noise(p / (uSize * 0.4)) * 0.5;
  col *= 0.93 + 0.09 * grain;
  // the hour's light (at night a little grey, as the eye sees it), then the night's own lights
  col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), uNight * 0.25) * uTint;
  col += vec3(1.0, 0.95, 0.82) * gStars * uNight;
  // what lights itself (lava): bright by day as by night, glowing past its edges at night
  col = max(col, gEmit * (0.85 + 0.15 * uNight)) + gEmit * 0.25 * uNight;
  gl_FragColor = vec4(col, 1.0);
}
`
