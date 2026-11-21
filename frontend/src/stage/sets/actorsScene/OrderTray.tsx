/**
 * The order tray: the tab's cards in order, each with move up / move down and its sort value (initiative)
 * typed in place. Moving a card while sorted by a value keeps the order you see and switches to your order.
 */
import { useEffect, useState } from 'react'
import { api } from '../../../api'
import type { StageEditor } from '../../types'
import type { SceneCommands } from './commands'
import type { ActorsSceneContent, SceneTab, TabCard } from './types'

function SortValueInput({ card, sortKey, editor }: { card: TabCard; sortKey: string; editor: StageEditor }) {
  const saved = card.sort_values?.[sortKey]
  const [text, setText] = useState(saved === undefined ? '' : String(saved))
  useEffect(() => setText(saved === undefined ? '' : String(saved)), [saved])
  const commit = () => {
    const value = text.trim() === '' ? null : Number(text.replace(',', '.'))
    if (value !== null && Number.isNaN(value)) return setText(saved === undefined ? '' : String(saved))
    if (value === (saved ?? null)) return
    void editor.run(() => api.actorValues(editor.sagaId, card.id, { [sortKey]: value }))
  }
  return (
    <input
      className="order-value"
      inputMode="numeric"
      aria-label={`${card.real_name ?? card.name} ${sortKey}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        commit()
        // Enter jumps to the next row: type everyone's initiative in one go
        const inputs = [...document.querySelectorAll<HTMLInputElement>('.order-tray .order-value')]
        inputs[inputs.indexOf(e.currentTarget) + 1]?.focus()
      }}
    />
  )
}

export default function OrderTray({ content, tab, cards, editor, commands }: {
  content: ActorsSceneContent
  tab: SceneTab
  cards: TabCard[]
  editor: StageEditor
  commands: SceneCommands
}) {
  const keys = content.sort_keys || []
  // The value typed in place: what the tab is sorted by, else the Saga template's turn order (initiative)
  const sortKey = tab.order_by !== 'custom' ? tab.order_by : content.turn_order ?? keys[0]?.[0]
  const sortName = keys.find(([k]) => k === sortKey)?.[1] ?? sortKey
  // In order, not rotated: the tray shows who goes first
  const byId = new Map(cards.map((c) => [c.id, c]))
  const rows = (tab.sequence ?? tab.card_ids).flatMap((id) => byId.get(id) ?? [])

  return (
    <div className="order-tray menu wide">
      <div className="menu-title">Order · {tab.name}</div>
      <div className="order-head">
        <span className="muted small">{tab.order_by === 'custom' ? 'Your order' : `By ${sortName}, highest first`}</span>
        {keys.map(([key, name]) => (
          <button key={key} className={`small ${tab.order_by === key ? 'on' : ''}`} onClick={() => void commands.orderBy(tab.id, key)}>
            Sort by {name}
          </button>
        ))}
      </div>
      {rows.length === 0 && <p className="muted small">No creatures in this tab.</p>}
      <ol className="order-list">
        {rows.map((card, i) => (
          <li key={card.id} className={`order-row ${card.id === tab.turn.actor_id ? 'current' : ''} ${card.defeated ? 'defeated' : ''} ${card.hidden ? 'hidden' : ''}`}>
            <span className="order-pos">{i + 1}</span>
            <span className="order-name" title={card.hidden ? 'Hidden from players' : undefined}>
              {card.real_name ?? card.name ?? '???'}{card.hidden ? ' ⦸' : ''}{card.defeated ? ' ☠' : ''}
            </span>
            {sortKey && <SortValueInput card={card} sortKey={sortKey} editor={editor} />}
            <button className="small" aria-label={`Move ${card.real_name} up`} disabled={i === 0} onClick={() => void commands.moveCard(tab.id, card.id, -1)}>▲</button>
            <button className="small" aria-label={`Move ${card.real_name} down`} disabled={i === rows.length - 1} onClick={() => void commands.moveCard(tab.id, card.id, 1)}>▼</button>
          </li>
        ))}
      </ol>
      <div className="menu-row">
        <button className="primary" disabled={!rows.length} onClick={() => void commands.turn(tab.id, 'start')}>⏮ Start</button>
        {!tab.turn_controls && (
          <button onClick={() => void commands.setTab(tab.id, { turn_controls: true })}>Show turn controls</button>
        )}
      </div>
    </div>
  )
}
