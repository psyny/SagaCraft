/**
 * The Stage's own controls (plan 33): no Set needed. Stages (the DM's: make any Stage live in one pick; the Set bar's
 * first item, plan 45), EFX (the
 * DM's: the Stage's environment in one click, each EFX layer on or off) and Actions (the DM and players: pick what
 * kind of thing, which one, the action, Run). The DM gets them in the Set bar; players get the Action control on their
 * live Stage. Build's Stage panel turns them on or off.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { ActionActors, ActionResult, StageSummary, StageView } from '../api/types'
import EyeIcon from '../components/EyeIcon'
import { ON_LABELS, type ActionOn } from '../saga/actions'
import { ResultNote } from '../saga/ActionsPanel'
import { EFX_LAYER_TYPES, LAYER_LABELS } from './sets/efx/types'
import type { StageEditor } from './types'
import { ActionsIcon, StagesIcon } from './SetIcons'

/** The DM's Stages control, first on the Set bar (plan 45): which Stage is live; picking one makes it live (on the
 *  Stages page it opens too). With nothing live (the Stage tab is dark) it's the bar's only control. */
export function StageSwitcher({ sagaId, editor }: { sagaId: number; editor?: StageEditor }) {
  const [stages, setStages] = useState<StageSummary[] | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api.stages(sagaId).then(setStages).catch(() => setStages([])), [sagaId])
  useEffect(() => { void load() }, [load, editor?.stage.id, editor?.stage.is_live])
  const live = stages?.find((s) => s.is_live) ?? null
  const pick = async (stageId: number | null) => {
    setBusy(true)
    const go = () => api.setLive(sagaId, stageId)
    if (editor) await editor.run(go)
    else await go().catch(() => undefined)
    await load()
    setBusy(false)
    if (editor && stageId !== null && stageId !== editor.stage.id) editor.openStage?.(stageId)
  }
  return (
    <div className="stage-control stage-switcher">
      <StagesIcon size={18} />
      <span className={`stage-live-dot ${live ? 'on' : ''}`} title={live ? `${live.name} is live` : 'Nothing is live'} />
      <select className="small" aria-label="The live Stage" title="The live Stage: pick one to make it live" value={live?.id ?? ''}
        disabled={busy || stages === null} onChange={(e) => void pick(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Nothing live</option>
        {(stages || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {editor && !editor.stage.is_live && <button className="small" disabled={busy} onClick={() => void pick(editor.stage.id)}>● Make this one live</button>}
    </div>
  )
}

/** The DM's EFX control: the Stage's environment, and the EFX layer Sets on or off (their eye). */
export function EfxControl({ stage, editor }: { stage: StageView; editor: StageEditor }) {
  if (!stage.efx) return null
  const layers = stage.sets.filter((s) => (EFX_LAYER_TYPES as readonly string[]).includes(s.type)).sort((a, b) => a.layer - b.layer)
  return (
    <div className="stage-control efx-control">
      <select className="small efx-pick" aria-label="Environment" title="The Stage's environment" value={stage.efx.current ?? ''}
        onChange={(e) => void editor.run(() => api.setStageEnvironment(editor.sagaId, stage.id, e.target.value ? Number(e.target.value) : null))}>
        <option value="">No environment</option>
        {stage.efx.environments.map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
      </select>
      {layers.map((s) => (
        <button key={s.id} className={`small toolbar-eye ${s.off ? 'off' : ''}`} aria-pressed={!s.off}
          title={s.off ? `${s.name}: put away (show it again)` : `${s.name}: hide it for now`}
          onClick={() => void editor.run(() => api.updateSet(editor.sagaId, s.id, { off: !s.off }))}>
          <EyeIcon open={!s.off} /> {LAYER_LABELS[s.type]}
        </button>
      ))}
      <Link className="small efx-link" to={`/s/${editor.sagaId}/efx`}>Environments →</Link>
    </div>
  )
}

const KINDS: ActionOn[] = ['character', 'item', 'group']

/** The Action control: what kind of thing, which one, the action, Run; the result just under it. The list is the
 *  member's (the DM: everything; a player: their characters, their items and groups). */
export function ActionControl({ sagaId }: { sagaId: number }) {
  const [actors, setActors] = useState<ActionActors | null>(null)
  const [kind, setKind] = useState<ActionOn | null>(null)
  const [actorId, setActorId] = useState<number | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => api.actionActors(sagaId).then(setActors).catch((e: Error) => setError(e.message)), [sagaId])
  useEffect(() => { void load() }, [load])
  if (!actors) return <span className="muted small">Loading actions…</span>
  const kinds = KINDS.filter((k) => actors[k].length > 0)
  if (!kinds.length) return <span className="muted small">No actions to run (Saga → Template → Actions).</span>
  const shownKind = kind && kinds.includes(kind) ? kind : kinds[0]
  const list = actors[shownKind]
  const actor = list.find((a) => a.id === actorId) ?? list[0]
  const action = actor.actions.find((a) => a.key === key) ?? actor.actions[0]
  const run = async () => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      setResult(shownKind === 'group' ? await api.runGroupAction(sagaId, actor.id, action.key) : await api.runResourceAction(sagaId, actor.id, action.key))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stage-control action-control">
      {kinds.length > 1 && (
        <select className="small" aria-label="Run an action on" value={shownKind}
          onChange={(e) => { setKind(e.target.value as ActionOn); setActorId(null); setKey('') }}>
          {kinds.map((k) => <option key={k} value={k}>{ON_LABELS[k]}</option>)}
        </select>
      )}
      <select className="small" aria-label="Which one" value={actor.id} onChange={(e) => { setActorId(Number(e.target.value)); setKey('') }}>
        {list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select className="small" aria-label="Action" value={action.key} title={action.description || undefined} onChange={(e) => setKey(e.target.value)}>
        {actor.actions.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
      </select>
      <button className="small primary" disabled={busy} onClick={() => void run()}><ActionsIcon size={15} /> Run</button>
      {(result || error) && (
        <div className="action-control-result">
          <ResultNote result={result} error={error} onClose={() => { setResult(null); setError('') }} />
        </div>
      )}
    </div>
  )
}

/** A player's Action control on the live Stage: a button that opens it (bottom left). */
export function PlayerActions({ sagaId, paused = false }: { sagaId: number; paused?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`player-actions ${open && !paused ? 'open' : ''}`} data-interactive onPointerDown={(e) => e.stopPropagation()}>
      <button className={`small ${open && !paused ? 'primary' : ''}`} aria-expanded={open && !paused} disabled={paused}
        title={paused ? 'The DM paused the game' : undefined} onClick={() => setOpen(!open)}><ActionsIcon size={15} /> Actions</button>
      {open && !paused && <ActionControl sagaId={sagaId} />}
    </div>
  )
}
