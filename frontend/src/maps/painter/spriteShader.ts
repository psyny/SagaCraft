/**
 * The map painter's sprite pass (plans 48, 49): one quad per instance (instanced), drawn over the ground pass nearest
 * last. Instances are pictures from the atlas (premultiplied, mipmapped), glows (fireflies: night only), **particles**
 * (environmental effects: a glow, a puff of mist or smoke, a spark, a leaf, a bubble, a mote; each moving its way:
 * wander, rise and fade, fall, drift, pulse; worked out per pixel, no picture) or **boxes**
 * (boundaries' pieces: a wall, a fence, a cliff's face): a box stands on its edge (P to Q on the ground, a thickness,
 * a height) and is worked out per pixel in the map's view (front, a little from above: a point at height z is z map px
 * up the screen): its top, the face turned toward us, its southern end; a wall going up the screen is a thin strip, one
 * going across shows its face. Looks: 1 fence, 2 palisade, 3 stone, 4 brick, 5 castle, 6 hedge, 7 cliff, 8 barrier,
 * 9 waterfall; colours from the palette texture (the boundary's entry), no bottom outline.
 * Organic pictures (mountains, hills, trees) fade into the ground at their foot, along a noisy edge.
 * The vertex shader moves pictures: trees sway (the top, not the foot), sails spin around their anchor, clouds drift,
 * birds fly around and flap (two frames shown in turn). The fragment shader grades for the hour (uLight) and adds the
 * night lights (uNight).
 * Per instance (painter/renderer.ts): aBase anchor x, y, size w, h (boxes: P, Q); aBox anchor x, y, flip, type (0
 * picture, 1 glow, 2 box, 3 particle; boxes: thickness, height, flags 1 cliff; particles: shape, lift, opacity); aUV
 * the atlas rect (boxes: palette entry, look, gaps, seed; particles: entry, colour row, lights itself, night only);
 * aMove sway, phase, spin, has night lights (boxes: the outward side; particles: motion, how far, how fast, phase);
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
// (particles: vSize shape, opacity, lights itself, night only; vInfo entry, colour row, twinkle, phase)
void main() {
  vec2 c = aCorner;                                  // 0..1, x to the right, y up
  vCorner = c;
  vType = aBox.w;
  vPhase = aMove.y;
  vec2 pos;
  if (aBox.w > 2.5) {
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
    vMap = pos; vEdge = vec4(0.0); vSize = vec4(aBox.x, fade * aBox.z, aUV.z, aUV.w); vInfo = vec4(aUV.x, aUV.y, aPath.y, ph); vOut = vec2(0.0);
    vUV = vec2(0.0); vNight = 0.0;
  } else if (aBox.w > 1.5) {
    // a box: the screen rectangle around its foot and its top
    vec2 P = aBase.xy; vec2 Q = aBase.zw;
    vec2 d = normalize(Q - P + vec2(0.0001, 0.0));
    vec2 nn = vec2(-d.y, d.x) * max(aBox.x, uPx) * 0.5;
    vec2 lo = min(min(P - nn, P + nn), min(Q - nn, Q + nn)) - vec2(2.0 * uPx);
    vec2 hi = max(max(P - nn, P + nn), max(Q - nn, Q + nn)) + vec2(2.0 * uPx);
    lo.y -= aBox.y;
    pos = mix(lo, hi, vec2(c.x, 1.0 - c.y));
    vMap = pos; vEdge = aBase; vSize = aBox; vInfo = aUV; vOut = aMove.xy;
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
    vMap = pos; vEdge = vec4(0.0); vSize = vec4(0.0); vInfo = vec4(max(0.0, -aBox.w), aBox.y, 0.0, aMove.y); vOut = vec2(0.0);
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

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cover(float d) { return clamp(d / uPx + 0.5, 0.0, 1.0); }   // d > 0 inside, by about a pixel
vec3 pal(float row) { return texture2D(uPalette, vec2((vInfo.x + 0.5) / 256.0, (row + 0.5) / 8.0)).rgb; }

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
    float top = H * (0.78 + 0.22 * noise(vec2(u / (H * 0.6), seed)));
    a = face > 0.5 ? 1.0 : cover(top - z);
    float leaf = noise(vec2(u, z) / max(2.5 * uPx, H * 0.08));
    col = mix(B, A, smoothstep(0.3, 0.7, leaf));
    col = mix(col, C, step(0.93, hash(floor(vec2(u, z) / max(3.0 * uPx, H * 0.1)) + seed)) * 0.9);
  } else if (look < 7.5) {                               // cliff: rock, cracks running down, darker below, a grassy rim
    float top = H * (0.86 + 0.14 * noise(vec2(u / max(H * 0.35, 3.0 * uPx), seed)));
    a = face > 0.5 ? 1.0 : cover(top - z);
    float streak = noise(vec2(u / max(H * 0.1, 2.0 * uPx), z / (H * 0.9) + seed));
    col = mix(A, B, 0.1 + 0.4 * (1.0 - z / H) + 0.3 * smoothstep(0.55, 0.85, streak));
    float strata = abs(fract(z / max(H * 0.3, 4.0 * uPx) + noise(vec2(u / (H * 0.5), seed)) * 0.4) - 0.5);
    col = mix(col, B * 0.7, smoothstep(0.4, 0.47, strata) * 0.45);
    col = mix(col, C, cover(z - top + max(H * 0.07, 1.5 * uPx)));
    if (face > 0.5) col = C;
  } else if (look < 8.5) {                               // barrier: glowing, see-through, light running up
    float band = 0.5 + 0.5 * sin(u / (H * 0.18) + uTime * 2.0 + z / H * 2.0);
    a = 0.35 + 0.3 * band * (0.5 + 0.5 * z / H);
    col = mix(A, C, band * 0.6);
    if (face > 0.5) a = 0.6;
  } else {                                               // waterfall: water falling down the face, foam below
    float v = fract(z / (H * 0.22) + uTime * 1.6 + noise(vec2(u / (H * 0.1), 0.0)) * 0.8);
    col = mix(A, C, smoothstep(0.75, 1.0, v) * 0.7);
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, H * 0.18, z)) * 0.65);
    a = 0.95;
  }
  return vec4(col, a);
}

vec4 boxColor() {
  vec2 P = vEdge.xy; vec2 Q = vEdge.zw;
  float t = max(vSize.x, uPx * 1.2); float H = vSize.y; bool cliff = vSize.z > 0.5;
  float look = vInfo.y; float gaps = vInfo.z;
  vec2 dd = Q - P; float L = max(length(dd), 0.001); vec2 d = dd / L;
  vec2 nn = vec2(-d.y, d.x); if (nn.y < 0.0) nn = -nn;     // the side toward us
  float u0 = dot(P, d);                                    // along the line from the map's origin: patterns run on
  vec3 A = pal(1.0); vec3 B = pal(2.0); vec3 C = pal(3.0);
  if (look > 8.5) {                                       // a waterfall: the river's colours (its entry's)
    A = pal(1.0); B = pal(2.0); C = pal(3.0);
  }
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
    if (look < 6.5) fc = mix(fc, B * 0.45, edge * 0.8);
    vec4 fr = vec4(fc, f.a * frontCov);
    result = vec4(mix(result.rgb, fr.rgb, fr.a), max(result.a, fr.a));
  }
  if (topCov > 0.0 && look < 8.5) {
    vec4 f = face(look, 1.0, tu + u0, tw, H, A, B, C);
    vec3 tc = f.rgb;
    tc = mix(tc, B * 0.45, (1.0 - cover(t * 0.5 - abs(tw) - uPx * 0.5)) * 0.6);
    vec4 tr = vec4(tc, f.a * topCov);
    result = vec4(mix(result.rgb, tr.rgb, tr.a), max(result.a, tr.a));
  }
  return result;
}

// A particle's colour and cover (vCorner: its quad, y up)
vec4 particleColor() {
  vec2 p = vCorner - 0.5;
  float shape = vSize.x;
  float r = length(p) * 2.0;
  vec3 col = pal(vInfo.y);
  float a = 0.0;
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
  } else {                                               // mote: a soft point with a four-pointed twinkle
    float star = exp(-abs(p.x) * 30.0) * exp(-abs(p.y) * 5.0) + exp(-abs(p.y) * 30.0) * exp(-abs(p.x) * 5.0);
    a = max(exp(-r * r * 14.0), star * 0.7);
    col = mix(col, pal(3.0), exp(-r * r * 40.0));
  }
  float tw = vInfo.z;
  if (tw > 0.0) a *= uTime > 0.0 ? 1.0 - tw + tw * max(0.0, sin(uTime * 2.4 + vInfo.w * 7.0)) : 1.0 - tw * 0.3;
  a *= vSize.y;
  if (vSize.w > 0.5) a *= uNight;
  return vec4(col, clamp(a, 0.0, 1.0));
}

void main() {
  if (vType > 2.5) {
    vec4 pc = particleColor();
    if (pc.a < 0.004) discard;
    bool lit = vSize.z > 0.5;                            // it lights itself: brighter at night, adding light
    vec3 col = lit ? pc.rgb * (1.0 + 0.25 * uNight) : pc.rgb * uLight;
    gl_FragColor = lit ? vec4(col * pc.a, pc.a * 0.6) : vec4(col * pc.a, pc.a);
    return;
  }
  if (vType > 1.5) {
    vec4 b = boxColor();
    if (b.a < 0.004) discard;
    vec3 col = b.rgb * uLight;
    float look = vInfo.y;
    if (look > 7.5 && look < 8.5) col += b.rgb * 0.6 * uNight;      // the barrier lights itself
    gl_FragColor = vec4(col * b.a, b.a);
    return;
  }
  if (vType > 0.5) {
    float r = length(vCorner - 0.5) * 2.0;
    float blink = uTime > 0.0 ? 0.35 + 0.65 * max(0.0, sin(uTime * 2.2 + vPhase * 7.0)) : 0.8;
    float a = (1.0 - smoothstep(0.0, 1.0, r)) * (1.0 - smoothstep(0.0, 1.0, r)) * uNight * blink;
    gl_FragColor = vec4(uGlowColor * a, a * 0.6);
    return;
  }
  vec4 day = texture2D(uAtlas, vUV);
  vec4 col = vec4(day.rgb * uLight, day.a);
  if (vNight > 0.5 && uNight > 0.0) {
    vec4 lit = texture2D(uNightAtlas, vUV);
    col.rgb = col.rgb * (1.0 - lit.a * uNight) + lit.rgb * uNight;
    col.a = max(col.a, lit.a * uNight);
  }
  if (vInfo.x > 0.0) {
    // organic sprites fade into the ground at their foot, along a noisy edge
    float foot = 1.0 - vInfo.y;
    float f = vInfo.x;
    float nz = noise(vec2(vCorner.x * 9.0 + vInfo.w * 5.0, 0.5)) * 0.65 + noise(vec2(vCorner.x * 31.0, vInfo.w * 3.0)) * 0.35;
    col *= smoothstep(foot - f * 0.1, foot + f, vCorner.y - (nz - 0.5) * f * 1.1);
  }
  gl_FragColor = col;
}
`
