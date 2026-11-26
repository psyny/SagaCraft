import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type {
  AttributeDef, CardMode, DisplayModeKey, DisplayStyle, DisplayTemplate, Region, Resource, SheetMode, SheetPreview, TokenStyle,
  TemplateElement, ViewKey,
} from '../../api/types'
import ColorPicker from '../../components/ColorPicker'
import Segmented from '../../components/Segmented'
import CreatureCard from '../../stage/sets/actorsScene/CreatureCard'
import { cardSize } from '../../stage/sets/actorsScene/layout'
import type { Card } from '../../stage/sets/actorsScene/types'
import { SheetView } from '../sheet/CharacterSheet'
import { useSaga } from '../SagaContext'
import SvgPicture from '../../components/SvgPicture'
import { TOKEN_STYLES, TokenRing } from '../../components/Token'
import { TokenLinks, TokenValues } from '../../maps/MapTokens'
import {
  BAR_SHAPES, CARD_MODES, COLORS, ICON_COUNT, ICON_GAP, ICONS, isCardMode, LOGIC_HINTS, LOGICS, MODE_LABELS, modeAttributes,
  newElement, NUMBER_COLORS, REGION_HINTS, REGION_LABELS, REGION_LIMITS, REGIONS, SHEET_MODES, STYLE_LABELS, stylesFor,
  systemElements, VALUE_SHOWN, viewRegions,
} from './modes'

type Lists = Record<Region, TemplateElement[]>

