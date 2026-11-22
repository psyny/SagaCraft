/** A full-screen fragment shader on a canvas (sky, space, aurora...). Uniforms by name: numbers or vec2-4. */
const VERTEX = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'

/** Value noise and fbm, shared by the shaders. */
export const NOISE = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
`

export interface Shader {
  draw: (uniforms: Record<string, number | number[]>) => void
  dispose: () => void
}

export function shader(canvas: HTMLCanvasElement, fragment: string, transparent = false): Shader | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: transparent, antialias: false }) as WebGLRenderingContext | null
  if (!gl || gl.isContextLost()) return null
  const compile = (type: number, source: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, source)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('EFX shader:', gl.getShaderInfoLog(s))
      return null
    }
    return s
  }
  const vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, NOISE + fragment)
  if (!vs || !fs) return null
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const where = gl.getAttribLocation(program, 'p')
  gl.enableVertexAttribArray(where)
  gl.vertexAttribPointer(where, 2, gl.FLOAT, false, 0, 0)
  const locations = new Map<string, WebGLUniformLocation | null>()
  const at = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name))
    return locations.get(name)!
  }
  return {
    draw(uniforms) {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(at('u_res'), canvas.width, canvas.height)
      for (const [name, value] of Object.entries(uniforms)) {
        const loc = at(name)
        if (!loc) continue
        if (typeof value === 'number') gl.uniform1f(loc, value)
        else if (value.length === 2) gl.uniform2f(loc, value[0], value[1])
        else if (value.length === 3) gl.uniform3f(loc, value[0], value[1], value[2])
        else gl.uniform4f(loc, value[0], value[1], value[2], value[3])
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buffer)
      // Each effect gets a canvas of its own (thrown away after): give its context back now, browsers keep few
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

/** "#rrggbb" as 0..1 numbers. */
export function rgb(hex: unknown, fallback = '#ffffff'): [number, number, number] {
  const h = typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
}
