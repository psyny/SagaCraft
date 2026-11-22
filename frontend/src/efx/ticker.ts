/** One animation loop for every effect on the page (paused with the tab, like any requestAnimationFrame). */
type Tick = (seconds: number, dt: number) => void

const ticks = new Set<Tick>()
let frame = 0
let last = 0

function loop(now: number) {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60
  last = now
  const seconds = Date.now() / 1000
  for (const tick of [...ticks]) tick(seconds, dt)
  frame = ticks.size ? requestAnimationFrame(loop) : 0
  if (!frame) last = 0
}

export function onTick(tick: Tick): () => void {
  ticks.add(tick)
  if (!frame && typeof requestAnimationFrame !== 'undefined') frame = requestAnimationFrame(loop)
  return () => { ticks.delete(tick) }
}

/** People who asked their system for less motion get still pictures. */
export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
