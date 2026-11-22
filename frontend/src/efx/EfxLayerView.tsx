/**
 * One EFX layer drawn in its box: its effects stacked in order (gradient and picture as CSS, the rest animated on
 * canvases by efx/effects). Used by the EFX Sets on Stages and by the environment preview. Intensity follows the
 * clock (efx/variation.ts); with reduced motion, effects are drawn once and stay still.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import type { EfxEffect, EfxLayer } from '../api/types'
import { EFFECTS } from './effects'
import { onTick, reducedMotion } from './ticker'
import { intensityAt } from './variation'

function cssEffect(effect: EfxEffect): CSSProperties | null {
  const p = effect.params
  if (effect.kind === 'gradient') {
    const top = String(p.top ?? '#141a33'), bottom = String(p.bottom ?? '#3d2a4f')
    return { background: p.style === 'plain' ? top : p.style === 'radial' ? `radial-gradient(ellipse at center, ${top}, ${bottom})` : `linear-gradient(180deg, ${top}, ${bottom})` }
  }
  if (effect.kind === 'image') {
    const url = p.file_url as string | null | undefined
    if (!url) return {}
    return { backgroundImage: `url(${url})`, backgroundSize: p.fit === 'contain' ? 'contain' : 'cover', backgroundRepeat: 'no-repeat',
      backgroundPosition: p.align === 'bottom' ? 'center bottom' : 'center' }
  }
  return null
}

function EffectCanvas({ effect }: { effect: EfxEffect }) {
  const box = useRef<HTMLDivElement>(null)
  const current = useRef(effect)
  current.current = effect // intensity and vary change without starting over
  const paramsKey = JSON.stringify(effect.params)
  useEffect(() => {
    const holder = box.current
    const make = EFFECTS[effect.kind]
    if (!holder || !make) return
    // A fresh canvas each time: a canvas keeps the first kind of drawing it was given (2D or WebGL), so switching
    // bokeh (2D) to aurora (WebGL) on the same one would draw nothing
    const canvas = document.createElement('canvas')
    canvas.className = 'efx-canvas'
    holder.appendChild(canvas)
    const instance = make({ canvas, params: effect.params, seed: effect.id })
    if (!instance) { canvas.remove(); return }
    let size = { w: 0, h: 0 }
    const fit = () => {
      const w = holder.clientWidth, h = holder.clientHeight
      if (!w || !h || (w === size.w && h === size.h)) return
      size = { w, h }
      canvas.width = Math.max(1, Math.round(w * instance.scale))
      canvas.height = Math.max(1, Math.round(h * instance.scale))
      instance.resize?.(w, h)
    }
    fit()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    observer?.observe(holder)
    let stop = () => {}
    if (reducedMotion()) {
      const now = Date.now() / 1000
      for (let i = 0; i < 60; i++) instance.frame(now, intensityAt(current.current, now), 1 / 60) // let particles settle
    } else {
      stop = onTick((seconds, dt) => { if (size.w) instance.frame(seconds, intensityAt(current.current, seconds), dt) })
    }
    return () => { stop(); observer?.disconnect(); instance.dispose(); canvas.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect.kind, effect.id, paramsKey])
  return <div ref={box} className="efx-canvas-box" aria-hidden />
}

export default function EfxLayerView({ layer, className = '' }: { layer: EfxLayer; className?: string }) {
  return (
    <div className={`efx-layer ${className}`} aria-hidden>
      {layer.effects.map((effect) => {
        const css = cssEffect(effect)
        return css ? <div key={effect.id} className={`efx-css ${effect.kind === 'image' && effect.params.drift ? 'drift' : ''}`} style={css} />
          : <EffectCanvas key={effect.id} effect={effect} />
      })}
    </div>
  )
}
