/**
 * The throw (pure, deterministic): not real rigid-body physics, just enough to look like dice flying and rolling.
 * Dice are balls in a box (the Set): gravity, bounces on the floor and the walls, pushes between dice, spin that
 * rolls with the motion on the floor and slows down. The same seed gives the same throw on every screen.
 *
 * Landing on a value: the whole throw is simulated first; then each die gets a fixed rotation in its own frame (`landing`)
 * so that its last pose shows its value face up. Applied to every frame, the motion looks the same, just "painted" so
 * it lands right. See dice/DiceScene.tsx.
 */
import type { Vec } from './geometry'

export type Quat = [number, number, number, number] // x, y, z, w

export function seeded(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
const qnorm = (q: Quat): Quat => {
  const l = Math.hypot(...q) || 1
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}
export const qconj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]]

/** Rotate a vector by a quaternion. */
export function rotate(q: Quat, v: Vec): Vec {
  const r = qmul(qmul(q, [v[0], v[1], v[2], 0]), qconj(q))
  return [r[0], r[1], r[2]]
}

/** The shortest rotation taking unit vector a onto unit vector b. */
export function fromTo(a: Vec, b: Vec): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  if (d < -0.999999) {
    const axis: Vec = Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[2], 0, a[0]]
    const l = Math.hypot(...axis)
    return [axis[0] / l, axis[1] / l, axis[2] / l, 0]
  }
  const c: Vec = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  return qnorm([c[0], c[1], c[2], 1 + d])
}

export interface DieStart {
  /** Where it sits in the tray (x, z on the floor). */
  x: number
  z: number
  /** Ball radius for floor contact (the die's inradius) and between dice. */
  rest: number
  reach: number
}

export interface Frame { p: Vec[]; q: Quat[] }

const UP: Vec = [0, 1, 0]
const G = -32
const DT = 1 / 60
const MAX_STEPS = 360

/** A die already resting on the Set (an earlier roll): the new ones bounce off it; it doesn't move. */
export interface Obstacle { p: Vec; reach: number }

