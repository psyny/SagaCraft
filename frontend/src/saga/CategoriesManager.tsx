/**
 * The Saga's character categories (DM): each is based on a ruleset type. Rename, flags, add, delete (only
 * when no character uses it).
 */
import { useState } from 'react'
import { api } from '../api'
import type { Category } from '../api/types'
import { useSaga } from './SagaContext'

function CategoryRow({ category, onError }: { category: Category; onError: (message: string) => void }) {
  const { sagaId, ruleset, refreshSaga } = useSaga()
  const [name, setName] = useState(category.name)
  const [plural, setPlural] = useState(category.plural)
  const types = ruleset.kinds.character?.types || {}
  const save = async (changes: Partial<Category>) => {
    try {
      await api.updateCategory(sagaId, category.id, changes)
      await refreshSaga()
    } catch (e) {
      onError((e as Error).message)
    }
  }
  return (
    <div className="category-row">
      <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== category.name && void save({ name })} />
      <input aria-label="Plural" placeholder="Plural (section title)" value={plural} onChange={(e) => setPlural(e.target.value)} onBlur={() => plural !== category.plural && void save({ plural })} />
      <span className="muted small" title="The ruleset type it's based on">{types[category.type]?.name ?? category.type}</span>
      <label className="check small">
        <input type="checkbox" checked={category.player} onChange={(e) => void save({ player: e.target.checked })} /> Player characters
      </label>
      <label className="check small" title="Default for new characters of this category">
        <input type="checkbox" disabled={category.player} checked={category.instanceable} onChange={(e) => void save({ instanceable: e.target.checked })} /> Instanceable
      </label>
      <button
        className="small ghost danger"
        disabled={Boolean(category.count)}
        title={category.count ? `${category.count} characters use it: move them first` : undefined}
        onClick={async () => {
          try {
            await api.deleteCategory(sagaId, category.id)
            await refreshSaga()
          } catch (e) {
            onError((e as Error).message)
          }
        }}
      >
        Delete
      </button>
    </div>
  )
}

export default function CategoriesManager() {
  const { sagaId, ruleset, categories, refreshSaga } = useSaga()
  const types = Object.entries(ruleset.kinds.character?.types || {})
  const [name, setName] = useState('')
  const [type, setType] = useState(types[types.length - 1]?.[0] ?? '')
  const [error, setError] = useState('')

  const create = async () => {
    if (!name.trim()) return
    try {
      await api.createCategory(sagaId, { name, type })
      setName('')
      await refreshSaga()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="form">
      <p className="muted small">Categories organize characters: the Characters tab has one section per category, and each has its default display template. A category is based on a ruleset type, which gives its attributes.</p>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <div className="category-list">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} onError={setError} />
        ))}
      </div>
      <div className="field">
        <span className="field-label">New category</span>
        <div className="button-row">
          <input placeholder="Name (e.g. Boss)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} />
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Based on">
            {types.map(([key, t]) => <option key={key} value={key}>Based on {t.name}</option>)}
          </select>
          <button className="primary" disabled={!name.trim()} onClick={() => void create()}>Add</button>
        </div>
      </div>
    </div>
  )
}
