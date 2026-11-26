/**
 * The Dice roller Set: the 3D dice (dice/DiceScene.tsx) over the Set, and one toolbar the DM places like any other
 * (Controls): the **tray**. Its columns are the roll types:
 * - the results above, a row per roll on the Set (newest at the bottom): who rolled on the left, each roll type's
 *   result over its button;
 * - at the bottom: minimize, Roll, Clear (your row: your waiting dice and your rolls), Clear all (the DM), then the
 *   roll-type buttons, a number in a circle over each saying how many of it you're about to roll (click it: one less).
 * Who can roll (settings) adds dice and rolls their own; others watch. Each member's waiting dice are theirs (players
 * see only their own; the DM everyone's, and clicks a waiting die to pick, unseen, the number it lands on). Rolls stay
 * on the Set until cleared; new throws bounce off them. With no dice on it, the Set lets clicks through (registry:
 * passThrough). See set_types/dice.py.
 */
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../../../api'
import { bestInk } from '../../../color/theory'
import type { SceneDie, SceneRoll, TrayEdge } from '../../../dice/DiceScene'
// three.js is big: the 3D dice load with the first Dice roller shown, not with the app
const DiceScene = lazy(() => import('../../../dice/DiceScene'))
import { useOptionalSaga } from '../../../saga/SagaContext'
import { TITLE_H } from '../../constants'
import EyeIcon from '../../../components/EyeIcon'
import { ClearAllIcon, ClearIcon, ExpandIcon, MinimizeIcon, RollIcon } from '../../SetIcons'
import Toolbar from '../../Toolbar'
import type { SetViewProps } from '../../types'
import type { DiceContent, Roll, RollType, RolledGroup } from './types'
import { useStagePaused } from '../../StagePaused'

const MIN_KEY = (setId: number) => `sagacraft.diceTray.${setId}.min`
const HIDDEN_KEY = (setId: number) => `sagacraft.diceTray.${setId}.hidden`
/** Results rows shown (the latest); the earlier ones open on demand. */
const ROWS = 4

/** Pure: how many of each roll type a member is about to roll (their waiting dice, by roll type). */
export function waiting(content: DiceContent, memberId: number | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const type of content.roll_types) {
    const dice = content.tray.filter((d) => d.member_id === memberId && d.type_id === type.id).length
    const per = type.dice.reduce((n, d) => n + d.count, 0) || 1
    if (dice) out[type.id] = Math.max(1, Math.round(dice / per))
  }
  return out
}

/** Pure: how far (px of the Set) a box covers the Set from one edge (0: not against that edge, or not over the Set). */
export function coverFrom(edge: 'bottom' | 'top' | 'left' | 'right', setBox: DOMRect, box: DOMRect, scale: number): number {
  const across = edge === 'bottom' || edge === 'top'
  const overlaps = across ? box.right > setBox.left && box.left < setBox.right : box.bottom > setBox.top && box.top < setBox.bottom
  if (!overlaps) return 0
  const px = edge === 'bottom' ? setBox.bottom - box.top : edge === 'top' ? box.bottom - setBox.top
    : edge === 'left' ? box.right - setBox.left : setBox.right - box.left
  const size = across ? setBox.height : setBox.width
  return px > 0 && px < size * 0.6 ? px * scale : 0
}

