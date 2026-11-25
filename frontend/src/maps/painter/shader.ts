/**
 * The map painter's shaders (plan 47). PAINT_FRAGMENT draws the painted terrain, roads and rivers of the part of the
 * map in view into a texture the map shader then uses under the pictures; OBJECT_* draw the landmarks, one quad each,
 * into the same texture.
 *
 * Per pixel: the 3 × 3 tiles around the pixel's tile are read once (top of main: their terrain and random byte) into
 * globals for the region's borders.
 *
 * Built for Direct3D's compiler (Windows browsers: ANGLE to HLSL, then FXC), which inlines every call and unrolls
 * every loop that doesn't read a texture: this shader once took 50 s to build there, and the browser froze meanwhile.
 * So each big piece is in the code once, in a loop that reads a texture (ANGLE keeps those as loops): the two regions'
 * grounds (one loop reading their colours), the glyphs (one call, in a loop of two passes reading their colours; its
 * cells read their base's tile), the roads and rivers (a loop over the 3 × 3 tiles reading each). Texture reads stay
 * at most one call deep (deeper ones overflowed Direct3D's translator, see maps/shader.ts). `make gpu-check` reports
 * the build's time. Terrain borders are one system for every pair: the point is wobbled by noise and the
 * nearest tile centre wins (the Voronoi of the centres is the grid itself, square or hex); near the border with the
 * nearest tile of another terrain the two blend in a band (dithered in sketch). Glyph terrains (trees, hills,
 * mountains) scatter glyphs on a jittered grid in world space (seamless), draw the 3 × 4 cells around back to front,
 * and keep a glyph where its own centre lies in that terrain (whole trees, organic edges).
 *
 * Materials (domain/map_paint.py numbers): 1 grassland, 2 sand, 3 dirt, 4 rock, 5 snow, 6 marsh, 7 fields, 10 low
 * grass, 11 tall grass, 20 pines, 21 broadleaf, 22 redwoods, 23 dead trees, 24 palms, 30 hills, 31 mountains,
 * 32 snowy peaks, 33 volcano, 40 ocean, 41 lake; roads 50 dirt, 51 paved, 52 trail; rivers 60 river, 61 stream.
 * Styles: 0 sketch (flat colours, ink, paper grain), 1 diorama (pixel grid, light and soft shadows, posterized).
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
uniform float uStyle;     // 0 sketch, 1 diorama
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
uniform sampler2D uKinds; // per tile: road kind, river kind, a random byte
uniform sampler2D uPalette;
uniform vec3 uBackground;
${COMMON}

// The 3 x 3 tiles around the pixel's tile, read once in main
vec2 gT0;
float gTer[9]; float gRnd[9];
float gPx; // one canvas pixel, in map px (anti-aliasing, ink)

vec2 offsetOf(int k) { return vec2(float(k - (k / 3) * 3) - 1.0, float(k / 3) - 1.0); }

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

// Diorama helpers: a 4 x 4 ordered dither (pixel-art gradients) on the world's pixel grid, three tones by light
float bayer2(vec2 a) { return mod(a.x * 2.0 + a.y * 3.0, 4.0); }
float dither(vec2 p) {
  vec2 c = floor(p / (uSize / 24.0));
  return (bayer2(mod(c, 2.0)) * 4.0 + bayer2(mod(floor(c / 2.0), 2.0))) / 16.0 - 0.47;
}
// A surface's colour from its light (0 dark .. 1 lit): sketch two flat tones; diorama three, dithered between
vec3 shade(vec3 dark, vec3 mid, float l, vec2 p) {
  if (uStyle < 0.5) return l > 0.42 ? mid : dark;
  float d = l + dither(p) * 0.18;
  vec3 light = mix(mid, vec3(1.0, 0.98, 0.92), 0.14) * 1.04;
  return d < 0.36 ? dark : d < 0.72 ? mid : light;
}
// The outline colour: ink (sketch), a darker tone of what it outlines (diorama)
vec3 inkOf(vec3 c) { return uStyle > 0.5 ? c * 0.5 : INK; }
// Diorama: shadows fall to the bottom right of what stands up
vec2 shadowOffset(float h) { return vec2(0.55, 0.32) * h; }

// -- flat grounds -------------------------------------------------------------------------------------------------
vec3 ground(float m, vec2 p, vec3 A, vec3 B, vec3 C, float rnd) {
  float s = uSize;
  float n = fbm(p / (s * 0.9) + rnd * 3.0);
  vec3 col = mix(A, C, smoothstep(0.55, 0.85, n) * 0.6);
  if (uStyle > 0.5) {                  // diorama: the ground in dithered steps
    float t = n + dither(p) * 0.14;
    col = t > 0.6 ? mix(A, C, 0.5) : t < 0.4 ? mix(A, B, 0.22) : A;
  }
  vec2 cell; vec2 f; vec2 j;
  if (m < 1.5) {                       // grassland: a few short strokes
    cell = floor(p / (s * 0.16)); f = fract(p / (s * 0.16)); j = hash2(cell);
    if (j.x > 0.72) {
      vec2 q = (f - 0.3 - j * 0.4) * s * 0.16;
      float d = min(sdSegment(q, vec2(-0.03, 0.0) * s, vec2(0.0, -0.035) * s), sdSegment(q, vec2(0.0, -0.035) * s, vec2(0.03, 0.0) * s));
      col = mix(col, B, inkLine(d, s * 0.006) * 0.8);
    }
  } else if (m < 2.5) {                // sand: stippled dots
    cell = floor(p / (s * 0.07)); j = hash2(cell);
    vec2 q = p - (cell + 0.2 + 0.6 * j) * s * 0.07;
    if (j.y > 0.45) col = mix(col, B, fill(length(q) - s * 0.008) * 0.75);
  } else if (m < 3.5) {                // cracked dirt: cell borders
    vec2 g = p / (s * 0.3); vec2 gi = floor(g); float d1 = 9.0; float d2 = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)); vec2 c = o + hash2(gi + o) - fract(g);
      float d = dot(c, c); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
    col = mix(col, B, (1.0 - smoothstep(0.0, 0.06, sqrt(d2) - sqrt(d1))) * 0.7);
  } else if (m < 4.5) {                // rock: big cracks and light flecks
    vec2 g = p / (s * 0.45); vec2 gi = floor(g); float d1 = 9.0; float d2 = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)); vec2 c = o + hash2(gi + o) - fract(g);
      float d = dot(c, c); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
    col = mix(col, C, smoothstep(0.2, 0.0, d1) * 0.35);
    col = mix(col, B, (1.0 - smoothstep(0.0, 0.05, sqrt(d2) - sqrt(d1))) * 0.8);
  } else if (m < 5.5) {                // snow: soft blue shadows, sparkles
    col = mix(A, B, smoothstep(0.45, 0.8, fbm(p / (s * 0.5) + 2.0)) * 0.55);
    cell = floor(p / (s * 0.09)); j = hash2(cell);
    if (j.x > 0.93) col = mix(col, C, fill(length(p - (cell + j) * s * 0.09) - s * 0.01));
  } else if (m < 6.5) {                // marsh: puddles, reeds
    float w = fbm(p / (s * 0.35) + 4.0);
    col = mix(col, B, smoothstep(0.52, 0.56, w));
    col = mix(col, INK, inkLine(w - 0.54, 0.004) * 0.5);
    cell = floor(p / (s * 0.12)); j = hash2(cell + 3.0);
    if (j.x > 0.6 && w < 0.5) {
      vec2 q = p - (cell + vec2(0.5, 0.8)) * s * 0.12;
      float d = min(sdSegment(q, vec2(0.0), vec2(-0.012, -0.06) * s), sdSegment(q, vec2(0.0), vec2(0.014, -0.05) * s));
      col = mix(col, C, inkLine(d, s * 0.006));
    }
  } else if (m < 7.5) {                // fields: patches in two tones, furrows, hedges
    vec2 g = p / (s * 0.55) + vec2(fbm(p / s) * 0.6);
    vec2 gi = floor(g); vec2 gf = fract(g);
    float h = hash(gi);
    col = mix(A, mix(A, B, 0.45), step(0.5, h));
    float stripes = abs(fract((h > 0.5 ? gf.x : gf.y) * 7.0) - 0.5);
    col = mix(col, B, (1.0 - smoothstep(0.08, 0.16, stripes)) * 0.35);
    float edge = min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y));
    col = mix(col, C, 1.0 - smoothstep(0.03, 0.06, edge));
  } else {                             // low and tall grass: tufts
    float big = m > 10.5 ? 1.0 : 0.0;
    float cs = s * (0.13 - 0.03 * big);
    cell = floor(p / cs); j = hash2(cell + 5.0);
    if (j.x > 0.45 - 0.25 * big) {
      vec2 q = p - (cell + vec2(0.2 + 0.6 * j.y, 0.75)) * cs;
      float h = s * (0.03 + 0.03 * big) * (0.8 + 0.4 * j.x);
      float sway = uTime > 0.0 ? sin(uTime * 1.6 + p.x * 0.05) * 0.25 : 0.0;
      float d = min(sdSegment(q, vec2(0.0), vec2(-0.45 + sway, -1.0) * h), min(sdSegment(q, vec2(0.0), vec2(sway, -1.25) * h), sdSegment(q, vec2(0.0), vec2(0.45 + sway, -1.0) * h)));
      col = mix(col, B, inkLine(d, s * 0.006));
    }
  }
  return col;
}

// -- glyphs: trees, hills, mountains -------------------------------------------------------------------------------
// Draws one material's glyphs over col (back to front); id: its palette entry (glyphs only where it is)
vec3 glyphs(float m, float id, vec2 p, vec3 A, vec3 B, vec3 C, vec3 col) {
  float s = uSize;
  bool dio = uStyle > 0.5;
  float tree = m > 19.5 && m < 29.5 ? 1.0 : 0.0;
  float cs = tree > 0.5 ? s * (m > 21.5 && m < 22.5 ? 0.17 : m > 23.5 ? 0.26 : 0.2) : m < 30.5 ? s * 0.4 : s * (m > 31.5 ? 0.62 : 0.55);
  // Trees on square cells; hills and mountains on wider, shallower ones (rows overlap: no lattice shows)
  vec2 cell2 = tree > 0.5 ? vec2(cs) : vec2(cs, cs * 0.62);
  vec2 g = floor(p / cell2);
  float ow = gPx * 0.7 + s * 0.004;                 // outline width
  // Glyphs rise from their base: the cells at and below the pixel's (top to bottom: back to front)
  for (int n = 0; n < 15; n++) {
    {
      float dy = floor(float(n) / 3.0) - 1.0;
      if (tree > 0.5 && dy > 2.5) continue;
      vec2 cell = g + vec2(float(n) - (dy + 1.0) * 3.0 - 1.0, dy);
      vec2 j = hash2(cell + id * 13.0);
      float row = mod(cell.y, 2.0) * 0.5;           // odd rows shifted: no visible lattice
      vec2 base = tree > 0.5 ? (cell + vec2(0.1 + row * 0.6, 0.25) + vec2(0.7 - row * 0.3, 0.6) * j) * cs
        : (cell + vec2(row * 0.5, 0.0) + j * vec2(0.9, 1.0)) * cell2;
      // Only where its base lies in this terrain: the tile under the wobbled base (tiles are their centres' Voronoi
      // cells, so it's the nearest centre's; past the map's edge, the edge tile's)
      vec2 tb = clamp(tileOf(base + warp(base)), vec2(0.0), uCount - 1.0);
      if (floor(texture2D(uTiles, (tb + 0.5) / uCount).r * 255.0 + 0.5) != id) continue;
      if (tree > 0.5 && j.x * j.y > 0.62) continue; // a few gaps
      if (tree < 0.5 && hash(cell + 31.0) > (m < 30.5 ? 0.72 : 0.62)) continue;
      vec2 q = p - base;
      float k = 0.82 + 0.4 * hash(cell + 2.0);
      float sway = uTime > 0.0 ? sin(uTime * 1.3 + base.x * 0.03 + base.y * 0.02) : 0.0;
      if (tree > 0.5) {
        if (m < 20.5 || (m > 21.5 && m < 22.5)) {    // pines and redwoods: a jagged cone, lit from the left
          float h = cs * (m > 21.5 ? 2.0 : 1.5) * k; float w = cs * (m > 21.5 ? 0.5 : 0.68) * k;
          float y = -q.y / h;
          float xs = q.x - sway * 0.04 * h * y;
          float hw = w * 0.5 * (1.0 - y) * (0.8 + 0.4 * abs(fract(y * 4.0 + 0.5) - 0.5) * 2.0);
          float d = max(abs(xs) - hw, max(-y, y - 1.0) * h);
          if (dio) {                                 // its shadow on what's behind and under it
            vec2 sq = q - shadowOffset(h * 0.35);
            float sy = -sq.y / (h * 0.7);
            float sd = max(abs(sq.x) - w * 0.5 * (1.0 - sy), max(-sy, sy - 1.0) * h);
            col = mix(col, col * 0.62, fill(sd) * (1.0 - fill(d)));
          }
          float trunk = max(abs(q.x) - cs * 0.035, max(q.y - cs * 0.12, -q.y));
          col = mix(col, m > 21.5 ? B : inkOf(B), fill(trunk));
          vec3 dark = m > 21.5 ? mix(A, INK, 0.35) : B;
          vec3 leaf = shade(dark, A, 0.55 - xs / max(hw, 0.001) * 0.45 + y * 0.25, p);
          col = mix(col, leaf, fill(d));
          col = mix(col, inkOf(leaf), inkLine(d, ow) * step(-s * 0.02, d) * 0.9);
          if (!dio) col = mix(col, INK, inkLine(xs, gPx * 0.5) * fill(d + s * 0.01) * step(0.2, y) * 0.5);
        } else if (m < 23.5) {                       // broadleaf: a round bumpy crown on a short trunk
          float r = cs * 0.5 * k;
          vec2 c = q - vec2(sway * 0.04 * r * 2.0, -r * 1.25);
          float a = atan(c.y, c.x);
          float d = length(c) - r * (1.0 + 0.08 * sin(a * 7.0 + j.x * 6.0));
          if (dio) col = mix(col, col * 0.62, fill(length(c - shadowOffset(r * 0.9)) - r) * (1.0 - fill(d)));
          float trunk = sdSegment(q, vec2(0.0), vec2(0.0, -r * 0.6)) - cs * 0.03;
          col = mix(col, inkOf(B), fill(trunk));
          vec2 nrm = c / r;
          vec3 leaf = shade(B, A, 0.5 + 0.6 * dot(nrm, vec2(-0.6, -0.8)) - 0.1 * length(nrm), p);
          col = mix(col, leaf, fill(d));
          col = mix(col, inkOf(leaf), inkLine(d, ow) * 0.9);
        } else if (m < 24.5 && m > 23.5) {           // palms: a bent trunk, fronds fanning from its top
          float h = cs * 1.1 * k;
          vec2 top = vec2((j.x - 0.5) * cs * 0.5 + sway * 0.06 * h, -h);
          float trunk = min(sdSegment(q, vec2(0.0), vec2(top.x * 0.3, -h * 0.5)), sdSegment(q, vec2(top.x * 0.3, -h * 0.5), top)) - cs * 0.035;
          if (dio) col = mix(col, col * 0.62, fill(length(q - top - shadowOffset(h * 0.6)) - cs * 0.35));
          col = mix(col, mix(B, INK, 0.35), fill(trunk));
          // the six fronds: the two nearest by angle around the top (evenly spread, so no loop)
          vec2 rel = (q - top - vec2(0.0, 0.25 * cs * 0.22)) / vec2(1.0, 0.6);
          float at = (atan(rel.y, rel.x) - sway * 0.1) / 6.2831853 * 6.0 - j.y;
          float fronds = 1.0e5;
          for (int f = 0; f < 2; f++) {
            float a = 6.2831853 * (floor(at) + float(f) + j.y) / 6.0 + sway * 0.1;
            vec2 dir = vec2(cos(a), sin(a) * 0.6 + 0.25);
            vec2 r = q - top - dir * cs * 0.22;
            vec2 nd = normalize(dir);
            vec2 local = vec2(dot(r, nd), dot(r, vec2(-nd.y, nd.x)));
            fronds = min(fronds, (length(local / vec2(cs * 0.26, cs * 0.07)) - 1.0) * cs * 0.07);
          }
          vec3 leaf = shade(B, A, 0.55 - (q.x - top.x) / cs, p);
          col = mix(col, leaf, fill(fronds));
          col = mix(col, inkOf(leaf), inkLine(fronds, ow * 0.8) * 0.8);
        } else {                                      // dead trees: forked branches
          float h = cs * 1.3 * k;
          float d = sdSegment(q, vec2(0.0), vec2(0.0, -h));
          d = min(d, sdSegment(q, vec2(0.0, -h * 0.45), vec2(-h * 0.3, -h * 0.85)));
          d = min(d, sdSegment(q, vec2(0.0, -h * 0.6), vec2(h * 0.28, -h * 0.95)));
          d = min(d, sdSegment(q, vec2(0.0, -h * 0.8), vec2(h * 0.12, -h * 1.1)));
          if (dio) col = mix(col, col * 0.7, fill(sdSegment(q, vec2(0.0), shadowOffset(h * 0.5)) - s * 0.012));
          col = mix(col, A, fill(d - s * 0.012));
          col = mix(col, inkOf(A), inkLine(d - s * 0.012, gPx * 0.6) * 0.9);
        }
      } else if (m < 30.5) {                          // hills: a dome, lit from the left, a few strokes below
        float w = cs * (0.3 + 0.45 * j.y) * k; float h = w * (0.38 + 0.25 * j.x);
        vec2 c = q / vec2(w, h);
        float d = max((length(c) - 1.0) * min(w, h), q.y);
        if (dio) col = mix(col, col * 0.66, fill(max((length((q - shadowOffset(h * 0.5)) / vec2(w, h)) - 1.0) * min(w, h), q.y - h * 0.3)) * (1.0 - fill(d)));
        vec3 hill = shade(B, A, 0.55 - c.x * 0.5 - c.y * 0.2, p);
        col = mix(col, hill, fill(d));
        col = mix(col, inkOf(hill), inkLine(d, ow) * step(q.y, -h * 0.05) * 0.9);
        if (!dio) {
          float hatch = abs(fract((q.x + q.y) / (s * 0.035)) - 0.5);
          col = mix(col, INK, (1.0 - smoothstep(0.12, 0.25, hatch)) * fill(d) * step(0.25, c.x) * 0.35);
        }
      } else {                                         // mountains: a jagged peak, a lit face and a shaded one
        float h = cs * (m > 31.5 ? 1.2 : 1.0) * k * (0.6 + 0.8 * j.y);
        float w = min(h * (0.72 + 0.3 * j.x), cs * 0.9);
        float apex = (j.x - 0.5) * w * 0.45;
        float y = -q.y / h;
        float jag = (noise(vec2(q.y / (cs * 0.09), j.x * 9.0)) - 0.5) * cs * 0.08;
        float left = -w + (apex + w) * y + jag;
        float right = w - (w - apex) * y - jag;
        float d = max(max(left - q.x, q.x - right), max(-q.y - h, q.y));
        if (dio) {
          vec2 sq = q - shadowOffset(h * 0.3);
          float sy = -sq.y / h;
          col = mix(col, col * 0.6, fill(max(max(-w + (apex + w) * sy - sq.x, sq.x - w + (w - apex) * sy), max(-sq.y - h, sq.y))) * (1.0 - fill(d)));
        }
        float ridge = mix(apex, apex * 0.2 + w * 0.2, 1.0 - y) + (noise(vec2(q.y / (cs * 0.12), j.y * 7.0)) - 0.5) * cs * 0.06;
        bool lit = q.x < ridge;
        float l = lit ? 0.62 + 0.3 * (1.0 - (ridge - q.x) / max(ridge - left, 0.001)) : 0.2 + 0.25 * (1.0 - (q.x - ridge) / max(right - ridge, 0.001));
        vec3 face = shade(B, A, l, p);
        if (m > 32.5) { // volcano: cut flat, a glowing crater, lava down its side
          d = max(d, -q.y - h * 0.8);
          float lava = abs(q.x - apex * 0.8 - sin(q.y * 0.12) * w * 0.08) - w * 0.05 * (1.0 - y);
          face = mix(face, C, fill(lava) * step(0.2, y));
          if (y > 0.76) face = mix(face, C, 0.85);
        } else if (m > 31.5 && y > 0.58 + 0.1 * noise(vec2(q.x / (cs * 0.08), j.x * 5.0))) {
          face = lit ? C : mix(C, B, 0.45);              // snow caps
        }
        col = mix(col, face, fill(d));
        if (!dio) {                                       // hatching on the shaded face
          float hatch = abs(fract((q.x - q.y * 0.6) / (s * 0.03)) - 0.5);
          col = mix(col, INK, (1.0 - smoothstep(0.1, 0.22, hatch)) * fill(d) * (lit ? 0.0 : 1.0) * 0.35 * step(0.08, y));
          col = mix(col, INK, inkLine(q.x - ridge, gPx * 0.6) * fill(d + s * 0.01) * 0.6);
        }
        col = mix(col, inkOf(face), inkLine(d, ow * 1.2) * step(q.y, -h * 0.02) * 0.95);
      }
    }
  }
  return col;
}

// What lies under a glyph terrain's glyphs: trees and hills their third colour (ground, grass), mountains their foot
// (snowy peaks and volcanoes: their rock; their third colour is the snow, the lava)
vec3 footOf(float m, vec3 A, vec3 B, vec3 C) {
  if (m > 31.5 && m < 39.5) return mix(A, B, m > 32.5 ? 0.55 : 0.25);
  return C;
}

// -- water -----------------------------------------------------------------------------------------------------------
// Colours: A the water, B the deep (its foam: a lighter B), C the shoreline (drawn in main)
vec3 water(float m, vec2 p, vec3 A, vec3 B, vec3 C, float shore) {
  float s = uSize;
  vec3 foam = mix(B, vec3(1.0), 0.62);
  // Deep away from the shore; within a tile (the shore is known only within the tiles around)
  float deep = smoothstep(s * 0.05, s * (m > 40.5 ? 0.75 : 0.85), shore);
  vec3 col = mix(A, B, deep * 0.7);
  if (uStyle > 0.5) {                  // diorama: depth in dithered bands, sparkles on the surface
    float t = deep + (fbm(p / (s * 0.6) + uTime * 0.05) - 0.5) * 0.3 + dither(p) * 0.15;
    col = t < 0.3 ? mix(A, C, 0.35) : t < 0.7 ? A : mix(A, B, 0.8);
    if (deep < 0.8 && hash(floor(p / (s / 24.0)) + floor(uTime * 2.0)) > 0.996) col = mix(col, vec3(1.0), 0.7);
  }
  float t = uTime;
  // ripples along the shore, wave marks out at sea
  float r = abs(fract((shore - t * s * 0.02) / (s * 0.09)) - 0.5);
  col = mix(col, mix(B, INK, 0.3), (1.0 - smoothstep(0.03, 0.08, r)) * (1.0 - smoothstep(s * 0.12, s * 0.3, shore)) * 0.6);
  vec2 cell = floor(p / (s * 0.28)); vec2 j = hash2(cell + 9.0);
  if (j.x > 0.7 && shore > s * 0.25) {
    vec2 q = p - (cell + 0.25 + 0.5 * j) * s * 0.28 - vec2(sin(t * 0.7 + j.y * 6.0) * s * 0.01, 0.0);
    float wv = abs(q.y + sin(q.x / (s * 0.025)) * s * 0.008) ;
    col = mix(col, foam, (1.0 - smoothstep(s * 0.004, s * 0.008, wv)) * step(abs(q.x), s * 0.06) * 0.9);
  }
  return col;
}

void main() {
  float q = uRes.x / uView.z;                      // canvas pixels per map px
  vec2 p = uView.xy + vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / q;
  gPx = 1.0 / q;
  if (uStyle > 0.5) {                              // diorama: the world on a pixel grid
    float px = uSize / 24.0;
    p = (floor(p / px) + 0.5) * px;
    gPx = max(gPx, px * 0.5);
  }
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
  float mA = idA < 0.5 ? 0.0 : floor(texture2D(uPalette, vec2((idA + 0.5) / 256.0, 0.125)).r * 255.0 + 0.5);
  float mB = idB < 0.5 ? 0.0 : floor(texture2D(uPalette, vec2((idB + 0.5) / 256.0, 0.125)).r * 255.0 + 0.5);
  bool waterA = mA > 39.5 && mA < 49.5; bool waterB = mB > 39.5 && mB < 49.5;
  float band = uSize * 0.14;
  float f = smoothstep(-band, band, e);              // 1: fully this region
  // Each region's ground (this one; the other where they blend): what lies under its glyphs (trees: their ground
  // colour; hills and mountains: their foot). One loop: ground() and water() are compiled once.
  vec3 colA = uBackground; vec3 colB = uBackground;
  vec3 shoreline = INK;                              // the water's third colour
  for (int i = 0; i < 2; i++) {
    bool second = i == 1;
    float m = second ? mB : mA;
    if (m < 0.5 || (second && f >= 0.999)) continue;
    float id = second ? idB : idA;
    vec3 C1 = texture2D(uPalette, vec2((id + 0.5) / 256.0, 0.375)).rgb;
    vec3 C2 = texture2D(uPalette, vec2((id + 0.5) / 256.0, 0.625)).rgb;
    vec3 C3 = texture2D(uPalette, vec2((id + 0.5) / 256.0, 0.875)).rgb;
    vec3 c;
    if (m > 39.5 && m < 49.5) { c = water(m, p, C1, C2, C3, second ? -e : waterB ? 1.0e5 : e); shoreline = C3; }
    else if (m > 19.5 && m < 39.5) { vec3 ft = footOf(m, C1, C2, C3); c = ground(1.0, p, ft, mix(ft, C2, 0.6), mix(ft, vec3(1.0), 0.2), reg.w); }
    else c = ground(m, p, C1, C2, C3, reg.w);
    if (second) colB = c; else colA = c;
  }
  if (uStyle < 0.5) {
    // sketch: a stippled, wobbly fade (any pair the same way)
    float dither = (hash(floor(p / max(gPx * 2.0, uSize * 0.012))) - 0.5) * 0.6;
    f = smoothstep(0.35, 0.65, f + dither * (1.0 - abs(f - 0.5) * 2.0));
  }
  if (waterA != waterB) f = step(0.0, e);           // shores are sharp
  vec3 col = mix(colB, colA, f);
  if (waterA != waterB) col = mix(col, shoreline, inkLine(e, gPx * 0.9 + uSize * 0.008));

  // Glyphs: this region's, and the other's when it's near (lower kinds first: hills, trees, mountains). Two passes
  // of one loop: glyphs() is compiled once.
  bool gA = mA > 19.5 && mA < 39.5; bool gB = mB > 19.5 && mB < 39.5 && e < uSize * 1.2;
  bool bFirst = gB && (!gA || mB < mA);
  for (int i = 0; i < 2; i++) {
    bool useB = (i == 0) == bFirst;
    if (useB ? !gB : !gA) continue;
    float id = useB ? idB : idA;
    vec3 G1 = texture2D(uPalette, vec2((id + 0.5) / 256.0, 0.375)).rgb;
    vec3 G2 = texture2D(uPalette, vec2((id + 0.5) / 256.0, 0.625)).rgb;
    vec3 G3 = texture2D(uPalette, vec2((id + 0.5) / 256.0, 0.875)).rgb;
    col = glyphs(useB ? mB : mA, id, p, G1, G2, G3, col);
  }

  // Rivers, then roads: arms from tile centres to their edges' middles, the 3 x 3 tiles around joined smoothly
  vec2 pw = p + (vec2(noise(p / (uSize * 0.35)), noise(p / (uSize * 0.35) + 5.0)) - 0.5) * uSize * 0.12;
  float dRiver = 1.0e9; float kRiver = 0.0; float flow = 0.0;
  float dRoad = 1.0e9; float kRoad = 0.0;
  for (int k = 0; k < 9; k++) {
    vec2 t = gT0 + offsetOf(k);
    if (t.x < 0.0 || t.y < 0.0 || t.x >= uCount.x || t.y >= uCount.y) continue;   // none past the map's edge
    vec4 a = floor(texture2D(uTiles, (t + 0.5) / uCount) * 255.0 + 0.5);            // terrain, roads, rivers, out
    if (a.g < 0.5 && a.b < 0.5) continue;
    vec4 kk = floor(texture2D(uKinds, (t + 0.5) / uCount) * 255.0 + 0.5);           // road kind, river kind
    vec2 c = centerOf(t);
    float par = mod(t.y, 2.0);
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
      float d = sdSegment(pw, c, mid);
      if (river) {
        if (d < dRiver) {
          kRiver = kk.g;
          vec2 ab = mid - c;
          float along = dot(pw - c, ab) / max(dot(ab, ab), 0.0001) * length(ab);
          float way = mod(floor(a.a / bit), 2.0) > 0.5 ? 1.0 : -1.0;
          flow = way * along;
        }
        dRiver = smin(dRiver, d, uSize * 0.06);
      }
      if (road) {
        if (d < dRoad) kRoad = kk.r;
        dRoad = smin(dRoad, d, uSize * 0.05);
      }
    }
  }
  if (dRiver < uSize * 0.3) {
    float m = floor(texture2D(uPalette, vec2((kRiver + 0.5) / 256.0, 0.125)).r * 255.0 + 0.5);
    vec3 R1 = texture2D(uPalette, vec2((kRiver + 0.5) / 256.0, 0.375)).rgb;
    vec3 R2 = texture2D(uPalette, vec2((kRiver + 0.5) / 256.0, 0.625)).rgb;
    vec3 R3 = texture2D(uPalette, vec2((kRiver + 0.5) / 256.0, 0.875)).rgb;
    float w = uSize * (m > 60.5 ? 0.035 : 0.06) * (0.85 + 0.3 * noise(p / (uSize * 0.8)));
    if (uStyle > 0.5) w = max(w, uSize / 24.0 * 1.2);
    float d = dRiver - w;
    vec3 wc = R1;
    float streak = abs(fract((flow - uTime * uSize * 0.15) / (uSize * 0.16) + noise(p / (uSize * 0.2)) * 0.3) - 0.5);
    wc = mix(wc, R3, (1.0 - smoothstep(0.05, 0.12, streak)) * (1.0 - smoothstep(0.0, w * 0.6, dRiver)) * 0.8);
    col = mix(col, wc, fill(d));
    col = mix(col, R2, inkLine(d, gPx * 0.7 + uSize * 0.004));
  }
  if (dRoad < uSize * 0.3) {
    float m = floor(texture2D(uPalette, vec2((kRoad + 0.5) / 256.0, 0.125)).r * 255.0 + 0.5);
    vec3 R1 = texture2D(uPalette, vec2((kRoad + 0.5) / 256.0, 0.375)).rgb;
    vec3 R2 = texture2D(uPalette, vec2((kRoad + 0.5) / 256.0, 0.625)).rgb;
    vec3 R3 = texture2D(uPalette, vec2((kRoad + 0.5) / 256.0, 0.875)).rgb;
    float w = uSize * (m > 51.5 ? 0.016 : m > 50.5 ? 0.038 : 0.03);
    if (uStyle > 0.5) w = max(w, uSize / 24.0 * (m > 51.5 ? 0.8 : 1.3));  // at least a pixel-art pixel or so
    float d = dRoad - w;
    if (m > 51.5) {                                  // trail: dashes
      float dash = step(0.45, fract((p.x + p.y) / (uSize * 0.07)));
      col = mix(col, R1, fill(d) * dash);
    } else {
      vec3 rc = R1;
      if (m > 50.5) {                                // paved: joints between stones
        vec2 st = fract(pw / (uSize * 0.035));
        rc = mix(rc, R3, (1.0 - smoothstep(0.0, 0.18, min(st.x, st.y))) * 0.6);
      } else {
        rc = mix(rc, R3, (1.0 - smoothstep(0.0, w * 0.25, abs(dRoad - w * 0.45))) * 0.5);
      }
      col = mix(col, rc, fill(d));
      col = mix(col, R2, inkLine(d, gPx * 0.6 + uSize * 0.003));
    }
  }

  if (uStyle < 0.5) {
    // paper grain
    float grain = noise(p / (uSize * 0.02)) * 0.5 + noise(p / (uSize * 0.4)) * 0.5;
    col *= 0.93 + 0.09 * grain;
  } else {
    // diorama: a warm light
    col *= vec3(1.04, 1.0, 0.93);
  }
  gl_FragColor = vec4(col, 1.0);
}
`
