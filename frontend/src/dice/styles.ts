/**
 * The dice styles a member picks (Saga → User): textures painted on canvases (the base, the numbers, the glow, a
 * height field turned into a normal map) and three.js materials, always led by the member's colour. A die's assets are
 * built once per style, colour, shape and part (cached). See docs/concepts/stages.md ("Dice roller").
 *
 * Numbers are never glossy, whatever the style: masks take them out of the shine (roughness 1, no metal, no clear coat,
 * sheen or iridescence), so no highlight hides them; and they glow a little (NUMBER_GLOW) to stay readable in shade.
 */
import * as THREE from 'three'
import { bestInk, inkOn, luminance, mix, readableComplement, shade, vividComplement } from '../color/theory'
import { atlasCols, cellOf, dieMesh, faceLabel, type MeshOptions, type Vec } from './geometry'
import { seeded } from './physics'

export const DIE_STYLES: [string, string, string][] = [
  ['minimal', 'Minimalist', 'Your colour, a little glossy, rounded edges; numbers in a bold complementary colour.'],
  ['ember', 'Ember', 'Black stone with cracks glowing in your colour\'s complement; the numbers glow in your colour.'],
  ['metal', 'Metal', 'Brushed, very reflective metal in your colour; black or white numbers.'],
  ['raw_wood', 'Raw wood', 'Light raw wood grain; numbers in your colour.'],
  ['polished_wood', 'Polished wood', 'Dark varnished wood; numbers inlaid in your colour.'],
  ['noble', 'Noble', 'Deep lacquer of your colour, gold filigree, gold numbers.'],
  ['elven', 'Elven', 'Pearly and slender, with a sheen and leaf lines of your colour.'],
  ['dwarven', 'Dwarven', 'Heavy iron, thick bevels and rivets; runic numbers filled with your colour.'],
  ['orcish', 'Orcish', 'Blackened, rusted iron hacked into a lump; claw slashes of war paint in your colour, studs, hacked bone-white numbers.'],
  ['nature', 'Nature', 'A living pebble wrapped in vines and leaves of your colour, with little flowers; cream numbers.'],
  ['neon', 'Neon', 'Matte black; the edges and the numbers glow in your colour.'],
]

interface Look {
  mesh: MeshOptions
  font: string
  /** Paints a cell's base (the whole atlas is painted cell by cell; `plain`: edges and corners). */
  base: (g: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, plain: boolean) => void
  /** Height field (white high, black low) for the normal map, or none. */
  height?: (g: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, plain: boolean) => void
  /** Glow (the emissive map), or none. */
  glow?: (g: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, plain: boolean) => void
  ink: string
  /** Numbers also glow / are cut into the height field. */
  inkGlow?: boolean
  inkCut?: boolean
  material: THREE.MeshPhysicalMaterialParameters
  /** Numbers hacked in (rough, doubled strokes) / with a dark edge so they read on busy faces. */
  hacked?: boolean
  outlined?: string
  /** Gold and other metal parts (a metalness map: the filigree; numbers stay matte). */
  metalInk?: boolean
  /** A glowing line inside each face's border, in this colour (with the glow map). */
  rim?: string
}

const noise = (g: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, color: string, n: number, size: number, alpha = 0.15) => {
  g.fillStyle = color
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * rnd()
    g.fillRect(x + rnd() * s, y + rnd() * s, size * (0.5 + rnd()), size * (0.5 + rnd()))
  }
  g.globalAlpha = 1
}
const grain = (g: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, color: string, lines: number, width: number) => {
  g.strokeStyle = color
  for (let i = 0; i < lines; i++) {
    g.globalAlpha = 0.25 + rnd() * 0.35
    g.lineWidth = width * (0.5 + rnd())
    const yy = y + rnd() * s
    g.beginPath()
    g.moveTo(x, yy)
    for (let k = 1; k <= 8; k++) g.lineTo(x + (k / 8) * s, yy + Math.sin(k * 0.9 + i) * s * 0.02 + (rnd() - 0.5) * s * 0.015)
    g.stroke()
  }
  g.globalAlpha = 1
}
const cracks = (g: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, color: string, count: number, width: number) => {
  g.strokeStyle = color
  g.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    let px = x + rnd() * s, py = y + rnd() * s
    g.lineWidth = width * (0.4 + rnd())
    g.beginPath()
    g.moveTo(px, py)
    for (let k = 0; k < 6; k++) {
      px += (rnd() - 0.5) * s * 0.22
      py += (rnd() - 0.5) * s * 0.22
      g.lineTo(px, py)
    }
    g.stroke()
  }
}

