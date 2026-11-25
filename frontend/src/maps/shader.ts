/**
 * The map shader: one full-canvas quad. For each pixel it finds its tile (square or hex), reads the tile's fog,
 * draws the grid line by its distance to the tile's edge, and colours the fog. Nothing is drawn per tile, so
 * a 40 000-tile grid costs the same as a small one.
 *
 * Fog values: 0 unknown, 0.2 unknown but touching known or visible tiles (the edge ring), 0.5 known, 1 visible.
 * - flat: each tile its own state (unknown: the fog colour, known: grey, visible: the map),
 * - immersive: visible tiles are fully shown and known tiles fully seen (grey); the map's colour fades into
 *   known tiles next to visible ones (a soft blur of the states around, wobbled with noise); the fog's soft edge
 *   is drawn in the edge ring (by distance to the known tiles, never tile-shaped). Farther unknown tiles are all
 *   fog: players' pictures are black there (the server adds the edge ring to them). The fog is a texture
 *   (static, or moving when animated).
 */
export const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

export const FRAGMENT = `
precision highp float;
uniform vec2 uRes;          // canvas pixels
uniform vec2 uWorld;        // map px
uniform vec4 uView;         // the part of the map the canvas covers: x, y, w, h (map px)
uniform vec2 uTexSize;      // the picture's texture, in texels
uniform vec3 uBackground;   // where no picture covers the map
uniform sampler2D uMap;
uniform float uHasMap;
uniform sampler2D uPaint;   // the painter's drawing of the part in view (plan 47), under the pictures
uniform float uHasPaint;    // with it, the pictures' texture has alpha (premultiplied)
uniform vec3 uTint;         // the hour's light on the map (painter/daylight.ts: 1, 1, 1 at noon; the painting is lit already)
uniform sampler2D uFog;
uniform float uHasFog;
uniform vec2 uFogSize;      // columns, rows
uniform float uGridType;    // 0 none, 1 square, 2 hex
uniform float uShowGrid;
uniform float uSize;
uniform vec2 uOrigin;
uniform vec3 uGridColor;
uniform float uGridOpacity;
uniform float uGridMode;    // 0 colour, 1 contrast, 2 inverse
uniform float uLine;        // line width, canvas pixels
uniform float uMode;        // 0 flat, 1 soft
uniform float uStyle;       // 0 mist, 1 smoke, 2 clouds, 3 ink, 4 parchment, 5 void, 6 nebula, 7 embers, 8 blizzard, 9 depths
uniform vec3 uFog1;         // the fog's three colours (each style uses them its own way)
uniform vec3 uFog2;
uniform vec3 uFog3;
uniform float uFxSize;      // the fog's features: 1 normal, bigger is larger
uniform float uFxIntensity; // 0..1: the style's main variable
uniform float uEdge;        // 0..1: how organic the soft edges are (0.5 by default)
uniform float uKnown;       // 0..1: how much known tiles lose colour and light (0.5: grey, a little darker)
uniform float uTime;        // seconds, already scaled by the preset's motion (0: still)
uniform float uSeeThrough;  // the DM sees the map under unknown tiles
uniform float uGridSeen;    // grid lines only on known and visible tiles (map Sets)

const float SQRT3 = 1.7320508;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return v;
}

// The tile under a point, as (column, row); and the distance to that tile's edge (map px)
vec2 tileOf(vec2 p, out float edge) {
  if (uGridType < 1.5) {
    vec2 q = (p - uOrigin) / uSize;
    vec2 t = floor(q);
    vec2 f = fract(q);
    edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * uSize;
    return t;
  }
  float R = uSize / SQRT3;
  vec2 rel = p - uOrigin - vec2(uSize * 0.5, R);
  float q = (SQRT3 / 3.0 * rel.x - rel.y / 3.0) / R;
  float r = (2.0 / 3.0 * rel.y) / R;
  float x = q; float z = r; float y = -x - z;
  float rx = floor(x + 0.5); float ry = floor(y + 0.5); float rz = floor(z + 0.5);
  float dx = abs(rx - x); float dy = abs(ry - y); float dz = abs(rz - z);
  if (dx > dy && dx > dz) { rx = -ry - rz; } else if (dy <= dz) { rz = -rx - ry; }
  float row = rz;
  float col = rx + (rz - mod(rz, 2.0)) / 2.0;
  vec2 c = uOrigin + vec2(uSize * (col + 0.5 + 0.5 * mod(row, 2.0)), R + row * 1.5 * R);
  vec2 v = p - c;
  float m = max(abs(v.x), max(abs(0.5 * v.x + 0.8660254 * v.y), abs(-0.5 * v.x + 0.8660254 * v.y)));
  edge = uSize * 0.5 - m;
  return vec2(col, row);
}

// A tile's centre, and a point's distance to the tile (0 inside it)
vec2 centerOf(vec2 t) {
  if (uGridType < 1.5) return uOrigin + (t + 0.5) * uSize;
  float R = uSize / SQRT3;
  return uOrigin + vec2(uSize * (t.x + 0.5 + 0.5 * mod(t.y, 2.0)), R + t.y * 1.5 * R);
}
float tileDist(vec2 p, vec2 t) {
  vec2 v = p - centerOf(t);
  if (uGridType < 1.5) return length(max(abs(v) - uSize * 0.5, 0.0));
  float m = max(abs(v.x), max(abs(0.5 * v.x + 0.8660254 * v.y), abs(-0.5 * v.x + 0.8660254 * v.y)));
  return max(m - uSize * 0.5, 0.0);
}

bool inside(vec2 t) { return t.x >= 0.0 && t.y >= 0.0 && t.x < uFogSize.x && t.y < uFogSize.y; }

float stateOf(vec2 t) {
  if (uHasFog < 0.5) return 1.0;
  if (!inside(t)) return 0.0;
  return texture2D(uFog, (t + 0.5) / uFogSize).r;
}

// The state at a point, for the flat editor's lines. It reads the fog itself: calling stateOf from here (a texture
// read two calls deep, four times) made Direct3D's shader translator overflow its stack on Windows browsers, the
// program never linked, and maps fell back to the plain 2D drawing (no fog looks, no contrast/inverse grid).
float stateAt(vec2 p) {
  float e;
  vec2 t = tileOf(p, e);
  float s = inside(t) ? texture2D(uFog, (t + 0.5) / uFogSize).r : 0.0;
  return s < 0.25 ? 0.0 : s;
}

// The fog's look. Each style uses the three fog colours its own way (named in the Set's settings); size scales its
// features; intensity (0..1, 0.5 by default) is the style's main variable.
vec3 fogTexture(vec2 p, float t) {
  float k = uFxIntensity;
  vec2 q = p / (max(uSize * 4.0, 120.0) * uFxSize);
  if (uStyle < 0.5) {        // mist: shadow (1), veils (2), light (3); intensity: denser, more contrasted veils
    float n = fbm(q + vec2(t * 0.035, t * 0.02));
    float m = fbm(q * 1.7 - vec2(t * 0.02, -t * 0.03));
    float v = clamp((n * m * 2.0 - 0.5) * (0.5 + 2.0 * k) + 0.5, 0.0, 1.0);
    return v < 0.5 ? mix(uFog1, uFog2, v * 2.0) : mix(uFog2, uFog3, v * 2.0 - 1.0);
  } else if (uStyle < 1.5) { // smoke: dark (1), smoke (2), wisps (3); intensity: more curl, thicker wisps
    vec2 w = vec2(fbm(q + t * 0.05), fbm(q + vec2(5.2, 1.3) - t * 0.04));
    float n = fbm(q * 1.4 + (1.0 + 3.0 * k) * w);
    vec3 col = mix(uFog1, uFog2, smoothstep(0.25, 0.85, n));
    return mix(col, uFog3, smoothstep(0.6, 0.8, n) * 0.6 * (0.4 + k));
  } else if (uStyle < 2.5) { // clouds: sky (1), cloud shade (2), cloud (3); intensity: how much sky they cover
    float n = fbm(q * 0.8 + vec2(t * 0.025, 0.0));
    float lo = 0.55 - 0.4 * k;
    vec3 cloud = mix(uFog2, uFog3, smoothstep(lo + 0.08, lo + 0.3, n));
    return mix(uFog1, cloud, smoothstep(lo, lo + 0.4, n));
  } else if (uStyle < 3.5) { // ink: ink (1), grain (2), stains (3); intensity: more grain and stains
    float n = fbm(q * 3.0);
    float st = fbm(q * 0.7 + 7.0);
    vec3 col = mix(uFog1, uFog2, clamp(n * (0.4 + 1.2 * k), 0.0, 1.0));
    return mix(col, uFog3, smoothstep(0.6, 0.8, st) * clamp(0.2 + 1.2 * k, 0.0, 1.0));
  } else if (uStyle < 4.5) { // parchment: stains (1), paper (2), light paper (3); intensity: more stains
    float n = fbm(q * 2.0);
    float s = fbm(q * 0.6 + 3.0);
    vec3 paper = mix(uFog2, uFog3, smoothstep(0.3, 0.75, n));
    return mix(paper, uFog1, smoothstep(0.75 - 0.4 * k, 0.95 - 0.4 * k, s) * 0.85);
  } else if (uStyle < 5.5) { // void: sky (1), stars (2), tinted stars (3); slow twinkling motes of random size;
                             // intensity: how many
    float cs = 18.0 * uFxSize;
    vec2 cell = floor(p / cs);
    float h = hash(cell);
    float twinkle = 0.0;
    if (h < mix(0.003, 0.06, k * k)) {
      float sz = cs * mix(0.05, 0.5, hash(cell + 3.1));
      vec2 at = (cell + 0.5) * cs + (vec2(hash(cell + 7.7), hash(cell + 1.3)) - 0.5) * (cs - sz);
      vec2 d = abs(p - at);
      twinkle = step(max(d.x, d.y), sz * 0.5) * (0.5 + 0.5 * sin(t * (1.0 + h * 30.0) + h * 400.0));
    }
    return mix(uFog1, hash(cell + 5.5) > 0.6 ? uFog3 : uFog2, twinkle * 0.9);
  }
  if (uStyle > 6.5 && uStyle < 7.5) { // embers: ash (1), smoke (2), embers (3) rising and flickering; intensity: how many
    vec2 w = vec2(fbm(q * 0.9 + t * 0.03), fbm(q * 0.9 + vec2(3.1, 7.7) - t * 0.025));
    float n = fbm(q * 1.3 + 1.5 * w + vec2(0.0, t * 0.04));
    vec3 col = mix(uFog1, uFog2, smoothstep(0.3, 0.8, n));
    float cs = 14.0 * uFxSize;
    vec2 ep = p + vec2(sin(p.y / (cs * 3.0) + t * 0.7) * cs * 0.3, t * cs * 0.9);
    vec2 cell = floor(ep / cs);
    float h = hash(cell + 21.0);
    if (h < mix(0.01, 0.12, k)) {
      vec2 at = (cell + 0.5 + (vec2(hash(cell + 4.2), hash(cell + 9.1)) - 0.5) * 0.6) * cs;
      float r = cs * mix(0.05, 0.14, hash(cell + 1.7));
      float flick = 0.6 + 0.4 * sin(t * (3.0 + h * 50.0) + h * 300.0);
      col += uFog3 * smoothstep(r * 2.5, 0.0, length(ep - at)) * flick * 1.2;
    }
    return col + uFog3 * 0.14 * smoothstep(0.55, 0.9, n) * k;
  }
  if (uStyle > 7.5 && uStyle < 8.5) { // blizzard: shadow (1), snow haze (2), flakes (3) on the wind; intensity: how hard it snows
    float n = fbm(q + vec2(t * 0.08, t * 0.03));
    vec3 col = mix(uFog1, uFog2, smoothstep(0.25, 0.8, n));
    float wind = 0.4 + 1.2 * k;
    for (int layer = 0; layer < 2; layer++) {
      float fl = float(layer);
      float cs = (10.0 + fl * 8.0) * uFxSize;
      vec2 sp = p - vec2(t * cs * wind * (1.2 + fl), t * cs * (1.6 + fl));
      vec2 cell = floor(sp / cs);
      float h = hash(cell + 31.0 + fl * 7.0);
      if (h < mix(0.08, 0.45, k)) {
        vec2 at = (cell + 0.5 + (vec2(hash(cell + 2.9 + fl), hash(cell + 6.3 + fl)) - 0.5) * 0.7) * cs;
        float r = cs * mix(0.06, 0.12, hash(cell + 8.8));
        col = mix(col, uFog3, smoothstep(r, r * 0.3, length(sp - at)) * (0.55 + 0.45 * fl));
      }
    }
    return col;
  }
  if (uStyle > 8.5) { // depths: deep (1), water (2), light (3) in rippling caustics; intensity: how bright the light
    float n = fbm(q * 0.9 + vec2(t * 0.02, -t * 0.015));
    vec3 col = mix(uFog1, uFog2, smoothstep(0.25, 0.85, n));
    vec2 cq = q * 5.0;
    float c1 = noise(cq + vec2(t * 0.25, t * 0.18) + fbm(q * 2.0 + t * 0.05));
    float c2 = noise(cq * 1.4 - vec2(t * 0.2, -t * 0.22) + 3.7);
    float lines = pow(1.0 - abs(c1 - c2), 16.0);
    return col + uFog3 * lines * (0.15 + 0.9 * k) * smoothstep(0.2, 0.7, n);
  }
  // nebula: space (1), gas (2), second gas (3), dust lanes, tiny stars; animated, the gas swirls and slides very
  // slowly; intensity: how bright the gas glows
  vec2 r = q * 1.1;
  float a = t * 0.04;
  vec2 swirl = vec2(cos(a), sin(a)) * 0.35;
  vec2 w = vec2(fbm(r + swirl + vec2(1.7, 9.2)), fbm(r - swirl.yx + vec2(8.3, 2.8)));
  vec2 slide = vec2(t * 0.004, -t * 0.0025);
  float n = fbm(r + 1.6 * w + slide);
  float m = fbm(r * 1.9 - 1.2 * w + vec2(4.0, 1.0) - slide);
  float g = 0.4 + 1.2 * k;
  vec3 col = uFog1;
  col += uFog2 * pow(smoothstep(0.3, 0.85, n), 1.6) * 0.95 * g;
  col += uFog3 * pow(smoothstep(0.42, 0.9, m), 2.0) * 0.6 * (0.4 + n) * g;
  col *= 0.7 + 0.3 * smoothstep(0.2, 0.6, fbm(r * 3.1 + w));
  float cs = 9.0 * uFxSize;
  vec2 cell = floor(p / cs);
  float h = hash(cell + 11.0);
  if (h > 0.972) {
    vec2 at = (cell + 0.5) * cs + (vec2(hash(cell + 2.3), hash(cell + 5.9)) - 0.5) * cs * 0.66;
    float star = smoothstep(1.4 * hash(cell + 8.1) + 0.5, 0.0, length(p - at));
    col += vec3(0.85, 0.9, 1.0) * star * (0.75 + 0.25 * sin(t * (0.6 + h) + h * 30.0));
  }
  return col;
}

// Zoomed in past the picture's resolution: a bicubic (Catmull-Rom) sample, 9 bilinear taps, instead of blocky texels
vec3 catmullRom(vec2 uv) {
  vec2 pos = uv * uTexSize;
  vec2 t1 = floor(pos - 0.5) + 0.5;
  vec2 f = pos - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 p0 = (t1 - 1.0) / uTexSize;
  vec2 p3 = (t1 + 2.0) / uTexSize;
  vec2 p12 = (t1 + w2 / w12) / uTexSize;
  vec3 r = texture2D(uMap, vec2(p0.x, p0.y)).rgb * w0.x * w0.y;
  r += texture2D(uMap, vec2(p12.x, p0.y)).rgb * w12.x * w0.y;
  r += texture2D(uMap, vec2(p3.x, p0.y)).rgb * w3.x * w0.y;
  r += texture2D(uMap, vec2(p0.x, p12.y)).rgb * w0.x * w12.y;
  r += texture2D(uMap, vec2(p12.x, p12.y)).rgb * w12.x * w12.y;
  r += texture2D(uMap, vec2(p3.x, p12.y)).rgb * w3.x * w12.y;
  r += texture2D(uMap, vec2(p0.x, p3.y)).rgb * w0.x * w3.y;
  r += texture2D(uMap, vec2(p12.x, p3.y)).rgb * w12.x * w3.y;
  r += texture2D(uMap, vec2(p3.x, p3.y)).rgb * w3.x * w3.y;
  return clamp(r, 0.0, 1.0);
}

void main() {
  float q = uRes.x / uView.z;                        // canvas pixels per map px
  vec2 p = uView.xy + vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / q;
  // The picture: mipmapped when zoomed out (the texture's filter), bicubic when zoomed in past its texels
  float texelsPerPx = uTexSize.x / uWorld.x;
  vec3 base;
  if (uHasPaint > 0.5) {
    vec4 pic = uHasMap > 0.5 ? texture2D(uMap, p / uWorld) : vec4(0.0);
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 painted = texture2D(uPaint, uv).rgb;
    base = painted * (1.0 - pic.a) + pic.rgb * uTint;
  } else {
    base = (uHasMap < 0.5 ? uBackground : q > texelsPerPx * 1.2 ? catmullRom(p / uWorld) : texture2D(uMap, p / uWorld).rgb) * uTint;
  }
  float t = uTime;

  float edge;
  vec2 tile = tileOf(p, edge);
  float own = uGridType < 0.5 ? 1.0 : stateOf(tile);
  // lit: how much of the map's colour (visible); seen: how far out of the fog (known or visible)
  float lit = own > 0.75 ? 1.0 : 0.0;
  float seen = own > 0.25 ? 1.0 : 0.0;
  if (uHasFog > 0.5 && uMode > 0.5 && uGridType > 0.5 && own > 0.25 && own < 0.75) {
    // Known tiles next to visible ones: the map's colour fades in, a soft blur of the tile states around the
    // pixel (about one and a half tiles) whose centre wanders with noise, so it's organic, never tile-shaped.
    bool near = false;
    for (int dy = -2; dy <= 2; dy++) {
      for (int dx = -2; dx <= 2; dx++) {
        vec2 n = tile + vec2(float(dx), float(dy));
        if (inside(n) && stateOf(n) > 0.75) near = true;
      }
    }
    if (near) {
      float R = uSize * 1.5;
      vec2 warp = (vec2(fbm(p / (uSize * 0.9) + t * 0.04), fbm(p / (uSize * 0.9) + vec2(7.3, 2.1) - t * 0.03)) - 0.5) * uSize * 0.8 * (0.2 + 1.6 * uEdge);
      vec2 c = p + warp;
      float sumW = 0.0; float vis = 0.0;
      for (int ring = 0; ring <= 4; ring++) {
        float rad = R * float(ring) / 4.0;
        float w = exp(-2.2 * (rad / R) * (rad / R));
        for (int k = 0; k < 12; k++) {
          if (ring == 0 && k > 0) break;
          float a = 6.2831853 * (float(k) + 0.5 * float(ring)) / 12.0;
          float e;
          vec2 st = tileOf(c + vec2(cos(a), sin(a)) * rad, e);
          if (!inside(st)) continue;
          vis += w * step(0.75, stateOf(st));
          sumW += w;
        }
      }
      lit = smoothstep(0.0, 1.0, clamp(vis / max(sumW, 0.0001) * 2.2, 0.0, 1.0));
    }
  } else if (uHasFog > 0.5 && uMode > 0.5 && uGridType > 0.5 && own > 0.1 && own < 0.25) {
    // The edge ring: an unknown tile touching known or visible ones. Known and visible tiles stay fully shown;
    // here the map fades out, from fully seen at their edge to fog where the farther unknown tiles start (or
    // a tile further on). The fade wobbles with noise in its middle only, so both ends meet their tiles.
    float dK = 100000.0; float dV = 100000.0; float dO = 100000.0;
    for (int dy = -2; dy <= 2; dy++) {
      for (int dx = -2; dx <= 2; dx++) {
        vec2 n = tile + vec2(float(dx), float(dy));
        if (!inside(n)) continue;
        float s = stateOf(n);
        float d = tileDist(p, n);
        if (s > 0.25) dK = min(dK, d);
        if (s > 0.75) dV = min(dV, d);
        if (s < 0.1) dO = min(dO, d);
      }
    }
    float x = dK / (uSize * 0.95);
    if (dO < 99999.0) x = max(x, dK / max(dK + dO, 0.001));
    x = clamp(x, 0.0, 1.0);
    float wob = (fbm(p / (uSize * 0.7) + vec2(t * 0.04, -t * 0.03)) - 0.5) * 3.2 * uEdge;
    x = clamp(x + wob * x * (1.0 - x) * 2.0, 0.0, 1.0);
    seen = 1.0 - smoothstep(0.0, 1.0, x);
    lit = dV < 99999.0 ? 1.0 - smoothstep(0.0, uSize * 0.6, dV - dK) : 0.0;
  }

  float gray = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 known = mix(vec3(gray), base, 1.0 - min(1.0, uKnown * 2.0)) * (1.0 - 0.36 * uKnown);
  vec3 shown = mix(known, base, lit);
  vec3 fogCol = uMode < 0.5 ? vec3(0.0) : fogTexture(p, t);
  vec3 col = mix(fogCol, shown, seen);
  col = mix(col, mix(col, shown * 0.55, uSeeThrough), 1.0 - seen);

  // Grid lines: by distance to the tile's edge, inside the grid only
  if (uShowGrid > 0.5 && uGridType > 0.5 && inside(tile)) {
    float hw = uLine * 0.5;
    float d = edge * q;
    float a = 1.0 - smoothstep(hw - 0.6, hw + 0.6, d);
    if (a > 0.0) {
      vec3 line = uGridColor;
      if (uGridMode > 1.5) { line = vec3(1.0) - col; }
      else if (uGridMode > 0.5) { line = dot(col, vec3(0.299, 0.587, 0.114)) > 0.5 ? vec3(0.0) : vec3(1.0); }
      float alpha = uGridOpacity * a;
      if (uHasFog > 0.5 && uGridSeen > 0.5 && own < 0.25) alpha = 0.0;  // none on unknown tiles (nor the edge ring)
      if (uHasFog > 0.5) {
        if (uMode < 0.5) {
          // Flat (the editor): the line between differing states is grey
          float e2 = uSize * 0.12;
          float s1 = stateAt(p + vec2(e2, 0.0)); float s2 = stateAt(p - vec2(e2, 0.0));
          float s3 = stateAt(p + vec2(0.0, e2)); float s4 = stateAt(p - vec2(0.0, e2));
          float lo = min(min(s1, s2), min(s3, s4)); float hi = max(max(s1, s2), max(s3, s4));
          if (hi - lo > 0.1) { line = vec3(0.55); alpha = max(alpha, 0.85 * a); }
        } else {
          alpha *= seen;  // immersive: no lines in the fog
        }
      }
      col = mix(col, line, alpha);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`

