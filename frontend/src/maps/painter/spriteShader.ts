/**
 * The map painter's sprite pass (plans 48 to 50): one quad per instance (instanced), drawn over the ground pass nearest
 * last. Instances are pictures from the atlas (premultiplied, mipmapped), glows (fireflies: night only), **particles**
 * (environmental effects: a glow, a puff of mist or smoke, a spark, a leaf, a bubble, a mote; each moving its way:
 * wander, rise and fade, fall, drift, pulse; worked out per pixel, no picture), **boxes**
 * (boundaries' pieces: a wall, a fence, a cliff's face): a box stands on its edge (P to Q on the ground, a thickness,
 * a height) and is worked out per pixel in the map's view (front, a little from above: a point at height z is z map px
 * up the screen): its top, the face turned toward us, its southern end; a wall going up the screen is a thin strip, one
 * going across shows its face. Looks: 1 fence, 2 palisade, 3 stone, 4 brick, 5 castle, 6 hedge, 7 cliff, 8 barrier,
 * 9 slope (plan 51: an inclined face reaching out `run` from its edge, a parallelogram on the screen, shaded by which
 * way it faces; its corners cones); colours from the palette texture (the boundary's entry), no bottom outline; or
 * **falls** (a river's waterfall where it crosses a boundary, in the river's look and colours: a curtain down a cliff's
 * face or a wall, a cascade down a slope, or white water).
 * Organic pictures (mountains, hills, trees) fade into the ground at their foot, along a noisy edge.
 * The vertex shader moves pictures: trees sway (the top, not the foot), sails spin around their anchor, clouds drift,
 * birds fly around and flap (two frames shown in turn). The fragment shader grades for the hour (uLight) and adds the
 * night lights (uNight) and the natural glows (plan 53: at every hour); a second pass (uEmitPass) writes only how much
 * each pixel lights itself, into the painting's alpha (the bloom's light).
 * Per instance (painter/renderer.ts): aBase anchor x, y, size w, h (boxes: P, Q; falls: the crossing, along the edge);
 * aBox anchor x, y, flip, type (0 picture, 1 glow, 2 box, 3 particle, 4 fall; boxes: thickness, height, 1 cliff, 2 cone;
 * particles: shape, lift, opacity; falls: half its width, its height, how it's seen); aUV the atlas rect (boxes: palette
 * entry, look, gaps, seed; particles: entry, colour row, lights itself, night only; falls: the river's entry, lava, seed);
 * aMove sway, phase, spin, has night lights (boxes: the outward side, a slope's run; cones: Q is the first outward
 * side, this the second; falls: from the lip to the foot on the screen; particles: motion, how far, how fast, phase);
 * aPath motion (0 still, 1 drift, 2 fly), how far, how fast, flapping (frames a second; < 0: the second frame)
 * (particles: spin, twinkle).
 */

