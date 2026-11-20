import { motion } from 'framer-motion'
import type { DisplayOn, DisplayStyle } from '../../../api/types'
import FittedName from '../../../components/FittedName'
import Picture from '../../../components/Picture'
import { Balls, Bar, Num } from './AttributeDisplays'
import { cardAttributes, hoverAttributes } from './layout'
import type { Card, CardAttribute } from './types'

interface Props {
  card: Card
  highlighted: boolean
  dimmed: boolean
  selected: boolean
  pulse: number | null
  /** DM view: values in the DM view's style, a marker for how players see them, hidden cards ghosted. */
  admin: boolean
  /** Play view: clicking a value opens the value editor. */
  onAttrClick?: (attr: CardAttribute, element: HTMLElement) => void
}

const STYLE_MARK: Record<DisplayStyle, string> = { bar: '▬', number: '#', discrete: '●' }
const STYLE_NAME: Record<DisplayStyle, string> = { bar: 'a bar', number: 'the number', discrete: 'balls' }
const PLACE_NAME: Partial<Record<DisplayOn, string>> = { card: 'on the card', hover: 'on hover', hidden: 'nothing' }

/** How players see a value, said in words (DM only). */
function playersSee(attr: CardAttribute): string | null {
  if (!attr.player_style || !attr.player_display_on) return null
  if (attr.player_display_on === 'hidden') return 'players see nothing'
  return `players see ${STYLE_NAME[attr.player_style]} ${PLACE_NAME[attr.player_display_on]}`
}

/** One value: its name centred, the display on the row below. */
function AttributeRow({ attr, admin, onClick }: { attr: CardAttribute; admin: boolean; onClick?: Props['onAttrClick'] }) {
  const realValue = attr.type === 'counter' ? `${attr.current ?? '?'} / ${attr.max ?? '?'}` : String(attr.value ?? '—')

  let body
  if (attr.style === 'bar' && attr.type === 'counter') {
    body = <Bar current={attr.current ?? 0} max={attr.max ?? 0} />
  } else if (attr.style === 'discrete' && attr.level !== undefined) {
    body = <Balls level={attr.level} levels={attr.levels ?? 4} />
  } else if (attr.type === 'counter') {
    body = <span className="attr-value"><Num value={attr.current} /> / {attr.max}</span>
  } else {
    body = <span className="attr-value"><Num value={attr.value as number | null | undefined} /></span>
  }

  const players = admin ? playersSee(attr) : null
  const playerPlace = attr.player_display_on
  // Mark values players see differently from the DM: another style, another place, or not at all
  let mark: string | null = null
  if (admin && playerPlace === 'hidden') mark = '⦸'
  else if (admin && attr.player_style && attr.player_style !== attr.style) mark = STYLE_MARK[attr.player_style]
  else if (admin && playerPlace && playerPlace !== attr.display_on) mark = playerPlace === 'hover' ? '⇣' : '▣'
  const markClass = playerPlace === 'hidden' ? 'pm-hidden' : `pm-${attr.player_style}`

  return (
    <div
      className={`attr attr-${attr.style} ${onClick ? 'clickable' : ''}`}
      title={admin ? `${attr.label}: ${realValue}${players ? ` · ${players}` : ''}${onClick ? ' · click to change' : ''}` : undefined}
      onPointerDown={(e) => onClick && e.stopPropagation()}
      onClick={(e) => {
        if (!onClick) return
        e.stopPropagation()
        onClick(attr, e.currentTarget)
      }}
    >
      <div className="attr-label">
        {attr.label}
        {mark && <span className={`player-mode ${markClass}`} aria-label={players ?? undefined}> {mark}</span>}
      </div>
      <div className="attr-display">{body}</div>
      {admin && attr.style === 'discrete' && <span className="real-value">{realValue}</span>}
    </div>
  )
}

/**
 * Three card styles:
 * - face: the face crop on top with the name on a dark band over it; values below,
 * - none: the name band, values right below,
 * - full: the whole picture as background; name band on top, values on a dark band at the bottom.
 * Values set to show "on hover" go in a tray that opens under the card while the pointer is on it.
 */
export default function CreatureCard({ card, highlighted, dimmed, selected, pulse, admin, onAttrClick }: Props) {
  const style = card.style
  const differentForPlayers = admin && card.player_name !== card.name
  const name = (
    <div
      className="card-name band"
      title={differentForPlayers ? `Players see: ${card.player_name ?? '???'}` : undefined}
    >
      {card.name ? <FittedName name={card.name} /> : <span className="muted">???</span>}
    </div>
  )
  const values = (
    <div className="card-attrs">
      {cardAttributes(card).map((attr) => (
        <AttributeRow key={attr.key} attr={attr} admin={admin} onClick={onAttrClick} />
      ))}
    </div>
  )
  const hover = hoverAttributes(card)
  const initial = <div className="picture picture-empty card-initial">{(card.name || '?').slice(0, 1)}</div>

  return (
    <>
      <motion.div
        className={['creature-card', `style-${style}`, highlighted && 'highlighted', selected && 'selected', card.defeated && 'defeated', card.hidden && 'ghost']
          .filter(Boolean).join(' ')}
        animate={{ scale: highlighted ? 1.06 : 1, opacity: dimmed ? 0.32 : card.hidden ? 0.55 : 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      >
        {pulse !== null && <motion.div key={pulse} className="attention-ring" initial={{ opacity: 0.9, scale: 0.9 }} animate={{ opacity: 0, scale: 1.25 }} transition={{ duration: 1.4, repeat: 2 }} />}

        {style === 'face' && (
          <>
            <div className="card-face">
              {card.picture ? <Picture url={card.picture.url} mode="face" face={card.picture.face} className="card-face-pic" /> : initial}
              {name}
            </div>
            {values}
          </>
        )}

        {style === 'none' && (
          <>
            {name}
            {values}
          </>
        )}

        {style === 'full' && (
          <>
            <div className="card-bg">{card.picture ? <Picture url={card.picture.url} mode="full" className="card-bg-pic" /> : initial}</div>
            {name}
            <div className="card-bottom band">{values}</div>
          </>
        )}

        {card.defeated && <div className="defeated-mark" aria-label="defeated">☠</div>}
        {card.hidden && <div className="hidden-badge">Hidden</div>}
      </motion.div>

      {hover.length > 0 && (
        <div className="hover-tray">
          {hover.map((attr) => (
            <AttributeRow key={attr.key} attr={attr} admin={admin} onClick={onAttrClick} />
          ))}
        </div>
      )}
    </>
  )
}