function looks(color: string): Record<string, Look> {
  const c = color
  const lit = luminance(c) < 0.06 ? mix(c, '#ffffff', 0.55) : c // a glow that shows, even for a very dark colour
  return {
    minimal: {
      mesh: { chamfer: 0.12 }, font: '700 {size}px system-ui, sans-serif', ink: readableComplement(c),
      base: (g, x, y, s) => { g.fillStyle = c; g.fillRect(x, y, s, s) },
      material: { roughness: 0.32, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25 },
    },
    ember: {
      // Cracks glow in the colour's complement; the numbers glow in the colour itself
      mesh: { chamfer: 0.08 }, font: '700 {size}px Georgia, serif', ink: c, inkGlow: true,
      base: (g, x, y, s, rnd) => { g.fillStyle = '#121012'; g.fillRect(x, y, s, s); noise(g, x, y, s, rnd, '#3a3436', 140, s * 0.03) },
      glow: (g, x, y, s, rnd) => { cracks(g, x, y, s, rnd, vividComplement(c), 5, s * 0.012) },
      height: (g, x, y, s, rnd) => { g.fillStyle = '#808080'; g.fillRect(x, y, s, s); cracks(g, x, y, s, rnd, '#202020', 5, s * 0.02) },
      material: { roughness: 0.78, metalness: 0.1, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.6 },
    },
    metal: {
      mesh: { chamfer: 0.08 }, font: '800 {size}px system-ui, sans-serif', ink: bestInk(c), inkCut: true,
      base: (g, x, y, s, rnd) => { g.fillStyle = shade(c, 0.15); g.fillRect(x, y, s, s); grain(g, x, y, s, rnd, shade(c, -0.25), 30, s * 0.004) },
      height: (g, x, y, s, rnd) => { g.fillStyle = '#808080'; g.fillRect(x, y, s, s); grain(g, x, y, s, rnd, '#9a9a9a', 70, s * 0.006) },
      material: { roughness: 0.22, metalness: 1, clearcoat: 0.2 },
    },
    raw_wood: {
      mesh: { chamfer: 0.1 }, font: '700 {size}px Georgia, serif', ink: inkOn(c, '#c9ad80', 3.5), inkCut: true,
      base: (g, x, y, s, rnd) => { g.fillStyle = '#c9ad80'; g.fillRect(x, y, s, s); grain(g, x, y, s, rnd, '#94703f', 18, s * 0.011) },
      height: (g, x, y, s, rnd) => { g.fillStyle = '#808080'; g.fillRect(x, y, s, s); grain(g, x, y, s, rnd, '#6a6a6a', 16, s * 0.012) },
      material: { roughness: 0.85, metalness: 0 },
    },
    polished_wood: {
      mesh: { chamfer: 0.12 }, font: '700 {size}px Georgia, serif', ink: inkOn(shade(c, 0.15), '#5a321b'),
      base: (g, x, y, s, rnd) => { g.fillStyle = '#5a321b'; g.fillRect(x, y, s, s); grain(g, x, y, s, rnd, '#2e170b', 20, s * 0.012); grain(g, x, y, s, rnd, '#8a5530', 8, s * 0.008) },
      material: { roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 },
    },
    noble: {
      mesh: { chamfer: 0.1 }, font: 'italic 700 {size}px Georgia, serif', ink: '#e8c46a', metalInk: true,
      base: (g, x, y, s, _rnd, plain) => {
        g.fillStyle = shade(c, -0.45); g.fillRect(x, y, s, s)
        if (plain) { g.fillStyle = '#c9a24e'; g.fillRect(x, y, s, s); return }
        g.strokeStyle = '#e8c46a'; g.lineWidth = s * 0.018
        g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.4, 0, Math.PI * 2); g.stroke()
        g.lineWidth = s * 0.008
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2
          g.beginPath(); g.arc(x + s / 2 + Math.cos(a) * s * 0.43, y + s / 2 + Math.sin(a) * s * 0.43, s * 0.03, a, a + Math.PI); g.stroke()
        }
      },
      material: { roughness: 0.25, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 },
    },
    elven: {
      mesh: { chamfer: 0, scale: [0.9, 1.14, 0.9] as Vec }, font: 'italic 600 {size}px "Palatino Linotype", Palatino, serif', ink: inkOn(c, mix(c, '#e9e4da', 0.72), 4),
      base: (g, x, y, s, rnd) => {
        g.fillStyle = mix(c, '#e9e4da', 0.72); g.fillRect(x, y, s, s)
        g.strokeStyle = mix(c, '#e9e4da', 0.25); g.lineWidth = s * 0.008
        for (let k = 0; k < 3; k++) {
          const sx = x + rnd() * s, sy = y + s
          g.beginPath(); g.moveTo(sx, sy)
          g.bezierCurveTo(sx + s * 0.1, sy - s * 0.4, sx - s * 0.2, sy - s * 0.6, sx + (rnd() - 0.5) * s * 0.3, y)
          g.stroke()
        }
      },
      material: { roughness: 0.2, metalness: 0, clearcoat: 0.6, sheen: 1, sheenColor: new THREE.Color(c), sheenRoughness: 0.4, iridescence: 0.5, iridescenceIOR: 1.4 },
    },
    dwarven: {
      mesh: { chamfer: 0.24 }, font: '900 {size}px Impact, "Arial Black", sans-serif', ink: c, inkCut: true,
      base: (g, x, y, s, rnd) => { g.fillStyle = '#3a3a40'; g.fillRect(x, y, s, s); noise(g, x, y, s, rnd, '#55555c', 120, s * 0.04, 0.3) },
      height: (g, x, y, s, rnd, plain) => {
        g.fillStyle = '#808080'; g.fillRect(x, y, s, s)
        if (plain) return
        g.fillStyle = '#e0e0e0'
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2
          g.beginPath(); g.arc(x + s / 2 + Math.cos(a) * s * 0.42, y + s / 2 + Math.sin(a) * s * 0.42, s * 0.03, 0, Math.PI * 2); g.fill()
        }
        noise(g, x, y, s, rnd, '#606060', 60, s * 0.05, 0.5)
      },
      material: { roughness: 0.5, metalness: 0.75 },
    },
    orcish: {
      // Crude and brutal: blackened, rusted iron hacked into an uneven lump, three claw slashes of war paint in the
      // colour, studs on the rims, numbers hacked in bone white
      mesh: { chamfer: 0.04, rough: 0.11 }, font: '900 {size}px Impact, "Arial Black", sans-serif', ink: '#e8dcbc', inkCut: true, hacked: true,
      base: (g, x, y, s, rnd, plain) => {
        g.fillStyle = '#241f1b'; g.fillRect(x, y, s, s)
        noise(g, x, y, s, rnd, '#6e3b1c', 26, s * 0.16, 0.45) // rust
        noise(g, x, y, s, rnd, '#0c0a09', 60, s * 0.06, 0.5) // soot
        if (plain) return
        // Three claw slashes of war paint
        g.strokeStyle = c; g.lineCap = 'round'
        const ax = x + s * (0.15 + rnd() * 0.15), ay = y + s * (0.1 + rnd() * 0.1)
        for (let k = 0; k < 3; k++) {
          g.globalAlpha = 0.85; g.lineWidth = s * (0.035 + rnd() * 0.02)
          g.beginPath(); g.moveTo(ax + k * s * 0.12, ay)
          g.quadraticCurveTo(ax + k * s * 0.12 + s * 0.2, ay + s * 0.35, ax + k * s * 0.12 + s * (0.42 + rnd() * 0.08), ay + s * (0.72 + rnd() * 0.08))
          g.stroke()
        }
        g.globalAlpha = 1
        // Iron studs near the corners
        g.fillStyle = '#5b5650'
        for (const [px, py] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) { g.beginPath(); g.arc(x + px * s, y + py * s, s * 0.04, 0, Math.PI * 2); g.fill() }
      },
      height: (g, x, y, s, rnd, plain) => {
        g.fillStyle = '#808080'; g.fillRect(x, y, s, s)
        noise(g, x, y, s, rnd, '#5a5a5a', 90, s * 0.07, 0.6) // hammer dents
        cracks(g, x, y, s, rnd, '#303030', 9, s * 0.02) // gouges
        if (plain) return
        g.fillStyle = '#d8d8d8'
        for (const [px, py] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) { g.beginPath(); g.arc(x + px * s, y + py * s, s * 0.045, 0, Math.PI * 2); g.fill() }
      },
      material: { roughness: 0.82, metalness: 0.45 },
    },
    nature: {
      // A living pebble: the colour as leafy green-tinted stone, wrapped in vines and leaves in shades of the colour,
      // little flowers in its complement; cream numbers with a dark edge
      mesh: { chamfer: 0.22 }, font: 'italic 700 {size}px Georgia, serif', ink: '#f3ecd6', inkCut: true, outlined: '#1d2416',
      base: (g, x, y, s, rnd, plain) => {
        const stone = mix(shade(c, -0.35), '#3f5a32', 0.45)
        g.fillStyle = stone; g.fillRect(x, y, s, s)
        noise(g, x, y, s, rnd, shade(stone, -0.3), 60, s * 0.06, 0.4)
        // A vine across the face, with leaves along it
        g.strokeStyle = mix(shade(c, -0.15), '#2f4a22', 0.5); g.lineWidth = s * 0.018; g.lineCap = 'round'
        const y0 = y + s * (0.15 + rnd() * 0.2)
        g.beginPath(); g.moveTo(x, y0)
        g.bezierCurveTo(x + s * 0.35, y0 + s * 0.25, x + s * 0.6, y0 - s * 0.1, x + s, y0 + s * 0.35); g.stroke()
        const leaves = plain ? 6 : 9
        for (let k = 0; k < leaves; k++) {
          const t = (k + 0.5) / leaves
          const lx = x + t * s, ly = y0 + Math.sin(t * 3.2) * s * 0.12 + (k % 2 ? s * 0.08 : -s * 0.06) + t * s * 0.25
          g.save(); g.translate(lx, ly); g.rotate((k % 2 ? 0.9 : -0.7) + rnd() * 0.4)
          g.fillStyle = shade(c, -0.2 + rnd() * 0.5)
          g.beginPath(); g.ellipse(0, 0, s * 0.07, s * 0.028, 0, 0, Math.PI * 2); g.fill()
          g.strokeStyle = shade(c, -0.45); g.lineWidth = s * 0.004
          g.beginPath(); g.moveTo(-s * 0.06, 0); g.lineTo(s * 0.06, 0); g.stroke()
          g.restore()
        }
        // Small flowers in the colour's complement
        const petal = vividComplement(c)
        for (let k = 0; k < (plain ? 1 : 2); k++) {
          const fx = x + s * (0.15 + rnd() * 0.7), fy = y + s * (0.7 + rnd() * 0.2)
          g.fillStyle = petal
          for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; g.beginPath(); g.arc(fx + Math.cos(a) * s * 0.022, fy + Math.sin(a) * s * 0.022, s * 0.018, 0, Math.PI * 2); g.fill() }
          g.fillStyle = '#f3d36b'; g.beginPath(); g.arc(fx, fy, s * 0.012, 0, Math.PI * 2); g.fill()
        }
      },
      height: (g, x, y, s, rnd) => { g.fillStyle = '#808080'; g.fillRect(x, y, s, s); noise(g, x, y, s, rnd, '#9a9a9a', 80, s * 0.05, 0.5) },
      material: { roughness: 0.75, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.5 },
    },
    neon: {
      // Matte black; the edges and corners (the chamfer) and a soft rim inside each face glow in the colour, so do the numbers
      mesh: { chamfer: 0.09 }, font: '600 {size}px "Avenir Next", "Segoe UI", system-ui, sans-serif', ink: lit, inkGlow: true, rim: lit,
      base: (g, x, y, s, rnd, plain) => {
        g.fillStyle = plain ? lit : '#0a0a0c'; g.fillRect(x, y, s, s)
        if (!plain) noise(g, x, y, s, rnd, '#16161a', 50, s * 0.04, 0.5)
      },
      glow: (g, x, y, s, _rnd, plain) => { if (plain) { g.fillStyle = lit; g.fillRect(x, y, s, s) } },
      material: { roughness: 0.9, metalness: 0, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.5 },
    },
  }
}

