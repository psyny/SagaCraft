/**
 * The map tools bar's pieces (plan 45): icon buttons, drop-down choices, trays (a colour, a slider) and the list of
 * a kind's things (☰: select, eye, rename, delete). Trays and lists open under their button (components/Popover).
 */
import { useState, type ReactNode } from 'react'
import ColorPicker from '../../components/ColorPicker'
import Popover, { anchorOf, type Anchor } from '../../components/Popover'
import { StageEyeIcon } from '../../stage/SetIcons'
import { BinIcon, ListIcon, PlusIcon, RenameIcon } from './icons'

export const Sep = () => <span className="toolbar-sep" />

export function ToolButton({ icon, label, on = false, onClick, disabled = false, title, text, className = '' }: {
  icon: ReactNode; label: string; on?: boolean; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean
  title?: string; text?: string; className?: string
}) {
  return (
    <button type="button" className={`map-tool ${on ? 'on' : ''} ${text ? 'with-text' : ''} ${className}`} aria-pressed={on} aria-label={label}
      title={title ?? label} disabled={disabled} onClick={onClick}>
      {icon}{text && <span className="map-tool-text">{text}</span>}
    </button>
  )
}

/** A button that opens something under itself. */
function useAnchor() {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const toggle = (e: React.MouseEvent<HTMLElement>) => setAnchor(anchor ? null : anchorOf(e.currentTarget))
  return { anchor, toggle, close: () => setAnchor(null) }
}

