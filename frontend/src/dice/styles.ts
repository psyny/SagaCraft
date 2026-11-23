/**
 * The dice styles a member picks (Saga → User): textures painted on canvases (the base, the numbers, the glow, a
 * height field turned into a normal map) and three.js materials, always led by the member's colour. A die's assets are
 * built once per style, colour, shape and part (cached). See docs/concepts/stages.md ("Dice roller").
 *
 * Numbers are never glossy, whatever the style: masks take them out of the shine (roughness 1, no metal, no clear coat,
 * sheen or iridescence), so no highlight hides them; and they glow a little (NUMBER_GLOW) to stay readable in shade.
 */
import * as THREE from 'three'
import { bestInk, hexToRgb, hslToRgb, inkOn, luminance, mix, readableComplement, rgbToHex, rgbToHsl, shade, vividComplement } from '../color/theory'
import { atlasCols, cellOf, dieMesh, faceLabel, type MeshOptions, type Vec } from './geometry'
import { agate, edgeRunes, gear, hexSigil, marble, roots, scrimshaw, smoke, speckled, splatter, type Pt } from './painters'
import { seeded } from './physics'

export const DIE_STYLES: [string, string, string][] = [
  ['minimal', 'Minimalist', 'Your colour, a little glossy, rounded edges; numbers in a bold complementary colour.'],
  ['ember', 'Ember', 'Black stone with cracks glowing in your colour\'s complement; the numbers glow in your colour.'],
  ['metal', 'Metal', 'Brushed, very reflective metal in your colour; black or white numbers.'],
  ['raw_wood', 'Raw wood', 'Light raw wood grain; numbers in your colour.'],
  ['polished_wood', 'Polished wood', 'Dark varnished wood; numbers inlaid in your colour.'],
  ['noble', 'Noble', 'Deep lacquer of your colour, gold filigree, gold numbers.'],
  ['elven', 'Elven', 'Black or white (against your colour), slender; runes written along its edges and numbers in your colour.'],
  ['dwarven', 'Dwarven', 'Heavy iron, thick bevels and rivets; runic numbers filled with your colour.'],
  ['orcish', 'Orcish', 'Matte in your colour, a hacked lump splattered with glossy blood in its complement; black or white numbers.'],
  ['nature', 'Nature', 'Dark earth wound with roots of your colour; cream numbers.'],
  ['neon', 'Neon', 'Matte black; the edges and the numbers glow in your colour.'],
  ['marble', 'Marble', 'Polished marble of your colour with dark veins; black or white numbers.'],
  ['granite', 'Granite', 'Polished granite flecked with your colour, black and white.'],
  ['cobble', 'Cobblestone', 'Grey stone, rough as cement and cobbles; numbers carved and filled with your colour.'],
  ['agate', 'Agate', 'Banded agate in shades of your colour, glossy; black or white numbers.'],
  ['hex', 'Hex', 'Matte in your colour; each number inside a hex sigil, both in its complement.'],
  ['glass', 'Glass', 'Clear glass tinted with your colour; solid numbers in your colour.'],
  ['sanded_glass', 'Sanded glass', 'Frosted glass of your colour, grainy like sea glass; white etched numbers.'],
  ['gnomish', 'Gnomish', 'Copper clockwork, gears and rivets; numbers glowing in your colour.'],
  ['jelly', 'Jelly', 'A wobbly gel: smoky shades of your colour, glossy, with glowing sparkles; numbers in its complement.'],
  ['cosmic', 'Cosmic', 'Deep space: nebulae of your colour and stars; glowing numbers.'],
  ['bone', 'Bone', 'Carved bone with scrimshaw in your colour; sepia numbers.'],
]

/** Paints a cell: x, y and s (its size) in atlas px; `plain`: the cell for edges and corners; `outline`: the face's
 *  polygon in atlas px (numbered faces). */
type Painter = (g: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, plain: boolean, outline?: Pt[]) => void

