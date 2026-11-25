/**
 * EFX → Environments (the DM's): build the environments Stages show through their EFX Sets; and (plan 48) the Saga's
 * map weathers: effects drawn over a map (rain, snow, sand, mist...), picked with a map's Weather tool. A map weather is
 * an environment of kind "weather": only its foreground is used. A Saga starts with presets. An environment has
 * three layers, back to front: far background (sky, space, colours, abstract light, a picture), near background
 * (landscape, abstract light, a transparent picture; or nothing) and foreground (weather, abstract light, a
 * vignette). Each layer stacks effects; each animated effect has an intensity range and how often it varies.
 * The editor is built from the server's catalog; changes save by themselves and show live on the Stages using it.
 * See docs/concepts/efx.md.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { EfxCatalog, EfxEffect, EfxLayer, EfxLayerKey, EfxParamSpec, Environment } from '../../api/types'
import ImageUploader from '../../components/imageEditor/ImageUploader'
import Modal from '../../components/Modal'
import Segmented from '../../components/Segmented'
import EfxLayerView from '../../efx/EfxLayerView'
import MapWeather from '../../maps/weather/MapWeather'
import { useSaga } from '../SagaContext'

const LAYERS: EfxLayerKey[] = ['far', 'near', 'fore']
type Kind = 'stage' | 'weather'
const LAYER_HINTS: Record<EfxLayerKey, string> = {
  far: 'The back: a sky, space, colours, a picture. Covers everything.',
  near: 'Between the far background and the Stage: a landscape, light, a transparent picture. Can stay empty.',
  fore: 'Over the Stage (never catches clicks): weather, light, a vignette. Keep it light enough to read through.',
}

const newId = () => Math.random().toString(36).slice(2, 10)

/** What the server takes: pictures by id (their signed URLs are only for drawing). */
export function forServer(layer: EfxLayer): EfxLayer {
  return { effects: layer.effects.map((e) => ({ ...e, params: Object.fromEntries(Object.entries(e.params).filter(([k]) => !k.endsWith('_url'))) })) }
}

