import { createContext, useContext } from 'react'

/** The Stage canvas zoom, so Sets can turn screen-pixel drags into Stage units. */
export const CanvasContext = createContext<{ scale: number }>({ scale: 1 })
export const useCanvas = () => useContext(CanvasContext)