/** A slider that saves once it stops moving (not on every step). */
export function SliderSetting({ label, value, min, max, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; unit?: string; onChange: (value: number) => void
}) {
  const [shown, setShown] = useState(value)
  useEffect(() => setShown(value), [value])
  useEffect(() => {
    if (shown === value) return
    const timer = window.setTimeout(() => onChange(shown), 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])
  return (
    <div className="attr-setting-row">
      <span className="field-label">{label}</span>
      <span className="inline-slider">
        <input type="range" min={min} max={max} value={shown} aria-label={label} onChange={(e) => setShown(Number(e.target.value))} />
        <span className="slider-value">{shown}{unit}</span>
      </span>
    </div>
  )
}

/** One element of a region: its name, move up/down, its styles (opened with ⚙), remove. */
function ElementRow({ element, attr, label, regions, region, index, count, onChange, onMove, onRegion, onRemove }: {
  element: TemplateElement
  attr?: AttributeDef
  label: string
  regions: Region[]
  region: Region
  index: number
  count: number
  onChange: (changes: Partial<TemplateElement>) => void
  onMove: (by: number) => void
  onRegion: (to: Region) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const styles = stylesFor(attr)
  const isCounter = attr?.type === 'counter'
  return (
    <div className={`element-row ${open ? 'open' : ''}`}>
      <div className="element-head">
        <button type="button" className="element-name" onClick={() => setOpen(!open)} aria-expanded={open}>
          <strong>{label}</strong>
          <span className="muted small">{STYLE_LABELS[element.style]}{element.show_label ? '' : ' · no name'}</span>
        </button>
        <button type="button" className="small ghost" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(-1)}>▲</button>
        <button type="button" className="small ghost" aria-label={`Move ${label} down`} disabled={index === count - 1} onClick={() => onMove(1)}>▼</button>
        <button type="button" className="small ghost" aria-label={`${label} settings`} onClick={() => setOpen(!open)}>⚙</button>
        <button type="button" className="small ghost danger" aria-label={`Remove ${label}`} onClick={onRemove}>✕</button>
      </div>
      {open && (
        <div className="element-options">
          {styles.length > 1 && (
            <div className="attr-setting-row">
              <span className="field-label">Value style</span>
              <Segmented<DisplayStyle> value={element.style} options={styles.map((s) => [s, STYLE_LABELS[s]])} onChange={(style) => onChange({ style })} />
            </div>
          )}
          <div className="field-label">View style</div>
          {isCounter && element.style === 'bar' && (
            <>
              <div className="attr-setting-row">
                <span className="field-label">Bar</span>
                <Segmented value={element.bar} options={BAR_SHAPES} onChange={(bar) => onChange({ bar })} />
              </div>
              <label className="check"><input type="checkbox" checked={element.gradient} onChange={(e) => onChange({ gradient: e.target.checked })} /> Gradient</label>
            </>
          )}
          {isCounter && (element.style === 'bar' || element.style === 'number') && (
            <div className="attr-setting-row">
              <span className="field-label">Value</span>
              <Segmented value={element.value_shown} options={VALUE_SHOWN} onChange={(value_shown) => onChange({ value_shown })} />
            </div>
          )}
          {isCounter && element.style === 'discrete' && (
            <>
              <div className="attr-setting-row">
                <span className="field-label">Icons</span>
                <select value={element.icon} aria-label={`${label} icons`} onChange={(e) => onChange({ icon: e.target.value as TemplateElement['icon'] })}>
                  {ICONS.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
                </select>
              </div>
              <SliderSetting label="Number of icons" value={element.icons} min={ICON_COUNT.min} max={ICON_COUNT.max} onChange={(icons) => onChange({ icons })} />
              <SliderSetting label="Icon spacing" value={element.icon_gap} min={ICON_GAP.min} max={ICON_GAP.max} unit=" px" onChange={(icon_gap) => onChange({ icon_gap })} />
              <div className="attr-setting-row">
                <span className="field-label">Logic</span>
                <select value={element.logic} aria-label={`${label} icon logic`} onChange={(e) => onChange({ logic: e.target.value as TemplateElement['logic'] })}>
                  {LOGICS.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
                </select>
              </div>
              <p className="muted small element-hint">{LOGIC_HINTS[element.logic]}</p>
              <label className="check"><input type="checkbox" checked={element.hide_full} onChange={(e) => onChange({ hide_full: e.target.checked })} /> Hide when full</label>
            </>
          )}
          <div className="attr-setting-row">
            <span className="field-label">Color</span>
            <Segmented value={element.color} options={COLORS} onChange={(color) => onChange({ color })} />
          </div>
          {(element.style === 'bar' || element.style === 'number') && (
            <div className="attr-setting-row">
              <span className="field-label">Number color</span>
              <Segmented value={element.number_color} options={NUMBER_COLORS} onChange={(number_color) => onChange({ number_color })} />
            </div>
          )}
          <label className="check"><input type="checkbox" checked={element.show_label} onChange={(e) => onChange({ show_label: e.target.checked })} /> Show the name ({label})</label>
          <div className="attr-setting-row">
            <span className="field-label">Region</span>
            <select value={region} aria-label={`${label} region`} onChange={(e) => onRegion(e.target.value as Region)}>
              {regions.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

/** A region's list, and "+ Add" with what isn't in this view yet. */
export function RegionList({ region, lists, regions, labelOf, attrOf, available, save }: {
  region: Region
  lists: Lists
  regions: Region[]
  labelOf: (key: string) => string
  attrOf: (key: string) => AttributeDef | undefined
  available: string[]
  save: (changed: Partial<Lists>) => void
}) {
  const list = lists[region]
  const limit = REGION_LIMITS[region]
  const full = limit !== undefined && list.length >= limit
  const put = (next: TemplateElement[]) => save({ [region]: next })
  return (
    <section className="region-box" aria-label={REGION_LABELS[region]}>
      <header className="region-head">
        <strong>{REGION_LABELS[region]}</strong>
        <span className="muted small">{limit !== undefined ? `${list.length}/${limit}` : list.length || ''}</span>
      </header>
      {REGION_HINTS[region] && <p className="muted small region-hint">{REGION_HINTS[region]}</p>}
      {list.map((element, i) => (
        <ElementRow
          key={element.key}
          element={element}
          attr={attrOf(element.key)}
          label={labelOf(element.key)}
          regions={regions}
          region={region}
          index={i}
          count={list.length}
          onChange={(changes) => put(list.map((e, j) => (j === i ? { ...e, ...changes } : e)))}
          onMove={(by) => {
            const next = [...list]
            const [item] = next.splice(i, 1)
            next.splice(i + by, 0, item)
            put(next)
          }}
          onRegion={(to) => {
            const room = REGION_LIMITS[to]
            if (to === region || (room !== undefined && lists[to].length >= room)) return
            save({ [region]: list.filter((_, j) => j !== i), [to]: [...lists[to], element] })
          }}
          onRemove={() => put(list.filter((_, j) => j !== i))}
        />
      ))}
      {!full && available.length > 0 && (
        <select
          className="add-element"
          value=""
          aria-label={`Add to ${REGION_LABELS[region]}`}
          onChange={(e) => e.target.value && put([...list, newElement(e.target.value, attrOf(e.target.value))])}
        >
          <option value="">＋ Add…</option>
          {available.map((key) => <option key={key} value={key}>{labelOf(key)}</option>)}
        </select>
      )}
    </section>
  )
}

/**
 * One template: its color and, for each display mode (cards: face, full, none; sheets: immersive, informative)
 * and each view (players, DM), the mode's regions as lists the DM fills, orders and styles. What isn't added
 * doesn't show. A live preview shows a character of your choice, exactly as that view receives it from the server.
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
  }, [isAdmin, sagaId, id])
  // Preview samples: resources of the template's kind (characters or items)
  const kind = template?.kind ?? 'character'
  useEffect(() => {
    if (!isAdmin || !template) return
    api.resources(sagaId, kind).then((list) => {
      setCharacters(list)
      setSampleId((current) => (current !== null && list.some((r) => r.id === current) ? current : list[0]?.id ?? null))
    }).catch(() => undefined)
    if (kind === 'item') setMode('informative') // items have one display: their sheet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, sagaId, kind, Boolean(template)])

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

  const attributes = modeAttributes(ruleset, mode, kind)
  const isItem = kind === 'item'
  const attrOf = (key: string) => attributes.find((a) => a.key === key)
  const system = systemElements(ruleset, kind)
  const labelOf = (key: string) => system.find(([k]) => k === key)?.[1] ?? attrOf(key)?.name ?? key
  const lists = viewRegions(template.config, mode, view)
  const used = new Set(Object.values(lists).flat().map((e) => e.key))
  const available = [...system.map(([k]) => k), ...attributes.map((a) => a.key)].filter((k) => !used.has(k))
  const sample = characters.find((c) => c.id === sampleId)
  const saveLists = (changed: Partial<Lists>) => void save({ modes: { [mode]: { [view]: changed } } })
  // Copy the other view's lists, for the mode being edited only (every region: what it doesn't have is emptied)
  const other: ViewKey = view === 'player' ? 'dm' : 'player'
  const otherName = other === 'dm' ? 'DM view' : 'player view'
  const copyOther = () => {
    if (!window.confirm(`Replace this ${view === 'dm' ? 'DM' : 'player'} view's ${MODE_LABELS[mode]} lists with the ${otherName}'s?`)) return
    saveLists(viewRegions(template.config, mode, other))
  }

  return (
    <div className="page template-editor">
      <header className="page-header">
        <div>
          <Link to={`/s/${sagaId}/saga/template?${isItem ? 'tab=item&' : ''}sub=displays`} className="muted small">← Display templates</Link>
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
          <ColorPicker label="Template color" value={template.config.color} onChange={(color) => void save({ color })} />
          <button onClick={async () => {
            const copy = await api.createTemplate(sagaId, `${template.name} (copy)`, template.id)
            navigate(`/s/${sagaId}/saga/displays/${copy.id}`)
          }}>Duplicate</button>
        </div>
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}

      <div className="mode-tabs">
        {!isItem && <div className="mode-group">
          <span className="field-label">Card</span>
          <Segmented<CardMode> value={(isCardMode(mode) ? mode : '') as CardMode} options={CARD_MODES.map((m) => [m, MODE_LABELS[m]])} onChange={setMode} />
        </div>}
        {!isItem && <div className="mode-group">
          <span className="field-label">Sheet</span>
          <Segmented<SheetMode> value={((SHEET_MODES as readonly string[]).includes(mode) ? mode : '') as SheetMode} options={SHEET_MODES.map((m) => [m, MODE_LABELS[m]])} onChange={setMode} />
        </div>}
        {!isItem && <div className="mode-group">
          <span className="field-label">Map</span>
          <Segmented<'token'> value={(mode === 'token' ? 'token' : '') as 'token'} options={[['token', 'Token']]} onChange={setMode} />
        </div>}
        {mode === 'token' && <div className="mode-group">
          <span className="field-label">Token border</span>
          <Segmented<TokenStyle> value={template.config.token_style ?? 'gradient'} options={TOKEN_STYLES} onChange={(token_style) => void save({ token_style })} />
        </div>}
        {isItem && <div className="mode-group"><span className="field-label">Item sheet</span><span className="muted small">The item's page and view</span></div>}
        <div className="mode-group">
          <span className="field-label">Editing</span>
          <Segmented<ViewKey> value={view} options={[['player', 'Player view'], ['dm', 'DM view']]} onChange={setView} />
        </div>
      </div>

      <div className="template-body">
        <section className="template-settings">
          <div className="template-copy">
            <p className="muted small">Add what this view shows, region by region; what isn't added isn't shown. ⚙ sets an element's styles.</p>
            <button className="small" onClick={copyOther} title={`This mode's lists (${MODE_LABELS[mode]}) from the ${otherName}`}>⎘ Copy {otherName}</button>
          </div>
          {REGIONS[mode].map((region) => (
            <RegionList key={`${mode}-${view}-${region}`} region={region} lists={lists} regions={REGIONS[mode]}
              labelOf={labelOf} attrOf={attrOf} available={available} save={saveLists} />
          ))}
        </section>

        <section className="template-preview">
          <div className="preview-head">
            <span className="field-label">Preview · {view === 'player' ? 'what players see' : 'what you see'}</span>
            <select value={sampleId ?? ''} onChange={(e) => setSampleId(Number(e.target.value))} aria-label={isItem ? 'Preview item' : 'Preview character'}>
              {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {!sample && <p className="muted">Create {isItem ? 'an item' : 'a character'} to see a preview.</p>}
          {preview && sample && mode === 'token' ? (
            preview.token ? <TokenPreview token={preview.token[view]} /> : null
          ) : preview && sample && (isCardMode(mode) ? (
            <CardPreview card={preview.cards[view][mode as CardMode] as Card} admin={view === 'dm'} />
          ) : (
            <div className={`sheet-preview mode-${mode}`}>
              <SheetView sheet={preview.sheet[view]} mode={mode as SheetMode} open />
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

/** A token as on a map, big, with its hover trays open. */
function TokenPreview({ token }: { token: NonNullable<SheetPreview['token']>['player'] }) {
  const r = 56
  const shape = { cx: 160, cy: 130, half: r, ring: 0, box: [160 - r, 130 - r, r * 2, r * 2] as [number, number, number, number] }
  return (
    <svg className="token-preview" viewBox="0 0 320 260" width="100%" style={{ maxWidth: 480 }}>
      <TokenLinks shape={shape} values={token.values} tile={64} />
      <circle cx={shape.cx} cy={shape.cy} r={r} fill="#1b1722" />
      {token.icon?.url
        ? <SvgPicture url={token.icon.url} face={token.icon.face} cx={shape.cx} cy={shape.cy} r={r} clipId="token-preview-pic" />
        : <text x={shape.cx} y={shape.cy} dy="0.35em" textAnchor="middle" fontSize={r} fill="#ece6da" fontFamily="serif">{(token.name || '?').slice(0, 1)}</text>}
      <TokenRing cx={shape.cx} cy={shape.cy} r={r} style={token.style} color={token.color} id="token-preview-ring" />
      <TokenValues shape={shape} values={token.values} hovered tile={64} />
    </svg>
  )
}

/** A card as on a Stage, with its hover trays open. */
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
