/**
 * The 3D dice (three.js) over a Dice roller Set: a see-through floor that catches their shadows, room lighting for
 * reflections, and
 * - the tray: the dice waiting in rows along the bottom (they drop in when added, and turn slowly), and
 * - the rolls on the Set: each roll's dice flying from the tray, bouncing off the edges, each other and the dice already
 *   resting there, and landing on their values (physics.ts: the same throw on every screen), then staying. Rolls on
 *   the Set when the scene opens (or is resized) rest where they are; new ones are thrown.
 * The DM clicks a tray die to pick its value (onDieClick); a picked die shows a small gold dot (the DM only).
 * The tray sits along one edge (`edge`) and the dice are thrown from it: everything is laid out and simulated as if
 * the tray were at the bottom, then turned about the vertical axis.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { d100Faces } from './geometry'
import { landing, qmul, simulate, type Frame, type Obstacle, type Quat } from './physics'
import { dieAssets } from './styles'

export interface SceneDie { id: number; sides: number; color: string; style: string; value?: number; forced?: number | null }
/** A roll on the Set: its dice (values set) and its throw's seed. */
export interface SceneRoll { id: number; seed: number; dice: SceneDie[] }

interface Props {
  width: number
  height: number
  tray: SceneDie[]
  /** The rolls on the Set, oldest first. */
  rolls?: SceneRoll[]
  onDieClick?: (id: number) => void
  /** A thrown roll came to rest. */
  onSettled?: (rollId: number) => void
  /** A preview: the dice centred and close (the User page). */
  preview?: boolean
  /** Where the tray sits (the throw starts there). */
  edge?: TrayEdge
  /** The throw's speed (1: the first version's; above 5: instant). */
  speed?: number
  /** The dice's size (1: normal). */
  size?: number
  /** How far (px) the tray's controls cover the Set from the tray's edge: the waiting dice sit above them, and new
   *  throws land clear of them. */
  trayInset?: number
  /** False until `trayInset` is known: the rolls already there wait for it (so they rest clear of the tray). */
  ready?: boolean
}

export type TrayEdge = 'bottom' | 'top' | 'left' | 'right'
/** The turn about the vertical axis from "tray at the bottom" to each edge. */
const EDGE_ANGLE: Record<TrayEdge, number> = { bottom: 0, top: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }

/** Pure: a point of the "tray at the bottom" frame, turned to the edge's frame (rotation about y). */
export function turn(x: number, z: number, edge: TrayEdge): [number, number] {
  const a = EDGE_ANGLE[edge]
  const c = Math.cos(a), s = Math.sin(a)
  return [x * c + z * s, -x * s + z * c]
}

/** One drawn die: a d100 is two (tens and units). */
interface Piece { key: string; die: SceneDie; part: 'tens' | 'units' | null; sides: number; face: number | null }

const pieces = (dice: SceneDie[]): Piece[] => dice.flatMap((d): Piece[] => {
  if (d.sides !== 100) return [{ key: `${d.id}`, die: d, part: null, sides: d.sides, face: d.value ?? null }]
  const [tens, units] = d.value ? d100Faces(d.value) : [null, null]
  return [{ key: `${d.id}:t`, die: d, part: 'tens' as const, sides: 100, face: tens }, { key: `${d.id}:u`, die: d, part: 'units' as const, sides: 100, face: units }]
})

/** Tray places: rows along the bottom of the floor (world units), centred, above `inset` (the tray's controls). */
export function trayPlaces(count: number, w: number, d: number, inset = 0): [number, number][] {
  const step = 2.4
  const perRow = Math.max(1, Math.floor((w - 1) / step))
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / perRow)
    const inRow = Math.min(perRow, count - row * perRow)
    return [((i % perRow) - (inRow - 1) / 2) * step, d / 2 - 2.6 - inset - row * step]
  })
}

const FOV = 12 // degrees, vertical: narrow, so dice at the edges show their top, not their sides

/** Bands the dice don't land in (world units): a margin on top, the waiting dice at the bottom (above the tray's
 *  controls, `trayInset`). */
const TOP_BAND = 1.1, BOTTOM_BAND = 3.6 // the waiting dice's row stays clear of the rolled ones

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** A roll drawn on the Set: its meshes, its throw (frames, the landing turns) and where its dice rest. */
interface RollEntry {
  group: THREE.Group
  meshes: THREE.Mesh[]
  frames: Frame[]
  land: Quat[]
  start: number
  settled: boolean
  /** Its throw was simulated centred in its field, drawn shifted by this (world units, towards the far edge). */
  shift: number
  /** Where its dice rest, as drawn (before the edge's turn). */
  rest: Obstacle[]
}

