/**
 * Interface layout: Sets fixed to the screen (backend domain/stage_layout.py). Each has an anchor (a corner, an
 * edge's middle, the centre), a width and height in % of the screen and an offset in % from its anchor.
 */
import type { ScreenAnchor, SetScreen } from '../api/types'

export const DEFAULT_SCREEN: SetScreen = { anchor: 'center', width: 60, height: 60, x: 0, y: 0 }

export const ANCHORS: ScreenAnchor[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right']

/** Where the Set sits in the room left over: 0 against the left/top edge, 1 against the right/bottom. */
const FRACTIONS: Record<ScreenAnchor, [number, number]> = {
  'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0],
  left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
  'bottom-left': [0, 1], bottom: [0.5, 1], 'bottom-right': [1, 1],
}

export function screenRect(screen: SetScreen | undefined, width: number, height: number) {
  const s = { ...DEFAULT_SCREEN, ...screen }
  const w = (width * s.width) / 100
  const h = (height * s.height) / 100
  const [fx, fy] = FRACTIONS[s.anchor] ?? [0.5, 0.5]
  return { x: (width - w) * fx + (width * s.x) / 100, y: (height - h) * fy + (height * s.y) / 100, w, h }
}

const round = (v: number) => Math.round(v * 10) / 10
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))

/** A drag in px turned into the screen's %: moving shifts the offset, resizing changes the size. */
export function dragScreen(base: SetScreen, kind: 'move' | 'resize', dx: number, dy: number, width: number, height: number): SetScreen {
  const s = { ...DEFAULT_SCREEN, ...base }
  if (kind === 'move') return { ...s, x: round(clamp(s.x + (dx / width) * 100, -100, 100)), y: round(clamp(s.y + (dy / height) * 100, -100, 100)) }
  // Resizing from the bottom-right corner: an anchor on the right/bottom grows the other way, so keep the corner under the pointer
  const [fx, fy] = FRACTIONS[s.anchor] ?? [0.5, 0.5]
  const gw = (dx / width) * 100 / (1 - fx || 1)
  const gh = (dy / height) * 100 / (1 - fy || 1)
  return { ...s, width: round(clamp(s.width + (fx === 1 ? 0 : gw), 5, 100)), height: round(clamp(s.height + (fy === 1 ? 0 : gh), 5, 100)) }
}
