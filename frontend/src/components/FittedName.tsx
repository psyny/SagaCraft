import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { nameAbbreviations } from './nameAbbreviations'

let measureCanvas: HTMLCanvasElement | null = null

function textWidth(text: string, font: string): number | null {
  measureCanvas = measureCanvas || document.createElement('canvas')
  const ctx = measureCanvas.getContext?.('2d')
  if (!ctx) return null // no canvas (tests): keep the full name, CSS ellipsis still applies
  ctx.font = font
  return ctx.measureText(text).width
}

/** A name that abbreviates from the last word back when it doesn't fit (see nameAbbreviations). */
export default function FittedName({ name, className = '' }: { name: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const options = useMemo(() => nameAbbreviations(name), [name])
  const [index, setIndex] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current?.parentElement
    if (!el || !ref.current) return
    const style = getComputedStyle(el)
    const available = el.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')
    const font = getComputedStyle(ref.current).font
    if (!available || !font) return setIndex(0)
    const fits = options.findIndex((text) => {
      const width = textWidth(text, font)
      return width === null || width <= available
    })
    setIndex(fits === -1 ? options.length - 1 : fits)
  }, [options])

  return (
    <span ref={ref} className={className} title={index > 0 ? name : undefined}>
      {options[index]}
    </span>
  )
}
