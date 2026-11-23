/**
 * The 3D dice (three.js) over a Dice roller Set: a see-through floor that catches their shadows, room lighting for
 * reflections, and either
 * - the tray: the dice waiting in rows along the bottom (they drop in when added, and turn slowly), or
 * - the last roll: the dice flying from the tray, bouncing off the edges and each other and landing on their values
 *   (physics.ts: the same throw on every screen), then resting.
 * The DM clicks a tray die to pick its value (onDieClick); a picked die shows a small gold dot (the DM only).
 * The tray sits along one edge (`edge`) and the dice are thrown from it: everything is laid out and simulated as if
 * the tray were at the bottom, then turned about the vertical axis.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { d100Faces } from './geometry'
import { landing, qmul, simulate, type Frame, type Quat } from './physics'
import { dieAssets } from './styles'

export interface SceneDie { id: number; sides: number; color: string; style: string; value?: number; forced?: number | null }

interface Props {
  width: number
  height: number
  tray: SceneDie[]
  /** The last roll's dice (values set), and its throw. */
  roll: { id: number; seed: number; dice: SceneDie[] } | null
  /** Animate this roll (a new one); else show it at rest. */
  animate: boolean
  onDieClick?: (id: number) => void
  onSettled?: () => void
  /** A preview: the dice centred and close (the User page). */
  preview?: boolean
  /** Where the tray sits (the throw starts there). */
  edge?: TrayEdge
  /** The throw's speed (1: the first version's; above 5: instant). */
  speed?: number
  /** The dice's size (1: normal). */
  size?: number
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

/** Tray places: rows along the bottom of the floor (world units), centred. */
export function trayPlaces(count: number, w: number, d: number): [number, number][] {
  const step = 2.4
  const perRow = Math.max(1, Math.floor((w - 1) / step))
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / perRow)
    const inRow = Math.min(perRow, count - row * perRow)
    return [((i % perRow) - (inRow - 1) / 2) * step, d / 2 - 2.6 - row * step]
  })
}

const FOV = 12 // degrees, vertical: narrow, so dice at the edges show their top, not their sides

