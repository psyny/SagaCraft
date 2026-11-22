/**
 * What a Desktop piece shows, at its natural size (layout.ts; the view scales it to its box):
 * - ItemCard: a framed card (picture, name banner, category, the tier gem in its colour, the item template's values);
 *   it tilts toward the pointer with a sheen, and the top tier shimmers,
 * - DocumentPiece: the page the DM is on (a text page, or a picture and its title),
 * - characters use the Actors Scene's card or the sheet (stage/sets/actorsScene/CreatureCard, saga/sheet).
 */
import { useState, type PointerEvent } from 'react'
import Picture from '../../../components/Picture'
import SheetValue from '../../../saga/sheet/SheetValue'
import { DOCUMENT, ITEM, tierColor } from './layout'
import type { Piece } from './types'

type ItemPiece = Extract<Piece, { kind: 'item' }>
type DocumentPieceT = Extract<Piece, { kind: 'document' }>

export function ItemCard({ piece }: { piece: ItemPiece }) {
  const [tilt, setTilt] = useState<{ x: number; y: number } | null>(null)
  const sheet = piece.sheet
  const color = tierColor(piece.tier)
  const top = Boolean(piece.tier && piece.tier.of > 1 && piece.tier.index === piece.tier.of - 1)
  const picture = sheet.picture ?? (piece.icon ? { url: piece.icon.url, face: null } : null)
  // Its values, but not the name, pictures, the category or the tier (the banner and the gem show those)
  const values = sheet.informative.filter((v) => !['@name', '@category', piece.tier?.key].includes(v.key) && v.type !== 'image')
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTilt({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 })
  }
  return (
    <div className={`item-card ${top ? 'top-tier' : ''}`} style={{ width: ITEM.w, height: ITEM.h, ['--tier' as string]: color,
      transform: tilt ? `perspective(700px) rotateY(${tilt.x * 14}deg) rotateX(${-tilt.y * 14}deg)` : undefined,
      ['--sheen-x' as string]: tilt ? `${(tilt.x + 0.5) * 100}%` : '50%', ['--sheen-y' as string]: tilt ? `${(tilt.y + 0.5) * 100}%` : '0%' }}
      onPointerMove={onMove} onPointerLeave={() => setTilt(null)}>
      <div className="item-card-art">
        {picture?.url ? <Picture url={picture.url} mode="full" className="item-card-pic" />
          : <div className="item-card-initial">{(sheet.name || '?').slice(0, 1)}</div>}
        {piece.tier && <span className="item-card-gem" title={`${piece.tier.name}: ${piece.tier.label}`} />}
      </div>
      <div className="item-card-banner">
        <strong>{sheet.name ?? '???'}</strong>
        <span>{[sheet.category_name ?? sheet.type_name, piece.tier?.label].filter(Boolean).join(' · ')}</span>
      </div>
      {values.length > 0 && (
        <div className="item-card-values">{values.map((v) => <SheetValue key={v.key} value={v} />)}</div>
      )}
      <div className="item-card-sheen" aria-hidden />
    </div>
  )
}

export function DocumentPiece({ piece }: { piece: DocumentPieceT }) {
  const page = piece.current
  return (
    <div className="desk-document" style={{ width: DOCUMENT.w, height: DOCUMENT.h }}>
      <div className="desk-document-head">
        <strong>{piece.title ?? '???'}</strong>
        {piece.count > 1 && <span className="muted small">{piece.page + 1} / {piece.count}</span>}
      </div>
      {!page && <p className="muted">No pages yet.</p>}
      {page?.title && <h3 className="desk-document-title">{page.title}</h3>}
      {page?.kind === 'text' && <div className="desk-document-text">{page.text}</div>}
      {page?.kind === 'image' && page.image?.url && <Picture url={page.image.url} mode="full" className="desk-document-pic" />}
    </div>
  )
}
