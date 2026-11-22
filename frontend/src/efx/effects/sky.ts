/** Far background: a sky. Time of day sets the colours; the sun (day) or the moon (night), stars, clouds moved by
 *  the wind; the intensity is the cloud cover. */
import { rgb, shader } from '../gl'
import { num, str, type EffectFactory } from './types'

const TIMES: Record<string, { top: string; horizon: string; body: string; night: number }> = {
  dawn: { top: '#2b3d73', horizon: '#f3a47c', body: '#ffd9a6', night: 0.3 },
  day: { top: '#2f6fcf', horizon: '#bfe1ff', body: '#fff7dc', night: 0 },
  dusk: { top: '#1c1a4a', horizon: '#e9744a', body: '#ffb36e', night: 0.55 },
  night: { top: '#03060f', horizon: '#18214a', body: '#e6ecff', night: 1 },
}

const FRAGMENT = `
uniform vec3 u_top, u_horizon, u_body_color, u_cloud;
uniform vec3 u_body; // x, y (0..1, up), radius (of the height)
uniform float u_show_body, u_moon, u_stars, u_night, u_wind, u_cover;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec3 col = mix(u_horizon, u_top, pow(clamp(uv.y, 0.0, 1.0), 0.75));
  // stars, twinkling, fading towards the horizon and by day
  vec2 g = vec2(uv.x * aspect, uv.y) * 170.0;
  vec2 id = floor(g);
  float h = hash(id);
  if (h > 1.0 - 0.012 * u_stars) {
    float d = length(fract(g) - 0.5);
    float tw = 0.55 + 0.45 * sin(u_time * (0.8 + h * 3.0) + h * 60.0);
    col += vec3(1.0) * smoothstep(0.16, 0.0, d) * tw * u_night * smoothstep(0.08, 0.5, uv.y);
  }
  // the sun or the moon, with a glow
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 b = vec2(u_body.x * aspect, u_body.y);
  float d = length(p - b);
  float r = u_body.z;
  float disc = smoothstep(r, r * 0.94, d);
  vec3 body = u_body_color;
  if (u_moon > 0.5) body *= 0.82 + 0.18 * noise((p - b) / r * 3.0); // a few seas on the moon
  col = mix(col, body, disc * u_show_body);
  col += u_body_color * exp(-(d * d) / (r * r * (u_moon > 0.5 ? 5.0 : 14.0))) * (u_moon > 0.5 ? 0.25 : 0.55) * u_show_body;
  // clouds, drifting
  vec2 q = vec2(uv.x * aspect * 1.3 + u_time * u_wind * 0.012, uv.y * 2.4);
  float n = fbm(q * 1.8 + vec2(0.0, u_time * 0.004)) + 0.25 * fbm(q * 5.0 - u_time * u_wind * 0.01);
  float t = 0.95 - 0.7 * u_cover;
  float c = smoothstep(t - 0.12, t + 0.18, n) * smoothstep(0.02, 0.3, uv.y);
  vec3 lit = mix(u_cloud * mix(u_horizon, vec3(1.0), 0.45), u_cloud, smoothstep(0.3, 1.0, n));
  lit *= 1.0 - 0.72 * u_night;
  col = mix(col, lit, c * 0.92);
  gl_FragColor = vec4(col, 1.0);
}`

export const sky: EffectFactory = ({ canvas, params }) => {
  const s = shader(canvas, FRAGMENT)
  if (!s) return null
  const time = TIMES[str(params.time, 'dusk')] ?? TIMES.dusk
  const moon = time.night >= 1
  const show = moon ? Boolean(params.moon) : Boolean(params.sun)
  const height = num(params.height, 35) / 100
  return {
    scale: 0.6,
    frame(seconds, k) {
      s.draw({
        u_time: seconds % 10000, u_top: rgb(time.top), u_horizon: rgb(time.horizon), u_body_color: rgb(time.body),
        u_cloud: rgb(params.clouds), u_body: [0.72, 0.12 + 0.75 * height, moon ? 0.055 : 0.07], u_show_body: show ? 1 : 0,
        u_moon: moon ? 1 : 0, u_stars: num(params.stars, 60) / 100, u_night: time.night, u_wind: num(params.wind, 20) / 100,
        u_cover: k,
      })
    },
    dispose: s.dispose,
  }
}
