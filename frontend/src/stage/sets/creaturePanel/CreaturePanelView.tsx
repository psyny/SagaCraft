import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState, type PointerEvent } from 'react'
import { api } from '../../../api'
import Popover, { anchorOf, type Anchor } from '../../../components/Popover'
import CharacterSheetModal from '../../../saga/sheet/CharacterSheet'
import { useOptionalSaga } from '../../../saga/SagaContext'
import { useCanvas } from '../../CanvasContext'
import { TITLE_H } from '../../constants'
import type { SetViewProps } from '../../types'
import CreatureCard from './CreatureCard'
import { computeLayout, moveItem, nearestSlot } from './layout'
import { CardMenu } from './PlayMenus'
import type { CardAttribute, CreaturePanelContent } from './types'
import ValueEditor from './ValueEditor'

interface Drag {
  id: number
  startX: number
  startY: number
  dx: number
  dy: number
  moved: boolean
}

type Pop = { kind: 'card'; cardId: number; anchor: Anchor } | { kind: 'value'; cardId: number; attrKey: string; anchor: Anchor }

/**
 * Cards on the Stage.
 * - view:  read-only (players),
 * - play:  the DM drags cards to arrange them, clicks a card for its menu, clicks a value to change it,
 * - build: the DM clicks a card to select it (its settings show in the side panel).
 */
export default function CreaturePanelView({ set, mode, editor, selectedActorId, onSelectActor, attention }: SetViewProps) {
  const content = set.content as CreaturePanelContent
  const { scale } = useCanvas()
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [pop, setPop] = useState<Pop | null>(null)
  // The character sheet opened from a card (players: click the card; DM: the card menu)
  const [sheetCardId, setSheetCardId] = useState<number | null>(null)
  const saga = useOptionalSaga()
  const admin = content.config !== undefined
  const height = set.height - TITLE_H
  const rects = computeLayout(content.cards, content.shape, set.width, height, content.spacing)
  const canDrag = mode === 'play' && Boolean(editor) && (content.shape === 'free' || content.order === 'manual')

  const onPointerDown = (e: PointerEvent, id: number) => {
    if (mode === 'view') return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, moved: false }
    setDrag(dragRef.current)
  }

  const onPointerMove = (e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = (e.clientX - d.startX) / scale
    const dy = (e.clientY - d.startY) / scale
    const moved = d.moved || Math.hypot(dx, dy) * scale > 5
    dragRef.current = { ...d, dx: canDrag ? dx : 0, dy: canDrag ? dy : 0, moved }
    setDrag(dragRef.current)
  }

  const onPointerUp = (e: PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!d || !editor) return
    if (!d.moved) {
      if (mode === 'build') onSelectActor(selectedActorId === d.id ? null : d.id)
      else setPop({ kind: 'card', cardId: d.id, anchor: anchorOf(e.currentTarget as Element) })
      return
    }
    if (!canDrag) return
    const rect = rects.get(d.id)!
    if (content.shape === 'free') {
      const x = Math.round(Math.max(0, rect.x + d.dx))
      const y = Math.round(Math.max(0, rect.y + d.dy))
      void editor.run(() => api.updateActor(editor.sagaId, d.id, { position: { x, y } }))
    } else {
      const ids = content.cards.map((c) => c.id)
      const slots = ids.map((id) => rects.get(id)!)
      const from = ids.indexOf(d.id)
      const to = nearestSlot(slots, rect.x + d.dx + rect.w / 2, rect.y + d.dy + rect.h / 2)
      if (from !== to) void editor.run(() => api.reorderActors(editor.sagaId, set.id, moveItem(ids, from, to)))
    }
  }

  const commitValue = (cardId: number, attr: CardAttribute, value: number) => {
    setPop(null)
    const card = content.cards.find((c) => c.id === cardId)
    if (!editor || !card) return
    const current = attr.type === 'counter' ? attr.current : attr.value
    if (value === current) return
    void editor.run(() =>
      attr.type === 'counter'
        ? api.changeCounter(editor.sagaId, card.resource_id, attr.key, { current: value })
        : api.updateResource(editor.sagaId, card.resource_id, { attributes: { [attr.key]: value } }),
    )
  }

  if (content.cards.length === 0) {
    return <div className="panel-empty">{mode === 'build' ? 'No creatures yet. Add some from the side panel.' : ''}</div>
  }

  const sheetCard = sheetCardId !== null ? content.cards.find((c) => c.id === sheetCardId) : undefined
  const popCard = pop ? content.cards.find((c) => c.id === pop.cardId) : undefined
  const popAttr = pop?.kind === 'value' ? popCard?.attributes.find((a) => a.key === pop.attrKey) : undefined

  return (
    <div className={`creature-panel mode-${mode}`}>
      <AnimatePresence>
        {content.cards.map((card) => {
          const rect = rects.get(card.id)!
          const dragging = drag?.id === card.id && drag.moved
          return (
            <motion.div
              key={card.id}
              className={`card-slot ${dragging ? 'dragging' : ''} ${mode !== 'view' ? 'interactive' : ''} ${pop?.cardId === card.id ? 'open' : ''}`}
              style={{ width: rect.w, height: rect.h, zIndex: dragging ? 50 : content.highlight_actor_id === card.id ? 5 : 1 }}
              initial={{ opacity: 0, scale: 0.85, x: rect.x, y: rect.y }}
              animate={{ opacity: 1, scale: 1, x: rect.x + (dragging ? drag!.dx : 0), y: rect.y + (dragging ? drag!.dy : 0) }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={dragging ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 28 }}
              onPointerDown={(e) => onPointerDown(e, card.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => { dragRef.current = null; setDrag(null) }}
              data-interactive={mode !== 'view' ? true : undefined}
              onClick={mode === 'view' && saga ? () => setSheetCardId(card.id) : undefined}
            >
              <CreatureCard
                card={card}
                highlighted={content.highlight_actor_id === card.id}
                dimmed={content.spotlight && content.highlight_actor_id !== card.id}
                selected={mode === 'build' && selectedActorId === card.id}
                pulse={attention && attention.actorId === card.id ? attention.nonce : null}
                admin={admin}
                onAttrClick={
                  mode === 'play' && editor
                    ? (attr, element) => setPop({ kind: 'value', cardId: card.id, attrKey: attr.key, anchor: anchorOf(element) })
                    : undefined
                }
              />
            </motion.div>
          )
        })}
      </AnimatePresence>

      {pop && popCard && editor && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} className={pop.kind === 'value' ? 'value-pop' : ''}>
          {pop.kind === 'card' ? (
            <CardMenu card={popCard} setId={set.id} content={content} editor={editor} close={() => setPop(null)}
              onOpenSheet={saga ? () => setSheetCardId(popCard.id) : undefined} />
          ) : popAttr ? (
            <ValueEditor attr={popAttr} onCommit={(value) => commitValue(popCard.id, popAttr, value)} />
          ) : null}
        </Popover>
      )}

      {saga && (
        <CharacterSheetModal
          sagaId={saga.sagaId}
          resourceId={sheetCard?.resource_id ?? null}
          setId={set.id}
          refreshKey={sheetCard ? JSON.stringify(sheetCard.attributes) : ''}
          onClose={() => setSheetCardId(null)}
        />
      )}
    </div>
  )
}
