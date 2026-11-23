/**
 * A character's, item's or group's actions (the Saga template's rules): what each does, Run, and what changed.
 * Characters list their party's actions too (those this member may run; the DM: all). The server decides who
 * may run what and works everything out: this only shows it. See docs/implementation/30-actions-and-calculated-variables.md.
 */
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { ActionOffer, ActionResult, ResourceActions } from '../api/types'
import Modal from '../components/Modal'
import { describeAction, describeRoll, rulesetNames, WHO_LABELS } from './actions'
import { useSaga } from './SagaContext'

type Target = { resourceId: number } | { groupId: number }

/** A character's or item's actions (null while loading, or when it has none to show). */
export function useResourceActions(sagaId: number, resourceId: number | null | undefined) {
  const [data, setData] = useState<ResourceActions | null>(null)
  const load = useCallback(() => {
    if (!resourceId) return setData(null)
    api.resourceActions(sagaId, resourceId).then(setData).catch(() => setData(null))
  }, [sagaId, resourceId])
  useEffect(load, [load])
  const any = Boolean(data && (data.actions.length || data.party?.actions.length))
  return { data, any, reload: load }
}

function ActionRow({ action, target, onRan }: { action: ActionOffer; target: Target; onRan: (result: ActionResult | null, error?: string) => void }) {
  const { sagaId, ruleset } = useSaga()
  const [busy, setBusy] = useState(false)
  const { nameOf, actionName } = rulesetNames(ruleset)
  const lines = describeAction(action, nameOf, actionName)
  const run = async () => {
    setBusy(true)
    try {
      const result = 'resourceId' in target
        ? await api.runResourceAction(sagaId, target.resourceId, action.key)
        : await api.runGroupAction(sagaId, target.groupId, action.key)
      onRan(result)
    } catch (e) {
      onRan(null, (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className={`action-row ${action.can ? '' : 'off'}`}>
      <div className="action-text">
        <strong>{action.name}</strong>
        {action.description && <span className="muted small">{action.description}</span>}
        {lines.length > 0 && <span className="action-does small">{lines.join(' · ')}</span>}
      </div>
      {action.can
        ? <button className="small primary" disabled={busy} onClick={() => void run()}>{busy ? '…' : 'Run'}</button>
        : <span className="muted small" title="Who can run it">{WHO_LABELS[action.who]}</span>}
    </li>
  )
}

export function ResultNote({ result, error, onClose }: { result: ActionResult | null; error: string; onClose: () => void }) {
  if (error) return <div className="error" onClick={onClose}>{error}</div>
  if (!result) return null
  return (
    <div className="notice action-result" onClick={onClose} role="status">
      <strong>{result.action}</strong>
      {result.changes.length === 0 ? <span className="muted small"> Done (nothing you see changed).</span> : (
        <ul>
          {result.changes.map((c, i) => <li key={i}>{c.name} · {c.variable} {c.before} → <strong>{c.after}</strong></li>)}
        </ul>
      )}
      {(result.rolls?.length ?? 0) > 0 && (
        <ul className="action-rolls">
          {result.rolls!.map((r, i) => <li key={i} className="muted small">🎲 {r.thing}: {describeRoll(r)}</li>)}
        </ul>
      )}
    </div>
  )
}

/**
 * The actions of a character or item (`resourceId`, with `data` from useResourceActions) or of a group (`groupId`,
 * the DM's). `onRan` follows a run that changed something (reload what shows the values).
 */
export default function ActionsPanel({ resourceId, groupId, data, onRan }: {
  resourceId?: number; groupId?: number; data?: ResourceActions | null; onRan?: (result: ActionResult) => void
}) {
  const { sagaId } = useSaga()
  const [groupList, setGroupList] = useState<ActionOffer[] | null>(null)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (groupId === undefined) return
    api.groupActions(sagaId, groupId).then(setGroupList).catch(() => setGroupList([]))
  }, [sagaId, groupId])
  const ran = (next: ActionResult | null, message = '') => {
    setResult(next)
    setError(message)
    if (next) onRan?.(next)
  }
  const note = <ResultNote result={result} error={error} onClose={() => { setResult(null); setError('') }} />

  if (groupId !== undefined) {
    if (groupList === null) return <p className="muted small">Loading…</p>
    if (!groupList.length) return <p className="muted small">No actions on groups yet (Saga → Template → Actions).</p>
    return (
      <div className="actions-panel">
        {note}
        <ul className="action-list">{groupList.map((a) => <ActionRow key={a.key} action={a} target={{ groupId }} onRan={ran} />)}</ul>
      </div>
    )
  }
  if (!data || resourceId === undefined) return <p className="muted small">Loading…</p>
  return (
    <div className="actions-panel">
      {note}
      {data.actions.length > 0 && (
        <ul className="action-list">{data.actions.map((a) => <ActionRow key={a.key} action={a} target={{ resourceId }} onRan={ran} />)}</ul>
      )}
      {data.party && data.party.actions.length > 0 && (
        <>
          <h4 className="action-party">Its party: {data.party.name}</h4>
          <ul className="action-list">
            {data.party.actions.map((a) => <ActionRow key={a.key} action={a} target={{ groupId: data.party!.id }} onRan={ran} />)}
          </ul>
        </>
      )}
      {!data.actions.length && !data.party?.actions.length && <p className="muted small">No actions for it.</p>}
    </div>
  )
}

/** "Actions" for a character sheet's header: shown when the character has actions to show; they open in a window. */
export function ActionsButton({ resourceId, name, onRan }: { resourceId: number; name: string; onRan?: () => void }) {
  const { sagaId } = useSaga()
  const { data, any } = useResourceActions(sagaId, resourceId)
  const [open, setOpen] = useState(false)
  if (!any) return null
  return (
    <>
      <button className="small" onClick={() => setOpen(true)} title="Rests and the Saga template's other actions">⚡ Actions</button>
      <Modal open={open} title={`${name}: actions`} onClose={() => setOpen(false)}>
        {open && <ActionsPanel resourceId={resourceId} data={data} onRan={() => onRan?.()} />}
      </Modal>
    </>
  )
}
