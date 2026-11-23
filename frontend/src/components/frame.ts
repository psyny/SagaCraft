/**
 * A thin gradient frame in a resource's colour (its player's; several players: white; none: black): on every card
 * and sheet, like its token's border. The colour comes from the server (`frame`); this makes the CSS variables the
 * `.framed` style reads.
 */
import type { CSSProperties } from 'react'
import { shade } from '../color/theory'

export function frameStyle(color: string | null | undefined): CSSProperties {
  if (!color) return {}
  return { ['--frame-a' as string]: shade(color, 0.5), ['--frame-b' as string]: color, ['--frame-c' as string]: shade(color, -0.45) } as CSSProperties
}