export const SPRITE_VERTEX = `
attribute vec2 aCorner;
attribute vec4 aBase;
attribute vec4 aBox;
attribute vec4 aUV;
attribute vec4 aMove;
attribute vec4 aPath;
uniform vec4 uView;
uniform float uTime;
uniform float uPx;        // one canvas pixel, in map px
varying vec2 vUV;
varying float vNight;
varying vec2 vCorner;
varying float vType;
varying float vPhase;
varying vec2 vMap;        // boxes: where this pixel is (map px, as drawn)
varying vec4 vEdge;       // boxes: P, Q
varying vec4 vSize;       // boxes: thickness, height, flags, -
varying vec4 vInfo;       // boxes: entry, look, gaps, seed
varying vec2 vOut;        // boxes: the outward side
varying vec2 vExtra;      // boxes: a slope's run; falls: from the lip to the foot on the screen
// (particles: vSize shape, opacity, lights itself, night only; vInfo entry, colour row, twinkle, phase)
void main() {
  vec2 c = aCorner;                                  // 0..1, x to the right, y up
  vCorner = c;
  vType = aBox.w;
  vPhase = aMove.y;
  vec2 pos;
  if (aBox.w > 3.5) {
    // a river's waterfall: the screen rectangle around its curtain (or its white water) and the foam at its foot
    vec2 P = aBase.xy; float hw = aBox.x;
    vec2 span = abs(aBase.zw) * hw * 1.9 + vec2(hw * 1.9) + vec2(2.0 * uPx);
    vec2 lip = aBox.z > 0.5 && aBox.z < 1.5 ? P - vec2(0.0, aBox.y) : P;   // a wall's top; a cliff's or slope's edge
    vec2 lo = min(lip, lip + aMove.xy) - span; vec2 hi = max(lip, lip + aMove.xy) + span;
    pos = mix(lo, hi, vec2(c.x, 1.0 - c.y));
    vMap = pos; vEdge = aBase; vSize = aBox; vInfo = aUV; vOut = vec2(0.0); vExtra = aMove.xy;
    vUV = vec2(0.0); vNight = 0.0;
  } else if (aBox.w > 2.5) {
    // a particle: where its motion takes it (still when not animated: uTime 0 gives each its own moment)
    float t = uTime; float ph = aMove.w; float sp = aMove.z; float amt = aMove.y; float m = aMove.x;
    vec2 off = vec2(0.0, -aBox.y);
    float fade = 1.0;
    if (m > 0.5 && m < 1.5) {                          // wander
      off += vec2(sin(t * sp + ph) + 0.4 * sin(t * sp * 2.3 + ph * 1.7), 0.6 * cos(t * sp * 0.8 + ph * 1.3) + 0.3 * sin(t * sp * 1.9 + ph)) * amt * 0.5;
    } else if (m > 1.5 && m < 2.5) {                   // rise, fading out
      float k = fract(t * sp + ph * 0.159);
      off.y -= k * amt; off.x += sin(t * 1.7 + ph * 3.0) * amt * 0.08 + k * amt * 0.15;
      fade = smoothstep(0.0, 0.15, k) * (1.0 - smoothstep(0.55, 1.0, k));
    } else if (m > 2.5 && m < 3.5) {                   // fall to the ground
      float k = fract(t * sp + ph * 0.159);
      off.y += (k - 1.0) * amt; off.x += sin(t * 2.1 + ph * 3.0) * amt * 0.25;
      fade = smoothstep(0.0, 0.1, k) * (1.0 - smoothstep(0.9, 1.0, k));
    } else if (m > 3.5 && m < 4.5) {                   // drift sideways
      off.x += sin(t * sp + ph) * amt;
      fade = 0.75 + 0.25 * sin(t * sp * 0.7 + ph * 2.0);
    } else if (m > 4.5) {                              // pulse
      fade = 0.55 + 0.45 * sin(t * sp * 6.2831853 + ph);
    }
    vec2 q = (c - 0.5) * aBase.zw;
    if (aPath.x != 0.0) {
      float ang = aPath.x * t * 6.2831853 + ph;
      q = vec2(cos(ang) * q.x - sin(ang) * q.y, sin(ang) * q.x + cos(ang) * q.y);
    }
    pos = aBase.xy + off + vec2(q.x, -q.y);
    vMap = pos; vEdge = vec4(0.0); vSize = vec4(aBox.x, fade * aBox.z, aUV.z, aUV.w); vInfo = vec4(aUV.x, aUV.y, aPath.y, ph); vOut = vec2(0.0); vExtra = vec2(0.0);
    vUV = vec2(0.0); vNight = 0.0;
  } else if (aBox.w > 1.5) {
    // a box: the screen rectangle around its foot and its top (a slope: and its foot reaching out; its corner: a cone)
    vec2 P = aBase.xy; vec2 Q = aBase.zw; float R = aMove.z; float H = aBox.y;
    vec2 lo; vec2 hi;
    if (aBox.z > 1.5) {
      vec2 V = P - vec2(0.0, H);
      lo = V - vec2(R, max(0.0, R - H)); hi = V + vec2(R, H + R);
    } else {
      vec2 d = normalize(Q - P + vec2(0.0001, 0.0));
      vec2 nn = vec2(-d.y, d.x) * max(aBox.x, uPx) * 0.5;
      lo = min(min(P - nn, P + nn), min(Q - nn, Q + nn));
      hi = max(max(P - nn, P + nn), max(Q - nn, Q + nn));
      lo.y -= H;
      if (R > 0.0) {
        vec2 w = vec2(aMove.x * R, H + aMove.y * R) - vec2(0.0, H);
        lo = min(lo, min(P + w, Q + w)); hi = max(hi, max(P + w, Q + w));
      }
    }
    lo -= vec2(2.0 * uPx); hi += vec2(2.0 * uPx);
    pos = mix(lo, hi, vec2(c.x, 1.0 - c.y));
    vMap = pos; vEdge = aBase; vSize = aBox; vInfo = aUV; vOut = aMove.xy; vExtra = vec2(R, 0.0);
    vUV = vec2(0.0); vNight = 0.0;
  } else {
    vec2 local = vec2((c.x - aBox.x) * aBase.z, (1.0 - c.y - aBox.y) * aBase.w);
    float t = uTime;
    if (t > 0.0) {
      float up = clamp(-local.y / max(aBase.w, 0.001), 0.0, 1.0);
      local.x += aMove.x * sin(t * 1.3 + aMove.y) * aBase.w * 0.05 * up * up;
      if (aMove.z != 0.0) {
        float a = aMove.z * t * 6.2831853;
        local = vec2(cos(a) * local.x - sin(a) * local.y, sin(a) * local.x + cos(a) * local.y);
      }
    }
    pos = aBase.xy + local;
    if (aPath.x > 0.5) {
      float ang = aPath.z * t + aMove.y;
      if (aPath.x < 1.5) pos.x += sin(ang) * aPath.y;
      else pos += vec2(cos(ang), sin(ang) * 0.55) * aPath.y;
    }
    vUV = mix(aUV.xy, aUV.zw, vec2(aBox.z > 0.5 ? 1.0 - c.x : c.x, 1.0 - c.y));
    vNight = aMove.w;
    // (pictures: vInfo how much of the foot fades, the anchor's height, -, a seed)
    vMap = pos; vEdge = vec4(0.0); vSize = vec4(0.0); vInfo = vec4(max(0.0, -aBox.w), aBox.y, 0.0, aMove.y); vOut = vec2(0.0); vExtra = vec2(0.0);
  }
  float shown = 1.0;
  if (aPath.w != 0.0 && aBox.w < 1.5) {
    float cycle = fract(uTime * abs(aPath.w) * 0.5 + aMove.y);
    shown = (aPath.w > 0.0) == (cycle < 0.5) ? 1.0 : 0.0;
  }
  vec2 ndc = (pos - uView.xy) / uView.zw * 2.0 - 1.0;
  gl_Position = shown > 0.5 ? vec4(ndc.x, -ndc.y, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`

