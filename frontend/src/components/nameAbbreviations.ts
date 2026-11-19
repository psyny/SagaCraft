/**
 * Shorter versions of a name, from the full name to the most abbreviated: the last word becomes an
 * initial first, then the one before it, working back (the first word always stays whole).
 * "Goblin King of the North" → "Goblin King of the N." → "Goblin King of t. N." → … → "Goblin K. o. t. N."
 */
export function nameAbbreviations(name: string): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const result = [words.join(' ')]
  for (let cut = words.length - 1; cut >= 1; cut -= 1) {
    const shortened = words.map((w, i) => (i >= cut ? `${w.charAt(0)}.` : w))
    result.push(shortened.join(' '))
  }
  return result
}
