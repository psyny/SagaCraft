/**
 * The dice styles a member picks (Saga → User): textures painted on canvases (the base, the numbers, the glow, a
 * height field turned into a normal map) and three.js materials, always led by the member's colour. A die's assets are
 * built once per style, colour, shape and part (cached). See docs/concepts/stages.md ("Dice roller").
 *
 * Numbers are never glossy, whatever the style: masks take them out of the shine (roughness 1, no metal, no clear coat,
 * sheen or iridescence) and the shader takes away their specular (dice/surfaces.ts), so no highlight hides them; they
 * glow a little (NUMBER_GLOW) to stay readable in shade, and they're debossed: cut into the surface (the normal map).
 *
 * Styles with a `surface` (metals, gels, stones, weave...) aren't painted per face: their material is worked out from
 * the point's place on the die (dice/surfaces.ts), one unbroken texture over faces, edges and corners.
 */
import * as THREE from 'three'
import { bestInk, hexToRgb, hslToRgb, inkOn, luminance, mix, readableComplement, rgbToHex, rgbToHsl, shade, vividComplement } from '../color/theory'
import { atlasCols, cellOf, dieMesh, faceLabel, type MeshOptions, type Vec } from './geometry'
import { agate, arcaneSeal, edgeRunes, gear, marble, roots, scrimshaw, speckled, type Pt } from './painters'
import { seeded } from './physics'
import { applyDieShader, type Surface } from './surfaces'

/** The styles, grouped by context (the picker shows each group under its name): key, name, what it looks like, group. */
export const DIE_STYLES: [string, string, string, string][] = [
  // Classic
  ['minimal', 'Minimalist', 'Your colour, a little glossy, rounded edges; numbers in a bold complementary colour.', 'Classic'],
  ['glass', 'Glass', 'Clear glass tinted with your colour; solid numbers in your colour.', 'Classic'],
  ['jelly', 'Jelly', 'A wobbly gel: smoky shades of your colour, glossy, with glowing sparkles; numbers in its complement.', 'Classic'],
  ['neon', 'Neon', 'Matte black; the edges glow in a shade of your colour, the numbers in your colour.', 'Classic'],
  // Regal
  ['noble', 'Noble', 'Satin lacquer of your colour, polished gold filigree and edges; gold numbers.', 'Regal'],
  ['aristocrat', 'Aristocrat', 'Satin lacquer of your colour, polished silver filigree and edges; silver numbers.', 'Regal'],
  ['guild', 'Guild', 'Satin lacquer of your colour, filigree and edges of polished metal in its complement; numbers to match.', 'Regal'],
  // Metal
  ['metal_matte', 'Matte metal', 'Metal of your colour with a soft, diffuse sheen; numbers cut in, black or white.', 'Metal'],
  ['metal_satin', 'Satin metal', 'Metal of your colour with a smooth satin lustre; numbers cut in, black or white.', 'Metal'],
  ['metal_polished', 'Polished metal', 'Mirror-polished metal of your colour, no texture; numbers cut in, black or white.', 'Metal'],
  ['metal_hammered', 'Hammered metal', 'Metal of your colour beaten into dimples that catch the light; numbers cut in, black or white.', 'Metal'],
  ['metal', 'Brushed metal', 'Metal of your colour brushed in fine streaks; numbers cut in, black or white.', 'Metal'],
  ['metal_rusted', 'Rusted metal', 'Metal of your colour eaten by raised, rough rust; numbers cut in, black or white.', 'Metal'],
  ['carbon', 'Carbon fiber', 'Woven carbon fiber of your colour under a resin coat.', 'Metal'],
  // Natural
  ['raw_wood', 'Raw wood', 'Light raw wood grain; numbers in your colour.', 'Natural'],
  ['polished_wood', 'Polished wood', 'Dark varnished wood; numbers inlaid in your colour.', 'Natural'],
  ['nature', 'Nature', 'Dark earth wound with roots of your colour; cream numbers.', 'Natural'],
  ['bone', 'Bone', 'Carved bone with scrimshaw in your colour; sepia numbers.', 'Natural'],
  // Gems
  ['marble', 'Marble', 'Polished marble of your colour with dark veins; black or white numbers.', 'Gems'],
  ['granite', 'Granite', 'Polished granite flecked with your colour, black and white.', 'Gems'],
  ['agate', 'Agate', 'Banded agate in shades of your colour, glossy; black or white numbers.', 'Gems'],
  ['charoite', 'Charoite', 'Polished charoite: silky, swirling fibres of your colour with white and black streaks.', 'Gems'],
  ['amber', 'Amber', 'Warm, almost see-through amber of your colour, low contrast, with tiny bubbles.', 'Gems'],
  ['crystal', 'Crystal', 'A cut gem of your colour: facets that flash as it turns.', 'Gems'],
  ['iridescent', 'Iridescent', 'A beetle\'s shell: your colour, shifting to other hues as it turns.', 'Gems'],
  // Folk
  ['elven', 'Elven', 'Black or white (against your colour), slender; runes written along its edges and numbers in your colour.', 'Folk'],
  ['dwarven', 'Dwarven', 'Heavy iron, thick bevels and rivets; runic numbers filled with your colour.', 'Folk'],
  ['gnomish', 'Gnomish', 'Copper clockwork, gears and rivets; numbers glowing in your colour.', 'Folk'],
  ['orcish', 'Orcish', 'A hacked lump of scratched hide in your colour, splashed with wet blood in its complement (drips, droplets) over old stains.', 'Folk'],
  // Arcane
  ['ember', 'Ember', 'Black stone with cracks glowing in your colour\'s complement; the numbers glow in your colour.', 'Arcane'],
  ['hellish', 'Hellish', 'Very dark purple marble cracked with veins glowing in a shade of your colour; glowing numbers, clear of cracks.', 'Arcane'],
  ['fire', 'Fire', 'Burning: tongues of flame in your colour climbing a charred die, white-hot at their cores; white-hot numbers.', 'Arcane'],
  ['hex', 'Hex', 'A wizard\'s die: your colour turned and darkened, glowing seals of circles and triangles on every face; numbers glowing in your colour.', 'Arcane'],
  ['cosmic', 'Cosmic', 'Deep space: nebulae of your colour and stars; glowing numbers.', 'Arcane'],
]

