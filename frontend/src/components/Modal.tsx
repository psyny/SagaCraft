import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Open modals, most recent last: Escape only closes the top one (modals can stack, e.g. the uploader)
const stack: symbol[] = []

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  /** Controls shown in the header, left of the close button. */
  actions?: ReactNode
  className?: string
}

export default function Modal({ open, title, onClose, children, wide = false, actions, className = '' }: Props) {
  const id = useRef(Symbol('modal'))
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    const me = id.current
    stack.push(me)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) close.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(me), 1)
    }
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            className={`modal ${wide ? 'wide' : ''} ${className}`}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>{title}</h2>
              {actions && <div className="modal-actions">{actions}</div>}
              <button className="ghost icon" onClick={onClose} aria-label="Close">✕</button>
            </header>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
