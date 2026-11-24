/**
 * The Desktop Set: pieces the DM lays out for the players (characters, items, documents, pictures). See
 * set_types/desktop.py and layout.ts.
 * - Auto: pieces in rows at one scale that fills the desk; Free: each piece's own place, size and angle; Focus: one
 *   piece big in the middle, the others in a row at the bottom (‹ › at its ends: previous, next), nothing dragged.
 * - A piece's bar has Focus (from any layout: it switches to Focus with that piece in the middle).
 * - The DM (Play and Build) adds pieces from the main toolbar, clicks one to get its bar (eye, a character's display
 *   and template, a document's pages, remove), and drags it; in Free, resizes it (corner) and rotates it (top handle,
 *   Shift: 15° steps). Dragging in Auto switches the desk to Free, everything staying where it was.
 * - Players only look: the desk as the DM arranged it, scaled to their screen.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { api } from '../../../api'
import type { Resource } from '../../../api/types'
import EyeIcon from '../../../components/EyeIcon'
import ImageUploader from '../../../components/imageEditor/ImageUploader'
import Modal from '../../../components/Modal'
import Picture, { PictureScale } from '../../../components/Picture'
import ResourcePicker from '../../../components/ResourcePicker'
import Segmented from '../../../components/Segmented'
import { SheetView } from '../../../saga/sheet/CharacterSheet'
import { TITLE_H } from '../../constants'
import Toolbar from '../../Toolbar'
import type { SetViewProps } from '../../types'
import CreatureCard from '../actorsScene/CreatureCard'
import { autoLayout, focusLayout, freeBox, layoutSize, naturalSize, toPlace, type Box } from './layout'
import { DocumentPiece, ItemCard } from './Pieces'
import type { CharacterMode, DeskLayout, DesktopContent, Piece } from './types'

const MODES: [CharacterMode, string][] = [['face', 'Card: face'], ['full', 'Card: full'], ['none', 'Card: values'], ['immersive', 'Sheet: immersive'], ['informative', 'Sheet: informative']]
type Drag = { id: number; kind: 'move' | 'resize' | 'rotate'; x: number; y: number; start: Box; box: Box; moved: boolean }

export default function DesktopView({ set, mode, editor }: SetViewProps) {
  const content = set.content as DesktopContent
  const admin = content.config !== undefined
  const canEdit = admin && Boolean(editor) && mode !== 'view'
  const W = set.width, H = set.height - TITLE_H
  const desk = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // A piece just dropped stays where it was dropped until the server's places arrive (no jump back and forth)
  const [dropped, setDropped] = useState<{ id: number; box: Box } | null>(null)
  useEffect(() => setDropped(null), [set.content])
  const [adding, setAdding] = useState<'character' | 'item' | 'document' | null>(null)
  const [uploading, setUploading] = useState(false)

  const sizes = content.pieces.map(layoutSize) // where they go
  const natural = content.pieces.map(naturalSize) // what they draw (scaled to their box)
  const auto = autoLayout(sizes, W, H, content.gap)
  const focusMode = content.layout === 'focus'
  const focusIndex = focusMode && content.focus_id != null ? content.pieces.findIndex((p) => p.id === content.focus_id) : -1
  // Focus: the turn bar's way, upside down (the row at the bottom); the arrows are the DM's
  const focused = focusMode ? focusLayout(natural, focusIndex >= 0 ? focusIndex : null, W, H, canEdit) : null
  const boxes = focused ? focused.boxes
    : content.layout === 'free' ? content.pieces.map((p, i) => freeBox(p.position, sizes[i], W, H, auto[i])) : auto
  const boxOf = (i: number) => (drag && drag.id === content.pieces[i].id ? drag.box
    : dropped && dropped.id === content.pieces[i].id ? dropped.box : boxes[i])
  const order = content.pieces.map((_, i) => i).sort((a, b) => (boxOf(a)?.z ?? 0) - (boxOf(b)?.z ?? 0))

  const command = (name: string, args: Record<string, unknown>) => editor && editor.run(() => api.setCommand(editor.sagaId, set.id, name, args))
  const scale = () => {
    const el = desk.current
    return el ? el.getBoundingClientRect().width / el.clientWidth || 1 : 1
  }
  const deskPoint = (e: ReactPointerEvent) => {
    const r = desk.current!.getBoundingClientRect()
    const s = scale()
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }
  }

  const start = (e: ReactPointerEvent, piece: Piece, i: number, kind: Drag['kind']) => {
    if (!canEdit || e.button !== 0) return
    e.stopPropagation()
    if (focusMode) { // Focus: pieces are picked, not moved
      setSelected(piece.id)
      return
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setSelected(piece.id)
    setDrag({ id: piece.id, kind, x: e.clientX, y: e.clientY, start: boxes[i], box: boxes[i], moved: false })
  }
  const move = (e: ReactPointerEvent) => {
    if (!drag) return
    const s = scale()
    const dx = (e.clientX - drag.x) / s, dy = (e.clientY - drag.y) / s
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    const b = drag.start
    let box: Box = b
    if (drag.kind === 'move') box = { ...b, x: b.x + dx, y: b.y + dy }
    if (drag.kind === 'resize') {
      const w = Math.max(40, b.w + dx)
      box = { ...b, w, h: w * (b.h / b.w) }
    }
    if (drag.kind === 'rotate') {
      const p = deskPoint(e)
      let rot = (Math.atan2(p.y - (b.y + b.h / 2), p.x - (b.x + b.w / 2)) * 180) / Math.PI + 90
      if (rot > 180) rot -= 360
      if (e.shiftKey) rot = Math.round(rot / 15) * 15
      box = { ...b, rot }
    }
    setDrag({ ...drag, box, moved: true })
  }
  const end = () => {
    const d = drag
    setDrag(null)
    if (!d || !d.moved) return
    setDropped({ id: d.id, box: d.box })
    if (content.layout === 'free') {
      void command('pieces.place', { positions: { [d.id]: toPlace(d.box, W, H) } })
    } else {
      // Arranging by hand: Free, with every piece where Auto had it (and this one where it was dropped)
      const positions = Object.fromEntries(content.pieces.map((p, i) => [p.id, toPlace(p.id === d.id ? d.box : auto[i], W, H)]))
      void command('pieces.place', { positions, layout: 'free', front: d.id })
    }
  }

  const add = (resources: Resource[]) => editor && resources.length && void editor.run(() => api.addActors(editor.sagaId, set.id, { resource_ids: resources.map((r) => r.id) }))
  const piece = content.pieces.find((p) => p.id === selected) ?? null
  const pieceIndex = piece ? content.pieces.indexOf(piece) : -1

  return (
    <div className={`desktop-set mode-${mode}`}>
      {canEdit && (
        <Toolbar id="main">
          <button className="small" onClick={() => setAdding('character')}>＋ Character</button>
          <button className="small" onClick={() => setAdding('item')}>＋ Item</button>
          <button className="small" onClick={() => setAdding('document')}>＋ Document</button>
          <button className="small" onClick={() => setUploading(true)}>＋ Picture</button>
          <Segmented<DeskLayout> value={content.layout} options={[['auto', 'Auto'], ['free', 'Free'], ['focus', 'Focus']]}
            onChange={(layout) => void editor!.run(() => api.updateSet(editor!.sagaId, set.id, { config: { layout } }))} />
        </Toolbar>
      )}
      <div ref={desk} className={`desk layout-${content.layout} ${content.pieces.length ? '' : 'empty'}`} style={{ height: H }} data-interactive={canEdit ? true : undefined}
        onPointerDown={() => canEdit && setSelected(null)} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}>
        {content.pieces.length === 0 && (
          // Empty: nothing shows (the Set is invisible and lets clicks through), but in Build, to find it
          mode === 'build' && <div className="panel-empty">An empty desk: add characters, items, documents or pictures from its options in the Set bar.</div>
        )}
        {order.map((i) => {
          const p = content.pieces[i]
          const box = boxOf(i)
          if (!box) return null
          const nat = natural[i]
          // A picture is drawn at its box's size; the others at their own size, scaled (their pictures asked for big)
          const flat = p.kind === 'image'
          const place = focusMode ? (i === focusIndex ? 'in-focus' : 'in-row') : ''
          return (
            <div key={p.id} className={`desk-piece kind-${p.kind} ${place} ${p.id === selected && canEdit ? 'selected' : ''} ${p.shown === false ? 'hidden-piece' : ''} ${drag?.id === p.id ? 'dragging' : ''}`}
              style={{ left: box.x, top: box.y, width: box.w, height: box.h, transform: box.rot ? `rotate(${box.rot}deg)` : undefined, zIndex: (box.z ?? 0) + 1 }}
              onPointerDown={(e) => start(e, p, i, 'move')}>
              <div className="desk-piece-inner" style={flat ? { width: box.w, height: box.h } : { width: nat.w, height: nat.h, transform: `scale(${box.w / nat.w})` }}>
                <PictureScale.Provider value={flat ? 1 : box.w / nat.w}>
                  <PieceBody piece={p} admin={admin} />
                </PictureScale.Provider>
              </div>
              {p.caption && p.kind === 'image' && <div className="desk-caption">{p.caption}</div>}
              {p.shown === false && <span className="desk-hidden" title="Only you see it"><EyeIcon open={false} /></span>}
              {p.id === selected && canEdit && !focusMode && (
                <>
                  <span className="desk-handle resize" title="Resize" onPointerDown={(e) => start(e, p, i, 'resize')} />
                  <span className="desk-handle rotate" title="Rotate (Shift: 15° steps)" onPointerDown={(e) => start(e, p, i, 'rotate')} />
                </>
              )}
            </div>
          )
        })}
        {focused?.arrows && (
          // Previous and next at the row's ends (the DM's): the piece before or after the one in focus
          (['prev', 'next'] as const).map((which) => {
            const at = focused.arrows![which]
            const end = which === 'prev' ? focusIndex <= 0 : focusIndex < 0 || focusIndex >= content.pieces.length - 1
            return (
              <button key={which} className="desk-arrow" data-interactive aria-label={which === 'prev' ? 'Previous piece' : 'Next piece'}
                title={which === 'prev' ? 'Previous' : 'Next'} disabled={end}
                style={{ left: at.x, top: at.y, width: focused.arrows!.size, height: focused.arrows!.size }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => { setSelected(null); void command('piece.focus', { step: which === 'prev' ? -1 : 1 }) }}>
                {which === 'prev' ? '‹' : '›'}
              </button>
            )
          })
        )}
        {piece && canEdit && boxOf(pieceIndex) && !drag && (
          // Well above the piece (clear of its rotate handle), or under it when it's at the desk's top
          <div className="desk-bar" data-interactive style={{ left: Math.max(0, boxOf(pieceIndex)!.x),
            top: boxOf(pieceIndex)!.y >= 64 ? boxOf(pieceIndex)!.y - 60 : boxOf(pieceIndex)!.y + boxOf(pieceIndex)!.h + 14, zIndex: 9999 }}
            onPointerDown={(e) => e.stopPropagation()}>
            <button className="small ghost" title={piece.shown === false ? 'Only you see it: show it to the players' : 'Players see it: hide it'}
              onClick={() => void command('piece.set', { actor_id: piece.id, shown: piece.shown === false })}><EyeIcon open={piece.shown !== false} /></button>
            <button className="small ghost" disabled={focusMode && piece.id === content.focus_id}
              title={focusMode && piece.id === content.focus_id ? 'In focus' : 'Focus: bring it to the middle, the others in a row below'}
              onClick={() => void command('piece.focus', { actor_id: piece.id })}>◎ Focus</button>
            {piece.kind === 'character' && (
              <select className="small" aria-label="Display" value={piece.mode} onChange={(e) => void command('piece.set', { actor_id: piece.id, mode: e.target.value })}>
                {MODES.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
              </select>
            )}
            {(piece.kind === 'character' || piece.kind === 'item') && (
              <select className="small" aria-label="Template" value={piece.template_id ?? ''}
                onChange={(e) => void command('piece.set', { actor_id: piece.id, template_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Its default template</option>
                {(content.templates?.[piece.kind] ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {piece.kind === 'document' && piece.count > 1 && (
              <>
                <button className="small" aria-label="Previous page" disabled={piece.page <= 0} onClick={() => void command('piece.set', { actor_id: piece.id, page: piece.page - 1 })}>‹</button>
                <span className="small">{piece.page + 1} / {piece.count}</span>
                <button className="small" aria-label="Next page" disabled={piece.page >= piece.count - 1} onClick={() => void command('piece.set', { actor_id: piece.id, page: piece.page + 1 })}>›</button>
              </>
            )}
            <button className="small ghost danger" title={piece.kind === 'image' ? 'Remove it (its picture is deleted)' : 'Take it off the desk'}
              onClick={() => { setSelected(null); void editor!.run(() => api.deleteActor(editor!.sagaId, piece.id)) }}>✕</button>
          </div>
        )}
      </div>
      {editor && (
        <div className="portal-guard" onPointerDown={(e) => e.stopPropagation()}>
          <ResourcePicker open={adding !== null} title={adding ? `Put ${adding === 'item' ? 'items' : `${adding}s`} on the desk` : ''}
            kinds={adding ? [adding] : []} multiple onPick={(_, list) => add(list)} onClose={() => setAdding(null)} />
          <Modal open={uploading} wide title="A picture for the desk" onClose={() => setUploading(false)}>
            {uploading && (
              <ImageUploader sagaId={editor.sagaId} category="desk" onCancel={() => setUploading(false)}
                onUploaded={(file) => { setUploading(false); void command('image.add', { file_id: file.id }) }} />
            )}
          </Modal>
        </div>
      )}
    </div>
  )
}

function PieceBody({ piece, admin }: { piece: Piece; admin: boolean }) {
  switch (piece.kind) {
    case 'character':
      return piece.card
        ? <CreatureCard card={piece.card} highlighted={false} dimmed={false} selected={false} pulse={null} admin={admin} />
        : piece.sheet ? <div className="desk-sheet"><SheetView sheet={piece.sheet} mode={piece.mode === 'immersive' ? 'immersive' : 'informative'} open /></div> : null
    case 'item':
      return <ItemCard piece={piece} />
    case 'document':
      return <DocumentPiece piece={piece} />
    case 'image':
      return <Picture url={piece.url} mode="full" className="desk-picture" />
  }
}
