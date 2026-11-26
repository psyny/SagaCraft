import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { DisplayValue, Region, Sheet, SheetMode } from '../../api/types'
import Modal from '../../components/Modal'
import Picture from '../../components/Picture'
import Popover, { anchorOf, type Anchor } from '../../components/Popover'
import Segmented from '../../components/Segmented'
import { BoxBorder } from '../../components/borders/Border'
import ValueEditor from '../../stage/sets/actorsScene/ValueEditor'
import SheetValue, { type ValueClick } from './SheetValue'
import { RelationshipsButton } from '../lore/RelationshipsPanel'
import { ActionsButton } from '../ActionsPanel'
import { useOptionalSaga } from '../SagaContext'
import { frameStyle } from '../../components/frame'

const MODE_KEY = 'sagacraft.sheetMode'

/** The sheet mode chosen on this device (each person picks how they like to read sheets). */
export function useSheetMode(): [SheetMode, (mode: SheetMode) => void] {
  const [mode, setMode] = useState<SheetMode>(() => (localStorage.getItem(MODE_KEY) === 'informative' ? 'informative' : 'immersive'))
  return [mode, (next) => {
    localStorage.setItem(MODE_KEY, next)
    setMode(next)
  }]
}

/** Informative pages: how tall the body is before it moves to another page. */
export const PAGE_H = 300

const byRegion = (items: DisplayValue[], region: Region) => items.filter((i) => i.region === region)

/** One element where a single element fits (a top slot): the name is the title. */
function Slot({ item, name, onValueClick }: { item?: DisplayValue; name: string; onValueClick?: ValueClick }) {
  if (!item) return null
  if (item.key === '@name') return <h2>{name}</h2>
  return <SheetValue value={item} onClick={onValueClick} />
}

/**
 * The informative body, in pages: elements are measured (an invisible copy, as wide as the page) and split where
 * a page would grow taller than PAGE_H. Page controls show at the bottom when there is more than one.
 */
