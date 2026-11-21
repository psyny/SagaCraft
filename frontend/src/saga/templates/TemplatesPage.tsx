import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import type { DisplayTemplates } from '../../api/types'
import { useSaga } from '../SagaContext'
import { SagaSections } from '../SectionTabs'
import Segmented from '../../components/Segmented'
import TemplatePicker from './TemplatePicker'

/**
 * Display templates, for characters (cards and sheets) and items (their sheet): which template each character
 * category and each item category uses by default, and the catalog. How resources are displayed is set here
 * once; Sets and pages just show them.
 */
export default function TemplatesPage() {
  const { sagaId, categories, isAdmin, ruleset } = useSaga()
  const [params, setParams] = useSearchParams()
  const kind: 'character' | 'item' = params.get('kind') === 'item' ? 'item' : 'character'
  const itemTypes = ruleset.kinds.item?.types || {}
  const [pickingType, setPickingType] = useState<string | null>(null)
  const navigate = useNavigate()
  const [data, setData] = useState<DisplayTemplates | null>(null)
  const [picking, setPicking] = useState<number | null>(null)
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
  const defaults = data?.category_defaults || {}
  const own = data?.defaults.categories || {}
  const nameOf = (id: number | null | undefined) => data?.templates.find((t) => t.id === id)?.name ?? '—'
  const categoryName = (id: number) => categories.find((c) => c.id === id)?.plural ?? '?'
  const picked = categories.find((c) => c.id === picking)

  const create = async () => {
    const created = await api.createTemplate(sagaId, 'New template', null, kind) // blank: the DM sees everything, players nothing
    navigate(`/s/${sagaId}/saga/displays/${created.id}`)
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Saga</h1>
      </header>
      <SagaSections />
      <div className="list-toolbar">
        <span className="field-label">Templates for</span>
        <Segmented value={kind} options={[['character', 'Characters'], ['item', 'Items']]} onChange={(k) => setParams(k === 'item' ? { kind: 'item' } : {})} />
      </div>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}

      <section className="page-section">
        <h2>Defaults</h2>
        <p className="muted small">{kind === 'item'
          ? "Items use their category's template on their page and wherever they're opened."
          : "Characters use their category's template wherever they show, unless a Set picks another."}</p>
        {kind === 'item' && (
          <div className="default-slots">
            {Object.entries(itemTypes).map(([key, t]) => (
              <button key={key} className="default-slot" onClick={() => setPickingType(key)}>
                <span className="muted small">{t.plural || t.name}</span>
                <strong>{nameOf(data?.defaults.item?.[key])}</strong>
                <span className="slot-change small">Change</span>
              </button>
            ))}
          </div>
        )}
        <div className="default-slots">
          {kind === 'character' && categories.map((c) => (
            <button key={c.id} className="default-slot" onClick={() => setPicking(c.id)}>
              <span className="muted small">{c.plural}</span>
              <strong>{nameOf(defaults[String(c.id)])}</strong>
              <span className="slot-change small">{own[String(c.id)] === undefined ? 'From its type · change' : 'Change'}</span>
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
            const forTypes = Object.entries(data.defaults.item || {}).filter(([, id]) => id === t.id).map(([k]) => itemTypes[k]?.plural ?? k)
            const usage = t.kind === 'item' ? forTypes : t.default_for.map(categoryName)
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
        kind="item"
        title={pickingType ? `Default template for ${itemTypes[pickingType]?.plural ?? pickingType}` : ''}
        value={pickingType ? data?.defaults.item?.[pickingType] ?? null : null}
        onPick={(id) => pickingType !== null && id !== null && void run(() => api.setTypeTemplate(sagaId, 'item', pickingType, id))}
        onClose={() => setPickingType(null)}
      />
      <TemplatePicker
        open={picking !== null}
        title={picked ? `Default template for ${picked.plural}` : ''}
        value={picking !== null ? own[String(picking)] ?? null : null}
        defaultLabel={picked ? `Its type's (${nameOf(data?.defaults.character?.[picked.type])})` : undefined}
        onPick={(id) => picking !== null && void run(() => api.setCategoryTemplate(sagaId, picking, id))}
        onClose={() => setPicking(null)}
      />
    </div>
  )
}
