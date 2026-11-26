/**
 * The DM's player view (plan 59): the Stage exactly as players see it (what every player sees, or one player's: their
 * characters, their groups' fog), from the server (`stages/{id}/as-players`), redrawn whenever the Stage changes. It's
 * a preview: the players' controls show, nothing acts. Works on any Stage, live or not (the Stages page's Play view too).
 */
import { useContext, useEffect, useState } from 'react'
import { api } from '../api'
import type { StageView } from '../api/types'
import Popover, { anchorOf, type Anchor } from '../components/Popover'
import { SagaContext } from '../saga/SagaContext'
import { PlayerViewIcon } from './SetIcons'
import StageCanvas from './StageCanvas'

/** Whose view: every player's (null), or one player's (their member id). */
export type PlayerViewOf = { memberId: number | null }

/** The Set bar's button: picks whose view (every player, or one of them). */
export function PlayerViewButton({ onPick }: { onPick: (who: PlayerViewOf) => void }) {
  const saga = useContext(SagaContext)
  const [menu, setMenu] = useState<Anchor | null>(null)
  const players = saga?.saga.members.filter((m) => m.role === 'player') ?? []
  return (
    <>
      <button className="set-bar-button control player-view" aria-label="Player view" title="See the Stage as players see it"
        onClick={(e) => setMenu(menu ? null : anchorOf(e.currentTarget))}>
        <PlayerViewIcon />
      </button>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <div className="menu">
            <div className="menu-title">See the Stage as…</div>
            <button className="menu-item" onClick={() => { onPick({ memberId: null }); setMenu(null) }}>
              <span className="menu-icon">👁</span>Every player <span className="muted small">(what all of them see)</span>
            </button>
            {players.map((m) => (
              <button key={m.id} className="menu-item" onClick={() => { onPick({ memberId: m.id }); setMenu(null) }}>
                <span className="dice-dot" style={{ background: m.color }} />{m.display_name}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  )
}

/** The Stage as players see it, in place of the DM's, with a bar to switch whose view or go back. */
export function PlayerViewScreen({ sagaId, stage, who, onPick, onExit }: {
  sagaId: number; stage: StageView; who: PlayerViewOf; onPick: (who: PlayerViewOf) => void; onExit: () => void
}) {
  const saga = useContext(SagaContext)
  const [shown, setShown] = useState<StageView | null>(null)
  const [error, setError] = useState('')
  // Redrawn whenever the DM's Stage changes (its updates come as a new Stage)
  useEffect(() => {
    api.stageAsPlayers(sagaId, stage.id, who.memberId).then((s) => { setShown(s); setError('') }).catch((e: Error) => setError(e.message))
  }, [sagaId, stage, who.memberId])
  const member = who.memberId !== null ? saga?.saga.members.find((m) => m.id === who.memberId) : undefined
  // Their controls show as a player's (role, colour); nothing acts (the stage is inert)
  const asPlayer = saga && {
    ...saga, isAdmin: false,
    saga: { ...saga.saga, me: { ...saga.saga.me, member_id: member?.id ?? -1, role: 'player' as const, color: member?.color ?? null } },
  }
  const players = saga?.saga.members.filter((m) => m.role === 'player') ?? []
  return (
    <div className="player-view">
      <div className="player-view-stage" ref={(el) => el?.setAttribute('inert', '')}>
        <SagaContext.Provider value={asPlayer}>
          {shown && <StageCanvas stage={shown} mode="view" />}
        </SagaContext.Provider>
      </div>
      <div className="player-view-bar" role="status">
        <PlayerViewIcon size={16} />
        <span>Player view:</span>
        <select value={who.memberId ?? ''} aria-label="Whose view" onChange={(e) => onPick({ memberId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Every player</option>
          {players.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
        {error && <span className="error-inline small">{error}</span>}
        <button className="small primary" onClick={onExit}>Back to the DM's view</button>
      </div>
    </div>
  )
}
