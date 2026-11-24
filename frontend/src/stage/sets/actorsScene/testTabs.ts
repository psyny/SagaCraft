/** Test helper: a tab as the server renders it. */
import type { SceneTab } from './types'

export const tab = (over: Partial<SceneTab> = {}): SceneTab => ({
  id: 1, name: 'Exploration', shape: 'grid', flow: 'static', scatter: 0, neutral: 0, spacing: 14, spacing_y: 14, margin_top: 50, margin_sides: 50, card_size: 100, current_size: 170, order_by: 'custom',
  turn: { actor_id: null, round: 0 }, highlight_actor_id: null, spotlight: false, card_ids: [], ...over,
})