export const FOG_STYLES = ['mist', 'smoke', 'clouds', 'ink', 'parchment', 'void', 'nebula', 'embers', 'blizzard', 'depths'] as const
export type FogStyle = (typeof FOG_STYLES)[number]
/** Flat: tile by tile (black, grey, the map). Soft: organic edges and the style's fog. */
export type FogDisplay = 'flat' | 'soft'

/** How the fog looks (a fog preset's look; the server's domain/fog.py). */
export interface FogLook {
  display: FogDisplay
  style: FogStyle
  /** Each style's roles for them: FOG_COLOR_ROLES. */
  colors: [string, string, string]
  /** 0.25 to 4: the features' scale. */
  size: number
  /** 0 to 1: the style's main variable (FOG_INTENSITY). */
  intensity: number
  /** 0 to 2: how fast it moves (0: still). */
  motion: number
  /** 0 to 1: how organic the soft edges are. */
  edge: number
  /** 0 to 1: how much known tiles lose colour and light. */
  known: number
}

/** The Saga's default preset (domain/fog.py DEFAULT_LOOK): a soft, bright mist drifting slowly. */
export const DEFAULT_FOG_LOOK: FogLook = {
  display: 'soft', style: 'mist', colors: ['#7d8590', '#d3d8df', '#ffffff'], size: 1, intensity: 0.45, motion: 0.6, edge: 0.5, known: 0.5,
}

