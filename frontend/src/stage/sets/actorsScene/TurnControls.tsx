/** The DM's turn controls on the scene (Play view, when the tab has them on): start, previous, next, end. */
import { anchorOf, type Anchor } from '../../../components/Popover'
import type { SceneCommands } from './commands'
import type { SceneTab } from './types'

export default function TurnControls({ tab, commands, onOrder }: { tab: SceneTab; commands: SceneCommands; onOrder: (anchor: Anchor) => void }) {
  const running = tab.turn.actor_id !== null
  const empty = tab.card_ids.length === 0
  return (
    <div className="turn-controls" data-interactive onPointerDown={(e) => e.stopPropagation()}>
      <button onClick={(e) => onOrder(anchorOf(e.currentTarget))} title="Edit the order (initiative, move up and down)">☰ Order…</button>
      <button disabled={empty} onClick={() => void commands.turn(tab.id, 'start')} title="Start: jump to the first">⏮ {running ? 'Restart' : 'Start'}</button>
      <button disabled={!running} onClick={() => void commands.turn(tab.id, 'previous')} aria-label="Previous turn" title="Previous turn">◀</button>
      <span className="turn-round">{running ? `Round ${tab.turn.round}` : 'No turn'}</span>
      <button className="primary" disabled={empty} onClick={() => void commands.turn(tab.id, running ? 'next' : 'start')} aria-label="Next turn" title="Next turn">Next ▶</button>
      <button disabled={!running} onClick={() => void commands.turn(tab.id, 'end')} aria-label="End turns" title="End: no one's turn">■</button>
    </div>
  )
}
