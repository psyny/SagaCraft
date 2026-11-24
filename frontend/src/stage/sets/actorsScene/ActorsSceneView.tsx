import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState, type PointerEvent } from 'react'
import { api } from '../../../api'
import Popover, { anchorOf, type Anchor } from '../../../components/Popover'
import CharacterSheetModal from '../../../saga/sheet/CharacterSheet'
import { useOptionalSaga } from '../../../saga/SagaContext'
import { useCanvas } from '../../CanvasContext'
import { TITLE_H } from '../../constants'
import Toolbar from '../../Toolbar'
import type { SetViewProps } from '../../types'
import { sceneCommands } from './commands'
import CreatureCard from './CreatureCard'
import { CARD_W, computeLayout, moveItem, nearestSlot, tabLayout } from './layout'
import OrderTray from './OrderTray'
import { CardMenu } from './PlayMenus'
import TurnControls from './TurnControls'
import { inStyle, tabView, type ActorsSceneContent, type CardAttribute } from './types'
import ValueEditor from './ValueEditor'
import { openAddCreatures, setViewedTab, useAddCreatures, useViewedTab } from './viewedTab'
import AddCreatures from './AddCreatures'
import Modal from '../../../components/Modal'

interface Drag {
  id: number
  startX: number
  startY: number
  dx: number
  dy: number
  moved: boolean
}

type Pop =
  | { kind: 'card'; cardId: number; anchor: Anchor }
  | { kind: 'value'; cardId: number; attrKey: string; anchor: Anchor }
  | { kind: 'order'; anchor: Anchor }

/**
 * Cards on the Stage, one tab at a time.
 * - view:  read-only (players): the active tab,
 * - play:  the DM switches tabs (players follow), drags cards, clicks a card for its menu, a value to change it,
 *          and runs turns,
 * - build: the DM picks the tab to build (players don't follow) and clicks a card to select it.
 * The DM's controls are in two toolbars the Stage places (stage/Toolbar.tsx): "main" (the tabs; Build: + Add
 * creatures) and "turns" (Play, when the tab has turn controls). They float, so the DM's cards sit exactly where
 * the players' do.
 */
