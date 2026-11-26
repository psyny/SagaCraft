import { createContext, useContext } from 'react'

/**
 * Plan 58: the DM paused the Stage, and you can't act on it now (players and viewers on the live Stage; the DM never
 * is). Set views turn their actions off (dice, pings, moving tokens, changing values); the server refuses them anyway.
 */
export const StagePausedContext = createContext(false)
export const useStagePaused = () => useContext(StagePausedContext)
export const PAUSED_NOTE = 'The DM paused the game'
