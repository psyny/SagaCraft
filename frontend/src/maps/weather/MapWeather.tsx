/**
 * A map's weather over the map view (plan 49): its weather and fog fall onto the map and move with it
 * (maps/weather/weatherSim.ts); its other effects (a vignette...) are screen effects (EfxLayerView). Still when maps
 * aren't animated on this device (or the user asked for less motion): drawn once, again when the view moves.
 * It never catches clicks.
 */
import { useEffect, useMemo, useRef } from 'react'
import type { EfxLayer } from '../../api/types'
import EfxLayerView from '../../efx/EfxLayerView'
import { onTick, reducedMotion } from '../../efx/ticker'
import { useAnimateMaps } from '../animation'
import { MAP_WEATHER_KINDS, MapWeatherSim, type WeatherView } from './weatherSim'

export default function MapWeather({ weather, view, zoom = 1 }: { weather: EfxLayer; view: WeatherView; zoom?: number }) {
  const animate = useAnimateMaps() && !reducedMotion()
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const mapEffects = weather.effects.filter((e) => MAP_WEATHER_KINDS.has(e.kind))
  const screenEffects = weather.effects.filter((e) => !MAP_WEATHER_KINDS.has(e.kind))
  const key = JSON.stringify(mapEffects.map((e) => [e.id, e.params, e.intensity, e.vary]))
  // The first weather this view shows is already falling; a change of weather sets in gently
  const shown = useRef(false)
  const sim = useMemo(() => {
    const made = new MapWeatherSim(mapEffects, !shown.current)
    shown.current = true
    return made
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const scale = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) * Math.max(0.5, zoom))

  const draw = (seconds: number, dt: number, advance: boolean) => {
    const cv = canvas.current
    const v = viewRef.current
    if (!cv || !v.w || !v.h) return
    const w = Math.max(1, Math.round(v.w * scale)), h = Math.max(1, Math.round(v.h * scale))
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    sim.frame(ctx, v, seconds, dt, advance)
  }

  // Animated: every frame
  useEffect(() => {
    if (!animate || sim.empty) return
    return onTick((seconds, dt) => draw(seconds, dt, true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, sim, scale])

  // Still: once, and again when the view moves
  useEffect(() => {
    if (animate || sim.empty) return
    draw(Date.now() / 1000, 0, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, sim, scale, view.x, view.y, view.s, view.w, view.h])

  return (
    <div className="map-weather" aria-hidden>
      {!sim.empty && <canvas ref={canvas} className="map-weather-canvas" />}
      {screenEffects.length > 0 && <EfxLayerView layer={{ ...weather, effects: screenEffects }} />}
    </div>
  )
}
