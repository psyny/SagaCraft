/**
 * The Dice roller Set: the 3D dice (dice/DiceScene.tsx) over the Set, the tray along the edge the DM picked, and three
 * toolbars the DM places like any other (Controls): "rolls" (the roll-type buttons), "tray" (its groups and Roll) and
 * "results" (the last roll, with ✕ to clear it and its dice). With no dice on it, the Set lets clicks through
 * (registry: passThrough); its toolbars still work. Players and the DM add dice and roll (viewers and the live
 * link watch); whoever added a group takes it back (the DM: any, and Clear). The DM clicks a tray die to pick, unseen,
 * the number it lands on. Every screen sees the same throw. See set_types/dice.py.
 */
import { useEffect, useRef, useState } from 'react'
import { api } from '../../../api'
import { bestInk } from '../../../color/theory'
import DiceScene, { type SceneDie, type TrayEdge } from '../../../dice/DiceScene'
import { useOptionalSaga } from '../../../saga/SagaContext'
import { TITLE_H } from '../../constants'
import Toolbar from '../../Toolbar'
import type { SetViewProps } from '../../types'
import type { DiceContent, Roll } from './types'

export default function DiceSetView({ set, mode, editor }: SetViewProps) {
  const content = set.content as DiceContent
  const saga = useOptionalSaga()
  const role = saga?.saga.me.role
  const sagaId = editor?.sagaId ?? saga?.sagaId
  const isDm = role === 'admin' && Boolean(editor)
  const canAct = Boolean(sagaId) && (role === 'player' || (isDm && mode !== 'build')) && mode !== 'build'
  const me = saga?.saga.me.member_id
  const W = set.width, H = set.height - TITLE_H
  const [error, setError] = useState('')
  const [picking, setPicking] = useState<number | null>(null)
  // Throw only rolls made while watching (a roll from before shows at rest); show results once it lands
  const seen = useRef(content.roll?.id ?? null)
  const animate = content.roll !== null && content.roll.id !== seen.current
  const [landed, setLanded] = useState<number | null>(content.roll?.id ?? null)
  useEffect(() => { if (!animate) setLanded(content.roll?.id ?? null) }, [animate, content.roll?.id])

  const act = async (name: string, args: Record<string, unknown> = {}) => {
    if (!sagaId) return
    setError('')
    try {
      if (editor) await editor.run(() => api.act(sagaId, set.id, name, args))
      else await api.act(sagaId, set.id, name, args)
    } catch (e) {
      setError((e as Error).message)
      window.setTimeout(() => setError(''), 3000)
    }
  }

  const tray: SceneDie[] = content.tray.map((d) => ({ id: d.id, sides: d.sides, color: d.color, style: d.style, forced: d.forced ?? null }))
  const roll = content.roll
  const rolled = roll && {
    id: roll.id, seed: roll.seed,
    dice: roll.groups.flatMap((g) => g.dice.map((d) => ({ id: d.id, sides: d.sides, value: d.value, color: g.color, style: g.style }))),
  }
  const groups = [...new Map(content.tray.map((d) => [d.group, d])).values()]
  const pickedDie = content.tray.find((d) => d.id === picking)
  const showResults = roll && content.tray.length === 0 && landed === roll.id

  return (
    <div className={`dice-set mode-${mode}`} style={{ height: H }}>
      <DiceScene width={W} height={H} tray={tray} roll={rolled} animate={animate} edge={(content.tray_edge ?? 'bottom') as TrayEdge}
        onDieClick={isDm && mode !== 'build' ? (id) => setPicking(id) : undefined}
        onSettled={() => { if (roll) { seen.current = roll.id; setLanded(roll.id) } }} />
      {canAct && (
        <Toolbar id="rolls">
          {content.roll_types.map((r) => (
            <button key={r.id} className="small dice-type" title={r.label} onClick={() => void act('tray.add', { type_id: r.id })}>{r.name}</button>
          ))}
        </Toolbar>
      )}
      {(groups.length > 0 || error) && (
        <Toolbar id="tray">
          {groups.map((g) => {
            const type = content.roll_types.find((r) => r.id === g.type_id)
            const mine = g.member_id === me
            const count = content.tray.filter((d) => d.group === g.group).length
            const per = type ? type.dice.reduce((n, d) => n + d.count, 0) : 1
            return (
              <span key={g.group} className="dice-group" style={{ borderColor: g.color }}>
                <span className="dice-dot" style={{ background: g.color }} />{type?.name ?? g.type_id}{count > per ? ` ×${Math.round(count / per)}` : ''}
                <span className="muted small">{g.member}</span>
                {canAct && (mine || isDm) && <button className="small ghost" aria-label="Take these dice back" onClick={() => void act('tray.remove', { group: g.group })}>✕</button>}
              </span>
            )
          })}
          {error && <span className="small error-inline">{error}</span>}
          {canAct && isDm && groups.length > 0 && <button className="small ghost" onClick={() => void act('tray.clear')}>Clear</button>}
          {canAct && groups.length > 0 && <button className="primary dice-roll" onClick={() => void act('roll')}>🎲 Roll</button>}
        </Toolbar>
      )}
      {showResults && (
        <Toolbar id="results">
          <Results roll={roll} history={content.history} />
          {canAct && <button className="small ghost dice-clear" title="Clear the results and the rolled dice" aria-label="Clear the results" onClick={() => void act('roll.clear')}>✕</button>}
        </Toolbar>
      )}
      {pickedDie && (
        <div className="dice-pick" data-interactive onPointerDown={(e) => e.stopPropagation()}>
          <div className="dice-pick-head">
            <strong>d{pickedDie.sides}: land on…</strong>
            <span className="muted small">Only you see this.</span>
            <button className="small ghost" aria-label="Close" onClick={() => setPicking(null)}>✕</button>
          </div>
          {pickedDie.sides <= 20 ? (
            <div className="dice-pick-values">
              {Array.from({ length: pickedDie.sides }, (_, i) => i + 1).map((v) => (
                <button key={v} className={`small ${pickedDie.forced === v ? 'primary' : ''}`} onClick={() => { void act('tray.force', { die_id: pickedDie.id, value: v }); setPicking(null) }}>{v}</button>
              ))}
            </div>
          ) : (
            <form onSubmit={(e) => {
              e.preventDefault()
              const v = Number((e.currentTarget.elements.namedItem('v') as HTMLInputElement).value)
              if (v >= 1 && v <= pickedDie.sides) { void act('tray.force', { die_id: pickedDie.id, value: v }); setPicking(null) }
            }}>
              <input name="v" type="number" min={1} max={pickedDie.sides} defaultValue={pickedDie.forced ?? ''} autoFocus aria-label="Value" />
              <button className="small primary">Pick</button>
            </form>
          )}
          <button className="small ghost" onClick={() => { void act('tray.force', { die_id: pickedDie.id, value: null }); setPicking(null) }}>Let it roll (random)</button>
        </div>
      )}
    </div>
  )
}

function Results({ roll, history }: { roll: Roll; history: Roll[] }) {
  return (
    <div className="dice-results">
      {roll.groups.map((g) => (
        <div key={g.group} className="dice-result" style={{ borderColor: g.color }} title={g.label}>
          <span className="dice-dot" style={{ background: g.color }} />
          <span className="dice-result-head"><strong>{g.name}</strong><span className="muted">{g.member}</span></span>
          {g.dice.length > 1 && (
            <span className="dice-values">
              {g.dice.map((d) => (
                <span key={d.id} className={`dice-value ${d.counted ? 'counted' : ''}`} style={d.counted ? { background: g.color, color: bestInk(g.color) } : undefined}>{d.value}</span>
              ))}
            </span>
          )}
          <span className="dice-total">{g.result}</span>
        </div>
      ))}
      <div className="muted small dice-by">Rolled by {roll.by}</div>
      {history.length > 0 && (
        <details className="dice-history">
          <summary className="small">Earlier rolls</summary>
          {history.map((r) => (
            <div key={r.id} className="small dice-history-row">
              {r.groups.map((g) => <span key={g.group}><span className="dice-dot" style={{ background: g.color }} /> {g.name}: <strong>{g.result}</strong></span>)}
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