/** The groups, in order (only the picker uses them: a member's style is just its key). */
export const DIE_STYLE_GROUPS = [...new Set(DIE_STYLES.map(([, , , group]) => group))]

/** Paints a cell: x, y and s (its size) in atlas px; `plain`: the cell for edges and corners; `outline`: the face's
 *  polygon in atlas px (numbered faces). */
type Painter = (g: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, plain: boolean, outline?: Pt[]) => void

interface Look {
  mesh: MeshOptions
  font: string
  /** Paints a cell's base (the whole atlas is painted cell by cell); or a `surface` instead. */
  base?: Painter
  /** One material over the whole die, worked out on the graphics card (dice/surfaces.ts): no base, no edge cell. */
  surface?: Surface
  /** Height field (white high, black low) for the normal map, or none. */
  height?: Painter
  /** Glow (the emissive map), or none. */
  glow?: Painter
  /** Gloss by area (the roughness map, starting at the material's roughness: darker is glossier), or none. It gets
   *  the same random numbers as `base`, so it can follow what base painted. */
  rough?: Painter
  /** Metal by area (the metalness map, starting at the material's metalness: white is metal), or none. Same random
   *  numbers as `base`. */
  metal?: Painter
  /** See-through: the body's opacity (the edges' too), optionally painted; numbers are always solid. */
  alpha?: { body: number; edges?: number; paint?: Painter }
  ink: string
  /** Numbers also glow (fully, not just a little). */
  inkGlow?: boolean
  material: THREE.MeshPhysicalMaterialParameters
  /** Numbers hacked in (rough, doubled strokes) / with an edge darkening what's around them by half (they read on busy
   *  faces; a darken filter in the shader, not a painted line). */
  hacked?: boolean
  outlined?: boolean
  /** How the numbers are cut in: a soft wall (default), a hard one, or not at all (glowing numbers never are). */
  deboss?: 'soft' | 'hard' | 'none'
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
  const shifted = hue(lit, 90) // the colour's hue turned 90° (Neon's edges, Hellish's cracks)
  const wizardBody = shade(hue(c, 90), -0.5) // Hex: the colour turned 90°, at half its brightness
  const wizardSign = hue(lit, 90) // its seals: the colour turned 90°, glowing
  const stone = mix(c, '#efece6', 0.55) // marble: the colour, pale
  const metalTint = shade(c, 0.15) // metal of the colour, a little brighter (it's lit by its reflections)
  // Regal: a satin-matte lacquer of the colour, the filigree and the edges of polished metal (a blend of materials)
  const regal = (metalColor: string, ink: string): Look => ({
    mesh: { chamfer: 0.1 }, font: 'italic 700 {size}px Georgia, serif', ink,
    base: (g, x, y, s, _rnd, plain) => { g.fillStyle = shade(c, -0.45); g.fillRect(x, y, s, s); filigree(g, x, y, s, plain, metalColor) },
    rough: (g, x, y, s, _rnd, plain) => filigree(g, x, y, s, plain, gray(0.16)),
    metal: (g, x, y, s, _rnd, plain) => filigree(g, x, y, s, plain, '#ffffff'),
    material: { roughness: 0.6, metalness: 0 },
  })
  const metal = (kind: Surface['kind'], roughness: number): Look => ({
    mesh: { chamfer: 0.08 }, font: '800 {size}px system-ui, sans-serif', ink: bestInk(metalTint),
    surface: { kind, colors: [metalTint] }, material: { roughness, metalness: 1 },
  })
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
    hellish: {
      // Very dark purple marble, its cracks glowing in a shade of the colour (its hue turned a little); numbers glowing in the
      // colour, a patch clear of cracks
      mesh: { chamfer: 0.1 }, font: '700 {size}px Georgia, serif', ink: lit, inkGlow: true,
      surface: { kind: 'hellish', colors: ['#0e0517', '#220d33', '#3a1a52', shifted, mix(shifted, '#ffffff', 0.45)] },
      // Satin, a weak reflection: on so dark a body the room's light would wash out a result's face
      material: { roughness: 0.5, metalness: 0, specularIntensity: 0.5 },
    },
    metal_matte: metal('metal_matte', 0.62),
    metal_satin: metal('metal_satin', 0.36),
    metal_polished: metal('metal_polished', 0.09),
    metal_hammered: metal('metal_hammered', 0.22),
    metal: metal('metal_brushed', 0.26), // the first Metal: members who picked it get brushed metal
    metal_rusted: { ...metal('metal_rusted', 0.3), surface: { kind: 'metal_rusted', colors: [metalTint, '#3f180a', '#7e3613', '#bf6a2a'] } },
    carbon: {
      // Tows of the colour woven in a twill, under a glossy resin coat
      mesh: { chamfer: 0.08 }, font: '800 {size}px system-ui, sans-serif', ink: bestInk(shade(c, -0.45)), outlined: bestInk(shade(c, -0.45)) !== '#000000',
      surface: { kind: 'carbon', colors: [c], params: [10] },
      material: { roughness: 0.38, metalness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }, // a soft coat: no glare over a result's number
    },
    raw_wood: {
      mesh: { chamfer: 0.1 }, font: '700 {size}px Georgia, serif', ink: inkOn(c, '#c9ad80', 3.5),
      base: (g, x, y, s, rnd) => { g.fillStyle = '#c9ad80'; g.fillRect(x, y, s, s); grain(g, x, y, s, rnd, '#94703f', 18, s * 0.011) },
      height: (g, x, y, s, rnd) => { g.fillStyle = '#808080'; g.fillRect(x, y, s, s); grain(g, x, y, s, rnd, '#6a6a6a', 16, s * 0.012) },
      material: { roughness: 0.85, metalness: 0 },
    },
    polished_wood: {
      mesh: { chamfer: 0.12 }, font: '700 {size}px Georgia, serif', ink: inkOn(shade(c, 0.15), '#5a321b'), deboss: 'hard',
      base: (g, x, y, s, rnd) => { g.fillStyle = '#5a321b'; g.fillRect(x, y, s, s); grain(g, x, y, s, rnd, '#2e170b', 20, s * 0.012); grain(g, x, y, s, rnd, '#8a5530', 8, s * 0.008) },
      material: { roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 },
    },
    noble: regal('#e2bd62', '#e8c46a'),
    aristocrat: regal('#d6d9df', '#e4e6ea'),
    guild: regal(vividComplement(c), inkOn(vividComplement(c), shade(c, -0.45), 3)),
    elven: {
      // Black or white against the colour; runes of the colour written along each face's edges, numbers in the colour
      mesh: { chamfer: 0.02, scale: [0.9, 1.14, 0.9] as Vec }, font: 'italic 600 {size}px "Palatino Linotype", Palatino, serif', ink: elf.ink, deboss: 'none',
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
      mesh: { chamfer: 0.24 }, font: '900 {size}px Impact, "Arial Black", sans-serif', ink: c,
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
      // A hacked lump of mottled, scratched hide in the colour, splashed with fresh liquid in its complement (glossy,
      // raised, drips and droplets) over old dried stains, all over its faces and edges; black or white hacked numbers
      mesh: { chamfer: 0.04, rough: 0.08 }, font: '900 {size}px Impact, "Arial Black", sans-serif', ink: bestInk(c), hacked: true,
      surface: { kind: 'orcish', colors: [c, blood, mix(shade(blood, -0.6), '#2a1a10', 0.35)] },
      material: { roughness: 0.92, metalness: 0 },
    },
    nature: {
      // Dark earth wound with roots: lighter roots of the colour, raised; cream numbers with a dark edge
      mesh: { chamfer: 0.18 }, font: 'italic 700 {size}px Georgia, serif', ink: '#f3ecd6', outlined: true,
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
      // Matte black; the edges and corners (the chamfer) and a soft rim inside each face glow in a shade of the colour (its
      // hue turned a little), the numbers in the colour
      mesh: { chamfer: 0.09 }, font: '600 {size}px "Avenir Next", "Segoe UI", system-ui, sans-serif', ink: lit, inkGlow: true, rim: shifted,
      base: (g, x, y, s, rnd, plain) => {
        g.fillStyle = plain ? shifted : '#0a0a0c'; g.fillRect(x, y, s, s)
        if (!plain) noise(g, x, y, s, rnd, '#16161a', 50, s * 0.04, 0.5)
      },
      glow: (g, x, y, s, _rnd, plain) => { if (plain) { g.fillStyle = shifted; g.fillRect(x, y, s, s) } },
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
    agate: {
      // Banded agate: rings in shades of the colour, glossy
      mesh: { chamfer: 0.1 }, font: '800 {size}px system-ui, sans-serif', ink: bestInk(c),
      base: (g, x, y, s, rnd) => agate(g, x, y, s, Math.floor(rnd() * 1e6), [shade(c, -0.35), c, mix(c, '#ffffff', 0.55), shade(c, 0.2), shade(c, -0.15)]),
      material: { roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 },
    },
    fire: {
      // Burning: a charred body, tongues of flame in the colour climbing each face towards its number's top, hotter
      // towards their cores; numbers white-hot in a patch the flames leave clear
      mesh: { chamfer: 0.1 }, font: '800 {size}px Georgia, serif', ink: mix(lit, '#ffffff', 0.65), inkGlow: true,
      surface: { kind: 'fire', colors: [shade(c, -0.85), lit, mix(hue(lit, 25), '#ffffff', 0.3), mix(hue(lit, 40), '#ffffff', 0.8)] },
      material: { roughness: 0.8, metalness: 0 },
    },
    hex: {
      // A wizard's die: the colour turned 90° and darkened; on each face a glowing seal in the turned colour (a frame along
      // its edges, circles, runic marks, corner seals); numbers glowing in the colour
      mesh: { chamfer: 0.08 }, font: '700 {size}px "Trebuchet MS", system-ui, sans-serif', ink: lit, inkGlow: true,
      base: (g, x, y, s, _rnd, plain, outline) => {
        g.fillStyle = wizardBody; g.fillRect(x, y, s, s)
        if (!plain && outline) arcaneSeal(g, outline, [x + s / 2, y + s / 2], wizardSign)
      },
      glow: (g, x, y, s, _rnd, plain, outline) => {
        if (!plain && outline) { g.save(); g.globalAlpha = 0.8; arcaneSeal(g, outline, [x + s / 2, y + s / 2], wizardSign, 0.025); g.restore() }
      },
      material: { roughness: 0.7, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.4 },
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
      surface: {
        kind: 'jelly', params: [1.8], alpha: 0.82,
        colors: [shade(hue(c, -18), -0.2), c, shade(hue(c, 14), 0.15), shade(c, -0.1), mix(c, '#ffffff', 0.75)],
      },
      material: { roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 },
    },
    cosmic: {
      // Deep space: nebulae of the colour and its complement, stars (glowing); numbers glowing pale
      mesh: { chamfer: 0.12 }, font: '700 {size}px Georgia, serif', ink: mix(lit, '#ffffff', 0.55), inkGlow: true,
      surface: { kind: 'cosmic', params: [1.6], colors: ['#05040a', shade(c, -0.6), '#08060f', shade(vividComplement(c), -0.55), '#05040a'] },
      material: { roughness: 0.35, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.1 },
    },
    charoite: {
      // Polished charoite: swirls of silky fibres in shades of the colour, white and black streaks, glossy
      mesh: { chamfer: 0.1 }, font: '700 {size}px Georgia, serif', ink: bestInk(c), outlined: bestInk(c) !== '#000000',
      surface: { kind: 'charoite', colors: [shade(c, -0.55), shade(c, -0.15), mix(c, '#ffffff', 0.35), mix(c, '#f6f2f8', 0.8), '#120c14'] },
      material: { roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 },
    },
    amber: {
      // Amber of the colour: warm, low-contrast flows, almost see-through, a few bubbles, a soft light inside
      mesh: { chamfer: 0.14 }, font: '700 {size}px Georgia, serif', ink: bestInk(c),
      surface: { kind: 'amber', alpha: 0.7, colors: [shade(vivid(c), -0.4), shade(vivid(c), -0.15), mix(vivid(c), '#ffffff', 0.2), mix(c, '#ffffff', 0.6)] },
      material: { roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 },
    },
    crystal: {
      // A cut gem: facets tilted every way catch the light and flash; lighter cuts between them; half see-through
      mesh: { chamfer: 0.09 }, font: '700 {size}px system-ui, sans-serif', ink: bestInk(shade(c, -0.45)), outlined: bestInk(shade(c, -0.45)) !== '#000000',
      surface: { kind: 'crystal', params: [170], alpha: 0.8, colors: [shade(c, -0.25), mix(c, '#ffffff', 0.6)] },
      material: { roughness: 0.03, metalness: 0.75, ior: 2.4 }, // no clear coat: it would lie flat over the facets
    },
    iridescent: {
      // A beetle's shell: the colour facing you, other hues as the surface turns away (goniochromism), fine pits
      mesh: { chamfer: 0.12 }, font: '700 {size}px system-ui, sans-serif', ink: bestInk(c), outlined: bestInk(c) !== '#000000',
      surface: { kind: 'iridescent', colors: [vivid(c), vivid(hue(c, 45)), vivid(hue(c, 95))] },
      material: { roughness: 0.18, metalness: 0.9, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.5, iridescenceIOR: 1.6 },
    },
    bone: {
      // Carved bone: ivory with a grain, scrimshaw etched in the colour, sepia numbers cut in
      mesh: { chamfer: 0.16, rough: 0.02 }, font: '700 {size}px Georgia, serif', ink: '#3b2a1a',
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

/** The colour made vivid (saturated, mid-light): a beetle's shell. */
function vivid(color: string): string {
  const [h, s, l] = rgbToHsl(hexToRgb(color))
  return rgbToHex(hslToRgb([h, Math.max(s, 0.75), Math.min(0.55, Math.max(l, 0.35))]))
}

/** Regal filigree: a ring and a garland of small arcs around the face; the plain cell (edges and corners) all of it. */
function filigree(g: CanvasRenderingContext2D, x: number, y: number, s: number, plain: boolean, color: string) {
  g.save()
  if (plain) { g.fillStyle = color; g.fillRect(x, y, s, s); g.restore(); return }
  g.strokeStyle = color; g.lineWidth = s * 0.018
  g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.4, 0, Math.PI * 2); g.stroke()
  g.lineWidth = s * 0.008
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    g.beginPath(); g.arc(x + s / 2 + Math.cos(a) * s * 0.43, y + s / 2 + Math.sin(a) * s * 0.43, s * 0.03, a, a + Math.PI); g.stroke()
  }
  g.restore()
}

/** A hue turned by some degrees. */
function hue(color: string, degrees: number): string {
  const [h, s, l] = rgbToHsl(hexToRgb(color))
  return rgbToHex(hslToRgb([(h + degrees + 360) % 360, s, l]))
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

/** The direction of the die's farthest point (a corner): where a surface's frame turns (dice/surfaces.ts). */
function cornerOf(positions: Float32Array): THREE.Vector3 {
  const at = new THREE.Vector3(0, 1, 0)
  let far = 0
  for (let i = 0; i < positions.length; i += 3) {
    const l = Math.hypot(positions[i], positions[i + 1], positions[i + 2])
    if (l > far + 1e-6) { far = l; at.set(positions[i], positions[i + 1], positions[i + 2]).normalize() }
  }
  return at
}

export interface DieAssets {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  faces: { value: number; normal: Vec; up: Vec }[]
  inradius: number
}

const cache = new Map<string, DieAssets>()

/** A die's geometry and material for a style and colour (a d100's part: 'tens' or 'units'). `simple` (the member's
 *  setting): a plain die in the colour, whatever the style: its numbers on a light material, no relief, maps or
 *  shader work (the lightest to draw and to build). */
export function dieAssets(sides: number, style: string, color: string, part: 'tens' | 'units' | null = null, simple = false): DieAssets {
  const key = `${sides}|${simple ? 'simple' : style}|${color}|${part}`
  const hit = cache.get(key)
  if (hit) return hit
  const look = simple ? looks(color).minimal : looks(color)[style] ?? looks(color).minimal
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
  const surface = look.surface
  const deboss = simple || look.inkGlow ? 'none' : look.deboss ?? 'soft'
  /** A cell-sized canvas drawn in atlas coordinates (its top left at x, y). */
  const offscreen = (side: number, x: number, y: number) => {
    const el = document.createElement('canvas')
    el.width = el.height = side
    const g = el.getContext('2d')!
    g.translate(-x, -y)
    return [el, g] as const
  }
  // A surface style's atlas holds only its numbers (on their own colour, so their edges stay clean). `ink` says where
  // the numbers are (green), a patch around them (red) and their outline (blue)
  const [map, gm] = canvas(surface ? look.ink : undefined)
  const [ink, gi] = canvas('#000000')
  const [glow, gg] = canvas('#000000')
  const [height, gh] = canvas('#808080')
  // Masks (linear): roughness, metalness, and the shine layers (clear coat, sheen, iridescence) where the numbers are off
  const [rough, gr] = canvas(gray(look.material.roughness ?? 1))
  const [metal, gx] = canvas(gray(look.material.metalness ?? 0))
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
    look.base?.(gm, x, y, cell, rnd, plain, outline)
    // The other maps get the same random numbers as the base, so what's raised, glossy or glowing follows what's painted
    look.rough?.(gr, x, y, cell, seeded(i * 97 + sides), plain, outline)
    look.metal?.(gx, x, y, cell, seeded(i * 97 + sides), plain, outline)
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
    const draw = (g: CanvasRenderingContext2D, color: string, blur = 0, alpha = 1, stroke = 0) => {
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
        if (stroke) { g.strokeStyle = color; g.lineWidth = stroke; g.lineJoin = 'round'; g.strokeText(text, 0, 0) }
        if (look.hacked) {
          // Hacked in: a few rough, offset strokes of the same number
          const r = seeded(spot.value * 13 + 5)
          for (let k = 0; k < 3; k++) {
            g.save(); g.translate((r() - 0.5) * size * 0.08, (r() - 0.5) * size * 0.08); g.rotate((r() - 0.5) * 0.12)
            g.globalAlpha = alpha * (k ? 0.55 : 1); g.fillText(text, 0, 0); g.restore()
          }
        } else g.fillText(text, 0, 0)
        if ((text === '6' || text === '9') && sides > 6) {
          g.fillRect(-size * 0.25, size * 0.42, size * 0.5, size * 0.07)
          if (stroke) g.strokeRect(-size * 0.25, size * 0.42, size * 0.5, size * 0.07)
        }
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
    if (deboss !== 'none') {
      // Cut in, everything inside the number (numbers catch no highlight, so its walls shade but never glint):
      // in the height field the number sunk, its walls sloping in from its edge (the normal map; soft or hard), and in
      // the colour map the shade the face around casts into it
      const hard = deboss === 'hard'
      const side = Math.ceil(cell) + 2
      const [hole, gHole] = offscreen(side, x, y) // everything but the number
      gHole.fillStyle = '#000000'; gHole.fillRect(x, y, side, side)
      gHole.globalCompositeOperation = 'destination-out'
      draw(gHole, '#000000')
      /** The number in `color`, with `edge` spreading in from its outline over `blur` px. */
      const inside = (color: string, edge: string, blur: number) => {
        const [el, g] = offscreen(side, x, y)
        draw(g, color)
        g.globalCompositeOperation = 'source-atop'
        g.shadowColor = edge; g.shadowBlur = blur
        g.drawImage(hole, x, y)
        return el
      }
      gh.drawImage(inside('#101010', '#808080', size * (hard ? 0.025 : 0.09)), x, y)
      gm.save(); gm.globalCompositeOperation = 'multiply'
      gm.drawImage(inside('#ffffff', hard ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)', size * (hard ? 0.02 : 0.06)), x, y)
      gm.restore()
    }
    if (look.inkGlow) draw(gg, look.ink, cell * 0.05)
    else draw(gg, look.ink, 0, NUMBER_GLOW) // numbers light themselves a little
    // The numbers' mask: the patch around each (red), its outline (blue, added), the number (white, last)
    draw(gi, '#ff0000', size * 0.18, 1, size * 0.42)
    if (look.outlined) { gi.save(); gi.globalCompositeOperation = 'lighter'; draw(gi, '#0000ff', 0, 1, size * 0.12); gi.restore() }
    numbers.push(draw)
  }
  // The numbers are never glossy: fully rough, not metal, out of every shine layer
  for (const draw of numbers) {
    draw(gr, '#ffffff'); draw(gx, '#000000'); draw(gs, '#000000')
    if (look.alpha) draw(ga, '#ffffff')
    draw(gi, '#ffffff')
  }
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
  geometry.setAttribute('surfUp', new THREE.BufferAttribute(mesh.ups, 3))
  const params = look.material
  if (simple) {
    const plain = { geometry, material: new THREE.MeshStandardMaterial({ map: texture(map), roughness: 0.45, metalness: 0 }),
      faces: mesh.faces, inradius: mesh.inradius }
    cache.set(key, plain)
    return plain
  }
  const shineMask = texture(shine, false)
  const material = new THREE.MeshPhysicalMaterial({
    map: texture(map),
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture(glow),
    ...(look.height || deboss !== 'none' ? { normalMap: texture(normalsFrom(height, 2.2), false), normalScale: new THREE.Vector2(0.9, 0.9) } : {}),
    ...params,
    // The masks hold the values (they multiply these); a surface works them out itself (numbers matte)
    ...(surface ? {} : { roughness: 1, roughnessMap: texture(rough, false), metalness: 1, metalnessMap: texture(metal, false) }),
    ...(params.clearcoat ? { clearcoatMap: shineMask } : {}),
    ...(params.sheen ? { sheenColorMap: shineMask } : {}),
    ...(params.iridescence ? { iridescenceMap: shineMask } : {}),
    // See-through (glass, jelly): the opacity map; numbers solid
    ...(look.alpha ? { transparent: true, alphaMap: texture(alphaMap, false), opacity: 1 } : {}),
  })
  const plain = cellOf(mesh.cells - 1, cols) // where the edges and corners read (dieMesh)
  applyDieShader(material, texture(ink, false), surface, cornerOf(mesh.positions), new THREE.Vector2(plain.u + plain.size / 2, plain.v + plain.size / 2))
  const assets = { geometry, material, faces: mesh.faces, inradius: mesh.inradius }
  cache.set(key, assets)
  return assets
}