/** What each style does with the three colours. */
export const FOG_COLOR_ROLES: Record<FogStyle, [string, string, string]> = {
  mist: ['Shadow', 'Veils', 'Light'],
  smoke: ['Dark', 'Smoke', 'Wisps'],
  clouds: ['Sky', 'Cloud shade', 'Cloud'],
  ink: ['Ink', 'Grain', 'Stains'],
  parchment: ['Stains', 'Paper', 'Light paper'],
  void: ['Sky', 'Stars', 'Tinted stars'],
  nebula: ['Space', 'Gas', 'Second gas'],
  embers: ['Ash', 'Smoke', 'Embers'],
  blizzard: ['Shadow', 'Snow haze', 'Flakes'],
  depths: ['Deep', 'Water', 'Light'],
}

/** What intensity changes, per style. */
export const FOG_INTENSITY: Record<FogStyle, string> = {
  mist: 'Denser, more contrasted veils',
  smoke: 'More curl, thicker wisps',
  clouds: 'More of the sky covered',
  ink: 'More grain and stains',
  parchment: 'More stains',
  void: 'More stars',
  nebula: 'Brighter gas',
  embers: 'More embers',
  blizzard: 'Harder snow, stronger wind',
  depths: 'Brighter rippling light',
}

/** Styles' names. */
export const FOG_STYLE_LABELS: Record<FogStyle, string> = {
  mist: 'Mist', smoke: 'Smoke', clouds: 'Clouds', ink: 'Ink', parchment: 'Parchment', void: 'Void', nebula: 'Nebula',
  embers: 'Embers', blizzard: 'Blizzard', depths: 'Depths',
}
