import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { CardMode, DisplayModeKey, DisplayOn, DisplayStyle, DisplayTemplate, Resource, SheetMode, SheetPreview, ViewKey } from '../../api/types'
import Segmented from '../../components/Segmented'
import CreatureCard from '../../stage/sets/creaturePanel/CreatureCard'
import { cardSize } from '../../stage/sets/creaturePanel/layout'
import type { Card } from '../../stage/sets/creaturePanel/types'
import { SheetView } from '../sheet/CharacterSheet'
import { useSaga } from '../SagaContext'
import { CARD_MODES, currentView, isCardMode, MODE_LABELS, modeAttributes, PLACES, SHEET_MODES } from './modes'

const STYLES: [DisplayStyle, string][] = [['bar', 'Bar'], ['number', 'Number'], ['discrete', 'Balls']]
const MAX_HIGHLIGHT = 4

/**
 * One template: for each display mode (cards: face, full, none; sheets: immersive, informative) and each
 * view (players, DM), where each value shows and how. A live preview shows a character of your choice,
 * exactly as that view receives it from the server.
 */
export default function TemplateEditor() {
  const { sagaId, ruleset, isAdmin } = useSaga()
  const { templateId } = useParams()
  const navigate = useNavigate()
  const [template, setTemplate] = useState<DisplayTemplate | null>(null)
  const [mode, setMode] = useState<DisplayModeKey>('face')
  const [view, setView] = useState<ViewKey>('player')
  const [characters, setCharacters] = useState<Resource[]>([])
  const [sampleId, setSampleId] = useState<number | null>(null)
  const [preview, setPreview] = useState<SheetPreview | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const id = Number(templateId)

  useEffect(() => {
    if (!isAdmin) return
    api.displayTemplates(sagaId).then((data) => {
      const found = data.templates.find((t) => t.id === id) ?? null
      setTemplate(found)
      setName(found?.name ?? '')
      if (!found) setError('Template not found')
    }).catch((e: Error) => setError(e.message))
    api.resources(sagaId, 'character').then((list) => {
      setCharacters(list)
      setSampleId((current) => current ?? list[0]?.id ?? null)
    }).catch(() => undefined)
  }, [isAdmin, sagaId, id])

  const loadPreview = useCallback(() => {
    if (sampleId === null) return
    api.templatePreview(sagaId, id, sampleId).then(setPreview).catch(() => setPreview(null))
  }, [sagaId, id, sampleId])
  useEffect(loadPreview, [loadPreview, template])

  if (!isAdmin) return <div className="page-message">Only the Saga's admins manage display templates.</div>
  if (!template) return <div className="page-message">{error || 'Loading…'}</div>

  const save = async (body: Parameters<typeof api.updateTemplate>[2]) => {
    setError('')
    try {
      setTemplate(await api.updateTemplate(sagaId, id, body))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const setValue = (key: string, changes: Partial<{ style: DisplayStyle; display_on: DisplayOn }>) =>
    save({ modes: { [mode]: { [key]: { [view]: changes } } } })

  const attributes = modeAttributes(ruleset, mode)
  const highlights = attributes.filter((a) => currentView(template.config, mode, a, view).display_on === 'highlight').length
  const sample = characters.find((c) => c.id === sampleId)

  return (
    <div className="page template-editor">
      <header className="page-header">
        <div>
          <Link to={`/s/${sagaId}/characters/templates`} className="muted small">← Display templates</Link>
          <input
            className="title-input"
            value={name}
            aria-label="Template name"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== template.name && void save({ name })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
        <div className="button-row">
          <button onClick={async () => {
            const copy = await api.createTemplate(sagaId, `${template.name} (copy)`, template.id)
            navigate(`/s/${sagaId}/characters/templates/${copy.id}`)
          }}>Duplicate</button>
        </div>
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}

      <div className="mode-tabs">
        <div className="mode-group">
          <span className="field-label">Card</span>
          <Segmented<CardMode> value={(isCardMode(mode) ? mode : '') as CardMode} options={CARD_MODES.map((m) => [m, MODE_LABELS[m]])} onChange={setMode} />
        </div>
        <div className="mode-group">
          <span className="field-label">Sheet</span>
          <Segmented<SheetMode> value={(isCardMode(mode) ? '' : mode) as SheetMode} options={SHEET_MODES.map((m) => [m, MODE_LABELS[m]])} onChange={setMode} />
        </div>
        <div className="mode-group">
          <span className="field-label">Editing</span>
          <Segmented<ViewKey> value={view} options={[['player', 'Player view'], ['dm', 'DM view']]} onChange={setView} />
        </div>
      </div>

      <div className="template-body">
        <section className="template-settings">
          {mode === 'informative' && (
            <p className="muted small">Highlight: next to the picture, bigger ({highlights}/{MAX_HIGHLIGHT}). Body: the rest of the sheet.</p>
          )}
          {isCardMode(mode) && <p className="muted small">Hover: in a tray under the card, while the pointer is on it.</p>}
          {attributes.map((attr) => {
            const current = currentView(template.config, mode, attr, view)
            const places = PLACES[mode].filter(([p]) => p !== 'highlight' || current.display_on === 'highlight' || highlights < MAX_HIGHLIGHT)
            return (
              <div key={attr.key} className={`attr-setting ${current.display_on === 'hidden' ? 'off' : ''}`}>
                <div className="attr-setting-row">
                  <strong>{attr.name}</strong>
                  <Segmented<DisplayOn> value={current.display_on} options={places} onChange={(display_on) => void setValue(attr.key, { display_on })} />
                </div>
                {attr.type === 'counter' && current.display_on !== 'hidden' && (
                  <div className="attr-setting-row">
                    <span className="field-label">Style</span>
                    <Segmented<DisplayStyle> value={current.style} options={STYLES} onChange={(style) => void setValue(attr.key, { style })} />
                  </div>
                )}
              </div>
            )
          })}
        </section>

        <section className="template-preview">
          <div className="preview-head">
            <span className="field-label">Preview · {view === 'player' ? 'what players see' : 'what you see'}</span>
            <select value={sampleId ?? ''} onChange={(e) => setSampleId(Number(e.target.value))} aria-label="Preview character">
              {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {!sample && <p className="muted">Create a character to see a preview.</p>}
          {preview && sample && (isCardMode(mode) ? (
            <CardPreview card={preview.cards[view][mode as CardMode] as Card} admin={view === 'dm'} />
          ) : (
            <div className={`sheet-preview mode-${mode}`}>
              <SheetView sheet={preview.sheet[view]} mode={mode as SheetMode} />
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

/** A card as on a Stage, with its hover tray open. */
function CardPreview({ card, admin }: { card: Card; admin: boolean }) {
  const size = cardSize(card)
  return (
    <div className="card-preview">
      <div className="card-slot preview-slot open" style={{ width: size.w, height: size.h }}>
        <CreatureCard card={card} highlighted={false} dimmed={false} selected={false} pulse={null} admin={admin} />
      </div>
    </div>
  )
}