/** A choice from a short list: the button shows the current one. */
export function MenuTool<T extends string>({ label, value, options, onChange, icon, disabled = false }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; icon?: ReactNode; disabled?: boolean
}) {
  const { anchor, toggle, close } = useAnchor()
  const current = options.find(([v]) => v === value)?.[1] ?? value
  return (
    <>
      <button type="button" className={`map-tool menu-tool ${anchor ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={Boolean(anchor)}
        aria-label={`${label}: ${current}`} title={label} disabled={disabled} onClick={toggle}>
        {icon}<span className="map-tool-label">{label}</span><span className="map-tool-text">{current}</span><span className="caret">▾</span>
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={close}>
          <div className="menu" role="menu" aria-label={label}>
            {options.map(([v, name]) => (
              <button key={v} role="menuitemradio" aria-checked={v === value} className={`menu-item ${v === value ? 'on' : ''}`}
                onClick={() => { onChange(v); close() }}>
                <span className="menu-icon">{v === value ? '✓' : ''}</span>{name}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  )
}

/** A button opening a tray of controls under it. */
export function TrayTool({ label, button, children, disabled = false }: {
  label: string; button: ReactNode; children: (close: () => void) => ReactNode; disabled?: boolean
}) {
  const { anchor, toggle, close } = useAnchor()
  return (
    <>
      <button type="button" className={`map-tool menu-tool ${anchor ? 'on' : ''}`} aria-expanded={Boolean(anchor)} aria-label={label} title={label}
        disabled={disabled} onClick={toggle}>
        {button}
      </button>
      {anchor && <Popover anchor={anchor} onClose={close} className="tool-tray">{children(close)}</Popover>}
    </>
  )
}

export function ColorTool({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return (
    <TrayTool label={label} button={<><span className="map-tool-label">{label}</span><span className="color-dot big" style={{ background: value }} /></>}>
      {() => <ColorPicker label={label} value={value} onChange={onChange} />}
    </TrayTool>
  )
}

/** A value on a slider: the map follows while dragging (`onDraft`), saved when released. */
export function SliderTool({ label, value, min, max, step = 1, unit = '%', onDraft, onSave, hint }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string
  onDraft?: (v: number | null) => void; onSave: (v: number) => void; hint?: string
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? value
  const commit = () => { if (draft !== null) { onSave(draft); setDraft(null); onDraft?.(null) } }
  return (
    <TrayTool label={label} button={<><span className="map-tool-label">{label}</span><span className="map-tool-text">{shown}{unit}</span><span className="caret">▾</span></>}>
      {() => (
        <label className="slider tray-slider">
          <span className="slider-head">{label} <span className="muted">{shown}{unit}</span></span>
          <input type="range" min={min} max={max} step={step} value={shown} aria-label={label} autoFocus
            onChange={(e) => { const v = Number(e.target.value); setDraft(v); onDraft?.(v) }}
            onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
          {hint && <span className="muted small">{hint}</span>}
        </label>
      )}
    </TrayTool>
  )
}

/** One thing in a kind's list. */
export interface EntityItem {
  id: string
  name: string
  /** Only the DM sees it. */
  hidden: boolean
  /** Before the name: a colour dot, a token. */
  mark?: ReactNode
  /** After the name, dimmed (tiles, kind). */
  note?: string
  /** It has a name of its own (not its resource's). */
  renamable: boolean
}

/** A kind of things on the map, for the bar: the list, the selected one, and what the list's buttons do. */
export interface EntityKind {
  /** "path", "region"... (buttons' labels). */
  noun: string
  items: EntityItem[]
  selected: string | null
  select: (id: string | null) => void
  /** ＋: add one and select it (or start placing it). */
  add: (e: React.MouseEvent<HTMLButtonElement>) => void
  /** ＋ is waiting for a click on the map. */
  adding?: boolean
  setHidden: (id: string, hidden: boolean) => void
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  /** Shown when the list is empty. */
  empty: string
}

function EntityRow({ item, on, kind, onPicked }: { item: EntityItem; on: boolean; kind: EntityKind; onPicked: () => void }) {
  const [renaming, setRenaming] = useState(false)
  return (
    <div className={`entity-row ${on ? 'on' : ''} ${item.hidden ? 'hidden-thing' : ''}`}>
      {renaming ? (
        <input className="entity-name-input" defaultValue={item.name} autoFocus aria-label={`Rename ${item.name}`} maxLength={80}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== item.name) kind.rename(item.id, v); setRenaming(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') { e.stopPropagation(); setRenaming(false) }
          }} />
      ) : (
        <button type="button" className="entity-name" title={`Select ${item.name}`} onClick={() => { kind.select(item.id); onPicked() }}>
          {item.mark}<span className="entity-label">{item.name}</span>{item.note && <span className="muted small">{item.note}</span>}
        </button>
      )}
      <button type="button" className="map-tool small-tool" aria-pressed={!item.hidden} aria-label={item.hidden ? `Show ${item.name} to players` : `Hide ${item.name} from players`}
        title={item.hidden ? 'Only you see it: show it to players' : 'Players see it: hide it (only you)'} onClick={() => kind.setHidden(item.id, !item.hidden)}>
        <StageEyeIcon open={!item.hidden} size={16} />
      </button>
      {item.renamable && (
        <button type="button" className="map-tool small-tool" aria-label={`Rename ${item.name}`} title="Rename" onClick={() => setRenaming(true)}>
          <RenameIcon size={16} />
        </button>
      )}
      <button type="button" className="map-tool small-tool" aria-label={`Delete ${item.name}`} title="Delete"
        onClick={() => window.confirm(`Delete the ${kind.noun} "${item.name}"?`) && kind.remove(item.id)}>
        <BinIcon size={16} />
      </button>
    </div>
  )
}

/** ☰ (the list) and ＋ (add), then the selected one's name: the start of every kind's tools. */
export function EntityHead({ kind, title }: { kind: EntityKind; title: string }) {
  const { anchor, toggle, close } = useAnchor()
  const selected = kind.items.find((i) => i.id === kind.selected) ?? null
  return (
    <>
      <ToolButton icon={<ListIcon />} label={`${title}: the list`} title={`Every ${kind.noun} on this layer`} on={Boolean(anchor)} onClick={toggle}
        text={String(kind.items.length)} />
      {anchor && (
        <Popover anchor={anchor} onClose={close} className="entity-tray">
          <div className="entity-list" role="list" aria-label={title}>
            <div className="menu-title">{title}</div>
            {kind.items.length === 0 && <p className="muted small entity-empty">{kind.empty}</p>}
            {kind.items.map((item) => <EntityRow key={item.id} item={item} on={item.id === kind.selected} kind={kind} onPicked={close} />)}
          </div>
        </Popover>
      )}
      <ToolButton icon={<PlusIcon />} label={`Add a ${kind.noun}`} on={Boolean(kind.adding)} onClick={kind.add} />
      {selected && (
        <>
          <Sep />
          <span className={`entity-chip ${selected.hidden ? 'hidden-thing' : ''}`} title={selected.hidden ? 'Only you see it' : 'Players see it'}>
            {selected.mark}<span className="entity-label">{selected.name}</span>
            <button type="button" className="entity-chip-x" aria-label="Deselect" title="Deselect (Esc)" onClick={() => kind.select(null)}>✕</button>
          </span>
        </>
      )}
    </>
  )
}

/** Is a thing only the DM's (no one named)? */
export const isHidden = (v: { groups: number[]; members: number[]; owner?: boolean } | null | undefined) =>
  !v || (!v.groups.length && !v.members.length && !v.owner)

/** The visibility an eye sets: the players' group, or no one (the DM only). */
export function eyeVisibility(groups: { id: number; key: string | null }[] | undefined, hidden: boolean) {
  const players = groups?.find((g) => g.key === 'players')
  return hidden || !players ? { groups: [], members: [] } : { groups: [players.id], members: [] }
}
