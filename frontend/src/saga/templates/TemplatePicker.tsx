import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { DisplayTemplate, DisplayTemplates } from '../../api/types'
import Modal from '../../components/Modal'
import { useSaga } from '../SagaContext'

interface Props {
  open: boolean
  title: string
  /** The template now in use (null: the type's default, when `defaultLabel` is given). */
  value: number | null
  /** Offer "Default" as the first choice (Sets), labelled e.g. "Default (NPC)". */
  defaultLabel?: string
  onPick: (templateId: number | null) => void
  onClose: () => void
}

/** Pick a display template: the Defaults page's slots and the creature panel's templates use it. */
export default function TemplatePicker({ open, title, value, defaultLabel, onPick, onClose }: Props) {
  const { sagaId, ruleset } = useSaga()
  const [data, setData] = useState<DisplayTemplates | null>(null)
  const types = ruleset.kinds.character?.types || {}

  useEffect(() => {
    if (open) api.displayTemplates(sagaId).then(setData).catch(() => setData(null))
  }, [open, sagaId])

  const pick = (id: number | null) => {
    onPick(id)
    onClose()
  }
  const usage = (t: DisplayTemplate) =>
    t.default_for.length ? `Default for ${t.default_for.map((k) => types[k]?.plural || types[k]?.name || k).join(', ')}` : ''

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="template-pick-list">
        {defaultLabel && (
          <button className={`template-pick ${value === null ? 'on' : ''}`} onClick={() => pick(null)}>
            <strong>{defaultLabel}</strong>
            <span className="muted small">Follows the Saga's default</span>
          </button>
        )}
        {data?.templates.map((t) => (
          <button key={t.id} className={`template-pick ${value === t.id ? 'on' : ''}`} onClick={() => pick(t.id)}>
            <strong>{t.name}</strong>
            <span className="muted small">{usage(t)}</span>
          </button>
        ))}
        {!data && <p className="muted">Loading…</p>}
      </div>
      <div className="button-row end">
        <Link to={`/s/${sagaId}/characters/templates`} onClick={onClose} className="small">Manage templates…</Link>
      </div>
    </Modal>
  )
}
