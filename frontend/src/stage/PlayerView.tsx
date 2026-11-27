/**
 * The DM's player view (plan 59): the Stage exactly as players see it (what every player sees, or one player's: their
 * characters, their groups' fog), from the server (`stages/{id}/as-players`), redrawn whenever the Stage changes. It's
 * a preview: the players' controls show, nothing acts. Works on any Stage, live or not (the Stages page's Play view too).
 * Plan 60: its button sits next to Pause and stays first in the players' Set bar on the player view.
 */
import { useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { StageView } from '../api/types'
import Popover, { anchorOf, type Anchor } from '../components/Popover'
import { SagaContext } from '../saga/SagaContext'
import { PlayerViewIcon } from './SetIcons'
import StageCanvas from './StageCanvas'

/** Whose view: every player's (null), or one player's (their member id). */
export type PlayerViewOf = { memberId: number | null }

/** The Set bar's button, next to Pause (plan 60): whose view this is, and a list to pick another: the DM's, every
 * player's, or one player's. On the player view it's the one thing the DM has that the player doesn't. */
export function PlayerViewButton({ current, onPick }: { current: PlayerViewOf | null; onPick: (who: PlayerViewOf | null) => void }) {
  const saga = useContext(SagaContext)
  const [menu, setMenu] = useState<Anchor | null>(null)
  const players = saga?.saga.members.filter((m) => m.role === 'player') ?? []
  const label = !current ? 'DM' : current.memberId === null ? 'Players' : players.find((m) => m.id === current.memberId)?.display_name ?? 'Player'
  const pick = (who: PlayerViewOf | null) => { onPick(who); setMenu(null) }
  const item = (on: boolean, text: ReactNode, who: PlayerViewOf | null, mark?: ReactNode) => (
    <button className={`menu-item ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => pick(who)}>
      <span className="menu-icon">{mark ?? (on ? '✓' : '')}</span>{text}
    </button>
  )
  return (
    <>
      <button className={`set-bar-button control player-view ${current ? 'open' : ''}`} aria-haspopup="menu" aria-expanded={Boolean(menu)}
        aria-label="Player view" title="See the Stage as the DM, as every player, or as one player"
        onClick={(e) => setMenu(menu ? null : anchorOf(e.currentTarget))}>
        <PlayerViewIcon />
        <span className="set-bar-name">{label} ▾</span>
      </button>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <div className="menu">
            <div className="menu-title">See the Stage as…</div>
            {item(!current, 'DM', null)}
            {item(current?.memberId === null, <>Players <span className="muted small">(what every player sees)</span></>, { memberId: null })}
            {players.map((m) => (
              <span key={m.id}>{item(current?.memberId === m.id, m.display_name, { memberId: m.id },
                current?.memberId === m.id ? '✓' : <span className="dice-dot" style={{ background: m.color }} />)}</span>
            ))}
          </div>
        </Popover>
      )}
    </>
  )
}

/** The Stage as players see it, in place of the DM's: exactly the player's Stage (their Set bar too), with the DM's
 * player view button first in that bar. A preview: nothing acts. */
export function PlayerViewScreen({ sagaId, stage, who, onPick }: {
  sagaId: number; stage: StageView; who: PlayerViewOf; onPick: (who: PlayerViewOf | null) => void
}) {
  const saga = useContext(SagaContext)
  const [shown, setShown] = useState<StageView | null>(null)
  const [error, setError] = useState('')
  // Redrawn whenever the DM's Stage changes (its updates come as a new Stage)
  useEffect(() => {
    api.stageAsPlayers(sagaId, stage.id, who.memberId).then((s) => { setShown(s); setError('') }).catch((e: Error) => setError(e.message))
  }, [sagaId, stage, who.memberId])
  const member = who.memberId !== null ? saga?.saga.members.find((m) => m.id === who.memberId) : undefined
  // Their controls show as a player's (role, colour)
  const asPlayer = saga && {
    ...saga, isAdmin: false,
    saga: { ...saga.saga, me: { ...saga.saga.me, member_id: member?.id ?? -1, role: 'player' as const, color: member?.color ?? null } },
  }
  return (
    <div className="player-view-screen">
      <SagaContext.Provider value={asPlayer}>
        {shown && <StageCanvas stage={shown} mode="view" preview={{ current: who, onPick }} />}
      </SagaContext.Provider>
      {error && <div className="error floating">{error}</div>}
    </div>
  )
}