/** Simulate a throw from the tray: the frames (every 1/60 s) until every die rests. Box: x in ±w/2, z in ±d/2. */
export function simulate(dice: DieStart[], w: number, d: number, seed: number, obstacles: Obstacle[] = []): Frame[] {
  const rnd = seeded(seed)
  const range = (a: number, b: number) => a + (b - a) * rnd()
  const p: Vec[] = dice.map((s) => [s.x, s.rest + 0.2, s.z])
  const v: Vec[] = dice.map(() => [range(-0.35, 0.35) * w, range(9, 14), -range(1.1, 1.7) * d])
  const q: Quat[] = dice.map(() => qnorm([range(-1, 1), range(-1, 1), range(-1, 1), range(-1, 1)]))
  const spin: Vec[] = dice.map(() => [range(-18, 18), range(-18, 18), range(-18, 18)])
  const still = dice.map(() => 0)
  const frames: Frame[] = []
  for (let step = 0; step < MAX_STEPS; step++) {
    for (let i = 0; i < dice.length; i++) {
      if (still[i] > 20) continue
      const r = dice[i].rest
      v[i][1] += G * DT
      for (let k = 0; k < 3; k++) p[i][k] += v[i][k] * DT
      // Floor: bounce, friction, and roll with the motion
      if (p[i][1] < r) {
        p[i][1] = r
        v[i][1] = Math.abs(v[i][1]) > 1.5 ? -v[i][1] * 0.42 : 0
        v[i][0] *= 0.9
        v[i][2] *= 0.9
        const roll: Vec = [v[i][2] / r, 0, -v[i][0] / r] // up × v, over the radius
        for (let k = 0; k < 3; k++) spin[i][k] = spin[i][k] * 0.75 + roll[k] * 0.25
      }
      // Walls
      const hx = w / 2 - dice[i].reach, hz = d / 2 - dice[i].reach
      if (p[i][0] < -hx || p[i][0] > hx) { p[i][0] = Math.max(-hx, Math.min(hx, p[i][0])); v[i][0] *= -0.6 }
      if (p[i][2] < -hz || p[i][2] > hz) { p[i][2] = Math.max(-hz, Math.min(hz, p[i][2])); v[i][2] *= -0.6 }
      for (let k = 0; k < 3; k++) spin[i][k] *= 0.992
      // Spin: q' = q + ½ ω q dt
      const dq = qmul([spin[i][0], spin[i][1], spin[i][2], 0], q[i])
      q[i] = qnorm([q[i][0] + dq[0] * DT / 2, q[i][1] + dq[1] * DT / 2, q[i][2] + dq[2] * DT / 2, q[i][3] + dq[3] * DT / 2])
      const speed = Math.hypot(...v[i]) + Math.hypot(...spin[i]) * 0.05
      still[i] = p[i][1] <= r + 1e-3 && speed < 0.6 ? still[i] + 1 : 0
      if (still[i] > 20) { v[i] = [0, 0, 0]; spin[i] = [0, 0, 0] }
    }
    // Dice push each other apart (and trade some speed)
    for (let i = 0; i < dice.length; i++) {
      for (let j = i + 1; j < dice.length; j++) {
        const min = dice[i].reach + dice[j].reach
        const dx: Vec = [p[j][0] - p[i][0], p[j][1] - p[i][1], p[j][2] - p[i][2]]
        const dist = Math.hypot(...dx)
        if (dist >= min || dist === 0) continue
        const n: Vec = [dx[0] / dist, dx[1] / dist, dx[2] / dist]
        const push = (min - dist) / 2
        for (let k = 0; k < 3; k++) { p[i][k] -= n[k] * push; p[j][k] += n[k] * push }
        const rel = (v[j][0] - v[i][0]) * n[0] + (v[j][1] - v[i][1]) * n[1] + (v[j][2] - v[i][2]) * n[2]
        if (rel < 0) {
          for (let k = 0; k < 3; k++) { v[i][k] += n[k] * rel * 0.85; v[j][k] -= n[k] * rel * 0.85 }
          still[i] = still[j] = 0
        }
      }
    }
    // Dice already on the Set: pushed off them (they stay put), bouncing back
    for (let i = 0; i < dice.length; i++) {
      for (const o of obstacles) {
        const min = dice[i].reach + o.reach
        const dx: Vec = [p[i][0] - o.p[0], p[i][1] - o.p[1], p[i][2] - o.p[2]]
        const dist = Math.hypot(...dx)
        if (dist >= min || dist === 0) continue
        const n: Vec = [dx[0] / dist, dx[1] / dist, dx[2] / dist]
        for (let k = 0; k < 3; k++) p[i][k] += n[k] * (min - dist)
        const into = v[i][0] * n[0] + v[i][1] * n[1] + v[i][2] * n[2]
        if (into < 0) {
          for (let k = 0; k < 3; k++) v[i][k] -= n[k] * into * 1.6
          still[i] = 0
        }
      }
    }
    frames.push({ p: p.map((x) => [...x] as Vec), q: q.map((x) => [...x] as Quat) })
    if (still.every((s) => s > 20)) break
  }
  return frames
}

/** The fixed rotation (in the die's frame) that makes its last pose show `faceNormal` straight up; with `faceUp` (the
 * way the face's number points), also turned about that normal so the number reads upright: pointing to `screenUp`. */
export function landing(last: Quat, faceNormal: Vec, faceUp?: Vec, screenUp: Vec = [0, 0, -1]): Quat {
  const up = rotate(qconj(last), UP) // which way "up" is in the die's own frame at the end
  const land = fromTo(faceNormal, up)
  if (!faceUp) return land
  const w = rotate(qmul(last, land), faceUp) // where the number points at rest (level)
  const angle = Math.atan2(w[2] * screenUp[0] - w[0] * screenUp[2], w[0] * screenUp[0] + w[2] * screenUp[2])
  const s = Math.sin(angle / 2)
  return qmul(land, [faceNormal[0] * s, faceNormal[1] * s, faceNormal[2] * s, Math.cos(angle / 2)])
}