export default function ActorsSceneView({ set, mode, editor, selectedActorId, onSelectActor, attention }: SetViewProps) {
  const content = set.content as ActorsSceneContent
  const { scale } = useCanvas()
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [pop, setPop] = useState<Pop | null>(null)
  // The character sheet opened from a card (players: click the card; DM: the card menu)
  const [sheetCardId, setSheetCardId] = useState<number | null>(null)
  const saga = useOptionalSaga()
  const admin = content.tabs !== undefined
  const built = useViewedTab(set.id)
  const adding = useAddCreatures(set.id)
  const viewedId = mode === 'build' && built !== null && content.tabs?.some((t) => t.id === built) ? built : content.active_tab
  const viewed = tabView(content, viewedId)
  const { tab } = viewed
  // Inactive characters: off the Set (the DM still finds them, faded, in Build)
  const cards = mode === 'build' ? viewed.cards : viewed.cards.filter((c) => !c.inactive)
  const commands = editor ? sceneCommands(editor, set.id) : null
  const strip = admin && mode !== 'view'
  const turns = Boolean(editor) && strip && mode === 'play' && Boolean(tab.turn_controls)
  const height = set.height - TITLE_H
  const current = tab.turn.actor_id
  const layout = tabLayout(tab)
  const rects = computeLayout(cards, tab.shape, set.width, height, layout.gap, layout.options)
  const rotating = tab.flow === 'rotate' && current !== null
  const canReorder = tab.order_by === 'custom' && tab.shape !== 'bar' && tab.shape !== 'free' && !rotating
  const canDrag = mode === 'play' && Boolean(editor) && (tab.shape === 'free' || canReorder)

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
    if (!d || !editor || !commands) return
    if (!d.moved) {
      if (mode === 'build') onSelectActor(selectedActorId === d.id ? null : d.id)
      else setPop({ kind: 'card', cardId: d.id, anchor: anchorOf(e.currentTarget as Element) })
      return
    }
    if (!canDrag) return
    const rect = rects.get(d.id)!
    if (tab.shape === 'free') {
      void commands.placeCard(tab.id, d.id, Math.round(Math.max(0, rect.x + d.dx)), Math.round(Math.max(0, rect.y + d.dy)))
    } else {
      const ids = cards.map((c) => c.id)
      const slots = ids.map((id) => rects.get(id)!)
      const from = ids.indexOf(d.id)
      const to = nearestSlot(slots, rect.x + d.dx + rect.w / 2, rect.y + d.dy + rect.h / 2)
      if (from !== to) void commands.setOrder(tab.id, moveItem(ids, from, to))
    }
  }

  const commitValue = (cardId: number, attr: CardAttribute, value: number) => {
    setPop(null)
    if (!editor) return
    const old = attr.type === 'counter' ? attr.current : attr.value
    if (value === old) return
    // An instance keeps its own values; any other card changes the character everywhere
    void editor.run(() =>
      attr.type === 'counter'
        ? api.actorCounter(editor.sagaId, cardId, attr.key, { current: value })
        : api.actorValues(editor.sagaId, cardId, { [attr.key]: value }),
    )
  }

  const pickTab = (tabId: number) => {
    setViewedTab(set.id, tabId)
    if (mode === 'play' && commands && tabId !== content.active_tab) void commands.switchTab(tabId)
  }

  const sheetCard = sheetCardId !== null ? content.cards.find((c) => c.id === sheetCardId) : undefined
  const popCard = pop && pop.kind !== 'order' ? cards.find((c) => c.id === pop.cardId) : undefined
  const popAttr = pop?.kind === 'value' ? popCard?.attributes.find((a) => a.key === pop.attrKey) : undefined

  return (
    <div className={`actors-scene mode-${mode}`}>
      {strip && (
        <Toolbar id="main">
          {content.tabs!.map((t) => (
            <button
              key={t.id}
              className={`scene-tab ${t.id === tab.id ? 'on' : ''} ${t.id === content.active_tab ? 'active' : ''}`}
              title={t.id === content.active_tab ? 'Players see this tab' : mode === 'play' ? 'Show this tab to the players' : 'Build this tab'}
              onClick={() => pickTab(t.id)}
            >
              {t.id === content.active_tab && <span className="scene-tab-dot" />}
              {t.name}
              <span className="scene-tab-count" title="Shown to players in this tab">{content.cards.filter((c) => c.tabs?.[String(t.id)]?.shown).length}</span>
            </button>
          ))}
          {mode === 'build' && editor && (
            <button className="primary small" title="To the scene (every tab)" onClick={() => openAddCreatures(set.id)}>＋ Add creatures</button>
          )}
          {mode === 'build' && tab.id !== content.active_tab && (
            <span className="muted small scene-tab-note">Building “{tab.name}”: players still see “{content.tabs!.find((t) => t.id === content.active_tab)?.name}”</span>
          )}
        </Toolbar>
      )}

      {turns && commands && (
        <Toolbar id="turns">
          <TurnControls tab={tab} commands={commands} onOrder={(anchor) => setPop({ kind: 'order', anchor })} />
        </Toolbar>
      )}

      <div className="scene-body" style={{ height }}>
        {cards.length === 0 && (
          <div className="panel-empty">{mode === 'build' ? 'No creatures in this scene yet: “+ Add creatures”.' : ''}</div>
        )}
        <AnimatePresence>
          {cards.map((card) => {
            const rect = rects.get(card.id)!
            const cardScale = rect.scale ?? 1
            const dragging = drag?.id === card.id && drag.moved
            const isCurrent = current === card.id
            const drawn = isCurrent && tab.shape === 'bar'
            // The card in evidence (the turn bar's current creature) in its tab's evidence style
            const shown = drawn ? inStyle(card, tab.evidence_card_style) : card
            return (
              <motion.div
                key={card.id}
                className={`card-slot ${dragging ? 'dragging' : ''} ${mode !== 'view' ? 'interactive' : ''} ${pop && pop.kind !== 'order' && pop.cardId === card.id ? 'open' : ''}`}
                style={{ width: CARD_W, height: rect.h / cardScale, transformOrigin: '0 0', zIndex: dragging ? 50 : drawn ? 20 : tab.highlight_actor_id === card.id || isCurrent ? 5 : 1 }}
                initial={{ opacity: 0, scale: cardScale * 0.85, x: rect.x, y: rect.y }}
                animate={{ opacity: 1, scale: cardScale, x: rect.x + (dragging ? drag!.dx : 0), y: rect.y + (dragging ? drag!.dy : 0) }}
                exit={{ opacity: 0, scale: cardScale * 0.8 }}
                transition={dragging ? { duration: 0 } : { type: 'spring', stiffness: drawn ? 170 : 260, damping: drawn ? 22 : 28 }}
                onPointerDown={(e) => onPointerDown(e, card.id)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => { dragRef.current = null; setDrag(null) }}
                data-interactive={mode !== 'view' ? true : undefined}
                data-card-id={card.id}
                onClick={mode === 'view' && saga ? () => setSheetCardId(card.id) : undefined}
              >
                {/* The turn bar "draws" the current card: a flip and a lift every time the turn lands on it */}
                <motion.div
                  key={drawn ? `drawn-${tab.turn.round}` : 'still'}
                  className="draw-wrap"
                  initial={drawn ? { rotateY: 75, rotate: -6, y: -24, opacity: 0.4 } : false}
                  animate={{ rotateY: 0, rotate: 0, y: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 160, damping: 18 }}
                >
                  <CreatureCard
                    card={shown}
                    highlighted={tab.highlight_actor_id === card.id}
                    current={isCurrent}
                    dimmed={tab.spotlight && tab.highlight_actor_id !== card.id}
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
              </motion.div>
            )
          })}
        </AnimatePresence>

      </div>

      {pop && editor && commands && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} className={pop.kind === 'value' ? 'value-pop' : pop.kind === 'order' ? 'order-pop' : ''}>
          {pop.kind === 'order' ? (
            <OrderTray content={content} tab={tab} cards={cards} editor={editor} commands={commands} />
          ) : pop.kind === 'card' && popCard ? (
            <CardMenu card={popCard} set={set} tab={tab} content={content} editor={editor} commands={commands} close={() => setPop(null)}
              onOpenSheet={saga ? () => setSheetCardId(popCard.id) : undefined} />
          ) : popCard && popAttr ? (
            <ValueEditor attr={popAttr} onCommit={(value) => commitValue(popCard.id, popAttr, value)} />
          ) : null}
        </Popover>
      )}

      {/* Modals render in a portal, but React still bubbles their pointer events up to the Stage canvas (which would
          pan): stop them here */}
      <div className="portal-guard" onPointerDown={(e) => e.stopPropagation()}>
      {editor && (
        <Modal open={adding} wide title={`Add creatures to ${set.name}`} onClose={() => openAddCreatures(set.id, false)}>
          {adding && <AddCreatures setId={set.id} content={content} tab={tab} editor={editor} onClose={() => openAddCreatures(set.id, false)} />}
        </Modal>
      )}

      {saga && (
        <CharacterSheetModal
          sagaId={saga.sagaId}
          resourceId={sheetCard?.resource_id ?? null}
          setId={set.id}
          actorId={sheetCard?.id ?? null}
          refreshKey={sheetCard ? JSON.stringify(sheetCard.attributes) : ''}
          initialMode="informative"
          onClose={() => setSheetCardId(null)}
        />
      )}
      </div>
    </div>
  )
}
