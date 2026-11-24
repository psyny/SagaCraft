import { motion, type MotionStyle } from 'framer-motion'
import type { CSSProperties } from 'react'
import type { DisplayStyle, Region } from '../../../api/types'
import FittedName from '../../../components/FittedName'
import Picture from '../../../components/Picture'
import { ValueBody } from '../../../saga/sheet/SheetValue'
import { REGION_LABELS } from '../../../saga/templates/modes'
import { CARD_RATIO, CARD_W, cardAttributes, hoverAttributes, topAttribute } from './layout'
import { SheetView } from '../../../saga/sheet/CharacterSheet'
import type { Card, CardAttribute } from './types'
import { frameStyle } from '../../../components/frame'

interface Props {
  card: Card
  highlighted: boolean
  /** Whose turn it is: the current-turn highlight (in the card's group color; separate from the DM's highlight). */
  current?: boolean
  dimmed: boolean
  selected: boolean
  pulse: number | null
  /** DM view: values in the DM view's style, a marker for how players see them, hidden cards ghosted. */
  admin: boolean
  /** Play view: clicking a value opens the value editor. */
  onAttrClick?: (attr: CardAttribute, element: HTMLElement) => void
}

const STYLE_MARK: Record<DisplayStyle, string> = { bar: '▬', number: '#', discrete: '●', text: 'T' }
const STYLE_NAME: Record<DisplayStyle, string> = { bar: 'a bar', number: 'the number', discrete: 'icons', text: 'the text' }

/** How players see a value, said in words (DM only). */
function playersSee(attr: CardAttribute): string | null {
  if (!attr.player_region) return null
  if (attr.player_region === 'hidden') return 'players see nothing'
  return `players see ${STYLE_NAME[attr.player_style ?? 'number']} (${REGION_LABELS[attr.player_region as Region].toLowerCase()})`
}

const editable = (attr: CardAttribute) => attr.type === 'counter' || attr.type === 'number'

/** One value: its name centred (when the template shows it), the display on the row below. */
export function AttributeRow({ attr, admin, onClick, compact = false }: { attr: CardAttribute; admin: boolean; onClick?: Props['onAttrClick']; compact?: boolean }) {
  const realValue = attr.type === 'counter' ? `${attr.current ?? '?'} / ${attr.max ?? '?'}` : String(attr.value ?? '—')
  const clickable = onClick && editable(attr) ? onClick : undefined
  const players = admin ? playersSee(attr) : null
  const playerRegion = attr.player_region
  // Mark values players see differently from the DM: another style, another place, or not at all
  let mark: string | null = null
  if (admin && playerRegion === 'hidden') mark = '⦸'
  else if (admin && attr.player_style && attr.player_style !== attr.style) mark = STYLE_MARK[attr.player_style]
  else if (admin && playerRegion && playerRegion !== attr.region) mark = playerRegion.startsWith('hover') ? '⇣' : '▣'
  const markClass = playerRegion === 'hidden' ? 'pm-hidden' : `pm-${attr.player_style}`
  // A value whose name isn't shown takes no room for it (the value band fits what it shows); the DM's mark then sits
  // on its corner
  const labelled = attr.show_label !== false && !compact

  return (
    <div
      className={`attr attr-${attr.style} ${compact ? 'compact' : ''} ${clickable ? 'clickable' : ''} ${labelled ? '' : 'no-label'}`}
      title={admin ? `${attr.label}: ${realValue}${players ? ` · ${players}` : ''}${clickable ? ' · click to change' : ''}` : undefined}
      onPointerDown={(e) => clickable && e.stopPropagation()}
      onClick={(e) => {
        if (!clickable) return
        e.stopPropagation()
        clickable(attr, e.currentTarget)
      }}
    >
      {labelled && (
        <div className="attr-label">
          {attr.label}
          {mark && <span className={`player-mode ${markClass}`} aria-label={players ?? undefined}> {mark}</span>}
        </div>
      )}
      <div className="attr-display"><ValueBody value={attr} /></div>
      {!labelled && !compact && mark && <span className={`player-mode corner ${markClass}`} aria-label={players ?? undefined}>{mark}</span>}
      {admin && attr.style === 'discrete' && <span className="real-value">{realValue}</span>}
    </div>
  )
}

/** Sheets drawn in a card: laid out at this width (a sheet's proportions and text), then scaled to the card. */
const SHEET_W = 240
const HOVER_SIDES = ['left', 'right', 'bottom'] as const

