/**
 * Labels (the DM, plan 45): markers on the map without editing its picture, on the map tools bar. ＋ then click the
 * map to place one (selected); a click on a label picks it. The selected label's tools: move (click its new place),
 * its pin (pin, dot, star, flag, diamond, none), where the text goes (left, above, right), size, colour, and "text on
 * click". Its text is its name (rename in the list). Players see a label only when it's on a place they know.
 */
import { useState } from 'react'
import type { LabelPin, LocationMap, MapLabel } from '../../api/types'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { MoveIcon } from '../toolbar/icons'
import { ColorTool, eyeVisibility, isHidden, MenuTool, Sep, ToolButton, type EntityKind } from '../toolbar/widgets'

const PINS: [LabelPin, string][] = [['pin', 'Pin'], ['dot', 'Dot'], ['star', 'Star'], ['flag', 'Flag'], ['diamond', 'Diamond'], ['none', 'Text only']]

export function useLabelsTool({ map, run, active }: { map: LocationMap | null; run: MapCommand; active: boolean }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [placing, setPlacing] = useState<'new' | 'move' | null>(null)
  const labels = map?.labels ?? []
  const label = labels.find((l) => l.id === selected) ?? null

  const save = (changes: Partial<MapLabel>, id: string | null = selected) => run('labels.save', { label: { ...(id ? { id } : {}), ...changes } })
  const select = (id: string | null) => { setSelected(id); setPlacing(null) }

  const onPoint: MapViewProps['onPoint'] = (phase, point) => {
    if (phase !== 'down' || !placing) return
    const at: [number, number] = [Math.round(point[0]), Math.round(point[1])]
    if (placing === 'new') {
      void run('labels.save', { label: { text: `Place ${labels.length + 1}`, point: at } }).then((next) => {
        const made = next?.labels?.[next.labels.length - 1]
        if (made) setSelected(made.id)
      })
    } else void save({ point: at })
    setPlacing(null)
  }

  const kind: EntityKind = {
    noun: 'label',
    items: labels.map((l) => ({
      id: l.id, name: l.text || '(no text)', hidden: isHidden(l.visibility), renamable: true, note: l.on_click ? 'on click' : undefined,
      mark: <span className="color-dot" style={{ background: l.color }} />,
    })),
    selected,
    select,
    add: () => setPlacing(placing === 'new' ? null : 'new'),
    adding: placing === 'new',
    setHidden: (id, hidden) => void save({ visibility: eyeVisibility(map?.groups, hidden) }, id),
    rename: (id, text) => void save({ text }, id),
    remove: (id) => { if (id === selected) select(null); void run('labels.delete', { id }) },
    empty: 'Mark places on the map (a village, a cave) without editing its picture. ＋ then click the map.',
  }

  const row = (
    <>
      {placing === 'new' && <span className="map-tool-hint">Click the map where it goes (Esc: cancel)</span>}
      {label && placing !== 'new' && (
        <>
          <ToolButton icon={<MoveIcon />} label="Move" text={placing === 'move' ? 'Click its new place' : 'Move'} on={placing === 'move'}
            onClick={() => setPlacing(placing === 'move' ? null : 'move')} />
          <Sep />
          <MenuTool label="Pin" value={label.pin} options={PINS} onChange={(pin) => void save({ pin })} />
          <MenuTool label="Text" value={label.side} options={[['left', 'Left'], ['above', 'Above'], ['right', 'Right']] as const} onChange={(side) => void save({ side })} />
          <MenuTool label="Size" value={label.size} options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']] as const} onChange={(size) => void save({ size })} />
          <ColorTool label="Colour" value={label.color} onChange={(color) => void save({ color })} />
          <ToolButton icon={<span className="map-tool-glyph">Aa</span>} label="Text on click" text="On click" on={label.on_click}
            title={label.on_click ? 'Players see the pin; a click shows the text. Click: always show the text' : 'Show the text only on click (players see the pin)'}
            onClick={() => void save({ on_click: !label.on_click })} />
        </>
      )}
    </>
  )

  const mapProps: Partial<MapViewProps> = active && map ? {
    ...(placing ? { onPoint } : {}),
    overlay: { labels: { showAll: true, selectedId: selected, onSelect: placing ? undefined : (l) => select(l.id) } },
  } : {}
  return {
    kind, row, mapProps, armed: Boolean(placing),
    escape: () => { if (placing) setPlacing(null); else if (selected) select(null); else return false; return true },
  }
}
