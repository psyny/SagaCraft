/**
 * Notices of actions someone else ran (plan 34): the DM is told of every action; everyone of those whose Notify is
 * "Everyone". Each shows what this member may see of it (the server built it for them), at the bottom right, for
 * NOTICE_MS or until clicked.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import type { ActionNotice } from '../api/types'
import { describeRoll } from './actions'

export const NOTICE_MS = 10000

export type ShownNotice = ActionNotice & { id: number }

function Notice({ notice, onDismiss }: { notice: ShownNotice; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [onDismiss])
  return (
    <motion.div className="action-notice" role="status" onClick={onDismiss} layout
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }}>
      <div><strong>{notice.by}</strong> ran <strong>{notice.action}</strong>{notice.on ? <> on <strong>{notice.on}</strong></> : null}</div>
      {notice.changes.length > 0 && (
        <ul>{notice.changes.map((c, i) => <li key={i}>{c.name} · {c.variable} {c.before} → <strong>{c.after}</strong></li>)}</ul>
      )}
      {(notice.rolls?.length ?? 0) > 0 && (
        <ul className="action-rolls">{notice.rolls!.map((r, i) => <li key={i} className="muted small">🎲 {r.thing}: {describeRoll(r)}</li>)}</ul>
      )}
    </motion.div>
  )
}

export default function ActionNotices({ notices, onDismiss }: { notices: ShownNotice[]; onDismiss: (id: number) => void }) {
  return (
    <div className="action-notices" aria-live="polite">
      <AnimatePresence>
        {notices.map((n) => <Notice key={n.id} notice={n} onDismiss={() => onDismiss(n.id)} />)}
      </AnimatePresence>
    </div>
  )
}
