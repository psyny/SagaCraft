/** What an animated effect is to the layer drawing it: a canvas it paints each frame. */
export interface EffectEnv {
  canvas: HTMLCanvasElement
  params: Record<string, unknown>
  /** The effect's id: a stable seed. */
  seed: string
}

export interface Effect {
  /** Canvas pixels per CSS pixel (shaders draw smaller and are scaled up: they're soft anyway). */
  scale: number
  resize?: (width: number, height: number) => void
  /** seconds: the clock; k: the intensity now (0..1); dt: seconds since the last frame. */
  frame: (seconds: number, k: number, dt: number) => void
  dispose: () => void
}

export type EffectFactory = (env: EffectEnv) => Effect | null

export const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
export const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback)
