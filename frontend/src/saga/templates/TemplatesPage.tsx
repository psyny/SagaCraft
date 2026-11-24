import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import type { DisplayTemplates } from '../../api/types'
import { useSaga } from '../SagaContext'
import TemplatePicker from './TemplatePicker'

/**
 * Display templates, for characters (cards and sheets) and items (their sheet): which template each character
 * type and each item type uses by default, and the catalog. How resources are displayed is set here
 * once; Sets and pages just show them. A sub-tab of Saga → Template → Characters and → Items (plan 38: `?sub=displays`,
 * `?tab=item&sub=displays`; it was a tab of its own since plan 34), for that kind.
 */
export default function TemplatesPage({ kind }: { kind: 'character' | 'item' }) {
  const { sagaId, isAdmin, ruleset } = useSaga()
  // Each type of the kind has its default (plan 40: a character type's is what its category had)
  const kindTypes = ruleset.kinds[kind]?.types || {}
  const [pickingType, setPickingType] = useState<string | null>(null)
  const navigate = useNavigate()
  const [data, setData] = useState<DisplayTemplates | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => api.displayTemplates(sagaId).then(setData).catch((e: Error) => setError(e.message)), [sagaId])
  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  if (!isAdmin) return <div className="page-message">Only the Saga's admins manage display templates.</div>

  const run = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const nameOf = (id: number | null | undefined) => data?.templates.find((t) => t.id === id)?.name ?? '—'
  const typeName = (key: string) => kindTypes[key]?.plural || kindTypes[key]?.name || key

  const create = async () => {
    const created = await api.createTemplate(sagaId, 'New template', null, kind) // blank: the DM sees everything, players nothing
    navigate(`/s/${sagaId}/saga/displays/${created.id}`)
  }

  return (
    <div className="display-templates">
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}

      <section className="page-section">
        <h2>Defaults</h2>
        <p className="muted small">{kind === 'item'
          ? "Items use their type's template on their page and wherever they're opened."
          : "Characters use their type's template wherever they show, unless a Set picks another."}</p>
        <div className="default-slots">
          {Object.entries(kindTypes).map(([key, t]) => (
            <button key={key} className="default-slot" onClick={() => setPickingType(key)}>
              <span className="muted small">{t.plural || t.name}</span>
              <strong>{nameOf(data?.defaults[kind]?.[key])}</strong>
              <span className="slot-change small">Change</span>
            </button>
          ))}
        </div>
      </section>

      <section className="page-section">
        <div className="section-head">
          <h2>Catalog</h2>
          <button className="primary small" onClick={() => void create()}>＋ New template</button>
        </div>
        <div className="template-grid">
          {data?.templates.filter((t) => t.kind === kind).map((t) => {
            const usage = t.default_for.map(typeName)
            return (
            <div key={t.id} className="template-tile" onClick={() => navigate(`/s/${sagaId}/saga/displays/${t.id}`)}>
              <strong><span className="color-dot" style={{ background: t.config.color }} /> {t.name}</strong>
              <span className="muted small">
                {usage.length ? `Default for ${usage.join(', ')}` : 'Not a default'}
              </span>
              <div className="button-row" onClick={(e) => e.stopPropagation()}>
                <button className="small ghost" onClick={() => navigate(`/s/${sagaId}/saga/displays/${t.id}`)}>Edit</button>
                <button className="small ghost" onClick={() => void run(() => api.createTemplate(sagaId, `${t.name} (copy)`, t.id))}>Duplicate</button>
                <button
                  className="small ghost danger"
                  disabled={usage.length > 0}
                  title={usage.length ? 'Pick another default first' : undefined}
                  onClick={() => window.confirm(`Delete "${t.name}"? Sets using it go back to the default.`) && void run(() => api.deleteTemplate(sagaId, t.id))}
                >
                  Delete
                </button>
              </div>
            </div>
            )
          })}
        </div>
      </section>

      <TemplatePicker
        open={pickingType !== null}
        kind={kind}
        title={pickingType ? `Default template for ${typeName(pickingType)}` : ''}
        value={pickingType ? data?.defaults[kind]?.[pickingType] ?? null : null}
        onPick={(id) => pickingType !== null && id !== null && void run(() => api.setTypeTemplate(sagaId, kind, pickingType, id))}
        onClose={() => setPickingType(null)}
      />
    </div>
  )
}
