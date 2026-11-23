/**
 * Archetypes (plan 33): what a character is besides its type (a race, a class, a talent), each in a category the Saga
 * template names, adding variables level by level ("Warrior 4" has the Warrior's level 1 to 4 variables). The server
 * checks and stores them (backend domain/archetypes.py); these helpers shape them for the editors and sheets.
 */
import type { ArchetypeDef, AttributeDef, LevelChange, PickedArchetype, Ruleset } from '../api/types'

/** The archetypes of a ruleset by key. */
export const archetypesOf = (ruleset: Ruleset) => new Map((ruleset.archetypes || []).map((a) => [a.key, a]))

/** The variables a character's archetypes give it, each archetype's up to its level, with the archetype. */
export function archetypeVariables(ruleset: Ruleset, picked: PickedArchetype[] | undefined): { archetype: ArchetypeDef; level: number; variables: AttributeDef[] }[] {
  const byKey = archetypesOf(ruleset)
  return (picked || []).flatMap((p) => {
    const archetype = byKey.get(p.key)
    return archetype ? [{ archetype, level: p.level, variables: archetype.variables.filter((v) => (v.level ?? 1) <= p.level) }] : []
  })
}

/** "Warrior 4" (the level when the archetype has more than one), "Human". */
export function archetypeLabel(archetype: Pick<ArchetypeDef, 'name' | 'max_level'>, level: number): string {
  return archetype.max_level > 1 ? `${archetype.name} ${level}` : archetype.name
}

// -- changing by level (mirrors backend domain/archetypes.py: the editor's preview; the server applies them) --------

/** An archetype variable as the template or the ruleset holds it (what changing by level needs). */
type LevelVariable = { type: string; default?: unknown; level?: number; by_level?: LevelChange[] }

const maxOf = (value: unknown) => (value && typeof value === 'object' && 'max' in value ? Number((value as { max: number }).max) || 0 : 0)

/** What a variable is at a level of its archetype (undefined before it comes); a counter's is its max. */
export function valueAt(attr: LevelVariable, level: number): unknown {
  if (level < (attr.level ?? 1)) return undefined
  let value: unknown = attr.type === 'counter' ? maxOf(attr.default) : attr.default ?? null
  for (const change of attr.by_level || []) if (change.level <= level) value = change.value
  return value
}

/** A variable's value when a character gains it at a level. */
export function grantedValue(attr: LevelVariable, level: number): unknown {
  if (attr.type !== 'counter') return valueAt(attr, level)
  const start = (attr.default as { current: number; max: number } | null) || { current: 0, max: 0 }
  const top = Number(valueAt(attr, level) ?? 0)
  return { current: Math.max(0, Math.min(top, (start.current ?? 0) + (top - (start.max ?? 0)))), max: top }
}

/** A character's values once its archetypes change from `before` to `after` (what Save will do). */
export function applyLevels(ruleset: Ruleset, before: PickedArchetype[], after: PickedArchetype[], values: Record<string, unknown>): Record<string, unknown> {
  const out = { ...values }
  const old = new Map(before.map((p) => [p.key, p.level]))
  const byKey = archetypesOf(ruleset)
  for (const picked of after) {
    const archetype = byKey.get(picked.key)
    if (!archetype) continue
    const was = old.get(picked.key) ?? 0
    for (const attr of archetype.variables) {
      if ((attr.level ?? 1) > picked.level) continue
      if ((attr.level ?? 1) > was) {
        if (out[attr.key] === null || out[attr.key] === undefined) out[attr.key] = grantedValue(attr, picked.level)
        continue
      }
      const then = valueAt(attr, was), now = valueAt(attr, picked.level)
      if (JSON.stringify(then) === JSON.stringify(now)) continue
      if (attr.type === 'counter') {
        const stored = (out[attr.key] as { current: number; max: number } | null) || (grantedValue(attr, was) as { current: number; max: number })
        const top = Number(now), current = (stored.current ?? 0) + (top - Number(then))
        out[attr.key] = { current: Math.max(0, Math.min(top, current)), max: top }
      } else out[attr.key] = now
    }
  }
  return out
}

/** A value in a few words: a counter "3 / 5", yes/no, a number, words. */
export function shortValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'object' && 'max' in (value as object)) {
    const c = value as { current: number; max: number }
    return `${c.current} / ${c.max}`
  }
  return String(value)
}

/** "3: 4 · 7: 5 · 15: 6": a variable's value at the level it comes and at each change (a counter: its max). */
/** A variable's steps: the value it comes with at its level, then each change (a counter: its max). */
export function levelSteps(attr: LevelVariable): LevelChange[] {
  const start = attr.type === 'counter' ? maxOf(attr.default) : attr.default
  return [{ level: attr.level ?? 1, value: start }, ...(attr.by_level || [])]
}

/** The step in force at an archetype level (the last one at or below it), or -1 before the variable comes. */
export function stepAt(steps: LevelChange[], level: number): number {
  let at = -1
  steps.forEach((s, i) => { if (s.level <= level) at = i })
  return at
}

export function describeByLevel(attr: LevelVariable): string {
  return levelSteps(attr).map((s) => `${s.level}: ${shortValue(s.value)}`).join(' · ')
}

/** What changing a character's archetypes will change in its values (the editor's "On Save"). */
export function levelChanges(ruleset: Ruleset, before: PickedArchetype[], after: PickedArchetype[], values: Record<string, unknown>) {
  const next = applyLevels(ruleset, before, after, values)
  return archetypeVariables(ruleset, after).flatMap((g) => g.variables
    .filter((a) => JSON.stringify(values[a.key] ?? null) !== JSON.stringify(next[a.key] ?? null))
    .map((a) => ({ archetype: g.archetype.name, variable: a.name, key: a.key, from: values[a.key], to: next[a.key] })))
}
