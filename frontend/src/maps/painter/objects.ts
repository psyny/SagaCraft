/**
 * Landmarks' shaders (plan 47): one quad each, centred on its anchor tile, its size in tiles (so the same landmark
 * fits square and hex grids), drawn into the painter's texture after the terrain. Each type draws with signed
 * distances: shapes filled in its colours (A walls or stone, B roofs or shade, C accents), the right side a little
 * darker (light from the top left), outlined in ink (sketch) or in a darker tone of the fill (diorama, on a pixel
 * grid). Variants change the composition; the variant comes from the server (picked at random when placed).
 *
 * Materials: 100 castle, 101 city, 102 village, 103 farm, 104 tower, 110 mine, 111 ruins, 112 temple, 113 standing
 * stones, 114 windmill, 115 lighthouse, 116 camp, 117 cave, 118 portal.
 */
import { COMMON } from './shader'

export const OBJECT_VERTEX = `
attribute vec2 aCorner;     // -1..1
attribute vec4 aPlace;      // centre x, y (map px), radius (map px), seed
attribute vec2 aKind;       // material, variant
attribute vec3 aColA;
attribute vec3 aColB;
attribute vec3 aColC;
uniform vec4 uView;
varying vec2 vUv;
varying vec4 vPlace;
varying vec2 vKind;
varying vec3 vA;
varying vec3 vB;
varying vec3 vC;
void main() {
  vec2 pos = aPlace.xy + aCorner * aPlace.z * 1.35;
  vec2 clip = vec2((pos.x - uView.x) / uView.z * 2.0 - 1.0, 1.0 - (pos.y - uView.y) / uView.w * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vUv = aCorner * 1.35; vPlace = aPlace; vKind = aKind; vA = aColA; vB = aColB; vC = aColC;
}
`

export const OBJECT_FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform vec4 uView;
varying vec2 vUv;
varying vec4 vPlace;
varying vec2 vKind;
varying vec3 vA;
varying vec3 vB;
varying vec3 vC;
${COMMON}

float gAA;   // anti-aliasing width, in the quad's units
vec4 acc;    // the drawing so far (straight colour, coverage)