export default function DiceScene({ width, height, tray, rolls = [], onDieClick, onSettled, preview = false, edge = 'bottom', speed = 1, size = 1, trayInset = 0, ready = true }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const three = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; group: THREE.Group; floor: THREE.Mesh
    sun: THREE.DirectionalLight; w: number; d: number; unit: number
  } | null>(null)
  const inset = useRef(0)
  const meshes = useRef<{ mesh: THREE.Mesh; piece: Piece; base: THREE.Vector3; spin: number; born: number }[]>([])
  const trayGroup = useRef<THREE.Group | null>(null)
  const drawn = useRef(new Map<number, RollEntry>())
  const drawnLayout = useRef('')
  const timing = useRef({ edge, speed })
  timing.current = { edge, speed }
  const clicked = useRef(onDieClick)
  clicked.current = onDieClick
  const settled = useRef(onSettled)
  settled.current = onSettled
  const shown = useRef(false) // rolls there when the scene first draws them rest; later ones are thrown

  // The renderer, once
  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    } catch {
      return // no WebGL (tests, old devices): the results still show
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.78
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.className = 'dice-canvas'
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.32 // reflections without washing the colours out
    // Tilted, so glossy tops seen from straight above don't mirror the room's ceiling lights (a white wash)
    scene.environmentRotation.set(-0.62, 0.5, 0)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x302838, 0.22))
    const sun = new THREE.DirectionalLight(0xffffff, 1.25)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.radius = 4
    scene.add(sun)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.35 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    const group = new THREE.Group()
    scene.add(group)
    trayGroup.current = new THREE.Group()
    group.add(trayGroup.current)
    // Straight overhead with a narrow view, so dice at rest show their top face square to the screen, even at the edges
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 600)
    camera.up.set(0, 0, -1) // the screen's top is the far side
    three.current = { renderer, scene, camera, group, floor, sun, w: 10, d: 6, unit: 40 }

    const raycaster = new THREE.Raycaster()
    const onDown = (e: PointerEvent) => {
      if (!clicked.current || !three.current) return
      const r = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = raycaster.intersectObjects(meshes.current.map((m) => m.mesh))[0]
      const found = hit && meshes.current.find((m) => m.mesh === hit.object)
      if (found && found.piece.die.value === undefined) { e.stopPropagation(); clicked.current(found.piece.die.id) }
    }
    renderer.domElement.addEventListener('pointerdown', onDown)

    let raf = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      for (const [i, m] of meshes.current.entries()) {
        // In the tray: dropping in, then turning slowly
        const t = Math.min(1, (now - m.born) / 450)
        const drop = reduced() ? 0 : (1 - t) * (1 - t) * 5
        m.mesh.position.set(m.base.x, m.base.y + drop + Math.sin(now / 900 + i) * 0.05, m.base.z)
        m.mesh.rotation.set(0.35, m.spin + now / 2600, 0.2)
      }
      const { edge: at, speed: pace } = timing.current
      const a = EDGE_ANGLE[at]
      const turned: Quat = [0, Math.sin(a / 2), 0, Math.cos(a / 2)]
      for (const [id, r] of drawn.current) {
        const frames = r.frames
        const k = reduced() || pace > 5 ? frames.length - 1 : Math.min(frames.length - 1, Math.floor(((now - r.start) / 1000) * 60 * pace))
        if (r.settled && k === frames.length - 1 && r.meshes[0]?.userData.k === k) continue // at rest: nothing moves
        const fr = frames[k]
        r.meshes.forEach((mesh, i) => {
          const q = qmul(turned, qmul(fr.q[i], r.land[i]))
          const [x, z] = turn(fr.p[i][0], fr.p[i][2] - r.shift, at)
          mesh.position.set(x, fr.p[i][1], z)
          mesh.quaternion.set(q[0], q[1], q[2], q[3])
          mesh.userData.k = k
        })
        if (k === frames.length - 1 && !r.settled) { r.settled = true; settled.current?.(id) }
      }
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      three.current = null
      // A new renderer draws everything again (at rest)
      drawn.current.clear()
      drawnLayout.current = ''
      shown.current = false
    }
  }, [])

  // Size: the floor is the Set (1 world unit ≈ a die's radius)
  useEffect(() => {
    const t = three.current
    if (!t || width <= 0 || height <= 0) return
    const unit = preview ? Math.min(width, height) / 3.6 : Math.max(22, Math.min(46, Math.min(width, height) / 9)) * size
    t.w = width / unit
    t.d = height / unit
    t.unit = unit
    t.renderer.setSize(width, height)
    t.camera.aspect = width / height
    const h = (t.d / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * 1.04
    t.camera.position.set(0, h, 0)
    t.camera.lookAt(0, 0, 0)
    t.camera.updateProjectionMatrix()
    t.floor.scale.set(t.w * 1.4, t.d * 1.4, 1)
    t.sun.position.set(-t.w * 0.3, 20, t.d * 0.4)
    const cam = t.sun.shadow.camera as THREE.OrthographicCamera
    Object.assign(cam, { left: -t.w, right: t.w, top: t.d, bottom: -t.d })
    cam.updateProjectionMatrix()
  }, [width, height, preview, size])

  // The tray: the dice waiting (the DM's pick shows as a gold dot)
  const trayKey = tray.map((d) => `${d.id}${d.forced ?? ''}${d.color}${d.style}`).join(',')
  const layoutKey = `${width}x${height}:${edge}:${size}`
  useEffect(() => {
    const t = three.current
    const holder = trayGroup.current
    if (!t || !holder) return
    inset.current = preview ? 0 : Math.min(trayInset / t.unit, Math.max(0, (edge === 'left' || edge === 'right' ? t.w : t.d) - 6))
    const previous = new Map(meshes.current.map((m) => [m.piece.key, m]))
    holder.clear()
    meshes.current = []
    const list = pieces(tray)
    const side = edge === 'left' || edge === 'right'
    const [cw, cd] = side ? [t.d, t.w] : [t.w, t.d] // the box, seen with the tray at the bottom
    const local = preview ? list.map((_, i): [number, number] => [(i - (list.length - 1) / 2) * 2.3, 0]) : trayPlaces(list.length, cw, cd, inset.current)
    const places = local.map(([x, z]) => (preview ? [x, z] : turn(x, z, edge)) as [number, number])
    list.forEach((piece, i) => {
      const assets = dieAssets(piece.sides, piece.die.style, piece.die.color, piece.part)
      const mesh = new THREE.Mesh(assets.geometry, assets.material)
      mesh.castShadow = true
      mesh.scale.setScalar(0.95)
      const [x, z] = places[i]
      const base = new THREE.Vector3(x, assets.inradius * 0.95 + 0.25, z)
      if (piece.die.forced) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe8c46a }))
        dot.position.set(0, assets.inradius + 0.5, 0)
        mesh.add(dot)
      }
      holder.add(mesh)
      meshes.current.push({ mesh, piece, base, spin: i * 1.7, born: previous.get(piece.key)?.born ?? performance.now() })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayKey, layoutKey, Math.round(trayInset / 8)])

  // The rolls on the Set: new ones thrown (bouncing off the dice already there), gone ones taken off
  const rollsKey = rolls.map((r) => r.id).join(',')
  useEffect(() => {
    const t = three.current
    if (!t || !ready) return
    const entries = drawn.current
    let atRest = !shown.current
    if (drawnLayout.current !== layoutKey) { // another size or tray edge: everything again, at rest
      for (const r of entries.values()) t.group.remove(r.group)
      entries.clear()
      drawnLayout.current = layoutKey
      atRest = true
    }
    const ids = new Set(rolls.map((r) => r.id))
    for (const [id, r] of entries) if (!ids.has(id)) { t.group.remove(r.group); entries.delete(id) }
    const side = edge === 'left' || edge === 'right'
    const [cw, cd] = side ? [t.d, t.w] : [t.w, t.d]
    const a = EDGE_ANGLE[edge]
    const screenUp: [number, number, number] = [Math.sin(a), 0, -Math.cos(a)]
    for (const roll of rolls) {
      if (entries.has(roll.id)) continue
      const list = pieces(roll.dice)
      // The throw happens between the far edge's margin and the waiting dice (above the tray's controls): simulated
      // centred, drawn shifted and turned; around the dice already resting there
      const bottom = BOTTOM_BAND + inset.current
      const shift = (bottom - TOP_BAND) / 2
      const local = trayPlaces(list.length, cw, cd, inset.current)
      const depth = Math.max(3, cd - TOP_BAND - bottom)
      // Thrown from the tray: from the field's near edge, where the waiting dice were
      const starts = list.map((p, i) => ({ x: local[i][0], z: Math.min(local[i][1] + shift, depth / 2 - 0.95), rest: dieAssets(p.sides, p.die.style, p.die.color, p.part).inradius * 0.95, reach: 0.95 }))
      const obstacles = [...entries.values()].flatMap((r) => r.rest).map((o) => ({ ...o, p: [o.p[0], o.p[1], o.p[2] + shift] as typeof o.p }))
      const frames = simulate(starts, cw, depth, roll.seed, obstacles)
      const last = frames[frames.length - 1]
      // Each die lands on its value, its number upright on the screen (the screen's top, before the tray edge's turn)
      const land = list.map((p, i) => {
        const face = dieAssets(p.sides, p.die.style, p.die.color, p.part).faces.find((f) => f.value === p.face)
        return face ? landing(last.q[i], face.normal, face.up, screenUp) : landing(last.q[i], [0, 1, 0])
      })
      const group = new THREE.Group()
      const made = list.map((piece) => {
        const assets = dieAssets(piece.sides, piece.die.style, piece.die.color, piece.part)
        const mesh = new THREE.Mesh(assets.geometry, assets.material)
        mesh.castShadow = true
        mesh.scale.setScalar(0.95)
        group.add(mesh)
        return mesh
      })
      t.group.add(group)
      entries.set(roll.id, {
        group, meshes: made, frames: atRest ? [last] : frames, land, start: performance.now(), settled: atRest, shift,
        rest: last.p.map((p) => ({ p: [p[0], p[1], p[2] - shift] as typeof p, reach: 0.95 })),
      })
    }
    shown.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollsKey, layoutKey, ready])

  return <div ref={host} className={`dice-scene ${onDieClick ? 'pickable' : ''}`} style={{ width, height }} />
}
