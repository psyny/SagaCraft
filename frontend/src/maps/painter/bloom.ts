/**
 * The map painter's night bloom (plan 49): at night what lights itself (lava, lit windows, fires, fireflies, glowing
 * effects) glows softly over a larger area. After the painting is drawn: its bright parts are taken at a quarter of
 * the size (a bright pass), blurred twice (a near and a wide spread), and added back over it. Then (plan 51) a second,
 * wide glow: that bloom blurred again (plan 52: about two and a half times as far), added at half its
 * strength: lights seem to light the area around them. One small program, four modes (painter/renderer.ts runs the
 * passes).
 */

export const BLOOM_VERTEX = `
attribute vec2 aPos;
varying vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

export const BLOOM_FRAGMENT = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uStep;       // bright: a texel of the painting; blur: a texel along the blur's direction
uniform float uMode;      // 0 bright pass, 1 blur, 2 add back, 3 add back the wide glow (spread thin: raised, then softly capped)
uniform float uAmount;    // bright: the threshold; add: how strong
varying vec2 vUV;
void main() {
  if (uMode < 0.5) {
    vec3 c = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(mod(float(i), 2.0) - 0.5, floor(float(i) / 2.0) - 0.5) * uStep * 2.0;
      vec3 s = texture2D(uTex, vUV + o).rgb;
      c += s * smoothstep(uAmount, uAmount + 0.25, max(s.r, max(s.g, s.b)));
    }
    gl_FragColor = vec4(c * 0.25, 1.0);
  } else if (uMode < 1.5) {
    vec3 c = vec3(0.0);
    for (int i = -4; i <= 4; i++) {
      c += texture2D(uTex, vUV + uStep * float(i)).rgb * exp(-float(i * i) / 8.0);
    }
    gl_FragColor = vec4(c / 4.898, 1.0);
  } else if (uMode < 2.5) {
    gl_FragColor = vec4(texture2D(uTex, vUV).rgb * uAmount, 1.0);
  } else {
    // blurred wider, its light is spread thinner: raised again, its brightest capped softly (its hue kept), so a lamp
    // lights the ground around it and a lava field doesn't wash the map out
    vec3 c = texture2D(uTex, vUV).rgb;
    float m = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c * (1.0 - exp(-m * 6.0)) / max(m, 0.0001) * uAmount, 1.0);
  }
}
`
