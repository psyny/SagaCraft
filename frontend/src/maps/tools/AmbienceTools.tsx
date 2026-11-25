/**
 * The map's ambience on the map tools bar (plan 48), in the editor and on a Stage (the DM changes it during play;
 * players see it live): Daytime (the hour: its light; night is dark, lit windows, fireflies, stars on the water) and
 * Weather (one of the Saga's map weathers, drawn over the map: EFX → Map weather).
 */
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { Environment, LocationMap } from '../../api/types'
import { useOptionalSaga } from '../../saga/SagaContext'
import { daylight, hourName } from '../painter/daylight'
import type { MapCommand } from '../useLocationMap'
import { CloudIcon, DaytimeIcon } from '../toolbar/icons'
import { TrayTool } from '../toolbar/widgets'

const QUICK: [string, number][] = [['Dawn', 6.5], ['Noon', 12], ['Dusk', 18], ['Night', 23]]

export function useAmbienceTools({ map, run, setMap, enabled }: {
  map: LocationMap | null; run: MapCommand; setMap?: (m: LocationMap) => void; enabled: boolean
}) {
  const hour = map?.ambience?.hour ?? 12
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? hour
  // Sent as it changes, at most every 200 ms (the last one always): players see the sun move
  const sent = useRef(0)
  const pending = useRef<number | null>(null)
  const timer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const send = (h: number) => {
    sent.current = Date.now()
    pending.current = null
    void run('ambience.set', { changes: { hour: h } }).finally(() => { if (pending.current === null) setDraft(null) })
  }
  const change = (h: number) => {
    setDraft(h)
    if (map && setMap) setMap({ ...map, ambience: { weather: map.ambience?.weather ?? null, hour: h } })
    window.clearTimeout(timer.current)
    const wait = 200 - (Date.now() - sent.current)
    if (wait <= 0) send(h)
    else { pending.current = h; timer.current = window.setTimeout(() => send(h), wait) }
  }
  // The Saga's map weathers (EFX → Map weather), fetched when the menu first opens
  const sagaId = useOptionalSaga()?.sagaId
  const [weathers, setWeathers] = useState<Environment[] | null>(null)
  const loadWeathers = () => {
    if (weathers || !sagaId) return
    api.environments(sagaId, 'weather').then(setWeathers).catch(() => setWeathers([]))
  }
  const current = map?.ambience?.weather ?? null
  const setWeather = (id: number | null) => void run('ambience.set', { changes: { weather: id } })
  const weather = map && enabled ? (
    <TrayTool label="Weather" button={<><CloudIcon /><span className="map-tool-text">{current?.name ?? 'No weather'}</span><span className="caret">▾</span></>}>
      {(close) => {
        loadWeathers()
        return (
          <div className="weather-tray" role="menu" aria-label="Weather">
            <button type="button" role="menuitemradio" aria-checked={!current} className={`weather-item ${!current ? 'on' : ''}`}
              onClick={() => { setWeather(null); close() }}>No weather</button>
            {weathers === null ? <span className="muted small">Loading…</span> : weathers.map((w) => (
              <button key={w.id} type="button" role="menuitemradio" aria-checked={current?.id === w.id} className={`weather-item ${current?.id === w.id ? 'on' : ''}`}
                onClick={() => { setWeather(w.id); close() }}>{w.name}</button>
            ))}
            <span className="muted small">Edit them in EFX → Map weather.</span>
          </div>
        )
      }}
    </TrayTool>
  ) : null
  const night = daylight(shown).night > 0.5
  const daytime = map && enabled ? (
    <TrayTool label="Daytime" button={<><DaytimeIcon night={night} /><span className="map-tool-text">{hourName(shown)}</span><span className="caret">▾</span></>}>
      {() => (
        <div className="daytime-tray">
          <label className="slider tray-slider">
            <span className="slider-head">Daytime <span className="muted">{hourName(shown)}</span></span>
            <input type="range" min={0} max={24} step={0.25} value={shown} autoFocus aria-label="Hour of the day" onChange={(e) => change(Number(e.target.value))} />
          </label>
          <div className="daytime-quick">
            {QUICK.map(([name, h]) => <button key={name} type="button" className="btn small" onClick={() => change(h)}>{name}</button>)}
          </div>
        </div>
      )}
    </TrayTool>
  ) : null
  return { daytime, weather }
}