export const SPRITE_FRAGMENT = `
precision highp float;
uniform sampler2D uAtlas;
uniform sampler2D uNightAtlas;
uniform sampler2D uGlowAtlas; // natural glows (plan 53)
uniform float uEmitPass;      // 1: only how much each pixel lights itself, into the alpha (painter/renderer.ts)
uniform sampler2D uPalette;
uniform vec3 uLight;      // the hour's light (1, 1, 1 at noon)
uniform float uNight;     // 0 day .. 1 night: how much the night lights show
uniform vec3 uGlowColor;  // fireflies
uniform float uTime;
uniform float uPx;
varying vec2 vUV;
varying float vNight;
varying vec2 vCorner;
varying float vType;
varying float vPhase;
varying vec2 vMap;
varying vec4 vEdge;
varying vec4 vSize;
varying vec4 vInfo;
varying vec2 vOut;
varying vec2 vExtra;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cover(float d) { return clamp(d / uPx + 0.5, 0.0, 1.0); }   // d > 0 inside, by about a pixel
vec3 pal(float row) { return texture2D(uPalette, vec2((vInfo.x + 0.5) / 256.0, (row + 0.5) / 8.0)).rgb; }
// @materials

// A box face's colour and cover: face 0 the front (u along, z up), 1 the top (u along, z across from its middle)
vec4 face(float look, float face, float u, float z, float H, vec3 A, vec3 B, vec3 C) {
  float seed = vInfo.w;
  vec3 col = A; float a = 1.0;
  if (look < 1.5) {                                      // fence: posts and two rails, see-through
    float ps = max(H * 0.9, 6.0 * uPx);
    float post = cover((0.09 - abs(fract(u / ps) - 0.5)) * ps);
    float rails = max(cover(min(z - H * 0.32, H * 0.46 - z)), cover(min(z - H * 0.66, H * 0.8 - z)));
    if (face > 0.5) { a = post; col = B; }
    else { a = max(post, rails); col = post > 0.5 ? B : mix(A, C, cover(z - H * 0.76) * 0.5); }
  } else if (look < 2.5) {                               // palisade: stakes with pointed tops
    float k = max(H * 0.22, 4.0 * uPx);
    float st = fract(u / k);
    float top = H - abs(st - 0.5) * 2.0 * H * 0.22;
    a = face > 0.5 ? 1.0 : cover(top - z);
    col = mix(A, B, step(0.5, fract(u / k * 0.5)) * 0.25);
    col = mix(col, B * 0.7, 1.0 - cover((0.5 - abs(st - 0.5)) * k - uPx));
  } else if (look < 4.5) {                               // stone (3), brick (4): courses, joints
    bool brick = look > 3.5;
    float ch = brick ? H / 6.0 : H / 3.0;
    float row = floor(z / ch);
    float sl = brick ? ch * 2.3 : ch * 1.6 * (0.8 + 0.4 * hash(vec2(row, seed)));
    float uu = u + row * sl * 0.5 + hash(vec2(row, seed + 3.0)) * sl * (brick ? 0.0 : 1.0);
    vec2 cell = vec2(floor(uu / sl), row);
    float ju = (0.5 - abs(fract(uu / sl) - 0.5)) * sl, jz = (0.5 - abs(fract(z / ch) - 0.5)) * ch;
    col = A * (0.88 + 0.22 * hash(cell + seed));
    col = mix(B, col, cover(min(ju, jz) - uPx * 0.4));
    if (face > 0.5) col = brick ? C : mix(A, C, 0.6);
  } else if (look < 5.5) {                               // castle: big blocks, crenels, arrow slits
    float ch = H / 4.0;
    float row = floor(z / ch);
    float sl = ch * 2.0;
    float uu = u + row * sl * 0.5;
    float ju = (0.5 - abs(fract(uu / sl) - 0.5)) * sl, jz = (0.5 - abs(fract(z / ch) - 0.5)) * ch;
    col = A * (0.9 + 0.15 * hash(vec2(floor(uu / sl), row) + seed));
    col = mix(mix(A, B, 0.5), col, cover(min(ju, jz) - uPx * 0.4));
    float mw = H * 0.32;
    float merlon = step(0.5, fract(u / mw));
    if (face < 0.5) {
      a = 1.0 - (1.0 - merlon) * cover(z - H * 0.8);
      float slit = cover((0.06 - abs(fract(u / (mw * 3.0)) - 0.5)) * mw * 3.0) * cover(min(z - H * 0.35, H * 0.6 - z));
      col = mix(col, B * 0.35, slit);
    } else col = mix(A, B, 0.18 + 0.22 * merlon);
  } else if (look < 6.5) {                               // hedge: a bumpy top, leaves, a few flowers
#ifdef MAP_BOUNDARIES_FACETED
    float cell = max(H * 0.41, 2.5 * uPx);
    float crown = abs(fract(u / cell) - 0.5) * 2.0;
    float top = H * (0.98 - 0.22 * crown);
    float facet = facetLight(vec2(u, z) / max(H * MAP_BOUNDARIES_SCALE * 0.62, 4.0 * uPx), seed);
    a = face > 0.5 ? 1.0 : cover(top - z) * smoothstep(0.0, H * 0.19, z);
    col = mix(A, B, clamp(0.37 - facet * MAP_BOUNDARIES_CONTRAST + 0.19 * crown, 0.1, 0.86));
    if (face > 0.5) col = mix(col, A, 0.46);
#else
    float top = H * (0.78 + 0.22 * noise(vec2(u / (H * 0.6), seed)));
    a = face > 0.5 ? 1.0 : cover(top - z);
    float leaf = noise(vec2(u, z) / max(2.5 * uPx, H * 0.08));
    col = mix(B, A, smoothstep(0.3, 0.7, leaf));
    col = mix(col, C, step(0.93, hash(floor(vec2(u, z) / max(3.0 * uPx, H * 0.1)) + seed)) * 0.9);
#endif
  } else if (look < 7.5) {                               // cliff: rock, cracks running down, darker below, a grassy rim
#ifdef MAP_BOUNDARIES_FACETED
    float cell = max(H * MAP_BOUNDARIES_SCALE, 3.0 * uPx);
    float facet = facetLight(vec2(u + z * 0.32, z * 0.68) / cell, seed);
    float ledge = fract((u + z * 0.27) / cell);
    float top = H * (0.87 + 0.13 * (1.0 - abs(ledge * 2.0 - 1.0)));
    float taper = smoothstep(0.0, H * (0.20 + 0.13 * ledge), z);
    a = face > 0.5 ? 1.0 : cover(top - z) * taper;
    col = mix(A, B, clamp(0.49 - facet * MAP_BOUNDARIES_CONTRAST - z / H * 0.24, 0.08, 0.88));
    col = mix(col, C, (face > 0.5 ? 1.0 : cover(z - top + H * 0.09)) * 0.83);
#else
    float top = H * (0.86 + 0.14 * noise(vec2(u / max(H * 0.35, 3.0 * uPx), seed)));
    a = face > 0.5 ? 1.0 : cover(top - z) * smoothstep(0.0, H * 0.18, z);
    float streak = noise(vec2(u / max(H * 0.1, 2.0 * uPx), z / (H * 0.9) + seed));
    col = mix(A, B, 0.1 + 0.4 * (1.0 - z / H) + 0.3 * smoothstep(0.55, 0.85, streak));
    float strata = abs(fract(z / max(H * 0.3, 4.0 * uPx) + noise(vec2(u / (H * 0.5), seed)) * 0.4) - 0.5);
    col = mix(col, B * 0.7, smoothstep(0.4, 0.47, strata) * 0.45);
    col = mix(col, C, cover(z - top + max(H * 0.07, 1.5 * uPx)));
    if (face > 0.5) col = C;
#endif
  } else {                                               // barrier: glowing, see-through, light running up
#ifdef MAP_BARRIER_SHARDS
    vec2 q = vec2(u / max(H * MAP_BARRIER_SIZE, 2.0 * uPx), z / H * 2.4 - uTime * MAP_BARRIER_SPEED);
    vec2 f = fract(q);
    float shard = step(0.72, f.x + f.y * 0.8) * (1.0 - step(1.28, f.x + f.y));
    float band = mix(0.18, 0.88, shard * (0.55 + 0.45 * hash(floor(q) + seed)));
#else
    float band = 0.5 + 0.5 * sin(u / (H * 0.18) + uTime * 2.0 + z / H * 2.0);
#endif
    a = 0.35 + 0.3 * band * (0.5 + 0.5 * z / H);
    col = mix(A, C, band * 0.6);
    if (face > 0.5) a = 0.6;
  }
  return vec4(col, a);
}

// A slope (plan 51): an inclined face from its top edge (on the screen: P..Q raised H) to its foot, reaching out R
// toward its low side: w = (out.x R, H + out.y R) from top to foot, a parallelogram; seen if it faces us or runs up
// the screen, or faces away but is gentler than the view (its foot above its top on the screen). Its corners: a cone
// (around its top V, from one outward side to the other). Gullies run down it, strata along it, lit from the
// north-west, its rim grassy (C), scree at its foot.
vec4 slopeColor() {
  float H = vSize.y; float R = max(vExtra.x, uPx); float seed = vInfo.w;
  vec3 A = pal(1.0); vec3 B = pal(2.0); vec3 C = pal(3.0);
  float u; float v; vec2 n; float side;      // along it, down it (0 top, 1 foot), its outward side; cover along it
  float span;                                // its length on the screen from top to foot (anti-aliasing)
  if (vSize.z > 1.5) {
    vec2 r = vMap - (vEdge.xy - vec2(0.0, H));
    // r = rho (R cos t, H + R sin t): (H^2 - R^2) rho^2 - 2 r.y H rho + |r|^2 = 0; the root nearer us
    float a2 = H * H - R * R; float b = -2.0 * r.y * H; float cc = dot(r, r);
    float disc = b * b - 4.0 * a2 * cc;
    if (disc < 0.0) return vec4(0.0);
    float sq = sqrt(disc);
    float r1 = abs(a2) < 1.0e-4 ? cc / max(-b, 1.0e-4) : (-b - sq) / (2.0 * a2);
    float r2 = abs(a2) < 1.0e-4 ? r1 : (-b + sq) / (2.0 * a2);
    vec2 n1 = vEdge.zw; vec2 n2 = vOut; float s12 = n1.x * n2.y - n1.y * n2.x;
    v = -1.0;
    for (int k = 0; k < 2; k++) {
      float rho = k == 0 ? r1 : r2;
      if (rho <= 0.0 || rho > 1.2) continue;
      vec2 dir = vec2(r.x / rho, r.y / rho - H) / R;
      float s1 = n1.x * dir.y - n1.y * dir.x; float s2 = dir.x * n2.y - dir.y * n2.x;
      bool inside = s1 * s12 >= -0.02 && s2 * s12 >= -0.02 && dot(dir, n1 + n2) > 0.0;
      if (inside && (v < 0.0 || dir.y > n.y)) { v = rho; n = dir; }
    }
    if (v < 0.0) return vec4(0.0);
    u = atan(n.y, n.x) * R * 3.0;
    side = 1.0;
    span = length(vec2(n.x * R, H + n.y * R));
  } else {
    vec2 P = vEdge.xy - vec2(0.0, H); vec2 Q = vEdge.zw - vec2(0.0, H);
    n = vOut;
    vec2 w = vec2(n.x * R, H + n.y * R);
    if (n.y < -0.05 && w.y > 0.0) return vec4(0.0);
    vec2 dd = Q - P; float L = max(length(dd), 0.001); vec2 d = dd / L;
    float det = d.x * w.y - d.y * w.x;
    if (abs(det) < 1.0e-3) return vec4(0.0);
    vec2 r = vMap - P;
    u = (r.x * w.y - r.y * w.x) / det;
    v = (d.x * r.y - d.y * r.x) / det;
    side = cover(min(u, L - u));
    u += dot(P, d);
    span = length(w);
  }
  float rim = H * 0.06 + uPx;
  float top = (noise(vec2(u / max(H * 0.4, 3.0 * uPx), seed)) - 0.5) * rim / span;
  float foot = 1.0 + (noise(vec2(u / max(H * 0.3, 3.0 * uPx), seed + 4.0)) - 0.5) * 0.16;
  float a = side * cover((v - top) * span) * cover((foot - v) * span);
  a *= 1.0 - smoothstep(0.72, foot, v);
  if (a < 0.004) return vec4(0.0);
  // gullies and planes down its face
#ifdef MAP_BOUNDARIES_FACETED
  float facet = facetLight(vec2(u / H + v * 0.65, v * 1.45) / MAP_BOUNDARIES_SCALE, seed);
  vec3 col = mix(A, B, clamp(0.27 + 0.28 * v - facet * MAP_BOUNDARIES_CONTRAST, 0.06, 0.88));
#else
  float gully = noise(vec2(u / max(H * 0.18, 2.0 * uPx), v * 1.2 + seed));
  vec3 col = mix(A, B, 0.08 + 0.28 * v + 0.4 * smoothstep(0.5, 0.85, gully));
  float strata = abs(fract(v * 3.2 + noise(vec2(u / (H * 0.8), seed)) * 0.5) - 0.5);
  col = mix(col, B * 0.8, smoothstep(0.42, 0.48, strata) * 0.3);
#endif
  // light from the north-west
  float lit = dot(n, normalize(vec2(-0.55, -0.83)));
  col *= 0.97 + 0.16 * lit;
  col = mix(col, mix(A, C, 0.25) * 1.08, (1.0 - smoothstep(0.0, 0.3, v)) * 0.3);   // its crest, catching the light
  // scree at its foot, its grassy rim, a thin crest line
  col = mix(col, mix(B, A, hash(floor(vec2(u, v * span) / max(2.0 * uPx, H * 0.06)) + seed)), smoothstep(0.75, 1.0, v) * 0.5);
  float grass = 1.0 - cover((v - top) * span - rim * (1.0 + noise(vec2(u / max(H * 0.15, 2.0 * uPx), seed + 9.0))));
  col = mix(col, C, grass);
  col = mix(col, B * 0.5, (1.0 - cover((v - top) * span - uPx * 0.8)) * 0.6);
  return vec4(col, a);
}

vec4 boxColor() {
  if (vInfo.y > 8.5) return slopeColor();
  vec2 P = vEdge.xy; vec2 Q = vEdge.zw;
  float t = max(vSize.x, uPx * 1.2); float H = vSize.y; bool cliff = vSize.z > 0.5;
  float look = vInfo.y; float gaps = vInfo.z;
  vec2 dd = Q - P; float L = max(length(dd), 0.001); vec2 d = dd / L;
  vec2 nn = vec2(-d.y, d.x); if (nn.y < 0.0) nn = -nn;     // the side toward us
  float u0 = dot(P, d);                                    // along the line from the map's origin: patterns run on
  vec3 A = pal(1.0); vec3 B = pal(2.0); vec3 C = pal(3.0);
  vec2 s = vMap;
  // the top: this point, H below, inside the foot
  vec2 tp = s + vec2(0.0, H) - P;
  float tu = dot(tp, d); float tw = dot(tp, nn);
  float topCov = cover(min(tu, L - tu)) * cover(t * 0.5 - abs(tw));
  // the face toward us: the foot's side nearest us, raised
  float fu = -1.0; float fz = -1.0; float frontCov = 0.0;
  if (abs(d.x) > 0.02) {
    vec2 F = P + nn * t * 0.5;
    fu = (s.x - F.x) / d.x;
    fz = (F.y + d.y * fu) - s.y;
    frontCov = cover(min(fu, L - fu)) * cover(min(fz, H - fz));
    if (cliff && vOut.y < 0.1) frontCov = 0.0;            // a cliff's face only where it looks toward us
  }
  // its southern end: across the foot, raised
  float cu = -1.0; float cz = -1.0; float capCov = 0.0;
  if (abs(nn.x) > 0.02 && !cliff) {
    vec2 E = (Q.y > P.y ? Q : P) - nn * t * 0.5;
    cu = (s.x - E.x) / nn.x;
    cz = (E.y + nn.y * cu) - s.y;
    capCov = cover(min(cu, t - cu)) * cover(min(cz, H - cz));
  }
  if (topCov + frontCov + capCov < 0.001) return vec4(0.0);
  // broken (ruined walls): missing pieces along it
  float along = (topCov > 0.5 ? tu : fu > -0.5 ? fu : 0.0) + u0;
  if (gaps > 0.0 && noise(vec2(along / max(H * 1.4, 1.0), vInfo.w * 31.0)) < gaps) return vec4(0.0);
  vec4 result = vec4(0.0);
  if (capCov > 0.0) {
    vec4 f = face(look, 0.0, cu, cz, H, A, B, C);
    result = vec4(f.rgb * 0.72, f.a * capCov);
  }
  if (frontCov > 0.0) {
    vec4 f = face(look, 0.0, fu + u0, fz, H, A, B, C);
    vec3 fc = f.rgb * 0.86;
    // an outline along its top (none along its foot: it stands in the ground; none at its ends: it runs on)
    float edge = 1.0 - cover(H - fz - uPx * 0.6);
#ifdef MAP_BOUNDARIES_FACETED
    if (look < 5.5) fc *= 1.0 + 0.26 * edge;
#else
    if (look < 6.5) fc = mix(fc, B * 0.45, edge * 0.8);
#endif
    vec4 fr = vec4(fc, f.a * frontCov);
    result = vec4(mix(result.rgb, fr.rgb, fr.a), max(result.a, fr.a));
  }
  if (topCov > 0.0) {
    vec4 f = face(look, 1.0, tu + u0, tw, H, A, B, C);
    vec3 tc = f.rgb;
#ifdef MAP_BOUNDARIES_FACETED
    tc *= mix(1.19, 1.01, smoothstep(-t * 0.35, t * 0.30, tw));
#else
    tc = mix(tc, B * 0.45, (1.0 - cover(t * 0.5 - abs(tw) - uPx * 0.5)) * 0.6);
#endif
    vec4 tr = vec4(tc, f.a * topCov);
    result = vec4(mix(result.rgb, tr.rgb, tr.a), max(result.a, tr.a));
  }
  return result;
}

// A river's waterfall (plan 50): the river's own look where it crosses a boundary, the same over any boundary (water:
// A the water, B its edge, C its streaks; lava: A molten, B crust, C bright). A curtain from its lip to its foot (mode
// 0: down a cliff's face, below the edge; 1: from a wall's top to the edge), widening as it falls and swaying a little,
// streaks running down, a pool of foam at its foot; mode 2 (the drop isn't seen from here): white water across the river.
vec4 fallColor() {
  vec2 P = vEdge.xy; vec2 d = vEdge.zw;
  float hw = max(vSize.x, uPx); float mode = vSize.z;
  bool lava = vInfo.y > 0.5; float seed = vInfo.z; float cascade = vInfo.w;   // down a slope: more white water
  vec3 A = pal(1.0); vec3 B = pal(2.0); vec3 C = pal(3.0);
  vec3 foam = lava ? mix(C, vec3(1.0, 0.93, 0.7), 0.35) : mix(mix(C, vec3(1.0), 0.65), A, 0.1);
  vec2 s = vMap - P;
  float t = uTime;
  vec2 w = vExtra;
  float det = d.x * w.y - d.y * w.x;
  if (mode > 1.5 || abs(det) < 1.0e-3) {
    vec2 nn = vec2(-d.y, d.x);
    float u = dot(s, d) / hw; float v = dot(s, nn) / hw;
#ifdef MAP_WATERFALL_SHEETS
    vec2 q = vec2(u * 3.0 + v, v * 3.0 - t * MAP_WATERFALL_SPEED);
    float shard = step(0.8, fract(q.x) + fract(q.y));
    float shape = 1.02 - max(abs(u) * 0.7, abs(v) + abs(u) * 0.22);
    return vec4(mix(A, foam, (0.18 + 0.8 * shard) * MAP_WATERFALL_FOAM), smoothstep(0.0, 0.2, shape) * 0.92);
#else
    float churn = noise(vec2(u * 2.2 + seed, v * 3.0 - t * 2.4)) * 0.6 + noise(vec2(u * 5.0 - seed, v * 6.0 + t * 3.1)) * 0.4;
    float shape = 1.0 - length(vec2(u / 1.35, v / 0.8)) + (churn - 0.5) * 0.55;
    return vec4(mix(A, foam, smoothstep(0.35, 0.7, churn)), smoothstep(0.0, 0.2, shape) * 0.92);
#endif
  }
  // the curtain: u along the edge (across the fall), z down from its lip (along w, from the lip to the foot)
  float H = max(length(w), uPx);
  vec2 r = s + (mode > 0.5 && mode < 1.5 ? vec2(0.0, vSize.y) : vec2(0.0));
  float u = (r.x * w.y - r.y * w.x) / det;
  float z = (d.x * r.y - d.y * r.x) / det * H;
  float v = clamp(z / H, 0.0, 1.0);
#ifdef MAP_WATERFALL_SHEETS
  float uu = u;
  float width = hw * (0.81 + 0.43 * v);
  vec2 q = vec2(uu / max(hw * MAP_WATERFALL_WIDTH, 2.0 * uPx), z / max(hw * 1.15, 3.0 * uPx) - t * MAP_WATERFALL_SPEED);
  float band = hash(vec2(floor(q.x), seed));
  float shard = step(0.89, fract(q.y + band) + fract(q.x) * 0.57);
  float sn = 0.33 + 0.21 * band + 0.36 * shard;
#else
  float uu = u - sin(v * 3.14159) * hw * 0.35 * (fract(seed * 7.13) - 0.5);       // a slight sway
  float width = hw * (0.8 + 0.45 * v) + (noise(vec2(z / max(hw * 0.8, 2.0 * uPx) - t * 1.5, seed)) - 0.5) * hw * 0.25;
  float sn = noise(vec2(uu / max(hw * 0.16, 1.5 * uPx) + seed * 3.0, z / max(hw * 1.4, 3.0 * uPx) - t * 2.6));
#endif
  float ac = cover(width - abs(uu)) * cover(z) * cover(H - z) * 0.94;
  float rim = abs(uu) / max(width, 0.001);
  vec3 col;
  if (lava) {
    col = mix(B, A, smoothstep(0.25, 0.6, sn));
    col = mix(col, C, smoothstep(0.75, 0.95, sn) * 0.8);
    col = mix(col, B * 0.8, smoothstep(0.7, 1.0, rim) * 0.6);
  } else {
    col = mix(A, mix(A, B, 0.35), smoothstep(0.6, 1.0, rim));
#ifdef MAP_WATERFALL_SHEETS
    col = mix(col, foam, sn * MAP_WATERFALL_FOAM * (0.68 + 0.32 * v));
#else
    col = mix(col, foam, smoothstep(0.5 - 0.25 * cascade, 0.85, sn) * (0.55 + 0.35 * v + 0.2 * cascade));
#endif
  }
  col = mix(col, foam, (1.0 - smoothstep(0.0, max(hw * 0.35, 2.0 * uPx), z)) * 0.6);   // the lip, catching the light
  // the pool at its foot: foam churning, wider than the fall
  float fz = (z - H) / hw;
#ifdef MAP_WATERFALL_SHEETS
  vec2 spray = vec2(uu / hw * 2.3 + fz, fz * 3.4 - t * MAP_WATERFALL_SPEED * 0.8);
  float churn = (0.25 + 0.75 * step(0.88, fract(spray.x) + fract(spray.y))) * MAP_WATERFALL_FOAM;
  float pool = 0.91 - max(abs(uu) / (hw * 1.65), abs(fz) + abs(uu) / (hw * 3.75));
#else
  float churn = noise(vec2(uu / max(hw * 0.35, 2.0 * uPx) + seed, fz * 1.8 - t * 1.2)) * 0.6
              + noise(vec2(uu / max(hw * 0.15, 1.5 * uPx) - seed, fz * 3.0 + t * 1.7)) * 0.4;
  float pool = 1.0 - length(vec2(uu / (hw * 1.75), fz / 0.8)) + (churn - 0.5) * 0.6;
#endif
  float ap = smoothstep(0.0, 0.25, pool) * 0.9;
  vec3 pc = lava ? mix(A, C, smoothstep(0.4, 0.8, churn)) : mix(A, foam, smoothstep(0.3, 0.6, churn));
  // the pool over the curtain
  float a = ap + ac * (1.0 - ap);
  return vec4((pc * ap + col * ac * (1.0 - ap)) / max(a, 0.001), a);
}

// A particle's colour and cover (vCorner: its quad, y up)
vec4 particleColor() {
  vec2 p = vCorner - 0.5;
  float shape = vSize.x;
  float r = length(p) * 2.0;
  vec3 col = vInfo.x < 0.5 ? vec3(1.0, 0.55, 0.18) : pal(vInfo.y);   // (no entry: a plain fire's orange)
  float a = 0.0;
#ifdef MAP_PARTICLES_FACETED
  if (shape < 6.5) {
    vec4 faceted = facetedParticle(p, shape, col, pal(2.0), vInfo.x < 0.5 ? vec3(1.0, 0.79, 0.34) : pal(3.0));
    a = faceted.a;
    col = faceted.rgb;
  } else
#endif
  if (shape < 1.5) {                                     // glow: a bright core, a soft halo
    a = exp(-r * r * 10.0) * 0.9 + exp(-r * r * 3.0) * 0.3;
    col = mix(col, vec3(1.0), exp(-r * r * 40.0) * 0.7);
  } else if (shape < 2.5) {                              // puff: soft and ragged, shaded below (mist, smoke, steam)
    float nz = noise(p * 4.0 + vInfo.w * 1.7) + 0.5 * noise(p * 9.0 - vInfo.w);
    a = 1.0 - smoothstep(0.15, 1.0, r + (nz - 0.75) * 0.6);
    a *= a;
    col = mix(pal(2.0), col, smoothstep(-0.45, 0.25, p.y));
  } else if (shape < 3.5) {                              // spark: a hot point, a short trail below (embers)
    float trail = exp(-p.x * p.x * 180.0) * smoothstep(-0.5, -0.05, p.y) * (1.0 - smoothstep(-0.05, 0.05, p.y)) * 0.6;
    a = max(exp(-r * r * 10.0), trail);
    col = mix(col, pal(3.0), exp(-r * r * 30.0));
  } else if (shape < 4.5) {                              // leaf: a pointed oval and its vein
    float w = 0.3 * (1.0 - 4.0 * p.y * p.y);
    a = smoothstep(0.0, 0.07, w - abs(p.x));
    col = mix(col, pal(2.0), (1.0 - smoothstep(0.0, 0.05, abs(p.x))) * 0.6 + smoothstep(0.0, 0.4, -p.x) * 0.2);
  } else if (shape < 5.5) {                              // bubble: a thin ring, a highlight
    a = smoothstep(0.6, 0.75, r) * (1.0 - smoothstep(0.86, 1.0, r)) * 0.85 + 0.12 * (1.0 - smoothstep(0.0, 0.8, r));
    vec2 h = p - vec2(-0.16, 0.16);
    float hl = exp(-dot(h, h) * 250.0);
    a = max(a, hl);
    col = mix(col, pal(3.0), hl);
  } else if (shape < 6.5) {                              // mote: a soft point with a four-pointed twinkle
    float star = exp(-abs(p.x) * 30.0) * exp(-abs(p.y) * 5.0) + exp(-abs(p.y) * 30.0) * exp(-abs(p.x) * 5.0);
    a = max(exp(-r * r * 14.0), star * 0.7);
    col = mix(col, pal(3.0), exp(-r * r * 40.0));
  } else {                                               // flame (plan 53): a tongue of fire licking up, flickering
#ifdef MAP_FLAME_FACETED
    vec4 faceted = facetedFlame(p, col, uTime, vInfo.w);
    a = faceted.a;
    col = faceted.rgb;
#else
    float yy = p.y + 0.5;                                // 0 its foot .. 1 its top
    float t = uTime;
    float sway = (noise(vec2(yy * 2.5 - t * 4.0, vInfo.w)) - 0.5) * 0.3 * yy;
    float x = p.x - sway;
    float wdt = 0.34 * pow(max(1.0 - yy, 0.0), 0.75) * smoothstep(-0.05, 0.16, yy);
    float tongue = noise(vec2(x * 7.0 + vInfo.w * 3.0, yy * 3.5 - t * 6.5)) * 0.7 + noise(vec2(x * 15.0 - vInfo.w, yy * 7.0 - t * 9.0)) * 0.3;
    float edge = wdt * (0.6 + 0.8 * tongue) - abs(x) - smoothstep(0.55, 1.0, yy) * 0.08 * (1.0 - tongue);
    a = smoothstep(0.0, 0.025, edge);
    float heat = clamp(edge / max(wdt, 0.001), 0.0, 1.0) * (1.0 - yy * 0.75);
    col = mix(col * vec3(0.9, 0.42, 0.22), col, smoothstep(0.05, 0.3, heat));      // a redder edge
    col = mix(col, vec3(1.0, 0.93, 0.62), smoothstep(0.35, 0.8, heat));            // its yellow-white heart
#endif
  }
  float tw = vInfo.z;
  if (tw > 0.0) a *= uTime > 0.0 ? 1.0 - tw + tw * max(0.0, sin(uTime * 2.4 + vInfo.w * 7.0)) : 1.0 - tw * 0.3;
  a *= vSize.y;
  if (vSize.w > 0.5) a *= uNight;
  return vec4(col, clamp(a, 0.0, 1.0));
}

void main() {
  vec4 col = vec4(0.0);    // premultiplied
  float emit = 0.0;        // how much it lights itself (the bloom's light: the alpha pass, plan 53)
  if (vType > 3.5) {
    vec4 f = fallColor();
    if (f.a < 0.004) discard;
    bool lava = vInfo.y > 0.5;                           // lava lights itself
    col = vec4((lava ? f.rgb * (1.0 + 0.3 * uNight) : f.rgb * uLight) * f.a, f.a);
    emit = lava ? f.a * 0.8 : 0.0;
  } else if (vType > 2.5) {
    vec4 pc = particleColor();
    if (pc.a < 0.004) discard;
    bool lit = vSize.z > 0.5;                            // it lights itself: brighter at night, adding light
    bool solid = vSize.x > 6.5;                          // (a flame covers what's behind it)
    vec3 c = lit ? pc.rgb * (1.0 + 0.25 * uNight) : pc.rgb * uLight;
    col = lit && !solid ? vec4(c * pc.a, pc.a * 0.6) : vec4(c * pc.a, pc.a);
    emit = lit ? pc.a : 0.0;
  } else if (vType > 1.5) {
    vec4 b = boxColor();
    if (b.a < 0.004) discard;
    vec3 c = b.rgb * uLight;
    float look = vInfo.y;
    bool barrier = look > 7.5 && look < 8.5;             // the barrier lights itself
    if (barrier) c += b.rgb * 0.6 * uNight;
    col = vec4(c * b.a, b.a);
    emit = barrier ? b.a * 0.6 : 0.0;
  } else if (vType > 0.5) {
#ifdef MAP_PARTICLES_FACETED
    vec2 p = abs(vCorner - 0.5);
    float r = (p.x + p.y) * 2.0;
#else
    float r = length(vCorner - 0.5) * 2.0;
#endif
    float blink = uTime > 0.0 ? 0.35 + 0.65 * max(0.0, sin(uTime * 2.2 + vPhase * 7.0)) : 0.8;
    float a = (1.0 - smoothstep(0.0, 1.0, r)) * (1.0 - smoothstep(0.0, 1.0, r)) * uNight * blink;
    col = vec4(uGlowColor * a, a * 0.6);
    emit = a;
  } else {
    vec4 day = texture2D(uAtlas, vUV);
    col = vec4(day.rgb * uLight, day.a);
    // night lights (lit at night: windows, lanterns); natural glows (plan 53: fire, lava, magic, at every hour, never
    // darkened by the night)
    if (mod(vNight, 2.0) > 0.5 && uNight > 0.0) {
      vec4 lit = texture2D(uNightAtlas, vUV);
      col.rgb = col.rgb * (1.0 - lit.a * uNight) + lit.rgb * uNight;
      col.a = max(col.a, lit.a * uNight);
      emit = lit.a * uNight;
    }
    if (vNight > 1.5) {
      vec4 g = texture2D(uGlowAtlas, vUV);
      col.rgb = col.rgb * (1.0 - g.a) + g.rgb;
      col.a = max(col.a, g.a);
      emit = max(emit, g.a);
    }
    if (vInfo.x > 0.0) {
      // organic sprites fade into the ground at their foot, along a noisy edge
      float foot = 1.0 - vInfo.y;
      float f = vInfo.x;
      float nz = noise(vec2(vCorner.x * 9.0 + vInfo.w * 5.0, 0.5)) * 0.65 + noise(vec2(vCorner.x * 31.0, vInfo.w * 3.0)) * 0.35;
      float k = smoothstep(foot - f * 0.1, foot + f, vCorner.y - (nz - 0.5) * f * 1.1);
      col *= k;
      emit *= k;
    }
  }
  if (uEmitPass > 0.5) {
    if (emit < 0.004) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, emit);
    return;
  }
  gl_FragColor = col;
}
`