float sdBox(vec2 p, vec2 c, vec2 b) { vec2 d = abs(p - c) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
// A roof or a peak: a triangle on a base from (c.x - w, c.y) to (c.x + w, c.y), its top h above
float sdRoof(vec2 p, vec2 c, float w, float h) {
  vec2 q = p - c;
  float y = -q.y / h;
  return max(abs(q.x) - w * (1.0 - y), max(q.y, -q.y - h));
}
float cover(float d) { return 1.0 - smoothstep(-gAA, gAA, d); }
void put(float d, vec3 c) { float a = cover(d); acc.rgb = mix(acc.rgb, c, a); acc.a = max(acc.a, a); }
void ink(float d, float w) {
  float a = 1.0 - smoothstep(w - gAA, w + gAA, abs(d));
  vec3 c = uStyle > 0.5 ? acc.rgb * 0.45 : INK;
  acc.rgb = mix(acc.rgb, c, a); acc.a = max(acc.a, a);
}
// A shape: filled, its right part a little darker (the light comes from the top left), outlined
void shape(float d, vec2 p, float cx, vec3 c) {
  vec3 col = p.x > cx ? mix(c, INK, 0.22) : c;
  if (uStyle > 0.5) col = mix(col, vec3(1.0, 0.96, 0.85), smoothstep(0.3, -0.6, p.x - cx) * 0.18);
  put(d, col);
  ink(d, uStyle > 0.5 ? 0.012 : 0.022);
}
// A house: walls, a roof, a door
void house(vec2 p, vec2 at, float w, float h, vec3 walls, vec3 roof) {
  shape(sdBox(p, at - vec2(0.0, h * 0.5), vec2(w, h * 0.5)), p, at.x + w * 0.35, walls);
  shape(sdRoof(p, at - vec2(0.0, h), w * 1.25, h * 0.9), p, at.x, roof);
  put(sdBox(p, at - vec2(-w * 0.35, h * 0.22), vec2(w * 0.16, h * 0.22)), INK);
}
// A tower: walls, a cone roof with a banner (or battlements), a window
void tower(vec2 p, vec2 at, float w, float h, vec3 walls, vec3 roof, vec3 flag, float cone) {
  shape(sdBox(p, at - vec2(0.0, h * 0.5), vec2(w, h * 0.5)), p, at.x + w * 0.3, walls);
  if (cone > 0.5) {
    shape(sdRoof(p, at - vec2(0.0, h), w * 1.3, w * 2.2), p, at.x, roof);
    put(sdSegment(p, at - vec2(0.0, h + w * 2.2), at - vec2(0.0, h + w * 2.9)) - 0.012, INK);
    put(sdBox(p, at - vec2(-w * 0.4, h + w * 2.72), vec2(w * 0.38, w * 0.17)), flag);
  } else {
    for (int i = 0; i < 3; i++) {
      float x = at.x - w + w * (0.33 + 0.67 * float(i));
      shape(sdBox(p, vec2(x, at.y - h - w * 0.22), vec2(w * 0.2, w * 0.22)), p, x, walls);
    }
  }
  put(sdBox(p, at - vec2(0.0, h * 0.62), vec2(w * 0.12, w * 0.22)), INK);
}
// A ring stone (the standing stones), back or front of the ring
void stone(vec2 p, float i, float v, float front, vec3 c) {
  float a = 6.2831853 * i / 7.0 + v;
  if ((sin(a) > 0.0 ? 1.0 : 0.0) != front) return;
  vec2 at = vec2(cos(a) * 0.6, 0.35 + sin(a) * 0.22);
  float h = 0.32 + 0.12 * hash(vec2(i, v));
  shape(sdBox(p, at - vec2(0.0, h * 0.5), vec2(0.07, h * 0.5)) - 0.02, p, at.x, c);
}

void main() {
  float m = floor(vKind.x + 0.5);
  float v = floor(vKind.y + 0.5);
  float seed = vPlace.w;
  vec2 p = vUv;
  float q = uRes.x / uView.z;                  // canvas px per map px
  gAA = 0.8 / (q * vPlace.z);
  if (uStyle > 0.5) { p = (floor(p * 22.0) + 0.5) / 22.0; gAA = max(gAA, 0.03); }
  vec3 A = vA; vec3 B = vB; vec3 C = vC;
  // A soft shadow under it (the diorama's falls to the bottom right)
  vec2 so = uStyle > 0.5 ? vec2(0.12, 0.05) : vec2(0.0);
  float sh = length((p - vec2(0.0, 0.58) - so) / vec2(0.85, 0.26)) - 1.0;
  acc = vec4(0.0, 0.0, 0.0, (1.0 - smoothstep(-0.3, 0.1, sh)) * (uStyle > 0.5 ? 0.35 : 0.18));

  if (m < 100.5) {                              // castle
    if (v < 0.5) {
      shape(sdBox(p, vec2(0.0, 0.3), vec2(0.62, 0.28)), p, 0.25, A);
      for (int i = 0; i < 5; i++) shape(sdBox(p, vec2(-0.5 + 0.25 * float(i), -0.02), vec2(0.07, 0.06)), p, 0.2, A);
      tower(p, vec2(-0.62, 0.6), 0.14, 0.75, A, B, C, 1.0);
      tower(p, vec2(0.62, 0.6), 0.14, 0.75, A, B, C, 1.0);
      tower(p, vec2(0.0, 0.35), 0.24, 0.95, A, B, C, 0.0);
      put(sdBox(p, vec2(0.0, 0.5), vec2(0.1, 0.12)), INK);
    } else if (v < 1.5) {
      shape(sdBox(p, vec2(0.0, 0.35), vec2(0.7, 0.22)), p, 0.3, A);
      tower(p, vec2(-0.3, 0.45), 0.2, 1.1, A, B, C, 1.0);
      tower(p, vec2(0.25, 0.55), 0.16, 0.7, A, B, C, 0.0);
      tower(p, vec2(0.62, 0.58), 0.11, 0.55, A, B, C, 1.0);
    } else {
      tower(p, vec2(-0.55, 0.45), 0.13, 0.6, A, B, C, 0.0);
      shape(sdBox(p, vec2(0.0, 0.3), vec2(0.55, 0.3)), p, 0.2, A);
      tower(p, vec2(0.0, 0.2), 0.3, 0.75, A, B, C, 1.0);
      tower(p, vec2(0.55, 0.55), 0.13, 0.6, A, B, C, 0.0);
      put(sdBox(p, vec2(0.0, 0.48), vec2(0.09, 0.12)), INK);
    }
  } else if (m < 101.5) {                       // city: houses in rows (back first), a tower, a wall in front
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      float row = floor(fi / 3.0);
      vec2 at = vec2(-0.55 + 0.55 * (fi - row * 3.0) + (hash(vec2(fi, v + seed)) - 0.5) * 0.18, -0.05 + row * 0.27);
      float w = 0.13 + 0.06 * hash(vec2(fi + 3.0, v));
      if (i == 4 && v > 0.5) tower(p, at + vec2(0.0, 0.05), 0.12, 0.85, A, B, C, 1.0);
      else house(p, at, w, 0.2 + 0.1 * hash(vec2(fi, 9.0 + v)), A, B);
    }
    // its wall in front: stone, with battlements
    shape(sdBox(p, vec2(0.0, 0.62), vec2(0.82, 0.07)), p, 0.3, A);
    for (int i = 0; i < 7; i++) shape(sdBox(p, vec2(-0.72 + 0.24 * float(i), 0.52), vec2(0.05, 0.04)), p, 0.3, A);
  } else if (m < 102.5) {                       // village: a few houses by a field
    float field = length((p - vec2(0.3, 0.5)) / vec2(0.45, 0.18)) - 1.0;
    put(field, mix(C, vec3(1.0), 0.15));
    ink(field, 0.012);
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      if (v < 0.5 && i == 3) continue;
      vec2 at = vec2(-0.55 + 0.38 * fi + (hash(vec2(fi, v)) - 0.5) * 0.15, 0.1 + 0.28 * mod(fi + v, 2.0));
      house(p, at, 0.16, 0.2, A, B);
    }
  } else if (m < 103.5) {                       // farm: a house (and a barn), a fence
    house(p, vec2(-0.1, 0.35), 0.3, 0.32, A, B);
    if (v > 0.5) house(p, vec2(0.5, 0.45), 0.18, 0.22, A, mix(B, INK, 0.2));
    put(max(abs(p.y - 0.62) - 0.014, abs(p.x) - 0.85), C);
    for (int i = 0; i < 7; i++) put(sdBox(p, vec2(-0.8 + 0.27 * float(i), 0.58), vec2(0.016, 0.07)), C);
  } else if (m < 104.5) {                       // tower: stone, a cone roof (or battlements), a lit window
    tower(p, vec2(0.0, 0.6), 0.22 - 0.04 * v, 1.0 + 0.15 * v, A, B, C, v > 1.5 ? 0.0 : 1.0);
    put(length(p - vec2(0.0, -0.15)) - 0.05, C);
  } else if (m < 110.5) {                       // mine: a rocky mound, a dark entrance with timber
    shape(sdRoof(p, vec2(0.0, 0.6), 0.85, 0.95), p, 0.1, A);
    put(sdBox(p, vec2(0.0, 0.42), vec2(0.18, 0.18)) - 0.06, C);
    put(sdBox(p, vec2(-0.21, 0.42), vec2(0.035, 0.2)), B);
    put(sdBox(p, vec2(0.21, 0.42), vec2(0.035, 0.2)), B);
    put(sdBox(p, vec2(0.0, 0.2), vec2(0.27, 0.035)), B);
    if (v > 0.5) {
      put(sdBox(p, vec2(0.58, 0.55), vec2(0.12, 0.05)), B);
      put(length(p - vec2(0.51, 0.62)) - 0.03, INK);
      put(length(p - vec2(0.65, 0.62)) - 0.03, INK);
    }
  } else if (m < 111.5) {                       // ruins: broken walls and columns
    put(length((p - vec2(0.0, 0.6)) / vec2(0.7, 0.09)) - 1.0, C);
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float h = 0.2 + 0.5 * hash(vec2(fi, v + 3.0));
      vec2 at = vec2(-0.6 + 0.3 * fi, 0.55 - 0.08 * mod(fi + v, 2.0));
      float d = sdBox(p, at - vec2(0.0, h * 0.5), vec2(0.08, h * 0.5));
      d = max(d, -(p.y - (at.y - h) - 0.06 * sin(p.x * 30.0 + fi)));
      shape(d, p, at.x + 0.03, A);
    }
  } else if (m < 112.5) {                       // temple: steps, columns, a pediment
    shape(sdBox(p, vec2(0.0, 0.55), vec2(0.7, 0.07)), p, 0.3, A);
    for (int i = 0; i < 5; i++) shape(sdBox(p, vec2(-0.48 + 0.24 * float(i), 0.2), vec2(0.05, 0.3)), p, 0.5, A);
    shape(sdBox(p, vec2(0.0, -0.13), vec2(0.62, 0.05)), p, 0.3, A);
    shape(sdRoof(p, vec2(0.0, -0.17), 0.7, v > 0.5 ? 0.45 : 0.3), p, 0.0, B);
    put(length(p - vec2(0.0, -0.32)) - 0.06, C);
  } else if (m < 113.5) {                       // standing stones in a ring (the back ones first)
    for (int i = 0; i < 7; i++) stone(p, float(i), v, 0.0, A);
    if (v > 0.5) shape(sdBox(p, vec2(0.0, 0.32), vec2(0.18, 0.05)), p, 0.0, B);
    for (int i = 0; i < 7; i++) stone(p, float(i), v, 1.0, A);
  } else if (m < 114.5) {                       // windmill: a tower, turning sails
    shape(max(sdBox(p, vec2(0.0, 0.25), vec2(0.22, 0.38)), abs(p.x) - 0.22 + (0.63 - p.y) * 0.12), p, 0.05, A);
    shape(sdRoof(p, vec2(0.0, -0.12), 0.24, 0.25), p, 0.0, C);
    float a = uTime * 0.8 + v;
    vec2 hub = vec2(0.0, -0.05);
    for (int i = 0; i < 4; i++) {
      float b = a + 1.5707963 * float(i);
      vec2 dir = vec2(cos(b), sin(b));
      vec2 r = p - hub;
      vec2 local = vec2(dot(r, dir), dot(r, vec2(-dir.y, dir.x)));
      shape(sdBox(local, vec2(0.38, 0.06), vec2(0.3, 0.07)), p, 1.0, B);
    }
    put(length(p - hub) - 0.05, INK);
  } else if (m < 115.5) {                       // lighthouse: a tapered striped tower, its light
    float d = max(sdBox(p, vec2(0.0, 0.2), vec2(0.25, 0.45)), abs(p.x) - 0.25 + (0.65 - p.y) * 0.12);
    vec3 c = mod(floor((p.y + 1.0) * 6.0), 2.0) > 0.5 ? B : A;
    shape(d, p, 0.05, c);
    shape(sdBox(p, vec2(0.0, -0.33), vec2(0.15, 0.09)), p, 0.05, C);
    shape(sdRoof(p, vec2(0.0, -0.42), 0.2, 0.2), p, 0.0, B);
    float glow = 1.0 - smoothstep(0.0, 0.6, length(p - vec2(0.0, -0.33)));
    acc.rgb = mix(acc.rgb, C, glow * 0.35 * (0.7 + 0.3 * sin(uTime * 3.0)));
    acc.a = max(acc.a, glow * 0.4);
  } else if (m < 116.5) {                       // camp: tents and a fire
    shape(sdRoof(p, vec2(-0.35, 0.45), 0.35, 0.45), p, -0.35, A);
    shape(sdRoof(p, vec2(0.38, 0.55), 0.28, 0.38), p, 0.38, mix(A, B, 0.5));
    put(sdSegment(p, vec2(-0.1, 0.62), vec2(0.1, 0.55)) - 0.02, B);
    float flame = length((p - vec2(0.0, 0.5)) / vec2(0.07, 0.12 + 0.02 * sin(uTime * 9.0))) - 1.0;
    put(flame * 0.08, C);
  } else if (m < 117.5) {                       // cave: a rocky mound, a dark mouth
    shape(length((p - vec2(0.0, 0.6)) / vec2(0.85, 0.75)) - 1.0 + step(0.6, p.y) * 9.0, p, 0.1, A);
    put(length((p - vec2(0.05, 0.58)) / vec2(0.28, 0.3)) - 1.0 + step(0.58, p.y) * 9.0, C);
  } else {                                       // portal: a stone arch, a glowing swirl
    float swirl = length((p - vec2(0.0, 0.1)) / vec2(0.32, 0.45)) - 1.0;
    float a = atan(p.y - 0.1, p.x) + uTime;
    put(swirl * 0.3, mix(C, vec3(1.0), 0.3 + 0.3 * sin(a * 3.0 + length(p) * 12.0)));
    float ring = abs(length((p - vec2(0.0, 0.1)) / vec2(0.42, 0.55)) - 1.0) - 0.12;
    shape(max(ring * 0.4, p.y - 0.62), p, 0.15, A);
  }
  gl_FragColor = acc;
}
`