const SIZE = 1024
/** How much numbers light themselves (styles whose numbers really glow, like Ember and Neon, glow fully). */
const NUMBER_GLOW = 0.22

const gray = (v: number) => {
  const h = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')
  return `#${h}${h}${h}`
}

/** A normal map from a height field (Sobel), in a new canvas. */
function normalsFrom(height: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = height.width, h = height.height
  const src = height.getContext('2d')!.getImageData(0, 0, w, h).data
  const out = document.createElement('canvas')
  out.width = w; out.height = h
  const g = out.getContext('2d')!
  const img = g.createImageData(w, h)
  const at = (x: number, y: number) => src[((Math.min(h - 1, Math.max(0, y)) * w) + Math.min(w - 1, Math.max(0, x))) * 4] / 255
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength
    const l = Math.hypot(dx, dy, 1)
    const i = (y * w + x) * 4
    img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255
    img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255
    img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255
    img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return out
}

export interface DieAssets {
  geometry: THREE.BufferGeometry
  material: THREE.MeshPhysicalMaterial
  faces: { value: number; normal: Vec; up: Vec }[]
  inradius: number
}

const cache = new Map<string, DieAssets>()

/** A die's geometry and material for a style and colour (a d100's part: 'tens' or 'units'). */
export function dieAssets(sides: number, style: string, color: string, part: 'tens' | 'units' | null = null): DieAssets {
  const key = `${sides}|${style}|${color}|${part}`
  const hit = cache.get(key)
  if (hit) return hit
  const look = looks(color)[style] ?? looks(color).minimal
  const mesh = dieMesh(sides === 100 ? 10 : sides, look.mesh)
  const cols = atlasCols(mesh.cells)
  const cell = SIZE / cols
  const canvas = (fill?: string) => {
    const el = document.createElement('canvas')
    el.width = el.height = SIZE
    const g = el.getContext('2d')!
    if (fill) { g.fillStyle = fill; g.fillRect(0, 0, SIZE, SIZE) }
    return [el, g] as const
  }
  const [map, gm] = canvas()
  const [glow, gg] = canvas('#000000')
  const [height, gh] = canvas('#808080')
  // Masks (linear): roughness, metalness, and the shine layers (clear coat, sheen, iridescence) where the numbers are off
  const [rough, gr] = canvas(gray(look.material.roughness ?? 1))
  const [metal, gx] = canvas(gray(look.metalInk ? 0.2 : look.material.metalness ?? 0))
  const [shine, gs] = canvas('#ffffff')
  const numbers: ((g: CanvasRenderingContext2D, color: string) => void)[] = []
  for (let i = 0; i < mesh.cells; i++) {
    const { u, v } = cellOf(i, cols)
    const x = u * SIZE, y = (1 - v) * SIZE - cell
    const plain = i === mesh.cells - 1
    const rnd = seeded(i * 97 + sides)
    look.base(gm, x, y, cell, rnd, plain)
    look.height?.(gh, x, y, cell, seeded(i * 31 + 7), plain)
    look.glow?.(gg, x, y, cell, seeded(i * 53 + 3), plain)
    if (plain) continue
    // What the cell shows: its face's number, in the middle
    const spots = [{ value: mesh.faces[i].value, dx: 0, dy: 0, angle: 0 }]
    const longest = Math.max(...spots.map((s) => faceLabel(sides, s.value, part).length))
    const size = cell * 0.62 * mesh.numberScale * (longest > 1 ? 0.82 : 1)
    const font = look.font.replace('{size}', String(Math.round(size)))
    const draw = (g: CanvasRenderingContext2D, color: string, blur = 0, alpha = 1) => {
      for (const spot of spots) {
        const text = faceLabel(sides, spot.value, part)
        g.save()
        g.translate(x + cell / 2 + spot.dx, y + cell / 2 + spot.dy)
        g.rotate(spot.angle)
        g.font = font
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillStyle = color
        g.globalAlpha = alpha
        if (blur) { g.shadowColor = color; g.shadowBlur = blur }
        if (look.outlined && g === gm) { g.strokeStyle = look.outlined; g.lineWidth = size * 0.12; g.lineJoin = 'round'; g.strokeText(text, 0, 0) }
        if (look.hacked) {
          // Hacked in: a few rough, offset strokes of the same number
          const r = seeded(spot.value * 13 + 5)
          for (let k = 0; k < 3; k++) {
            g.save(); g.translate((r() - 0.5) * size * 0.08, (r() - 0.5) * size * 0.08); g.rotate((r() - 0.5) * 0.12)
            g.globalAlpha = alpha * (k ? 0.55 : 1); g.fillText(text, 0, 0); g.restore()
          }
        } else g.fillText(text, 0, 0)
        if ((text === '6' || text === '9') && sides > 6) g.fillRect(-size * 0.25, size * 0.42, size * 0.5, size * 0.07)
        g.restore()
      }
    }
    // A glowing rim just inside the face's border (Neon)
    if (look.rim) {
      const outline = mesh.outlines[i].map(([px, py]) => [x + cell / 2 + px * 0.47 * cell, y + cell / 2 - py * 0.47 * cell] as const)
      for (const [g, width, blur] of [[gm, 0.012, 0], [gg, 0.016, 0.05]] as const) {
        g.save(); g.strokeStyle = look.rim; g.lineWidth = cell * width; g.lineJoin = 'round'
        if (blur) { g.shadowColor = look.rim; g.shadowBlur = cell * blur }
        g.beginPath(); outline.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.stroke(); g.restore()
      }
    }
    draw(gm, look.ink)
    if (look.inkGlow) draw(gg, look.ink, cell * 0.05)
    else draw(gg, look.ink, 0, NUMBER_GLOW) // numbers light themselves a little
    if (look.inkCut) draw(gh, '#303030')
    numbers.push(draw)
  }
  if (look.metalInk) {
    // Filigree is metal too (it's painted in the base): mark the gold
    const d = gm.getImageData(0, 0, SIZE, SIZE).data
    const m = gx.getImageData(0, 0, SIZE, SIZE)
    for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] > 150 && d[i + 2] < 140) { m.data[i] = m.data[i + 1] = m.data[i + 2] = 255 }
    gx.putImageData(m, 0, 0)
  }
  // The numbers are never glossy: fully rough, not metal, out of every shine layer (after the filigree, which is gold)
  for (const draw of numbers) { draw(gr, '#ffffff'); draw(gx, '#000000'); draw(gs, '#000000') }
  const texture = (el: HTMLCanvasElement, srgb = true) => {
    const t = new THREE.CanvasTexture(el)
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2))
  const params = look.material
  const shineMask = texture(shine, false)
  const material = new THREE.MeshPhysicalMaterial({
    map: texture(map),
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture(glow),
    ...(look.height || look.inkCut ? { normalMap: texture(normalsFrom(height, 2.2), false), normalScale: new THREE.Vector2(0.9, 0.9) } : {}),
    ...params,
    // The masks hold the values (they multiply these)
    roughness: 1, roughnessMap: texture(rough, false),
    metalness: 1, metalnessMap: texture(metal, false),
    ...(params.clearcoat ? { clearcoatMap: shineMask } : {}),
    ...(params.sheen ? { sheenColorMap: shineMask } : {}),
    ...(params.iridescence ? { iridescenceMap: shineMask } : {}),
  })
  const assets = { geometry, material, faces: mesh.faces, inradius: mesh.inradius }
  cache.set(key, assets)
  return assets
}