export default function DiceSetView({ set, mode, editor }: SetViewProps) {
  const content = set.content as DiceContent
  const saga = useOptionalSaga()
  const role = saga?.saga.me.role
  const sagaId = editor?.sagaId ?? saga?.sagaId
  const isDm = role === 'admin' && Boolean(editor)
  const me = saga?.saga.me.member_id
  // Rolling: who may (the server says), on the Stage (not while building it)
  const paused = useStagePaused() // players: the DM paused the game (plan 58)
  const canRoll = Boolean(sagaId) && mode !== 'build' && (isDm || (role === 'player' && content.can_roll !== false && !paused))
  const W = set.width, H = set.height - TITLE_H
  const [error, setError] = useState('')
  const [picking, setPicking] = useState<number | null>(null)
  const [allRows, setAllRows] = useState(false)
  // Rolled dice this person hid (a click on one): only for them, kept in this browser
  const [hiddenDice, setHiddenDice] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY(set.id)) || '[]') as number[]) } catch { return new Set() }
  })
  const hideDie = (id: number) => setHiddenDice((current) => {
    const ids = new Set(rolls.flatMap((r) => r.groups.flatMap((g) => g.dice.map((d) => d.id)))) // forget dice no longer there
    const next = new Set([...current].filter((d) => ids.has(d)))
    next.add(id)
    localStorage.setItem(HIDDEN_KEY(set.id), JSON.stringify([...next]))
    return next
  })
  const [minimized, setMinimized] = useState(() => localStorage.getItem(MIN_KEY(set.id)) === '1')
  const minimize = (on: boolean) => { setMinimized(on); localStorage.setItem(MIN_KEY(set.id), on ? '1' : '0') }
  // Results show once their dice land (rolls there when this opened already have)
  const rolls = content.rolls ?? []
  const [landed, setLanded] = useState<Set<number>>(() => new Set(rolls.map((r) => r.id)))
  const land = (id: number) => setLanded((current) => (current.has(id) ? current : new Set(current).add(id)))
  const speed = content.speed ?? 2
  useEffect(() => {
    // In case the throw can't be drawn (no WebGL): the results come anyway
    const timers = rolls.filter((r) => !landed.has(r.id)).map((r) => window.setTimeout(() => land(r.id), speed > 5 ? 0 : 7000 / speed))
    return () => timers.forEach((t) => window.clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolls.map((r) => r.id).join(','), speed])

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
  const scene: SceneRoll[] = rolls.map((r) => ({
    id: r.id, seed: r.seed,
    dice: r.groups.flatMap((g) => g.dice.map((d) => ({ id: d.id, sides: d.sides, value: d.value, color: g.color, style: g.style }))),
  }))
  const pickedDie = content.tray.find((d) => d.id === picking)
  const counts = waiting(content, me)
  const mine = content.tray.some((d) => d.member_id === me)
  const myRows = rolls.some((r) => r.member_id === me)
  const rows = rolls.filter((r) => landed.has(r.id))
  const types = content.roll_types
  // Players (plan 59): their roll buttons are in their bar (top left); the tray where the DM placed it shows the results
  const inBar = !isDm && Boolean(saga) && mode === 'view'
  const showTray = (canRoll && !inBar) || rows.length > 0 || mode === 'build'
  // Where the tray's controls cover the Set (wherever the DM placed them): the waiting dice go above them
  const edge = (content.tray_edge ?? 'bottom') as TrayEdge
  const root = useRef<HTMLDivElement>(null)
  const [trayEl, setTrayEl] = useState<HTMLDivElement | null>(null)
  const [cover, setCover] = useState(0)
  const [measured, setMeasured] = useState(false)
  useLayoutEffect(() => {
    const box = trayEl?.closest('.set-toolbar') ?? trayEl
    if (!root.current || !box) {
      setCover(0)
      // No tray (yet): give it a moment to mount before the rolls already there are placed
      const timer = window.setTimeout(() => setMeasured(true), showTray ? 300 : 0)
      return () => window.clearTimeout(timer)
    }
    const measure = () => {
      const a = root.current!.getBoundingClientRect()
      const px = coverFrom(edge, a, box.getBoundingClientRect(), a.height ? H / a.height : 1)
      setCover(Math.round(px / 8) * 8)
      setMeasured(true)
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(box)
    observer?.observe(root.current)
    return () => observer?.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edge, trayEl, H])

  return (
    <div ref={root} className={`dice-set mode-${mode}`} style={{ height: H }}>
      <Suspense fallback={null}>
        <DiceScene width={W} height={H} tray={tray} rolls={scene} edge={edge} trayInset={cover} ready={measured}
          speed={speed} size={content.dice_size ?? 1} still={saga?.saga.me.dice_still} simple={saga?.saga.me.dice_simple}
          onDieClick={isDm && mode !== 'build' ? (id) => setPicking(id) : undefined}
          onRolledClick={mode !== 'build' ? hideDie : undefined} showRolled={!content.rolled_hidden} hiddenDice={hiddenDice}
          onSettled={land} />
      </Suspense>
      {showTray && (
        <Toolbar id="tray">
          {/* Minimized: only the button that opens it again (the results and the roll types go) */}
          {canRoll && !inBar && minimized ? (
            <div ref={setTrayEl} className="dice-tray minimized">
              <button className="dice-tray-icon" aria-label="Show the dice tray" title="Show the dice tray (roll types, results)" onClick={() => minimize(false)}><ExpandIcon /></button>
            </div>
          ) : (
          <div ref={setTrayEl} className="dice-tray" style={{ gridTemplateColumns: `auto repeat(${types.length}, minmax(52px, auto))` }}>
            {rows.length > ROWS && (
              <button className="small ghost dice-tray-more" onClick={() => setAllRows(!allRows)}>
                {allRows ? 'Only the latest' : `＋${rows.length - ROWS} earlier`}
              </button>
            )}
            {(allRows ? rows : rows.slice(-ROWS)).map((roll) => <ResultRow key={roll.id} roll={roll} types={types} />)}
            {canRoll && !inBar && (
              <>
                <div className="dice-tray-controls">
                  <button className="dice-tray-icon" aria-label="Minimize the tray" title="Minimize (only the results stay)" onClick={() => minimize(true)}><MinimizeIcon /></button>
                  <button className="dice-tray-icon roll" aria-label="Roll" title="Roll your dice" disabled={!mine} onClick={() => void act('roll')}><RollIcon /></button>
                  <button className="dice-tray-icon" aria-label="Clear my row" title="Clear your row: your dice waiting and your rolls" disabled={!mine && !myRows} onClick={() => void act('clear')}><ClearIcon /></button>
                  {isDm && (
                    <>
                      <button className="dice-tray-icon" aria-label="Clear every row" title="Clear every row (everyone's dice and rolls)"
                        disabled={!content.tray.length && !rolls.length} onClick={() => void act('clear.all')}><ClearAllIcon /></button>
                      <button className={`dice-tray-icon ${content.rolled_hidden ? 'off' : ''}`} disabled={!rolls.length}
                        aria-label={content.rolled_hidden ? 'Show the rolled dice' : 'Hide the rolled dice'} aria-pressed={!content.rolled_hidden}
                        title={content.rolled_hidden ? 'Show the rolled dice again (for everyone)' : 'Hide the rolled dice for everyone (the results stay; a new roll shows them again)'}
                        onClick={() => void act('rolls.hide', { hidden: !content.rolled_hidden })}><EyeIcon open={!content.rolled_hidden} /></button>
                    </>
                  )}
                </div>
                {types.map((r) => (
                  <div key={r.id} className="dice-tray-type">
                    <button className="small dice-type" title={r.label} onClick={() => void act('tray.add', { type_id: r.id })}>{r.name}</button>
                    {counts[r.id] > 0 && (
                      <button className="dice-badge" aria-label={`One ${r.name} less (${counts[r.id]})`} title="One less" onClick={() => void act('tray.take', { type_id: r.id })}>
                        {counts[r.id]}
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
            {(!canRoll || inBar) && (rows.length > 0 || mode === 'build') && (
              <>
                <div className="dice-tray-controls" />
                {types.map((r) => <div key={r.id} className="dice-tray-label" title={r.label}>{r.name}</div>)}
              </>
            )}
          </div>
          )}
          {error && <span className="small error-inline">{error}</span>}
        </Toolbar>
      )}
      {inBar && canRoll && (
        <Toolbar id="player">
          <button className="dice-tray-icon roll" aria-label="Roll" title="Roll your dice" disabled={!mine} onClick={() => void act('roll')}><RollIcon /></button>
          <button className="dice-tray-icon" aria-label="Clear my row" title="Clear your row: your dice waiting and your rolls" disabled={!mine && !myRows} onClick={() => void act('clear')}><ClearIcon /></button>
          {types.map((r) => (
            <span key={r.id} className="dice-tray-type">
              <button className="small dice-type" title={r.label} onClick={() => void act('tray.add', { type_id: r.id })}>{r.name}</button>
              {counts[r.id] > 0 && (
                <button className="dice-badge" aria-label={`One ${r.name} less (${counts[r.id]})`} title="One less" onClick={() => void act('tray.take', { type_id: r.id })}>
                  {counts[r.id]}
                </button>
              )}
            </span>
          ))}
          {error && <span className="small error-inline">{error}</span>}
        </Toolbar>
      )}
      {pickedDie && (
        <div className="dice-pick" data-interactive onPointerDown={(e) => e.stopPropagation()}>
          <div className="dice-pick-head">
            <strong>d{pickedDie.sides}{pickedDie.member_id !== me ? ` (${pickedDie.member})` : ''}: land on…</strong>
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

/** One roll's row: who rolled, then each roll type's result in its column (other roll types, by name, at the end). */
function ResultRow({ roll, types }: { roll: Roll; types: RollType[] }) {
  const color = roll.color ?? roll.groups[0]?.color ?? '#888888'
  const byType = new Map(roll.groups.map((g) => [g.type_id, g]))
  const others = roll.groups.filter((g) => !types.some((t) => t.id === g.type_id))
  return (
    <>
      <div className="dice-tray-who" style={{ borderColor: color }}>
        <span className="dice-dot" style={{ background: color }} />{roll.by}
        {others.map((g) => <span key={g.group} className="muted small"> · {g.name} <strong>{g.result}</strong></span>)}
      </div>
      {types.map((t) => {
        const g = byType.get(t.id)
        return <div key={t.id} className="dice-tray-cell">{g && <Result group={g} />}</div>
      })}
    </>
  )
}

function Result({ group }: { group: RolledGroup }) {
  const times = group.name.match(/×(\d+)$/)?.[1]
  return (
    <div className="dice-result-cell" style={{ borderColor: group.color }}
      title={`${group.name} (${group.label}): ${group.dice.map((d) => d.value).join(', ')} → ${group.result}`}>
      <span className="dice-total">{group.result}</span>
      {times && <span className="dice-times">×{times}</span>}
      {group.dice.length > 1 && group.dice.length <= 8 && (
        <span className="dice-values">
          {group.dice.map((d) => (
            <span key={d.id} className={`dice-value ${d.counted ? 'counted' : ''}`} style={d.counted ? { background: group.color, color: bestInk(group.color) } : undefined}>{d.value}</span>
          ))}
        </span>
      )}
    </div>
  )
}