/**
 * Every card is one size in the card ratio (layout.ts); values grow its value band over the picture, what doesn't
 * fit is cut. Five card styles:
 * - face: the face crop (square) with the top band over it; values below,
 * - none: the top band, values right below,
 * - full: the whole picture in the card ratio as background; the top band on top, values on a dark band at the bottom,
 * - immersive, informative: the sheet in that mode, drawn in the card.
 * The top band holds the template's top element (usually the name). Hover regions open in trays on the left, right
 * and under the card while the pointer is on it, 5 px away, each tied to the card by a line from its centre.
 */
export default function CreatureCard({ card, highlighted, current = false, dimmed, selected, pulse, admin, onAttrClick }: Props) {
  const style = card.style
  const differentForPlayers = admin && card.player_name !== card.name
  const top = topAttribute(card)
  const band = top && (
    <div
      className="card-name band"
      style={top.key === '@name' && top.color ? { color: top.color } : undefined}
      title={differentForPlayers && top.key === '@name' ? `Players see: ${card.player_name ?? '???'}` : undefined}
    >
      {top.key === '@name'
        ? (card.name ? <FittedName name={card.name} /> : <span className="muted">???</span>)
        : <AttributeRow attr={top} admin={admin} onClick={onAttrClick} compact />}
    </div>
  )
  const values = (
    <div className="card-attrs">
      {cardAttributes(card).map((attr) => (
        <AttributeRow key={attr.key} attr={attr} admin={admin} onClick={onAttrClick} />
      ))}
    </div>
  )
  const initial = <div className="picture picture-empty card-initial">{(card.name || '?').slice(0, 1)}</div>
  const groupColor = card.color ? ({ '--group': card.color } as CSSProperties) : undefined

  return (
    <>
      {/* The trays' lines first (under the card and the trays): they show in the gap between them */}
      {HOVER_SIDES.map((side) => hoverAttributes(card, side).length > 0 && <div key={`link-${side}`} className={`tray-link link-${side}`} aria-hidden />)}
      <motion.div
        className={['creature-card', card.frame && 'framed', `style-${style}`, highlighted && 'highlighted', current && 'current-turn', selected && 'selected', card.defeated && 'defeated', card.hidden && 'ghost', card.inactive && 'inactive']
          .filter(Boolean).join(' ')}
        style={{ ...(groupColor as object | undefined), ...frameStyle(card.frame) } as MotionStyle}
        animate={{ scale: highlighted ? 1.06 : 1, opacity: dimmed ? 0.32 : card.hidden ? 0.55 : 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      >
        {pulse !== null && <motion.div key={pulse} className="attention-ring" initial={{ opacity: 0.9, scale: 0.9 }} animate={{ opacity: 0, scale: 1.25 }} transition={{ duration: 1.4, repeat: 2 }} />}

        {style === 'face' && (
          <>
            <div className="card-face">
              {card.picture ? <Picture url={card.picture.url} mode="face" face={card.picture.face} className="card-face-pic" /> : initial}
              {band}
            </div>
            {values}
          </>
        )}

        {style === 'none' && (
          <>
            {band}
            {values}
          </>
        )}

        {(style === 'immersive' || style === 'informative') && (
          <div className="card-sheet">
            {card.sheet ? (
              <div className="card-sheet-page" style={{ width: SHEET_W, height: SHEET_W / CARD_RATIO, transform: `scale(${CARD_W / SHEET_W})` }}>
                <SheetView sheet={card.sheet} mode={style} />
              </div>
            ) : initial}
          </div>
        )}

        {style === 'full' && (
          <>
            <div className="card-bg">{card.picture ? <Picture url={card.picture.url} mode="full" className="card-bg-pic" /> : initial}</div>
            {band}
            <div className="card-bottom band">{values}</div>
          </>
        )}

        {card.defeated && <div className="defeated-mark" aria-label="defeated">☠</div>}
        {card.hidden && <div className="hidden-badge">Hidden</div>}
        {card.inactive && <div className="hidden-badge">Inactive</div>}
      </motion.div>

      {current && <div className="turn-badge" style={groupColor} aria-label="Current turn">Turn</div>}

      {HOVER_SIDES.map((side) => {
        const list = hoverAttributes(card, side)
        return list.length > 0 && (
          <div key={side} className={`hover-tray tray-${side}`}>
            {list.map((attr) => <AttributeRow key={attr.key} attr={attr} admin={admin} onClick={onAttrClick} />)}
          </div>
        )
      })}
    </>
  )
}
