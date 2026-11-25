/**
 * The map painter's sprite pass (plan 48): one quad per sprite (instanced), its picture from the atlas (premultiplied,
 * mipmapped), drawn over the ground pass nearest last. The vertex shader moves them: trees sway (the top, not the
 * foot), sails spin around their anchor, clouds drift, birds fly around and flap (two frames shown in turn). The
 * fragment shader grades the picture for the hour (uLight) and adds its night lights (uNight).
 * Per instance (painter/renderer.ts): aBase anchor x, y and size w, h (map px); aBox anchor in the box (0..1), flip,
 * -; aUV the atlas rect; aMove sway, phase, spin (turns a second), has night lights; aPath motion (0 still, 1 drift,
 * 2 fly), how far (map px), how fast (radians a second), flapping (frames a second; < 0: the second frame).
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
varying vec2 vUV;
varying float vNight;
void main() {
  vec2 c = aCorner;                                  // 0..1, x to the right, y up
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
  vec2 pos = aBase.xy + local;
  if (aPath.x > 0.5) {
    float ang = aPath.z * t + aMove.y;
    if (aPath.x < 1.5) pos.x += sin(ang) * aPath.y;
    else pos += vec2(cos(ang), sin(ang) * 0.55) * aPath.y;
  }
  float shown = 1.0;
  if (aPath.w != 0.0) {
    float cycle = fract(t * abs(aPath.w) * 0.5 + aMove.y);
    shown = (aPath.w > 0.0) == (cycle < 0.5) ? 1.0 : 0.0;
  }
  vUV = mix(aUV.xy, aUV.zw, vec2(aBox.z > 0.5 ? 1.0 - c.x : c.x, 1.0 - c.y));
  vNight = aMove.w;
  vec2 ndc = (pos - uView.xy) / uView.zw * 2.0 - 1.0;
  gl_Position = shown > 0.5 ? vec4(ndc.x, -ndc.y, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`

export const SPRITE_FRAGMENT = `
precision mediump float;
uniform sampler2D uAtlas;
uniform sampler2D uNightAtlas;
uniform vec3 uLight;      // the hour's light (1, 1, 1 at noon)
uniform float uNight;     // 0 day .. 1 night: how much the night lights show
varying vec2 vUV;
varying float vNight;
void main() {
  vec4 day = texture2D(uAtlas, vUV);
  vec4 col = vec4(day.rgb * uLight, day.a);
  if (vNight > 0.5 && uNight > 0.0) {
    vec4 lit = texture2D(uNightAtlas, vUV);
    col.rgb = col.rgb * (1.0 - lit.a * uNight) + lit.rgb * uNight;
    col.a = max(col.a, lit.a * uNight);
  }
  gl_FragColor = col;
}
`
