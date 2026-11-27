/** The Panels Set (plan 60): rectangles and lines the DM draws in Build (backend set_types/panels.py). */
export type FillStyle = 'flat' | 'linear' | 'radial'
export type FillEffect = 'none' | 'blur' | 'frost' | 'glow' | 'inset'
export type LineStyle = 'solid' | 'dashed' | 'dotted'

export interface PanelRect {
  id: number
  kind: 'rect'
  x: number
  y: number
  w: number
  h: number
  /** The corners' radius (px). */
  radius: number
  fill: { color: string; style: FillStyle; color2: string; angle: number; opacity: number; effect: FillEffect; effect_size: number }
  /** Thickness 0: none. */
  border: { width: number; color: string }
}

export interface PanelLine {
  id: number
  kind: 'line'
  points: [number, number][]
  color: string
  width: number
  style: LineStyle
  /** Rounded corners (px). */
  radius: number
  opacity: number
}

export type PanelShape = PanelRect | PanelLine
export interface PanelsContent { shapes: PanelShape[] }
