/**
 * The map painter's ground pass (plans 47, 48): the terrain (grounds and water), the routes (roads and rivers) and the
 * walls of walled scenery, for the part of the map in view, into a texture the map shader puts under the pictures.
 * Scenery and features are sprites drawn over it (painter/sprites.ts). What each type looks like is data: the style's
 * JSON picks and tunes the patterns and looks below, through the palette texture (painter/data.ts, `encodeArt`).
 *
 * Per pixel: the 3 × 3 tiles around the pixel's tile are read once (terrain, random byte, scenery) into globals.
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
`

export const PAINT_FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform vec4 uView;       // the part of the map the canvas covers (map px)
uniform vec2 uCount;      // columns, rows
uniform sampler2D uTiles; // per tile: terrain, roads, rivers, river out
uniform sampler2D uKinds; // per tile: road kind, river kind, a random byte, scenery
uniform sampler2D uPalette;
uniform vec3 uBackground;
${COMMON}
const float ROWS = 8.0;   // the palette texture's rows (painter/data.ts)

// The 3 x 3 tiles around the pixel's tile, read once in main
vec2 gT0;
float gTer[9]; float gRnd[9]; float gSc[9];
float gPx; // one canvas pixel, in map px (anti-aliasing, ink)

vec2 offsetOf(int k) { return vec2(float(k - (k / 3) * 3) - 1.0, float(k / 3) - 1.0); }
float row(float r) { return (r + 0.5) / ROWS; }

// Region borders wobble: two octaves of noise, about a third of a tile
vec2 warp(vec2 p) {
  vec2 a = p / (uSize * 0.6);
  vec2 b = p / (uSize * 0.17);
  return (vec2(noise(a), noise(a + 7.7)) - 0.5) * uSize * 0.5 + (vec2(noise(b + 3.1), noise(b + 9.3)) - 0.5) * uSize * 0.16;
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
  return vec4(idA, idB, e, rA);
}

float inkLine(float d, float w) { return 1.0 - smoothstep(w - gPx * 0.6, w + gPx * 0.6, abs(d)); }
float fill(float d) { return 1.0 - smoothstep(-gPx * 0.6, gPx * 0.6, d); }

// -- ground patterns (the style's JSON: kind, colour, scale in tiles, density, size, strength) ------------------------
// 1 strokes, 2 stipple, 3 cracks, 4 flecks, 5 drifts, 6 sparkle, 7 puddles, 8 reeds, 9 fields, 10 tufts, 11 dunes,
// 12 cobbles, 13 tiles, 14 bricks
vec3 pattern(float kind, vec2 p, vec3 col, vec3 c, vec3 A, vec3 B, vec3 C, float scale, float density, float size, float strength) {
  float s = uSize;
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
  } else if (kind < 4.5 || (kind > 11.5 && kind < 12.5)) {   // cracks (3), flecks (4), cobbles (12): cells
    vec2 g = p / cs + (vec2(noise(p / (cs * 0.7)), noise(p / (cs * 0.7) + 3.3)) - 0.5) * (kind > 11.5 ? 0.15 : 0.4);
    vec2 gi = floor(g); float d1 = 9.0; float d2 = 9.0; vec2 n1 = vec2(0.0); vec2 n2 = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)); vec2 q = o + hash2(gi + o) - fract(g);
      float d = dot(q, q);
      if (d < d1) { d2 = d1; n2 = n1; d1 = d; n1 = gi + o; } else if (d < d2) { d2 = d; n2 = gi + o; }
    }
    if (kind < 3.5) {
      // plates in slightly different tones, cracks of varying width between them (some edges left out)
      col = mix(col, mix(col, C, 0.5), (hash(n1) - 0.5) * 0.5 * strength);
      float edge = sqrt(d2) - sqrt(d1);
      float w = size * 0.14 * (0.45 + noise(p / (cs * 0.35)));
      float keep = step(1.0 - density, hash(n1 + n2));
      col = mix(col, c, (1.0 - smoothstep(0.0, w, edge)) * strength * keep);
      col = mix(col, C, (smoothstep(w, w * 1.6, edge) - smoothstep(w * 1.6, w * 2.6, edge)) * 0.35 * keep);
    } else if (kind < 4.5) {
      col = mix(col, c, smoothstep(size * 0.5, 0.0, d1) * strength * step(1.0 - density, hash(n1 + 5.0)));
    } else {
      // cobbles: rounded stones in their own tones (darker toward the rim), the grout between them
      vec3 stone = mix(A, C, hash(n1) * 0.6 * density);
      stone = mix(stone, stone * 0.78, smoothstep(0.15, 0.6, sqrt(d1)) * strength);
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
    float edge = min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y));
    col = mix(col, c, (1.0 - smoothstep(size * 0.05, size * 0.05 + 0.03, edge)) * strength);
  } else if (kind > 13.5 && kind < 14.5) {          // bricks: rows half a brick apart, mortar between
    float row = floor(p.y / (cs * 0.5));
    vec2 g = vec2(p.x / cs + 0.5 * mod(row, 2.0), p.y / (cs * 0.5));
    vec2 gi = floor(g); vec2 gf = fract(g);
    col = mix(A, mix(A, C, 0.5), hash(gi) * density);
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
  float n = fbm(p / (uSize * 0.9) + rnd * 3.0);
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

// -- water -----------------------------------------------------------------------------------------------------------
// Colours: A the water, B the deep (its foam: a lighter B), C the shoreline (drawn in main); depth: how far from the
// shore it gets deep (tiles); waves: how many wave marks
vec3 water(vec2 p, vec3 A, vec3 B, vec3 C, float shore, float depth, float waves) {
  float s = uSize;
  vec3 foam = mix(B, vec3(1.0), 0.62);
  float deep = smoothstep(s * 0.05, s * max(depth, 0.1), shore);
  vec3 col = mix(A, B, deep * 0.7);
  float t = uTime;
  // ripples along the shore, wave marks out at sea
  float r = abs(fract((shore - t * s * 0.02) / (s * 0.09)) - 0.5);
  col = mix(col, mix(B, INK, 0.3), (1.0 - smoothstep(0.03, 0.08, r)) * (1.0 - smoothstep(s * 0.12, s * 0.3, shore)) * 0.6);
  // the surface: two layers of ripples drifting across each other (still, as they are at time 0)
  vec2 rq = p / (s * 0.42);
  float drift = t * 0.11;
  float r1 = noise(rq + vec2(drift, drift * 0.45));
  float r2 = noise(rq * 1.55 + vec2(-drift * 0.8, drift * 0.6) + 4.0);
  col = mix(col, foam, (1.0 - smoothstep(0.0, 0.05, abs(r1 - r2))) * 0.2 * smoothstep(s * 0.08, s * 0.35, shore));
  vec2 cell = floor(p / (s * 0.28)); vec2 j = hash2(cell + 9.0);
  if (j.x < waves && shore > s * 0.25) {
    vec2 q = p - (cell + 0.25 + 0.5 * j) * s * 0.28 - vec2(sin(t * 0.7 + j.y * 6.0) * s * 0.01, 0.0);
    float wv = abs(q.y + sin(q.x / (s * 0.025)) * s * 0.008);
    col = mix(col, foam, (1.0 - smoothstep(s * 0.004, s * 0.008, wv)) * step(abs(q.x), s * 0.06) * 0.9);
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

void main() {
  float q = uRes.x / uView.z;                      // canvas pixels per map px
  vec2 p = uView.xy + vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / q;
  gPx = 1.0 / q;
  gT0 = tileOf(p);
  for (int k = 0; k < 9; k++) {
    vec2 t = gT0 + offsetOf(k);
    // Past the map's edge the edge tiles' terrain goes on (no shore along the border)
    vec2 tc = clamp(t, vec2(0.0), uCount - 1.0);
    gTer[k] = floor(texture2D(uTiles, (tc + 0.5) / uCount).r * 255.0 + 0.5);
    vec4 kd = texture2D(uKinds, (tc + 0.5) / uCount);
    gRnd[k] = kd.b;
    gSc[k] = floor(kd.a * 255.0 + 0.5);
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
    if (k > 1.5) { c = water(p, C1, C2, C3, second ? -e : waterB ? 1.0e5 : e, art.r, art.g); shoreline = C3; }
    else c = ground(id, p, C1, C2, C3, (second ? hB.g : hA.g) / 255.0, reg.w);
    if (second) colB = c; else colA = c;
  }
  // a stippled, wobbly fade (any pair the same way)
  float dither = (hash(floor(p / max(gPx * 2.0, uSize * 0.012))) - 0.5) * 0.6;
  f = smoothstep(0.35, 0.65, f + dither * (1.0 - abs(f - 0.5) * 2.0));
  if (waterA != waterB) f = step(0.0, e);           // shores are sharp
  vec3 col = mix(colB, colA, f);
  if (waterA != waterB) col = mix(col, shoreline, inkLine(e, gPx * 0.9 + uSize * 0.008));

  // Routes: rivers, then roads. A tile with two connections of a kind draws one curve between those edges' middles
  // (pulled toward its centre); otherwise arms from its centre to them (junctions, ends). The 3 x 3 tiles around are
  // joined smoothly. Old looks wobble (noise in world space, so they still meet their neighbours), modern ones don't.
  vec2 wob = (vec2(noise(p / (uSize * 0.35)), noise(p / (uSize * 0.35) + 5.0)) - 0.5) * uSize * 0.16
           + (vec2(noise(p / (uSize * 0.11) + 2.0), noise(p / (uSize * 0.11) + 8.0)) - 0.5) * uSize * 0.04;
  float dRiver = 1.0e9; float kRiver = 0.0; float flow = 0.0;
  float dRoad = 1.0e9; float kRoad = 0.0; float alongRoad = 0.0;
  for (int k = 0; k < 9; k++) {
    vec2 t = gT0 + offsetOf(k);
    if (t.x < 0.0 || t.y < 0.0 || t.x >= uCount.x || t.y >= uCount.y) continue;   // none past the map's edge
    vec4 a = floor(texture2D(uTiles, (t + 0.5) / uCount) * 255.0 + 0.5);            // terrain, roads, rivers, out
    if (a.g < 0.5 && a.b < 0.5) continue;
    vec4 kk = floor(texture2D(uKinds, (t + 0.5) / uCount) * 255.0 + 0.5);           // road kind, river kind
    float wobRoad = texture2D(uPalette, vec2((kk.r + 0.5) / 256.0, row(4.0))).b;
    float wobRiver = texture2D(uPalette, vec2((kk.g + 0.5) / 256.0, row(4.0))).b;
    vec2 pr = p + wob * wobRoad; vec2 pv = p + wob * wobRiver;
    vec2 c = centerOf(t);
    float par = mod(t.y, 2.0);
    float nRoad = 0.0; float nRiver = 0.0;
    vec2 road1 = c; vec2 road2 = c; vec2 river1 = c; vec2 river2 = c; float out1 = 0.0; float out2 = 0.0;
    float armRoad = 1.0e9; float armRiver = 1.0e9; float armAlong = 0.0; float armFlow = 0.0;
    for (int dir = 0; dir < 8; dir++) {
      float bit = pow(2.0, float(dir));
      bool river = mod(floor(a.b / bit), 2.0) > 0.5;
      bool road = mod(floor(a.g / bit), 2.0) > 0.5;
      if (!river && !road) continue;
      vec2 o;
      if (uGridType < 1.5) {
        o = dir == 0 ? vec2(1.0, 0.0) : dir == 1 ? vec2(1.0, 1.0) : dir == 2 ? vec2(0.0, 1.0) : dir == 3 ? vec2(-1.0, 1.0)
          : dir == 4 ? vec2(-1.0, 0.0) : dir == 5 ? vec2(-1.0, -1.0) : dir == 6 ? vec2(0.0, -1.0) : vec2(1.0, -1.0);
      } else {
        if (dir > 5) continue;
        o = dir == 0 ? vec2(1.0, 0.0) : dir == 1 ? vec2(par, 1.0) : dir == 2 ? vec2(par - 1.0, 1.0) : dir == 3 ? vec2(-1.0, 0.0)
          : dir == 4 ? vec2(par - 1.0, -1.0) : vec2(par, -1.0);
      }
      vec2 mid = (c + centerOf(t + o)) * 0.5;
      vec2 ab = mid - c;
      if (river) {
        nRiver += 1.0;
        float outBit = mod(floor(a.a / bit), 2.0);
        if (nRiver < 1.5) { river1 = mid; out1 = outBit; } else { river2 = mid; out2 = outBit; }
        float d = sdSegment(pv, c, mid);
        if (d < armRiver) armFlow = (outBit > 0.5 ? 1.0 : -1.0) * dot(pv - c, ab) / max(length(ab), 0.0001);
        armRiver = min(armRiver, d);
      }
      if (road) {
        nRoad += 1.0;
        if (nRoad < 1.5) road1 = mid; else road2 = mid;
        float d = sdSegment(pr, c, mid);
        if (d < armRoad) armAlong = dot(pr - c, ab) / max(length(ab), 0.0001) + dot(c, vec2(0.37, 0.61));
        armRoad = min(armRoad, d);
      }
    }
    if (nRiver > 0.5) {
      float d = armRiver; float fl = armFlow;
      if (abs(nRiver - 2.0) < 0.5) {                 // one curve through the tile
        vec2 bz = sdBezier(pv, river1, c, river2);
        float len = distance(river1, c) + distance(c, river2);
        d = bz.x; fl = out2 > 0.5 ? bz.y * len : out1 > 0.5 ? (1.0 - bz.y) * len : bz.y * len;
      }
      if (d < dRiver) { kRiver = kk.g; flow = fl; }
      dRiver = smin(dRiver, d, uSize * 0.06);
    }
    if (nRoad > 0.5) {
      float d = armRoad; float al = armAlong;
      if (abs(nRoad - 2.0) < 0.5) {
        vec2 bz = sdBezier(pr, road1, c, road2);
        d = bz.x; al = bz.y * (distance(road1, c) + distance(c, road2)) + dot(c, vec2(0.37, 0.61));
      }
      if (d < dRoad) { kRoad = kk.r; alongRoad = al; }
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
    float w = art.g * 0.2 * uSize * (0.85 + 0.3 * noise(p / (uSize * 0.8))) * (1.0 + 1.4 * mouth);
    float shown = smoothstep(-shoreW * 2.5, 0.0, landDist);
    float d = dRiver - w;
    vec3 wc = R1;
    float streak = abs(fract((flow - uTime * uSize * 0.15) / (uSize * 0.16) + noise(p / (uSize * 0.2)) * 0.3) - 0.5);
    wc = mix(wc, R3, (1.0 - smoothstep(0.05, 0.12, streak)) * (1.0 - smoothstep(0.0, w * 0.6, dRiver)) * 0.8 * (1.0 - mouth));
    onRiver = fill(d);
    col = mix(col, wc, onRiver * shown);
    col = mix(col, R2, inkLine(d, gPx * 0.7 + uSize * 0.004) * shown * (1.0 - mouth * 0.7));
  }
  if (dRoad < uSize * 0.3) {
    vec3 R1 = texture2D(uPalette, vec2((kRoad + 0.5) / 256.0, row(1.0))).rgb;
    vec3 R2 = texture2D(uPalette, vec2((kRoad + 0.5) / 256.0, row(2.0))).rgb;
    vec3 R3 = texture2D(uPalette, vec2((kRoad + 0.5) / 256.0, row(3.0))).rgb;
    vec4 art = texture2D(uPalette, vec2((kRoad + 0.5) / 256.0, row(4.0)));
    float look = floor(art.r * 255.0 + 0.5);      // 1 dirt, 2 paved, 3 trail, 4 highway, 5 rail, 6 light
    float w = max(art.g * 0.2 * uSize, gPx * 1.2);
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
  }

  // Walls of walled scenery (castles, keeps, ruins): a band inside the type's outer tile edges (straight: the tiles'
  // own edges), its face toward the outside, crenels; open where a road goes through (a gate, drawn as a sprite),
  // broken where it has gaps (ruins). Towers at the corners are sprites (painter/sprites.ts).
  float sc = gSc[4];
  if (sc > 0.5) {
    vec4 wl = texture2D(uPalette, vec2((sc + 0.5) / 256.0, row(4.0)));
    if (wl.r > 0.5) {
      float inset = wl.g * 0.5 * uSize; float ww = max(wl.b * 0.2 * uSize, gPx * 2.0); float gaps = wl.a;
      vec2 c0 = centerOf(gT0);
      float road0 = floor(texture2D(uTiles, (clamp(gT0, vec2(0.0), uCount - 1.0) + 0.5) / uCount).g * 255.0 + 0.5);
      float dmin = 1.0e9; float along = 0.0; float gate = 0.0; float edgeSeed = 0.0;
      for (int k = 0; k < 9; k++) {
        if (k == 4) continue;
        if (uGridType < 1.5 && (k == 0 || k == 2 || k == 6 || k == 8)) continue;   // square tiles: 4 neighbours
        if (abs(gSc[k] - sc) < 0.5) continue;                                        // the same scenery: no wall
        vec2 o = offsetOf(k);
        vec2 ck = centerOf(gT0 + o);
        vec2 axis = ck - c0; float len = length(axis); vec2 n = axis / len;
        float d = len * 0.5 - dot(p - c0, n);
        if (d < dmin) {
          dmin = d;
          along = dot(p - (c0 + axis * 0.5), vec2(-n.y, n.x));
          gate = hasBit(road0, dirOf(o, mod(gT0.y, 2.0))) ? 1.0 : 0.0;
          edgeSeed = hash(c0 + ck);
        }
      }
      float off = dmin - inset;                     // 0 on the wall's middle, negative outside
      bool open = gate > 0.5 && abs(along) < uSize * 0.13;
      bool broken = gaps > 0.0 && noise(vec2(along / (ww * 3.0), edgeSeed * 50.0)) < gaps;
      if (dmin < 1.0e8 && abs(off) < ww * 0.5 + gPx * 2.0 && !open && !broken) {
        vec3 W1 = texture2D(uPalette, vec2((sc + 0.5) / 256.0, row(1.0))).rgb;
        vec3 W2 = texture2D(uPalette, vec2((sc + 0.5) / 256.0, row(2.0))).rgb;
        float t = off / (ww * 0.5);                 // -1 its outer edge .. 1 its inner edge
        vec3 face = mix(W1, W2, 0.3) * 0.86;
        vec3 wc = t < 0.0 ? face : W1;
        float merlon = step(0.5, fract(along / (ww * 1.2)));
        wc = mix(wc, W1 * 1.04, step(t, -0.35) * merlon);
        col = mix(col, wc, fill(abs(off) - ww * 0.5));
        col = mix(col, INK, inkLine(abs(off) - ww * 0.5, gPx * 0.7) * 0.9);
        col = mix(col, INK, inkLine(off + ww * 0.1, gPx * 0.45) * 0.35);
      }
    }
  }

  // paper grain
  float grain = noise(p / (uSize * 0.02)) * 0.5 + noise(p / (uSize * 0.4)) * 0.5;
  col *= 0.93 + 0.09 * grain;
  gl_FragColor = vec4(col, 1.0);
}
`