/** Bands the dice don't land in (world units): the roll-type buttons on top, the tray and results at the bottom. */
const TOP_BAND = 1.1, BOTTOM_BAND = 2.4
const SHIFT = (BOTTOM_BAND - TOP_BAND) / 2

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function DiceScene({ width, height, tray, roll, animate, onDieClick, onSettled, preview = false, edge = 'bottom', speed = 1, size = 1 }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const three = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; group: THREE.Group; floor: THREE.Mesh
    sun: THREE.DirectionalLight; w: number; d: number
  } | null>(null)
  const meshes = useRef<{ mesh: THREE.Mesh; piece: Piece; base: THREE.Vector3; spin: number; born: number }[]>([])
  const flight = useRef<{ frames: Frame[]; land: Quat[]; start: number; settled: boolean; edge: TrayEdge; speed: number } | null>(null)
  const clicked = useRef(onDieClick)
  clicked.current = onDieClick
  const settled = useRef(onSettled)
  settled.current = onSettled

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
    // Straight overhead with a narrow view, so dice at rest show their top face square to the screen, even at the edges
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 600)
    camera.up.set(0, 0, -1) // the screen's top is the far side
    three.current = { renderer, scene, camera, group, floor, sun, w: 10, d: 6 }

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
      const f = flight.current
      for (const [i, m] of meshes.current.entries()) {
        if (f) {
          const frames = f.frames
          const k = reduced() || f.speed > 5 ? frames.length - 1 : Math.min(frames.length - 1, Math.floor(((now - f.start) / 1000) * 60 * f.speed))
          const fr = frames[k]
          const a = EDGE_ANGLE[f.edge]
          const q = qmul([0, Math.sin(a / 2), 0, Math.cos(a / 2)], qmul(fr.q[i], f.land[i]))
          const [x, z] = turn(fr.p[i][0], fr.p[i][2] - SHIFT, f.edge)
          m.mesh.position.set(x, fr.p[i][1], z)
          m.mesh.quaternion.set(q[0], q[1], q[2], q[3])
          if (k === frames.length - 1 && !f.settled) { f.settled = true; settled.current?.() }
        } else {
          // In the tray: dropping in, then turning slowly
          const t = Math.min(1, (now - m.born) / 450)
          const drop = reduced() ? 0 : (1 - t) * (1 - t) * 5
          m.mesh.position.set(m.base.x, m.base.y + drop + Math.sin(now / 900 + i) * 0.05, m.base.z)
          m.mesh.rotation.set(0.35, m.spin + now / 2600, 0.2)
        }
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
    }
  }, [])

  // Size: the floor is the Set (1 world unit ≈ a die's radius)
  useEffect(() => {
    const t = three.current
    if (!t || width <= 0 || height <= 0) return
    const unit = preview ? Math.min(width, height) / 3.6 : Math.max(22, Math.min(46, Math.min(width, height) / 9)) * size
    t.w = width / unit
    t.d = height / unit
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

  // What's drawn: the tray, or the last roll (thrown now, or at rest)
  const trayKey = tray.map((d) => `${d.id}${d.forced ?? ''}${d.color}${d.style}`).join(',')
  const showRoll = tray.length === 0 && roll !== null
  const rollKey = showRoll ? `${roll!.id}` : ''
  useEffect(() => {
    const t = three.current
    if (!t) return
    const previous = new Map(meshes.current.map((m) => [m.piece.key, m]))
    t.group.clear()
    meshes.current = []
    flight.current = null
    const list = pieces(showRoll ? roll!.dice : tray)
    const side = edge === 'left' || edge === 'right'
    const [cw, cd] = side ? [t.d, t.w] : [t.w, t.d] // the box, seen with the tray at the bottom
    const local = preview ? list.map((_, i): [number, number] => [(i - (list.length - 1) / 2) * 2.3, 0]) : trayPlaces(list.length, cw, cd)
    const places = local.map(([x, z]) => (preview ? [x, z] : turn(x, z, edge)) as [number, number])
    list.forEach((piece, i) => {
      const assets = dieAssets(piece.sides, piece.die.style, piece.die.color, piece.part)
      const mesh = new THREE.Mesh(assets.geometry, assets.material)
      mesh.castShadow = true
      mesh.scale.setScalar(0.95)
      const [x, z] = places[i]
      const base = new THREE.Vector3(x, assets.inradius * 0.95 + 0.25, z)
      if (!showRoll && piece.die.forced) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe8c46a }))
        dot.position.set(0, assets.inradius + 0.5, 0)
        mesh.add(dot)
      }
      t.group.add(mesh)
      meshes.current.push({ mesh, piece, base, spin: i * 1.7, born: previous.get(piece.key)?.born ?? performance.now() })
    })
    if (showRoll) {
      const starts = list.map((p, i) => ({ x: local[i][0], z: local[i][1] + SHIFT, rest: dieAssets(p.sides, p.die.style, p.die.color, p.part).inradius * 0.95, reach: 0.95 }))
      // The throw happens between the bands by the far edge and the tray (simulated centred, drawn shifted and turned)
      const frames = simulate(starts, cw, Math.max(3, cd - TOP_BAND - BOTTOM_BAND), roll!.seed)
      const last = frames[frames.length - 1]
      // Each die lands on its value, its number upright on the screen (the screen's top, before the tray edge's turn)
      const a = EDGE_ANGLE[edge]
      const screenUp: [number, number, number] = [Math.sin(a), 0, -Math.cos(a)]
      const land = list.map((p, i) => {
        const face = dieAssets(p.sides, p.die.style, p.die.color, p.part).faces.find((f) => f.value === p.face)
        return face ? landing(last.q[i], face.normal, face.up, screenUp) : landing(last.q[i], [0, 1, 0])
      })
      flight.current = { frames: animate ? frames : [last], land, start: performance.now(), settled: false, edge, speed }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayKey, rollKey, width, height, edge, size])

  return <div ref={host} className={`dice-scene ${onDieClick ? 'pickable' : ''}`} style={{ width, height }} />
}
