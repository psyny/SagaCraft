/** Abstract light, in any layer (transparent): bokeh, aurora, silk (flowing ribbons), light rays, dust motes. The
 *  intensity is how much of it there is; size and speed shape it. Slower on the far layer and livelier in front
 *  gives depth. */
import { rgb, shader } from '../gl'
import { hexA, rng } from '../random'
import { num, str, type Effect, type EffectFactory } from './types'

const FRAGMENTS: Record<string, string> = {
  aurora: `
uniform vec3 u_a, u_b; uniform float u_amount, u_size, u_speed;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float x = uv.x * 3.0 * u_res.x / u_res.y / 1.7;
  float t = u_time * (0.03 + u_speed * 0.25);
  vec3 col = vec3(0.0); float a = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float y = 0.62 - fi * 0.07 + 0.1 * sin(x * 1.2 + t + fi * 2.1) + 0.09 * (fbm(vec2(x * 1.3 + t * 0.6 + fi * 3.0, t * 0.3)) - 0.5);
    float d = uv.y - y;
    float curtain = exp(-max(d, 0.0) * (14.0 - 8.0 * u_size)) * smoothstep(-0.03, 0.0, d);
    curtain *= 0.45 + 0.55 * fbm(vec2(x * 9.0 + fi * 5.0, uv.y * 1.5 - t * 1.5));
    col += mix(u_a, u_b, fi / 2.0 + 0.3 * (uv.y - y)) * curtain;
    a += curtain;
  }
  a = clamp(a * u_amount, 0.0, 1.0);
  gl_FragColor = vec4(clamp(col * u_amount, 0.0, 1.0) * 0.95, a * 0.95);
}`,
  flow: `
uniform vec3 u_a, u_b; uniform float u_amount, u_size, u_speed;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float t = u_time * (0.05 + u_speed * 0.4);
  float v = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y = 0.5 + 0.2 * sin(uv.x * (2.0 + fi * 0.7) + t * (0.6 + fi * 0.15) + fi * 1.7) + 0.12 * (fbm(vec2(uv.x * 2.0 + fi, t * 0.2)) - 0.5);
    float d = abs(uv.y - y);
    v += exp(-d * (60.0 - 45.0 * u_size)) * 0.6 + exp(-d * 8.0) * 0.08;
  }
  vec3 col = mix(u_a, u_b, uv.x);
  float a = clamp(v * u_amount, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}`,
  rays: `
uniform vec3 u_a, u_b; uniform float u_amount, u_size, u_speed;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 d = vec2((uv.x - 0.18) * u_res.x / u_res.y, uv.y - 1.15);
  float ang = atan(d.x, -d.y);
  float r = length(d);
  float t = u_time * (0.02 + u_speed * 0.15);
  float rays = pow(fbm(vec2(ang * (6.0 + 10.0 * (1.0 - u_size)), t)), 2.5) * 2.6;
  float a = clamp(rays * exp(-r * 0.9) * u_amount, 0.0, 1.0);
  vec3 col = mix(u_a, u_b, clamp(r * 0.6, 0.0, 1.0));
  gl_FragColor = vec4(col * a, a);
}`,
}

function glStyle(style: string): EffectFactory {
  return ({ canvas, params }) => {
    const s = shader(canvas, FRAGMENTS[style], true)
    if (!s) return null
    return {
      scale: 0.5,
      frame(seconds, k) {
        s.draw({ u_time: seconds % 10000, u_a: rgb(params.color_a), u_b: rgb(params.color_b), u_amount: k,
          u_size: num(params.size, 50) / 100, u_speed: num(params.speed, 30) / 100 })
      },
      dispose: s.dispose,
    }
  }
}

interface Mote { x: number; y: number; r: number; vx: number; vy: number; phase: number; hue: number }

/** Bokeh (soft discs) and dust (fine motes): drifting, gently pulsing. */
function particles(dust: boolean): EffectFactory {
  return ({ canvas, params, seed }) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const random = rng(seed.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 7))
    const size = num(params.size, 50) / 100, speed = num(params.speed, 30) / 100
    const a = str(params.color_a, '#f2c46d'), b = str(params.color_b, '#7a5cff')
    let w = 1, h = 1
    const motes: Mote[] = []
    const make = (): Mote => ({
      x: random() * w, y: random() * h,
      r: dust ? (0.6 + random() * 1.6) * (0.5 + size) : (8 + random() * 40) * (0.3 + size * 1.7),
      vx: (random() - 0.5) * (dust ? 14 : 22) * (0.2 + speed * 2), vy: (random() - 0.6) * (dust ? 10 : 14) * (0.2 + speed * 2),
      phase: random() * Math.PI * 2, hue: random(),
    })
    const effect: Effect = {
      scale: Math.min(1.5, window.devicePixelRatio || 1),
      resize(width, height) { w = width; h = height },
      frame(seconds, k, dt) {
        const scale = effect.scale
        const want = Math.round((dust ? 160 : 34) * k * Math.max(0.3, (w * h) / (1600 * 900)))
        while (motes.length < want) motes.push(make())
        if (motes.length > want) motes.length = want
        ctx.setTransform(scale, 0, 0, scale, 0, 0)
        ctx.clearRect(0, 0, w, h)
        ctx.globalCompositeOperation = 'lighter'
        for (const m of motes) {
          m.x += m.vx * dt; m.y += m.vy * dt
          if (m.x < -m.r) m.x = w + m.r; else if (m.x > w + m.r) m.x = -m.r
          if (m.y < -m.r) m.y = h + m.r; else if (m.y > h + m.r) m.y = -m.r
          const pulse = 0.55 + 0.45 * Math.sin(seconds * (0.4 + speed) + m.phase)
          const color = m.hue < 0.5 ? a : b
          if (dust) {
            ctx.fillStyle = hexA(color, 0.5 * pulse)
            ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill()
          } else {
            const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r)
            g.addColorStop(0, hexA(color, 0.28 * pulse))
            g.addColorStop(0.7, hexA(color, 0.16 * pulse))
            g.addColorStop(1, hexA(color, 0))
            ctx.fillStyle = g
            ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill()
          }
        }
        ctx.globalCompositeOperation = 'source-over'
      },
      dispose() { motes.length = 0 },
    }
    return effect
  }
}

export const abstract: EffectFactory = (env) => {
  const style = str(env.params.style, 'bokeh')
  if (style in FRAGMENTS) return glStyle(style)(env)
  return particles(style === 'dust')(env)
}