export function PagedBody({ items, onValueClick }: { items: DisplayValue[]; onValueClick?: ValueClick }) {
  const measure = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<number[][]>([items.map((_, i) => i)])
  const [page, setPage] = useState(0)

  useLayoutEffect(() => {
    const element = measure.current
    if (!element) return
    const compute = () => {
      const result: number[][] = []
      let current: number[] = []
      let start = 0
      ;([...element.children] as HTMLElement[]).forEach((child, i) => {
        const bottom = child.offsetTop + child.offsetHeight
        if (current.length && bottom - start > PAGE_H) {
          result.push(current)
          current = []
        }
        if (!current.length) start = child.offsetTop
        current.push(i)
      })
      if (current.length) result.push(current)
      setPages((old) => (JSON.stringify(old) === JSON.stringify(result) ? old : result.length ? result : [[]]))
    }
    compute()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(compute) : null
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [items])

  if (!items.length) return null
  const shown = Math.min(page, pages.length - 1)
  const paged = pages.length > 1
  return (
    <div className="sheet-pages">
      <div className="sheet-rest measure" ref={measure} aria-hidden>
        {items.map((v) => <SheetValue key={v.key} value={v} />)}
      </div>
      <div className="sheet-rest" style={paged ? { height: PAGE_H } : undefined}>
        {(pages[shown] ?? []).map((i) => items[i] && <SheetValue key={items[i].key} value={items[i]} onClick={onValueClick} />)}
      </div>
      {paged && (
        <div className="page-controls">
          <button className="small ghost" aria-label="Previous page" disabled={shown === 0} onClick={() => setPage(shown - 1)}>‹ Prev</button>
          <span className="page-dots" aria-label={`Page ${shown + 1} of ${pages.length}`}>
            {pages.map((_, i) => <button key={i} className={`page-dot ${i === shown ? 'on' : ''}`} aria-label={`Page ${i + 1}`} onClick={() => setPage(i)} />)}
            <span className="page-count">{shown + 1} / {pages.length}</span>
          </span>
          <button className="small ghost" aria-label="Next page" disabled={shown === pages.length - 1} onClick={() => setPage(shown + 1)}>Next ›</button>
        </div>
      )}
    </div>
  )
}

/**
 * A sheet, drawn from what the server sent for this viewer, region by region:
 * - immersive (the card's ratio): the picture as the whole background; top left, centre (the name) and right; the
 *   bottom centre above a two-column bottom panel; hover sides that slide in while the pointer is on it (a tap on
 *   touch screens),
 * - informative: the face top left with the name and the header next to it; the body below, in pages.
 * `open`: hover regions always shown (the template editor's preview).
 */
export function SheetView({ sheet, mode, open = false, onValueClick }: {
  sheet: Sheet; mode: SheetMode; open?: boolean
  /** Numbers and counters can be clicked (a sheet drawn as a Stage card: the DM changes them). */
  onValueClick?: ValueClick
}) {
  const name = sheet.name ?? '???'
  const [tapped, setTapped] = useState(false)
  if (mode === 'immersive') {
    const items = sheet.immersive
    const [left, center, right] = (['top_left', 'top_center', 'top_right'] as const).map((r) => byRegion(items, r)[0])
    const panel = byRegion(items, 'bottom_panel')
    const below = byRegion(items, 'bottom_center')
    return (
      <div className={`sheet sheet-immersive ${sheet.frame && !sheet.borders?.immersive ? 'framed' : ''} ${sheet.borders?.immersive ? 'bordered' : ''} ${open || tapped ? 'open' : ''}`} style={frameStyle(sheet.frame)} onClick={() => setTapped(!tapped)}>
        {sheet.borders?.immersive && <BoxBorder border={sheet.borders.immersive} base={5} />}
        <div className="sheet-bg">
          {sheet.picture ? <Picture url={sheet.picture.url} mode="full" className="sheet-bg-pic" /> : <div className="picture picture-empty sheet-initial">{name.slice(0, 1)}</div>}
        </div>
        {(left || center || right) && (
          <div className="sheet-title band">
            <div className="slot slot-left"><Slot item={left} name={name} onValueClick={onValueClick} /></div>
            <div className="slot slot-center"><Slot item={center} name={name} onValueClick={onValueClick} /></div>
            <div className="slot slot-right"><Slot item={right} name={name} onValueClick={onValueClick} /></div>
          </div>
        )}
        {(['left', 'right'] as const).map((side) => {
          const list = byRegion(items, `hover_${side}`)
          return list.length > 0 && (
            <div key={side} className={`sheet-hover hover-${side}`}>
              {list.map((v) => <SheetValue key={v.key} value={v} onClick={onValueClick} />)}
            </div>
          )
        })}
        {(below.length > 0 || panel.length > 0) && (
          <div className="sheet-lower">
            {below.length > 0 && <div className="sheet-bottom-center">{below.map((v) => <SheetValue key={v.key} value={v} onClick={onValueClick} />)}</div>}
            {panel.length > 0 && (
              <div className="sheet-values">
                {panel.map((v) => <SheetValue key={v.key} value={v} onClick={onValueClick} />)}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  const header = byRegion(sheet.informative, 'header')
  return (
    <div className={`sheet sheet-informative ${sheet.frame && !sheet.borders?.informative ? 'framed' : ''} ${sheet.borders?.informative ? 'bordered' : ''}`} style={frameStyle(sheet.frame)}>
      {sheet.borders?.informative && <BoxBorder border={sheet.borders.informative} base={5} />}
      <div className="sheet-top">
        <Picture url={sheet.picture?.url} mode="face" face={sheet.picture?.face} className="sheet-face" />
        <div className="sheet-side">
          <div>
            <h2 className="sheet-name">{name}</h2>
            <span className="muted small">{sheet.category_name ?? sheet.type_name}</span>
          </div>
          <div className="sheet-highlights">
            {header.map((v) => <SheetValue key={v.key} value={v} big onClick={onValueClick} />)}
          </div>
        </div>
      </div>
      <PagedBody items={byRegion(sheet.informative, 'body')} onValueClick={onValueClick} />
    </div>
  )
}

interface ModalProps {
  sagaId: number
  /** The character to show; null closes the sheet. */
  resourceId: number | null
  /** Opened from a Set: its template choice applies. */
  setId?: number | null
  /** A Stage card: an instance's sheet shows its own values. */
  actorId?: number | null
  /** Changes when the character may have changed (e.g. the Stage updated): the sheet reloads. */
  refreshKey?: string | number
  onClose: () => void
  /** "Edit" in the header, for those who may edit the character. */
  onEdit?: (resourceId: number) => void
  /** Open in this mode (the character view opens informative); the person can still switch. */
  initialMode?: SheetMode
  /** Opened from the Stage (plan 58): the numbers and counters this viewer may change are clicked to change them,
   * as on cards (false: not now, e.g. the game is paused). */
  editable?: boolean
}

/** A sheet value's number as the quick editor changes it (a counter's current value). */
const numberOf = (v: DisplayValue) => (v.type === 'counter' ? v.current : typeof v.value === 'number' ? v.value : undefined)

/** The character sheet in a modal, with the immersive / informative switch. */
export default function CharacterSheetModal({ sagaId, resourceId, setId, actorId, refreshKey, onClose, onEdit, initialMode, editable = false }: ModalProps) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [error, setError] = useState('')
  const [savedMode, saveMode] = useSheetMode()
  const [picked, setPicked] = useState<SheetMode | null>(null)
  const mode = picked ?? initialMode ?? savedMode
  const setMode = (next: SheetMode) => {
    setPicked(next)
    saveMode(next)
  }
  useEffect(() => setPicked(null), [resourceId])
  const saga = useOptionalSaga()
  // An action ran from the sheet: its values changed
  const [ran, setRan] = useState(0)

  useEffect(() => {
    if (resourceId === null) return setSheet(null)
    setError('')
    api.sheet(sagaId, resourceId, setId, actorId).then(setSheet).catch((e: Error) => setError(e.message))
  }, [sagaId, resourceId, setId, actorId, refreshKey, ran])

  const shown = sheet && sheet.resource_id === resourceId ? sheet : null
  // Changing a value from the sheet (plan 58): the ones the server says this viewer may change, with their number known
  const [pop, setPop] = useState<{ value: DisplayValue; anchor: Anchor } | null>(null)
  const [changeError, setChangeError] = useState('')
  const mayChange = (v: DisplayValue) => editable && Boolean(shown?.editable?.includes(v.key)) && numberOf(v) !== undefined
  const marked = shown && editable ? {
    ...shown,
    immersive: shown.immersive.map((v) => ({ ...v, changeable: mayChange(v) })),
    informative: shown.informative.map((v) => ({ ...v, changeable: mayChange(v) })),
  } : shown
  const onValueClick: ValueClick | undefined = editable ? (value, element) => { if (mayChange(value)) setPop({ value, anchor: anchorOf(element) }) } : undefined
  const commit = (value: DisplayValue, next: number) => {
    setPop(null)
    if (resourceId === null) return
    if (value.type === 'counter' && value.max !== undefined) next = Math.max(value.min ?? 0, Math.min(value.max, next)) // its min and max
    if (next === numberOf(value)) return
    setChangeError('')
    // The DM on a card: through the card (an instance keeps its own values); anyone else: the character (the server
    // checks what they may change)
    const card = saga?.isAdmin && actorId
    const change = value.type === 'counter'
      ? card ? api.actorCounter(sagaId, actorId!, value.key, { current: next }) : api.changeCounter(sagaId, resourceId, value.key, { current: next })
      : card ? api.actorValues(sagaId, actorId!, { [value.key]: next }) : api.updateResource(sagaId, resourceId, { attributes: { [value.key]: next } })
    void (change as Promise<unknown>).then(() => setRan((n) => n + 1)).catch((e: Error) => setChangeError(e.message))
  }
  return (
    <Modal
      open={resourceId !== null}
      title={shown ? (shown.name ?? '???') : ''}
      onClose={onClose}
      className={`sheet-modal mode-${mode}`}
      actions={
        <>
          <Segmented<SheetMode> value={mode} options={[['immersive', 'Immersive'], ['informative', 'Informative']]} onChange={setMode} />
          {shown && resourceId !== null && <RelationshipsButton subject={{ id: resourceId, name: shown.name ?? '???', kind: 'character' }} />}
          {/* An instance keeps its own values: actions are the character's */}
          {saga && shown && resourceId !== null && !shown.instance && (
            <ActionsButton key={resourceId} resourceId={resourceId} name={shown.name ?? '???'} onRan={() => setRan((n) => n + 1)} />
          )}
          {onEdit && resourceId !== null && <button className="small" onClick={() => onEdit(resourceId)}>✎ Edit</button>}
        </>
      }
    >
      {error && <div className="error">{error}</div>}
      {changeError && <div className="error" onClick={() => setChangeError('')}>{changeError}</div>}
      {marked ? <SheetView sheet={marked} mode={mode} onValueClick={onValueClick} /> : !error && <p className="muted">Loading…</p>}
      {pop && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} className="value-pop">
          <ValueEditor attr={pop.value} onCommit={(next) => commit(pop.value, next)} />
        </Popover>
      )}
      {shown?.real_name && shown.player_name !== shown.real_name && (
        <p className="muted small sheet-note">Players see this character as {shown.player_name ?? '???'}.</p>
      )}
    </Modal>
  )
}
