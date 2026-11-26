/**
 * Plan 59: highlights in a character's owner's colour (its token colour: its player's; several players: white). No
 * player (black) would vanish on dark maps and cards: then the theme's gold.
 */
import type { CSSProperties } from 'react'
import { contrastOn } from '../saga/templates/modes'

export const OWNER_FALLBACK = '#f3c24f'

export function ownerColor(color: string | null | undefined): string {
  return color && color.toLowerCase() !== '#000000' ? color : OWNER_FALLBACK
}

/** CSS variables for owner-coloured highlights: --owner (the colour), --owner-ink (text on it). */
export function ownerStyle(color: string | null | undefined): CSSProperties {
  const c = ownerColor(color)
  return { ['--owner' as string]: c, ['--owner-ink' as string]: contrastOn(c) } as CSSProperties
}
