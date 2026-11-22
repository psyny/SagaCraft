/** Far background: space. Two-coloured nebulae (the intensity is their glow), two layers of stars, maybe a planet
 *  lit from one side; everything drifts slowly. */
import { rgb, shader } from '../gl'
import { num, type EffectFactory } from './types'

const FRAGMENT = `
uniform vec3 u_a, u_b, u_planet_color;
uniform float u_stars, u_planet, u_size, u_drift, u_glow;
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * (0.2 + u_drift);
  vec2 q = uv * 1.5 + vec2(t * 0.01, t * 0.004);
  float n1 = fbm(q * 1.4 + fbm(q * 2.1 + t * 0.006));
  float n2 = fbm(q * 2.4 - vec2(7.1, 3.3) + t * 0.004);
  vec3 col = vec3(0.006, 0.006, 0.02);
  col += u_a * pow(n1, 2.4) * (0.6 + 2.2 * u_glow);
  col += u_b * pow(n2, 2.8) * (0.5 + 2.0 * u_glow);
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    float scale = l == 0 ? 230.0 : 95.0;
    vec2 g = (uv + vec2(t * 0.0015 * (fl + 1.0), 0.0)) * scale;
    vec2 id = floor(g);
    float h = hash(id + fl * 17.0);
    if (h > 1.0 - 0.02 * u_stars) {
      float d = length(fract(g) - 0.5);
      col += vec3(0.9, 0.95, 1.0) * smoothstep(0.2, 0.0, d) * (0.55 + 0.45 * sin(u_time * 1.7 + h * 40.0)) * (l == 0 ? 0.7 : 1.0);
    }
  }
  if (u_planet > 0.5) {
    vec2 pc = vec2(0.42, -0.16);
    float pr = 0.06 + 0.34 * u_size;
    vec2 rel = (uv - pc) / pr;
    float d = length(rel);
    if (d < 1.0) {
      vec3 nrm = normalize(vec3(rel, sqrt(max(0.0, 1.0 - d * d))));
      float light = clamp(dot(nrm, normalize(vec3(-0.65, 0.5, 0.6))), 0.0, 1.0);
      float bands = fbm(vec2(rel.y * 5.0, rel.x * 1.2 + u_time * 0.01));
      vec3 pcol = u_planet_color * (0.5 + 0.7 * bands);
      col = mix(col, pcol * (0.05 + light), smoothstep(1.0, 0.985, d));
    } else {
      col += u_planet_color * exp(-(d - 1.0) * 7.0) * 0.18;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`

export const space: EffectFactory = ({ canvas, params }) => {
  const s = shader(canvas, FRAGMENT)
  if (!s) return null
  return {
    scale: 0.65,
    frame(seconds, k) {
      s.draw({
        u_time: seconds % 10000, u_a: rgb(params.nebula_a), u_b: rgb(params.nebula_b), u_planet_color: rgb(params.planet_color),
        u_stars: num(params.stars, 70) / 100, u_planet: params.planet ? 1 : 0, u_size: num(params.planet_size, 35) / 100,
        u_drift: num(params.drift, 15) / 100, u_glow: k,
      })
    },
    dispose: s.dispose,
  }
}
