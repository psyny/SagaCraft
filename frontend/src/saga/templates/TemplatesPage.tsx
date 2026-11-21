import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import type { DisplayTemplates } from '../../api/types'
import { useSaga } from '../SagaContext'
import TemplatePicker from './TemplatePicker'

/**
 * Character display templates: which template each category uses by default, and the catalog.
 * How characters are displayed is set here once; Sets just show characters.
 */
export default function TemplatesPage() {
  const { sagaId, categories, isAdmin } = useSaga()
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
    const created = await api.createTemplate(sagaId, 'New template') // blank: the DM sees everything, players nothing
    navigate(`/s/${sagaId}/characters/templates/${created.id}`)
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Link to={`/s/${sagaId}/characters`} className="muted small">← Characters</Link>
          <h1>Character display templates</h1>
        </div>
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}

      <section className="page-section">
        <h2>Defaults</h2>
        <p className="muted small">Characters use their category's template wherever they show, unless a Set picks another.</p>
        <div className="default-slots">
          {categories.map((c) => (
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
          {data?.templates.map((t) => (
            <div key={t.id} className="template-tile" onClick={() => navigate(`/s/${sagaId}/characters/templates/${t.id}`)}>
              <strong><span className="color-dot" style={{ background: t.config.color }} /> {t.name}</strong>
              <span className="muted small">
                {t.default_for.length ? `Default for ${t.default_for.map(categoryName).join(', ')}` : 'Not a default'}
              </span>
              <div className="button-row" onClick={(e) => e.stopPropagation()}>
                <button className="small ghost" onClick={() => navigate(`/s/${sagaId}/characters/templates/${t.id}`)}>Edit</button>
                <button className="small ghost" onClick={() => void run(() => api.createTemplate(sagaId, `${t.name} (copy)`, t.id))}>Duplicate</button>
                <button
                  className="small ghost danger"
                  disabled={t.default_for.length > 0}
                  title={t.default_for.length ? 'Pick another default first' : undefined}
                  onClick={() => window.confirm(`Delete "${t.name}"? Sets using it go back to the default.`) && void run(() => api.deleteTemplate(sagaId, t.id))}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

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