interface Look {
  mesh: MeshOptions
  font: string
  /** Paints a cell's base (the whole atlas is painted cell by cell). */
  base: Painter
  /** Height field (white high, black low) for the normal map, or none. */
  height?: Painter
  /** Glow (the emissive map), or none. */
  glow?: Painter
  /** Gloss by area (the roughness map, starting at the material's roughness: darker is glossier), or none. It gets
   *  the same random numbers as `base`, so it can follow what base painted. */
  rough?: Painter
  /** See-through: the body's opacity (the edges' too), optionally painted; numbers are always solid. */
  alpha?: { body: number; edges?: number; paint?: Painter }
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
  const blood = vividComplement(c)
  const hexSign = vividComplement(c) // the sigil: the colour's complement
  const hexInk = inkOn(hexSign, c, 2.2) // the numbers: the complement, pushed (a little) until it reads
  const stone = mix(c, '#efece6', 0.55) // marble: the colour, pale
  // Elven: a black or white body against the colour (the colour reads on it)
  const elfDark = bestInk(c) === '#000000' ? luminance(c) > 0.2 : false
  const elf = { body: elfDark ? '#121014' : '#f1eee8', ink: elfDark ? lit : inkOn(c, '#f1eee8', 3), dark: elfDark }
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
      // Black or white against the colour; runes of the colour written along each face's edges, numbers in the colour
      mesh: { chamfer: 0.02, scale: [0.9, 1.14, 0.9] as Vec }, font: 'italic 600 {size}px "Palatino Linotype", Palatino, serif', ink: elf.ink,
      base: (g, x, y, s, rnd, plain, outline) => {
        g.fillStyle = elf.body; g.fillRect(x, y, s, s)
        if (plain || !outline) return
        edgeRunes(g, outline, [x + s / 2, y + s / 2], rnd, elf.ink, s)
      },
      material: elf.dark
        ? { roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.15 }
        : { roughness: 0.28, metalness: 0, clearcoat: 0.6, sheen: 1, sheenColor: new THREE.Color(c), sheenRoughness: 0.5, iridescence: 0.35, iridescenceIOR: 1.4 },
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
      // Matte in the colour, hacked into a lump, splattered with glossy blood in the colour's complement
      mesh: { chamfer: 0.04, rough: 0.08 }, font: '900 {size}px Impact, "Arial Black", sans-serif', ink: bestInk(c), hacked: true, inkCut: true,
      base: (g, x, y, s, rnd) => {
        g.fillStyle = c; g.fillRect(x, y, s, s)
        noise(g, x, y, s, rnd, shade(c, -0.35), 40, s * 0.08, 0.25)
        splatter(g, x, y, s, rnd, blood)
      },
      rough: (g, x, y, s, rnd) => {
        noise(g, x, y, s, rnd, '#000000', 40, s * 0.08, 0) // the same random numbers as base, nothing painted
        splatter(g, x, y, s, rnd, '#262626') // the blood is glossy
      },
      height: (g, x, y, s, rnd) => { g.fillStyle = '#808080'; g.fillRect(x, y, s, s); noise(g, x, y, s, rnd, '#5a5a5a', 70, s * 0.07, 0.5) },
      material: { roughness: 0.92, metalness: 0, clearcoat: 0 },
    },
    nature: {
      // Dark earth wound with roots: lighter roots of the colour, raised; cream numbers with a dark edge
      mesh: { chamfer: 0.18 }, font: 'italic 700 {size}px Georgia, serif', ink: '#f3ecd6', inkCut: true, outlined: '#1d2416',
      base: (g, x, y, s, rnd) => {
        const earth = mix(shade(c, -0.6), '#2e2116', 0.55)
        g.fillStyle = earth; g.fillRect(x, y, s, s)
        noise(g, x, y, s, rnd, shade(earth, -0.4), 70, s * 0.05, 0.45)
        roots(g, x, y, s, rnd, mix(shade(c, -0.05), '#b08a5a', 0.4), 0.035)
        roots(g, x, y, s, rnd, mix(shade(c, 0.25), '#d8b98a', 0.35), 0.016)
      },
      height: (g, x, y, s, rnd) => {
        g.fillStyle = '#707070'; g.fillRect(x, y, s, s)
        noise(g, x, y, s, rnd, '#000000', 70, s * 0.05, 0)
        roots(g, x, y, s, rnd, '#d8d8d8', 0.035)
        roots(g, x, y, s, rnd, '#c0c0c0', 0.016)
      },
      material: { roughness: 0.8, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.6 },
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
    marble: {
      // Polished marble of the colour (pale), dark veins and faint light ones
      mesh: { chamfer: 0.1 }, font: '700 {size}px Georgia, serif', ink: bestInk(stone),
      base: (g, x, y, s, rnd) => marble(g, x, y, s, Math.floor(rnd() * 1e6), stone, shade(c, -0.55), mix(stone, '#ffffff', 0.5)),
      material: { roughness: 0.2, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.08 },
    },
    granite: {
      // Polished granite: grey, flecks of black, white and the colour
      mesh: { chamfer: 0.08 }, font: '800 {size}px system-ui, sans-serif', ink: '#f4f1ec',
      base: (g, x, y, s, rnd) => speckled(g, x, y, s, Math.floor(rnd() * 1e6), '#6d6a68', [
        { color: '#1a1918', share: 0.3, size: 60 }, { color: '#e8e4de', share: 0.18, size: 70 }, { color: c, share: 0.22, size: 45 },
      ], 0.12),
      material: { roughness: 0.25, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.12 },
    },
    cobble: {
      // Grey stone like cement and cobbles: grainy, pitted, rough; carved numbers filled with the colour
      mesh: { chamfer: 0.2, rough: 0.03 }, font: '900 {size}px system-ui, sans-serif', ink: inkOn(c, '#8b8986', 3), inkCut: true,
      base: (g, x, y, s, rnd) => speckled(g, x, y, s, Math.floor(rnd() * 1e6), mix('#8b8986', c, 0.08), [
        { color: '#5f5d5a', share: 0.25, size: 90 }, { color: '#b5b2ad', share: 0.2, size: 110 },
      ], 0.3),
      height: (g, x, y, s, rnd) => { g.fillStyle = '#808080'; g.fillRect(x, y, s, s); noise(g, x, y, s, rnd, '#4a4a4a', 160, s * 0.03, 0.7); cracks(g, x, y, s, rnd, '#505050', 3, s * 0.008) },
      material: { roughness: 0.96, metalness: 0 },
    },
    agate: {
      // Banded agate: rings in shades of the colour, glossy
      mesh: { chamfer: 0.1 }, font: '800 {size}px system-ui, sans-serif', ink: bestInk(c),
      base: (g, x, y, s, rnd) => agate(g, x, y, s, Math.floor(rnd() * 1e6), [shade(c, -0.35), c, mix(c, '#ffffff', 0.55), shade(c, 0.2), shade(c, -0.15)]),
      material: { roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 },
    },
    hex: {
      // Matte in the colour; each number inside a hex sigil, both in its complement
      mesh: { chamfer: 0.08 }, font: '700 {size}px "Trebuchet MS", system-ui, sans-serif', ink: hexInk,
      base: (g, x, y, s, _rnd, plain) => {
        g.fillStyle = c; g.fillRect(x, y, s, s)
        if (!plain) hexSigil(g, x + s / 2, y + s / 2, s * 0.24, hexSign)
      },
      material: { roughness: 0.9, metalness: 0 },
    },
    glass: {
      // Clear glass tinted with the colour: see-through, glossy; solid numbers in the colour
      mesh: { chamfer: 0.06 }, font: '700 {size}px system-ui, sans-serif', ink: lit,
      base: (g, x, y, s, _rnd, plain) => {
        g.fillStyle = plain ? mix(c, '#ffffff', 0.35) : mix(c, '#ffffff', 0.2); g.fillRect(x, y, s, s)
        if (plain) return
        // A light catching the glass: a soft bright streak across the face
        const grad = g.createLinearGradient(x, y, x + s, y + s)
        grad.addColorStop(0.25, 'rgba(255,255,255,0)'); grad.addColorStop(0.4, 'rgba(255,255,255,0.35)'); grad.addColorStop(0.55, 'rgba(255,255,255,0)')
        g.fillStyle = grad; g.fillRect(x, y, s, s)
      },
      glow: (g, x, y, s) => { g.fillStyle = shade(c, -0.55); g.fillRect(x, y, s, s) }, // a faint inner light: the tint shows on dark tables
      alpha: { body: 0.5, edges: 0.85 },
      material: { roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.25, iridescenceIOR: 1.5, emissiveIntensity: 0.6 },
    },
    sanded_glass: {
      // Frosted, sea-worn glass of the colour: grainy, half see-through; white etched numbers
      mesh: { chamfer: 0.16 }, font: '700 {size}px system-ui, sans-serif', ink: '#ffffff',
      base: (g, x, y, s, rnd) => { g.fillStyle = mix(c, '#ffffff', 0.25); g.fillRect(x, y, s, s); noise(g, x, y, s, rnd, '#ffffff', 900, s * 0.006, 0.5) },
      alpha: {
        body: 0.7, edges: 0.85,
        paint: (g, x, y, s, rnd) => noise(g, x, y, s, rnd, '#ffffff', 900, s * 0.006, 0.4), // the sanded grain is more opaque
      },
      material: { roughness: 0.85, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.8 },
    },
    gnomish: {
      // Copper clockwork: gears and rivets, raised; numbers glowing in the colour
      mesh: { chamfer: 0.1 }, font: '800 {size}px "Courier New", monospace', ink: lit, inkGlow: true,
      base: (g, x, y, s, rnd, plain) => {
        g.fillStyle = '#b06a36'; g.fillRect(x, y, s, s)
        noise(g, x, y, s, rnd, '#4e8a72', 30, s * 0.05, 0.25) // verdigris
        noise(g, x, y, s, rnd, '#7a4420', 80, s * 0.04, 0.35)
        if (plain) return
        for (let k = 0; k < 3; k++) {
          gear(g, x + s * (0.15 + rnd() * 0.7), y + s * (0.15 + rnd() * 0.7), s * (0.08 + rnd() * 0.12), 8 + Math.floor(rnd() * 6), '#6e3c1a', rnd() * 3, '#c07a44')
        }
        g.fillStyle = '#e0a070'
        for (const [px, py] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) { g.beginPath(); g.arc(x + px * s, y + py * s, s * 0.025, 0, Math.PI * 2); g.fill() }
      },
      height: (g, x, y, s, rnd, plain) => {
        g.fillStyle = '#808080'; g.fillRect(x, y, s, s)
        noise(g, x, y, s, rnd, '#000000', 30, s * 0.05, 0); noise(g, x, y, s, rnd, '#000000', 80, s * 0.04, 0)
        if (plain) return
        for (let k = 0; k < 3; k++) gear(g, x + s * (0.15 + rnd() * 0.7), y + s * (0.15 + rnd() * 0.7), s * (0.08 + rnd() * 0.12), 8 + Math.floor(rnd() * 6), '#d0d0d0', rnd() * 3, '#a8a8a8')
      },
      material: { roughness: 0.38, metalness: 0.85 },
    },
    jelly: {
      // A gel: smoky shades of the colour (and its neighbours in hue), very glossy, a little see-through, glowing sparkles
      mesh: { chamfer: 0.26 }, font: '800 {size}px "Trebuchet MS", system-ui, sans-serif', ink: readableComplement(c),
      base: (g, x, y, s, rnd) => {
        smoke(g, x, y, s, Math.floor(rnd() * 1e6), [shade(hue(c, -18), -0.2), c, shade(hue(c, 14), 0.15), shade(c, -0.1)], 2.2)
        sparkles(g, x, y, s, rnd, mix(c, '#ffffff', 0.75))
      },
      glow: (g, x, y, s, rnd) => {
        rnd() // the same random numbers as base (its smoke took one)
        sparkles(g, x, y, s, rnd, mix(c, '#ffffff', 0.75))
      },
      alpha: { body: 0.82, edges: 0.9 },
      material: { roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.85 },
    },
    cosmic: {
      // Deep space: nebulae of the colour and its complement, stars (glowing); numbers glowing pale
      mesh: { chamfer: 0.12 }, font: '700 {size}px Georgia, serif', ink: mix(lit, '#ffffff', 0.55), inkGlow: true,
      base: (g, x, y, s, rnd) => {
        smoke(g, x, y, s, Math.floor(rnd() * 1e6), ['#05040a', shade(c, -0.6), '#08060f', shade(vividComplement(c), -0.55), '#05040a'], 2)
        stars(g, x, y, s, rnd, '#ffffff')
      },
      glow: (g, x, y, s, rnd) => { rnd(); stars(g, x, y, s, rnd, '#ffffff') },
      material: { roughness: 0.35, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.1, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1 },
    },
    bone: {
      // Carved bone: ivory with a grain, scrimshaw etched in the colour, sepia numbers cut in
      mesh: { chamfer: 0.16, rough: 0.02 }, font: '700 {size}px Georgia, serif', ink: '#3b2a1a', inkCut: true,
      base: (g, x, y, s, rnd, plain) => {
        g.fillStyle = '#e6dbc2'; g.fillRect(x, y, s, s)
        grain(g, x, y, s, rnd, '#c9b994', 14, s * 0.005)
        noise(g, x, y, s, rnd, '#b8a47e', 40, s * 0.02, 0.4)
        if (!plain) scrimshaw(g, x, y, s, rnd, shade(c, -0.15))
      },
      material: { roughness: 0.6, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.4 },
    },
  }
}

