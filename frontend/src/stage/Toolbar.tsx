/**
 * A Set's controls go in its toolbars. The Set type names them (SetTypeUI.toolbars), its view fills them with
 * <Toolbar id="...">, and the Stage core places them where the DM set them up (stage/toolbarPlaces.ts): on a canvas
 * Stage inside or around the Set, on an interface Stage on the screen's edges, stacked so they never overlap.
 * The content stays the view's own (its state, its popups); only where it shows changes.
 * Outside a Stage (tests), the content renders in place.
 */
import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Where this Set's toolbars render (the Stage core's docks), by toolbar key. */
export const ToolbarTargets = createContext<Record<string, HTMLElement | null> | null>(null)

export default function Toolbar({ id, children }: { id: string; children: ReactNode }) {
  const targets = useContext(ToolbarTargets)
  // React bubbles events through the view, not the dock: keep pointers away from the canvas and the Set's own drags
  const content = <div className="toolbar-items" onPointerDown={(e) => e.stopPropagation()}>{children}</div>
  if (!targets) return <div className={`set-toolbar inline toolbar-${id}`} data-interactive>{content}</div>
  const target = targets[id]
  return target ? createPortal(content, target) : null
}
