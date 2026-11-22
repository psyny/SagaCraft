/**
 * Labels (the DM): markers on the map without editing its picture. "＋ New label" then click the map to place it;
 * click a label to pick it. Its text, pin (pin, dot, star, flag, diamond, none), where the text goes (above, left,
 * right), size, colour, "text on click", who sees it; "Move" then click the new place. Players see a label only
 * when it's shared with them and on a place they know.
 */
import { useState } from 'react'
import type { LabelPin, LocationMap, MapLabel } from '../../api/types'
import ColorPicker from '../../components/ColorPicker'
import Segmented from '../../components/Segmented'
import VisibilityPicker from '../../components/VisibilityPicker'
import { useSaga } from '../../saga/SagaContext'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'

const PINS: [LabelPin, string][] = [['pin', '📍 Pin'], ['dot', '● Dot'], ['star', '★ Star'], ['flag', '⚑ Flag'], ['diamond', '◆ Diamond'], ['none', 'Text only']]

export function useLabelsTool({ map, run, active }: { map: LocationMap | null; run: MapCommand; active: boolean }) {
  const { saga } = useSaga()
  const [selected, setSelected] = useState<string | null>(null)
  const [placing, setPlacing] = useState<'new' | 'move' | null>(null)
  const labels = map?.labels ?? []
  const label = labels.find((l) => l.id === selected) ?? null

  const save = async (changes: Partial<MapLabel>) => {
    const next = await run('labels.save', { label: { ...(label && placing !== 'new' ? { id: label.id } : {}), ...changes } })
    if (next && (placing === 'new' || !label)) setSelected(next.labels?.[next.labels.length - 1]?.id ?? null)
  }

  const onPoint: MapViewProps['onPoint'] = (phase, point) => {
    if (phase !== 'down' || !placing) return
    const at: [number, number] = [Math.round(point[0]), Math.round(point[1])]
    if (placing === 'new') void save({ text: `Place ${labels.length + 1}`, point: at }).then(() => setPlacing(null))
    else void save({ point: at }).then(() => setPlacing(null))
  }

  const panel = map && (
    <div className="tool-panel">
      <div className="tool-head">
        <strong>Labels</strong>
        <button className={`small ${placing === 'new' ? 'primary' : ''}`} onClick={() => setPlacing(placing === 'new' ? null : 'new')}>
          {placing === 'new' ? 'Click the map…' : '＋ New label'}
        </button>
      </div>
      {labels.length === 0 && <p className="muted small">Mark places on the map (a village, a cave) without editing its picture.</p>}
      <div className="path-list">
        {labels.map((l) => (
          <button key={l.id} className={`path-row ${l.id === selected ? 'on' : ''}`} onClick={() => { setSelected(l.id === selected ? null : l.id); setPlacing(null) }}>
            <span className="color-dot" style={{ background: l.color }} />
            <span>{l.text || '(no text)'}</span>
            <span className="muted small">{l.on_click ? 'on click' : ''}</span>
          </button>
        ))}
      </div>
      {label && (
        <div className="path-editor">
          <label>Text<input key={`${label.id}-${label.text}`} defaultValue={label.text} maxLength={80}
            onBlur={(e) => e.target.value !== label.text && void save({ text: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></label>
          <div className="field"><span className="field-label">Pin</span>
            <div className="chips">{PINS.map(([pin, name]) => <button key={pin} className={`chip ${label.pin === pin ? 'on' : ''}`} onClick={() => void save({ pin })}>{name}</button>)}</div>
          </div>
          <div className="field"><span className="field-label">Text</span>
            <Segmented value={label.side} options={[['left', '← Left'], ['above', '↑ Above'], ['right', 'Right →']]} onChange={(side) => void save({ side })} />
          </div>
          <div className="field"><span className="field-label">Size</span>
            <Segmented value={label.size} options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]} onChange={(size) => void save({ size })} />
          </div>
          <div className="field"><span className="field-label">Pin colour</span><ColorPicker label="Pin colour" value={label.color} onChange={(color) => void save({ color })} /></div>
          <label className="check"><input type="checkbox" checked={label.on_click} onChange={(e) => void save({ on_click: e.target.checked })} /> Text only on click (players see the pin; a click shows the text)</label>
          <div className="field">
            <span className="field-label">Who sees it</span>
            <VisibilityPicker value={label.visibility || { groups: [], members: [] }} groups={saga.groups} members={saga.members}
              emptyLabel="Hidden (admins only)" onChange={(visibility) => void save({ visibility })} />
            <span className="muted small">Players see it only on a place they know.</span>
          </div>
          <div className="button-row">
            <button className={`small ${placing === 'move' ? 'primary' : ''}`} onClick={() => setPlacing(placing === 'move' ? null : 'move')}>{placing === 'move' ? 'Click the new place…' : '✥ Move'}</button>
            <span className="spacer" />
            <button className="small ghost danger" onClick={() => {
              if (!window.confirm(`Delete the label "${label.text}"?`)) return
              setSelected(null)
              void run('labels.delete', { id: label.id })
            }}>Delete label</button>
          </div>
        </div>
      )}
    </div>
  )

  const mapProps: Partial<MapViewProps> = active && map ? {
    ...(placing ? { onPoint } : {}),
    overlay: { labels: { showAll: true, selectedId: selected, onSelect: placing ? undefined : (l) => { setSelected(l.id); setPlacing(null) } } },
  } : {}
  return { panel, mapProps }
}