/** A hue turned by some degrees. */
function hue(color: string, degrees: number): string {
  const [h, s, l] = rgbToHsl(hexToRgb(color))
  return rgbToHex(hslToRgb([(h + degrees + 360) % 360, s, l]))
}

/** Sparkles: small bright dots with a soft halo. */
function sparkles(g: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, color: string) {
  g.save()
  g.fillStyle = color
  for (let k = 0; k < 26; k++) {
    const px = x + rnd() * s, py = y + rnd() * s, r = s * (0.004 + rnd() * 0.008)
    g.globalAlpha = 0.5 + rnd() * 0.5
    g.shadowColor = color; g.shadowBlur = r * 3
    g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill()
  }
  g.restore()
}

/** Stars: many tiny dots, a few brighter with a cross. */
function stars(g: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, color: string) {
  g.save()
  g.fillStyle = color
  g.strokeStyle = color
  for (let k = 0; k < 70; k++) {
    const px = x + rnd() * s, py = y + rnd() * s, r = s * (0.0015 + rnd() * 0.003)
    g.globalAlpha = 0.4 + rnd() * 0.6
    g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill()
  }
  for (let k = 0; k < 4; k++) {
    const px = x + rnd() * s, py = y + rnd() * s, r = s * (0.02 + rnd() * 0.02)
    g.globalAlpha = 0.9; g.lineWidth = s * 0.003
    g.beginPath(); g.moveTo(px - r, py); g.lineTo(px + r, py); g.moveTo(px, py - r); g.lineTo(px, py + r); g.stroke()
  }
  g.restore()
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
  // See-through styles: the opacity (the body's, the edges', solid numbers)
  const [alphaMap, ga] = canvas(gray(look.alpha?.body ?? 1))
  const numbers: ((g: CanvasRenderingContext2D, color: string) => void)[] = []
  for (let i = 0; i < mesh.cells; i++) {
    const { u, v } = cellOf(i, cols)
    const x = u * SIZE, y = (1 - v) * SIZE - cell
    const plain = i === mesh.cells - 1
    const rnd = seeded(i * 97 + sides)
    const outline = plain ? undefined : mesh.outlines[i].map(([px, py]) => [x + cell / 2 + px * 0.48 * cell, y + cell / 2 - py * 0.48 * cell] as const)
    look.base(gm, x, y, cell, rnd, plain, outline)
    // The other maps get the same random numbers as the base, so what's raised, glossy or glowing follows what's painted
    look.rough?.(gr, x, y, cell, seeded(i * 97 + sides), plain, outline)
    look.height?.(gh, x, y, cell, seeded(i * 97 + sides), plain, outline)
    look.glow?.(gg, x, y, cell, seeded(i * 97 + sides), plain, outline)
    if (look.alpha) {
      if (plain) { ga.fillStyle = gray(look.alpha.edges ?? look.alpha.body); ga.fillRect(x, y, cell, cell) }
      look.alpha.paint?.(ga, x, y, cell, seeded(i * 71 + 5), plain, outline)
    }
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
  for (const draw of numbers) { draw(gr, '#ffffff'); draw(gx, '#000000'); draw(gs, '#000000'); if (look.alpha) draw(ga, '#ffffff') }
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
    // See-through (glass, jelly): the opacity map; numbers solid
    ...(look.alpha ? { transparent: true, alphaMap: texture(alphaMap, false), opacity: 1 } : {}),
  })
  const assets = { geometry, material, faces: mesh.faces, inradius: mesh.inradius }
  cache.set(key, assets)
  return assets
}