function ParamField({ spec, value, onChange, onUpload }: {
  spec: EfxParamSpec
  value: unknown
  onChange: (value: unknown) => void
  onUpload: () => void
}) {
  if (spec.type === 'number') {
    return (
      <label className="inline-slider efx-param">{spec.label}
        <input type="range" min={spec.min} max={spec.max} step={spec.step ?? 1} value={Number(value ?? spec.default)}
          onChange={(e) => onChange(Number(e.target.value))} aria-label={spec.label} />
        <span className="muted small">{Math.round(Number(value ?? spec.default))}</span>
      </label>
    )
  }
  if (spec.type === 'color') {
    return (
      <label className="efx-param efx-color">{spec.label}
        <input type="color" value={String(value ?? spec.default)} onChange={(e) => onChange(e.target.value)} aria-label={spec.label} />
      </label>
    )
  }
  if (spec.type === 'bool') {
    return <label className="check efx-param"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> {spec.label}</label>
  }
  if (spec.type === 'choice') {
    const options = spec.options ?? []
    return (
      <div className="efx-param efx-choice">
        <span className="field-label">{spec.label}</span>
        {options.length <= 4 ? <Segmented value={String(value ?? spec.default)} options={options} onChange={onChange} /> : (
          <div className="chips">
            {options.map(([k, label]) => <button key={k} type="button" className={`chip ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}>{label}</button>)}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="efx-param efx-image">
      <span className="field-label">{spec.label}</span>
      <button className="small" onClick={onUpload}>{value ? 'Change picture…' : 'Upload a picture…'}</button>
      {Boolean(value) && <button className="small ghost" onClick={() => onChange(null)}>Remove</button>}
    </div>
  )
}

function EffectEditor({ effect, catalog, index, count, onChange, onMove, onRemove }: {
  effect: EfxEffect
  catalog: EfxCatalog
  index: number
  count: number
  onChange: (effect: EfxEffect) => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  const { sagaId } = useSaga()
  const def = catalog.effects[effect.kind]
  const [uploading, setUploading] = useState<string | null>(null)
  const set = (key: string, value: unknown) => onChange({ ...effect, params: { ...effect.params, [key]: value, ...(value === null ? { [`${key}_url`]: null } : {}) } })
  const [lo, hi] = effect.intensity
  const shown = (spec: EfxParamSpec) => {
    // Settings that only mean something for some choices
    const p = effect.params
    if (effect.kind === 'sky' && spec.key === 'sun') return p.time !== 'night'
    if (effect.kind === 'sky' && spec.key === 'moon') return p.time === 'night'
    if (effect.kind === 'space' && ['planet_color', 'planet_size'].includes(spec.key)) return Boolean(p.planet)
    if (effect.kind === 'weather' && spec.key === 'color') return !['leaves', 'embers', 'ash'].includes(String(p.kind))
    if (effect.kind === 'weather' && spec.key === 'length') return ['rain', 'storm', 'hail', 'wind', 'embers', 'sandstorm'].includes(String(p.kind))
    return true
  }
  return (
    <div className="efx-effect">
      <div className="efx-effect-head">
        <strong>{def?.name ?? effect.kind}</strong>
        <span className="spacer" />
        <button className="small ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Draw it further back" title="Further back">↑</button>
        <button className="small ghost" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Draw it further forward" title="Further forward">↓</button>
        <button className="small ghost danger" onClick={onRemove} aria-label="Remove the effect">✕</button>
      </div>
      <div className="efx-params">
        {def?.params.filter(shown).map((spec) => (
          <ParamField key={spec.key} spec={spec} value={effect.params[spec.key]} onChange={(v) => set(spec.key, v)} onUpload={() => setUploading(spec.key)} />
        ))}
      </div>
      {def?.intensity && (
        <div className="efx-intensity">
          <span className="field-label">{def.intensity} <span className="muted">{lo === hi || !effect.vary ? Math.round((lo + hi) / 2) : `${Math.round(lo)}–${Math.round(hi)}`}</span></span>
          <label className="inline-slider">From
            <input type="range" min={0} max={100} value={lo} aria-label={`${def.intensity}: from`}
              onChange={(e) => { const v = Number(e.target.value); onChange({ ...effect, intensity: [v, Math.max(v, hi)] }) }} />
          </label>
          <label className="inline-slider">To
            <input type="range" min={0} max={100} value={hi} aria-label={`${def.intensity}: to`}
              onChange={(e) => { const v = Number(e.target.value); onChange({ ...effect, intensity: [Math.min(lo, v), v] }) }} />
          </label>
          <label className="inline-slider">Changes every
            <input type="range" min={0} max={catalog.max_vary} step={5} value={effect.vary} aria-label="Changes every (seconds)"
              onChange={(e) => onChange({ ...effect, vary: Number(e.target.value) })} />
            <span className="muted small">{effect.vary ? `${effect.vary}s` : 'steady'}</span>
          </label>
        </div>
      )}
      <Modal open={uploading !== null} wide title="A picture for the environment" onClose={() => setUploading(null)}>
        {uploading && (
          <ImageUploader sagaId={sagaId} category="efx" defaultRatio={effect.kind === 'image' ? '16:9' : 'Free'} onCancel={() => setUploading(null)}
            onUploaded={(file) => { onChange({ ...effect, params: { ...effect.params, [uploading]: file.id, [`${uploading}_url`]: file.url } }); setUploading(null) }} />
        )}
      </Modal>
    </div>
  )
}

function LayerEditor({ layer, value, catalog, onChange }: { layer: EfxLayerKey; value: EfxLayer; catalog: EfxCatalog; onChange: (v: EfxLayer) => void }) {
  const effects = value.effects
  const add = (kind: string) => {
    const def = catalog.effects[kind]
    const params = Object.fromEntries(def.params.map((p) => [p.key, p.default]))
    onChange({ effects: [...effects, { id: newId(), kind, params, intensity: def.intensity ? [40, 60] : [50, 50], vary: def.intensity ? 60 : 0 }] })
  }
  const replace = (i: number, e: EfxEffect) => onChange({ effects: effects.map((x, j) => (j === i ? e : x)) })
  const move = (i: number, by: number) => {
    const next = [...effects]
    next.splice(i + by, 0, next.splice(i, 1)[0])
    onChange({ effects: next })
  }
  return (
    <section className="panel efx-layer-editor">
      <h2>{catalog.layer_names[layer]}</h2>
      <p className="muted small">{LAYER_HINTS[layer]}</p>
      {effects.length === 0 && <p className="muted small efx-nothing">{layer === 'far' ? 'Nothing: the Stage\'s own background shows.' : 'Nothing here.'}</p>}
      {effects.map((e, i) => (
        <EffectEditor key={e.id} effect={e} catalog={catalog} index={i} count={effects.length} onChange={(x) => replace(i, x)}
          onMove={(by) => move(i, by)} onRemove={() => onChange({ effects: effects.filter((_, j) => j !== i) })} />
      ))}
      <div className="chips efx-add">
        {catalog.layers[layer].map((kind) => (
          <button key={kind} className="chip" disabled={effects.length >= catalog.max_effects} onClick={() => add(kind)}>＋ {catalog.effects[kind].name}</button>
        ))}
      </div>
    </section>
  )
}

/** The three layers stacked, as on a Stage; a ghost of a Stage between near and fore to judge readability. */
export function EnvironmentPreview({ env, sample }: { env: Pick<Environment, 'far' | 'near' | 'fore'>; sample: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  return (
    <div className="efx-preview" ref={box}>
      <EfxLayerView layer={env.far} />
      <EfxLayerView layer={env.near} />
      {sample && (
        <div className="efx-sample" aria-hidden>
          <div className="efx-sample-map" />
          <div className="efx-sample-cards">{[0, 1, 2, 3].map((i) => <div key={i} className="efx-sample-card" />)}</div>
        </div>
      )}
      <EfxLayerView layer={env.fore} />
      {document.documentElement.requestFullscreen && ( // iPhones have no fullscreen for pages
        <button className="small ghost efx-preview-full" title="Preview on the whole screen"
          onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen())?.catch(() => undefined)}>⤢</button>
      )}
    </div>
  )
}

export default function EnvironmentsPage() {
  const { sagaId, isAdmin } = useSaga()
  const [kind, setKind] = useState<Kind>('stage')
  const [catalog, setCatalog] = useState<EfxCatalog | null>(null)
  const [list, setList] = useState<Environment[] | null>(null)
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Environment | null>(null)
  const [sample, setSample] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<'idle' | 'waiting' | 'saved'>('idle')
  const timer = useRef<number>()
  const edits = useRef(0)

  useEffect(() => {
    if (!isAdmin) return
    api.efxCatalog(sagaId).then(setCatalog).catch((e: Error) => setError(e.message))
  }, [sagaId, isAdmin])
  useEffect(() => {
    if (!isAdmin) return
    setList(null)
    setCurrentId(null)
    api.environments(sagaId, kind).then((l) => { setList(l); if (l.length) setCurrentId(l[0].id) }).catch((e: Error) => setError(e.message))
  }, [sagaId, isAdmin, kind])
  useEffect(() => { setDraft(list?.find((e) => e.id === currentId) ?? null) }, [currentId, list === null]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback((env: Environment) => {
    window.clearTimeout(timer.current)
    setSaving('waiting')
    const edit = ++edits.current
    timer.current = window.setTimeout(() => {
      api.updateEnvironment(sagaId, env.id, { name: env.name, far: forServer(env.far), near: forServer(env.near), fore: forServer(env.fore) })
        .then((saved) => {
          setList((l) => l?.map((e) => (e.id === saved.id ? saved : e)) ?? l)
          if (edit === edits.current) setSaving('saved')
        })
        .catch((e: Error) => setError(e.message))
    }, 450)
  }, [sagaId])
  const change = (next: Environment) => { setDraft(next); save(next) }

  const create = async (body: { example?: string; copy_of?: number }) => {
    try {
      const made = await api.createEnvironment(sagaId, { ...body, kind })
      setList((l) => [...(l ?? []), made])
      setCurrentId(made.id)
      setDraft(made)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const remove = async (env: Environment) => {
    if (!window.confirm(kind === 'weather' ? `Delete "${env.name}"? Maps with this weather will have none.` : `Delete "${env.name}"? Stages showing it will show none.`)) return
    await api.deleteEnvironment(sagaId, env.id)
    const rest = (list ?? []).filter((e) => e.id !== env.id)
    setList(rest)
    setCurrentId(rest[0]?.id ?? null)
    setDraft(rest[0] ?? null)
  }

  if (!isAdmin) return <div className="page-message">Only the Saga's admins build environments.</div>
  if (!catalog || !list) return <div className="page-message">{error || 'Loading…'}</div>
  const weather = kind === 'weather'
  const examples = weather ? catalog.weather_examples : catalog.examples
  return (
    <div className="page page-full efx-page">
      <header className="location-header">
        <h1>{weather ? 'Map weather' : 'Environments'}</h1>
        <Segmented<Kind> value={kind} onChange={setKind} options={[['stage', 'Stage environments'], ['weather', 'Map weather']]} />
        <span className="muted small">{weather
          ? "Weather over your maps (rain, snow, sand, mist...): pick one on a map's tools bar, in its editor or on a Stage."
          : 'Skies, landscapes and weather behind and over your Stages (add the EFX Sets to a Stage, then pick its environment).'}</span>
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <div className="efx-layout">
        <aside className="efx-list tool-panel">
          <div className="button-row">
            <button className="primary small" onClick={() => void create({})}>＋ New</button>
            <select className="small" value="" aria-label="Start from an example" onChange={(e) => e.target.value && void create({ example: e.target.value })}>
              <option value="">From an example…</option>
              {examples.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
            </select>
          </div>
          {list.length === 0 && <p className="muted small">{weather ? 'No map weathers. Start from an example: light rain, a snowstorm, a sandstorm…'
            : 'No environments yet. Start from an example: a starry night, a stormy coast, deep space…'}</p>}
          {list.map((env) => (
            <button key={env.id} className={`efx-list-item ${env.id === currentId ? 'on' : ''}`} onClick={() => setCurrentId(env.id)}>
              <span className="efx-thumb">{weather ? <span className="efx-thumb-fill efx-sample-painted-map" /> : <EnvironmentThumb env={env} />}</span>
              <span>{env.name}</span>
            </button>
          ))}
        </aside>
        {draft ? (
          <div className="efx-editor">
            <div className="efx-editor-head">
              <input className="title-input" value={draft.name} maxLength={80} aria-label="Name" onChange={(e) => change({ ...draft, name: e.target.value })} />
              <span className="muted small">{saving === 'waiting' ? 'Saving…' : saving === 'saved' ? 'Saved' : ''}</span>
              <span className="spacer" />
              {!weather && <label className="check small"><input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} /> Sample Stage</label>}
              <button className="small" onClick={() => void create({ copy_of: draft.id })}>Duplicate</button>
              <button className="small ghost danger" onClick={() => void remove(draft)}>Delete</button>
            </div>
            {weather ? (
              <MapWeatherPreview weather={draft.fore} />
            ) : <EnvironmentPreview env={draft} sample={sample} />}
            <div className="efx-layers">
              {(weather ? (['fore'] as EfxLayerKey[]) : LAYERS).map((layer) => (
                <LayerEditor key={layer} layer={layer} value={draft[layer]} catalog={catalog} onChange={(v) => change({ ...draft, [layer]: v })} />
              ))}
            </div>
          </div>
        ) : <div className="page-message">{weather ? 'Make a map weather to start.' : 'Make an environment to start.'}</div>}
      </div>
    </div>
  )
}

/** A map weather over a sample map, as maps show it (falling onto the map: maps/weather/). */
function MapWeatherPreview({ weather }: { weather: EfxLayer }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(el)
    return () => observer?.disconnect()
  }, [])
  return (
    <div ref={box} className="efx-preview">
      <div className="efx-sample-painted-map" />
      {size.w > 0 && <MapWeather weather={weather} view={{ x: 0, y: 0, s: 1, w: size.w, h: size.h }} />}
    </div>
  )
}

/** A still, small look at an environment for the list (its far background's colours). */
function EnvironmentThumb({ env }: { env: Environment }) {
  const far = env.far.effects[0]
  const p = far?.params ?? {}
  const color = far?.kind === 'gradient' ? `linear-gradient(180deg, ${p.top}, ${p.bottom})`
    : far?.kind === 'sky' ? ({ dawn: 'linear-gradient(180deg,#2b3d73,#f3a47c)', day: 'linear-gradient(180deg,#2f6fcf,#bfe1ff)', dusk: 'linear-gradient(180deg,#1c1a4a,#e9744a)', night: 'linear-gradient(180deg,#03060f,#18214a)' } as Record<string, string>)[String(p.time)]
      : far?.kind === 'space' ? `radial-gradient(circle at 40% 40%, ${p.nebula_a}, #020208 70%)`
        : far?.kind === 'image' && p.file_url ? `center / cover url(${p.file_url})`
          : far?.kind === 'abstract' ? `linear-gradient(135deg, ${p.color_a}, ${p.color_b})` : '#15121b'
  return <span className="efx-thumb-fill" style={{ background: color }} />
}
