/**
 * Fog presets (the DM, Locations page): how map Sets draw the fog of war. A list of the Saga's presets, the
 * selected one's settings, and a live preview: a sample map (no picture, a drawn terrain under a grid) with
 * visible, known and unknown areas, as players will see it (or as the DM does). Map Sets only pick a preset.
 * See docs/concepts/locations.md ("Fog presets").
 */
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import type { FogPreset, MapGrid } from '../../api/types'
import ColorPicker from '../../components/ColorPicker'
import Segmented from '../../components/Segmented'
import { tileCenter } from '../../maps/geometry'
import MapRenderer from '../../maps/MapRenderer'
import { FOG_COLOR_ROLES, FOG_INTENSITY, FOG_STYLE_LABELS, FOG_STYLES, type FogLook } from '../../maps/shader'
import { useSaga } from '../SagaContext'

/** A slider that previews while dragging and saves when released (one change per drag). */
function LiveSlider({ label, value, min, max, step, show, hint, toValue = (v) => v, fromValue = (v) => v, onLive, onSave }: {
  label: string; value: number; min: number; max: number; step: number; show: (v: number) => string; hint?: string
  toValue?: (slider: number) => number; fromValue?: (value: number) => number
  onLive: (v: number | null) => void; onSave: (v: number) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const position = draft ?? fromValue(value)
  const commit = () => {
    if (draft === null) return
    onSave(toValue(draft))
    setDraft(null)
  }
  return (
    <label className="slider">
      <span className="slider-head">{label} <span className="muted">{show(toValue(position))}</span></span>
      <input type="range" min={min} max={max} step={step} value={position}
        onChange={(e) => { const v = Number(e.target.value); setDraft(v); onLive(toValue(v)) }}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      {hint && <span className="muted small">{hint}</span>}
    </label>
  )
}

// -- the preview --------------------------------------------------------------

const COLS = 16
const ROWS = 10
const TILE = 48

/** A sample terrain (drawn, not a picture): fields, a forest, a river, a road and a village. */
function sampleTerrain(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const ground = ctx.createLinearGradient(0, 0, width, height)
  ground.addColorStop(0, '#6f8f4e')
  ground.addColorStop(0.55, '#a59a64')
  ground.addColorStop(1, '#7d8a55')
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#3f6a35'
  for (const [x, y, r] of [[0.18, 0.25, 70], [0.27, 0.2, 55], [0.22, 0.38, 60], [0.8, 0.75, 65], [0.88, 0.62, 50]]) {
    ctx.beginPath()
    ctx.arc(x * width, y * height, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = '#3f79a8'
  ctx.lineWidth = 26
  ctx.beginPath()
  ctx.moveTo(-20, height * 0.82)
  ctx.bezierCurveTo(width * 0.3, height * 0.6, width * 0.55, height * 1.05, width + 20, height * 0.55)
  ctx.stroke()
  ctx.strokeStyle = '#c9b48a'
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.moveTo(width * 0.1, height * 0.55)
  ctx.quadraticCurveTo(width * 0.45, height * 0.35, width * 0.85, height * 0.2)
  ctx.stroke()
  ctx.fillStyle = '#b8574a'
  for (const [x, y] of [[0.5, 0.3], [0.55, 0.36], [0.47, 0.4], [0.58, 0.28]]) ctx.fillRect(x * width, y * height, 22, 18)
  return canvas
}

/** Visible around the village and along a corridor; known around it; the rest unknown. */
function sampleFog(grid: MapGrid): Uint8Array {
  const fog = new Uint8Array(COLS * ROWS)
  const [vx, vy] = tileCenter(grid, 7, 4)
  const [kx, ky] = tileCenter(grid, 2, 2)
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const [x, y] = tileCenter(grid, c, r)
      const near = Math.hypot(x - vx, y - vy) / TILE
      const corridor = (r === 6 && c >= 8 && c <= 13) || (c === 13 && r >= 2 && r <= 6)
      const camp = Math.hypot(x - kx, y - ky) / TILE
      fog[r * COLS + c] = near < 2.2 || corridor ? 2 : near < 3.6 || camp < 1.8 ? 1 : 0
    }
  }
  return fog
}

function FogPreview({ look }: { look: FogLook }) {
  const [shape, setShape] = useState<'square' | 'hex'>('square')
  const [who, setWho] = useState<'players' | 'dm'>('players')
  const grid: MapGrid = useMemo(() => ({
    type: shape, size: TILE, x: 0, y: 0, cols: COLS, rows: ROWS, auto: false, unit_size: 5, unit: 'ft',
    color: '#ffffff', opacity: 0.3, mode: 'color', line: 1,
  }), [shape])
  const width = TILE * COLS + (shape === 'hex' ? TILE / 2 : 0)
  const height = shape === 'hex' ? Math.ceil((TILE / Math.sqrt(3)) * (2 + 1.5 * (ROWS - 1))) : TILE * ROWS
  const terrain = useMemo(() => ({ canvas: sampleTerrain(width, height) }), [width, height])
  const fog = useMemo(() => sampleFog(grid), [grid])
  return (
    <div className="fog-preview">
      <div className="fog-preview-bar">
        <strong>Preview</strong>
        <Segmented value={who} options={[['players', 'Players see'], ['dm', 'You see']]} onChange={setWho} />
        <Segmented value={shape} options={[['square', 'Square'], ['hex', 'Hex']]} onChange={setShape} />
      </div>
      <div className="fog-preview-map" style={{ aspectRatio: `${width} / ${height}` }}>
        <MapRenderer width={width} height={height} quality={1.4} source={terrain} grid={grid} showGrid fog={fog}
          display={look.display} fogLook={look} seeThrough={who === 'dm' ? 0.45 : 0} gridOnlySeen />
      </div>
      <p className="muted small">A sample map: visible around the village and along a corridor, known around them and at a
        camp, the rest unknown. {look.display === 'soft' && look.motion > 0 ? 'It moves as it will on the Stage.' : ''}</p>
    </div>
  )
}

// -- the editor ---------------------------------------------------------------

const pct = (v: number) => `${Math.round(v * 100)}%`

function PresetEditor({ preset, onSave, live, setLive }: {
  preset: FogPreset
  onSave: (body: { name?: string; changes?: Partial<FogLook> }) => void
  live: Partial<FogLook>
  setLive: (changes: Partial<FogLook>) => void
}) {
  const look = { ...preset.look, ...live }
  const save = (changes: Partial<FogLook>) => onSave({ changes })
  const slide = (key: keyof FogLook) => ({
    onLive: (v: number | null) => setLive(v === null ? {} : { [key]: v }),
    onSave: (v: number) => save({ [key]: v }),
  })
  return (
    <div className="tool-panel">
      <label>Name<input key={preset.id} defaultValue={preset.name} onBlur={(e) => e.target.value.trim() && e.target.value !== preset.name && onSave({ name: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></label>
      <div className="field">
        <span className="field-label">Display</span>
        <Segmented value={look.display} options={[['soft', 'Soft (styled fog)'], ['flat', 'Flat (tile by tile)']]} onChange={(display) => save({ display })} />
      </div>
      {look.display === 'soft' && (
        <>
          <div className="field">
            <span className="field-label">Style</span>
            <div className="chips">
              {FOG_STYLES.map((s) => (
                <button key={s} type="button" className={`chip ${look.style === s ? 'on' : ''}`} onClick={() => s !== look.style && save({ style: s })}>{FOG_STYLE_LABELS[s]}</button>
              ))}
            </div>
            <span className="muted small">A style comes with its own colours.</span>
          </div>
          <div className="field">
            <span className="field-label">Colors
              <button type="button" className="small ghost" title="The style's own colours" onClick={() => save({ style: look.style })}>Reset</button>
            </span>
            <div className="fog-colors">
              {FOG_COLOR_ROLES[look.style].map((role, i) => (
                <div key={role} className="fog-color">
                  <span className="muted small">{role}</span>
                  <ColorPicker label={role} value={look.colors[i]}
                    onChange={(c) => save({ colors: look.colors.map((x, j) => (j === i ? c : x)) as FogLook['colors'] })} />
                </div>
              ))}
            </div>
          </div>
          <div className="grid-2">
            <LiveSlider label="Size" value={look.size} min={-2} max={2} step={0.25} fromValue={Math.log2}
              toValue={(v) => Math.round(2 ** v * 1000) / 1000} show={(v) => `×${Number(v.toFixed(2))}`} {...slide('size')} />
            <LiveSlider label="Intensity" value={look.intensity} min={0} max={1} step={0.05} show={pct} hint={FOG_INTENSITY[look.style]} {...slide('intensity')} />
            <LiveSlider label="Motion" value={look.motion} min={0} max={2} step={0.1} show={(v) => (v === 0 ? 'Still' : `×${v.toFixed(1)}`)}
              hint="How fast it moves (0: still)" {...slide('motion')} />
            <LiveSlider label="Edge" value={look.edge} min={0} max={1} step={0.05} show={pct} hint="Smooth to ragged, where the fog meets the map" {...slide('edge')} />
          </div>
        </>
      )}
      <LiveSlider label="Known tiles" value={look.known} min={0} max={1} step={0.05} show={pct}
        hint="How much colour and light known tiles lose (0: like visible ones; 50%: grey)" {...slide('known')} />
    </div>
  )
}

export default function FogPresets() {
  const { sagaId } = useSaga()
  const [presets, setPresets] = useState<FogPreset[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [live, setLive] = useState<Partial<FogLook>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    api.fogPresets(sagaId).then((list) => { setPresets(list); setSelected((s) => s ?? list[0]?.id ?? null) }).catch((e: Error) => setError(e.message))
  }, [sagaId])

  const preset = presets?.find((p) => p.id === selected) ?? null
  const replace = (next: FogPreset) => setPresets((list) => (list || []).map((p) => (p.id === next.id ? next : p)))
  const run = async <T,>(action: () => Promise<T>) => {
    setError('')
    try { return await action() } catch (e) { setError((e as Error).message); return null }
  }
  const save = (body: { name?: string; changes?: Partial<FogLook> }) => {
    if (!preset) return
    void run(() => api.updateFogPreset(sagaId, preset.id, body)).then((next) => { if (next) replace(next); setLive({}) })
  }
  const add = (copyOf?: number) => void run(() => api.createFogPreset(sagaId, copyOf ? { copy_of: copyOf } : {})).then((made) => {
    if (!made) return
    setPresets((list) => [...(list || []), made])
    setSelected(made.id)
  })
  const remove = () => {
    if (!preset || !window.confirm(`Delete the fog preset "${preset.name}"? Maps using it switch to the first preset.`)) return
    void run(() => api.deleteFogPreset(sagaId, preset.id).then(() => true)).then((done) => {
      if (!done) return
      const rest = (presets || []).filter((p) => p.id !== preset.id)
      setPresets(rest)
      setSelected(rest[0]?.id ?? null)
    })
  }

  return (
    <div className="fog-presets">
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <aside className="fog-preset-list">
        <div className="tool-head"><strong>Fog presets</strong><button className="small" onClick={() => add()}>＋ New</button></div>
        <p className="muted small">How map Sets draw the fog of war. On the Stage, a map just picks one.</p>
        {(presets || []).map((p, i) => (
          <button key={p.id} className={`path-row ${p.id === selected ? 'on' : ''}`} onClick={() => { setSelected(p.id); setLive({}) }}>
            <span className="fog-swatch" style={{ background: `linear-gradient(135deg, ${p.look.colors.join(', ')})` }} />
            <span>{p.name}</span>
            <span className="muted small">{i === 0 ? 'default' : FOG_STYLE_LABELS[p.look.style]}</span>
          </button>
        ))}
        {preset && (
          <div className="button-row">
            <button className="small" onClick={() => add(preset.id)}>Duplicate</button>
            <button className="small ghost danger" disabled={(presets?.length ?? 0) < 2} title={(presets?.length ?? 0) < 2 ? 'Keep at least one preset' : undefined}
              onClick={remove}>Delete</button>
          </div>
        )}
      </aside>
      <section className="fog-preset-editor">
        {preset ? <PresetEditor key={preset.id} preset={preset} onSave={save} live={live} setLive={(c) => setLive((l) => ({ ...l, ...c }))} />
          : <p className="muted">{presets ? 'Pick a preset.' : 'Loading…'}</p>}
      </section>
      <section className="fog-preset-preview">
        {preset && <FogPreview look={{ ...preset.look, ...live }} />}
      </section>
    </div>
  )
}
