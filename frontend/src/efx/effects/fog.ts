/** Near background or foreground: banks of fog sliding across. The intensity is its density; speed (and its
 *  direction), the banks' size, how opaque it gets and how low it lies are settings. */
import { rgb, shader } from '../gl'
import { num, type EffectFactory } from './types'

const FRAGMENT = `
uniform vec3 u_color;
uniform float u_speed, u_size, u_opacity, u_ground, u_density;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = vec2(uv.x * u_res.x / u_res.y, uv.y) * mix(5.0, 1.1, u_size);
  float t = u_time * u_speed * 0.12;
  // two depths of fog: the far one slower, warped so the banks curl as they slide
  vec2 drift = vec2(t, t * 0.07);
  float warp = fbm(p * 0.6 - drift * 0.5);
  float near = fbm(p - drift + vec2(warp * 1.2, warp * 0.4));
  float far = fbm(p * 1.7 - drift * 0.55 + vec2(3.1, warp));
  float f = near * 0.65 + far * 0.35;
  float th = 0.78 - 0.55 * u_density;
  float a = smoothstep(th - 0.12, th + 0.28, f);
  // lying low: thick near the ground, thinning out above
  a *= mix(1.0, smoothstep(0.95, 0.05, uv.y), u_ground);
  a = clamp(a * u_opacity * (0.55 + 0.6 * u_density), 0.0, 1.0);
  gl_FragColor = vec4(u_color * a, a);
}`

export const fog: EffectFactory = ({ canvas, params }) => {
  const s = shader(canvas, FRAGMENT, true)
  if (!s) return null
  return {
    scale: 0.45,
    frame(seconds, k) {
      s.draw({ u_time: seconds % 10000, u_color: rgb(params.color, '#d9dee8'), u_speed: num(params.speed, 25) / 100,
        u_size: num(params.size, 50) / 100, u_opacity: num(params.opacity, 65) / 100, u_ground: num(params.ground, 40) / 100, u_density: k })
    },
    dispose: s.dispose,
  }
}
