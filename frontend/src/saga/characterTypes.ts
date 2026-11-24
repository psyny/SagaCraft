/**
 * A Saga's character types, in its template's order (plan 40: the types took over the categories). Each is a section
 * of the Characters page; its flags say whether its characters are player characters and whether new ones are
 * instanceable. Pure: read from the ruleset.
 */
import type { CharacterType, Ruleset } from '../api/types'

export function characterTypes(ruleset: Ruleset): CharacterType[] {
  return Object.entries(ruleset.kinds.character?.types || {}).map(([key, t]) => ({
    key, name: t.name, plural: t.plural || t.name, player: Boolean(t.player), instanceable: Boolean(t.instanceable) && !t.player,
  }))
}
