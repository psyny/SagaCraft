/** Build view settings: either the panel's or one card's, never both (only what was clicked). */
import { useEffect, useState } from 'react'
import { api } from '../../../api'
import type { DisplayOn, DisplayStyle, Resource } from '../../../api/types'
import Modal from '../../../components/Modal'
import Picture from '../../../components/Picture'
import Segmented from '../../../components/Segmented'
import VisibilityPicker from '../../../components/VisibilityPicker'
import { useSaga } from '../../../saga/SagaContext'
import type { SetInspectorProps } from '../../types'
import type { AttributeView, Card, CardConfig, CardViewConfig, CreaturePanelContent, PanelConfig } from './types'

const STYLE_LABELS: Record<DisplayStyle, string> = { bar: 'Bar', number: 'Number', discrete: 'Balls' }
const PLACE_OPTIONS: [DisplayOn, string][] = [['card', 'Card'], ['hover', 'Hover'], ['hidden', 'Hidden']]

type ViewKey = 'player' | 'dm'

/** One view of a card (the players' or the DM's): the same options in both. */
function ViewSettings({ view, card, config, save, editor }: {
  view: ViewKey
  card: Card
  config: CardConfig
  save: (changes: Partial<CardConfig>) => Promise<void>
  editor: SetInspectorProps['editor']
}) {
  const settings = config[view]
  const [name, setName] = useState(settings.name || '')
  useEffect(() => setName(settings.name || ''), [card.id, settings.name])
  const byKey = Object.fromEntries(card.attributes.map((a) => [a.key, a]))
  const setView = (changes: Partial<CardViewConfig>) => save({ [view]: changes } as Partial<CardConfig>)
  const setAttr = (key: string, changes: Partial<AttributeView>) =>
    save({ attributes: config.attributes.map((a) => (a.key === key ? { ...a, [view]: { ...a[view], ...changes } } : a)) })

  const hidden = view === 'player' ? Boolean(card.hidden) : Boolean(settings.hidden)
  const setHidden = (value: boolean) =>
    view === 'player'
      ? editor.run(() => api.updateActor(editor.sagaId, card.id, { revealed: !value }))
      : setView({ hidden: value })

  return (
    <section className="inspector-section">
      <div className="inspector-kind">{view === 'player' ? 'Player view' : 'DM view'}</div>
      <div className="attr-setting-row">
        <span className="field-label">Card</span>
        <Segmented<'shown' | 'hidden'>
          value={hidden ? 'hidden' : 'shown'}
          options={[['shown', 'Shown'], ['hidden', 'Hidden']]}
          onChange={(v) => void setHidden(v === 'hidden')}
        />
      </div>
      {view === 'dm' && hidden && <span className="muted small">Left out of your Play view; still listed here.</span>}
      <label>
        Name
        <input
          placeholder={card.real_name}
          value={name}
          disabled={settings.hide_name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== (settings.name || '') && setView({ name: name || null })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.hide_name} onChange={(e) => setView({ hide_name: e.target.checked })} /> Hide the name (shows ???)
      </label>

      <span className="field-label">Values</span>
      {config.attributes.map((entry) => {
        const attr = byKey[entry.key]
        const isCounter = attr?.type !== 'number'
        const current = entry[view]
        const styles: DisplayStyle[] = isCounter ? ['bar', 'number', 'discrete'] : ['number']
        return (
          <div key={entry.key} className={`attr-setting ${current.display_on === 'hidden' ? 'off' : ''}`}>
            <div className="attr-setting-row">
              <strong>{attr?.label || entry.key}</strong>
              <Segmented<DisplayOn> value={current.display_on} options={PLACE_OPTIONS} onChange={(display_on) => setAttr(entry.key, { display_on })} />
            </div>
            {styles.length > 1 && current.display_on !== 'hidden' && (
              <div className="attr-setting-row">
                <span className="field-label">Style</span>
                <Segmented<DisplayStyle>
                  value={current.style}
                  options={styles.map((s) => [s, STYLE_LABELS[s]] as [DisplayStyle, string])}
                  onChange={(style) => setAttr(entry.key, { style })}
                />
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

function CardSettings({ card, set, editor, onSelectActor }: { card: Card } & Pick<SetInspectorProps, 'set' | 'editor' | 'onSelectActor'>) {
  const config = card.config as CardConfig
  const save = (changes: Partial<CardConfig>) => editor.run(() => api.updateActor(editor.sagaId, card.id, { config: changes }))

  return (
    <div className="inspector">
      <section className="inspector-section">
        <div className="inspector-kind">Card</div>
        <div className="inspector-card-head">
          {card.picture ? <Picture url={card.picture.url} mode="face" face={card.picture.face} className="mini-pic" /> : <div className="mini-pic picture picture-empty">✦</div>}
          <div>
            <strong>{card.real_name}</strong>
            <div className="muted small">in {set.name}</div>
          </div>
        </div>
        <div className="field">
          <span className="field-label">Card style</span>
          <Segmented
            value={(config.card_style || 'default') as 'default' | 'face' | 'full' | 'none'}
            options={[['default', 'Panel default'], ['face', 'Face'], ['full', 'Full'], ['none', 'None']]}
            onChange={(v) => save({ card_style: v === 'default' ? null : v })}
          />
        </div>
      </section>

      <ViewSettings view="player" card={card} config={config} save={save} editor={editor} />
      <ViewSettings view="dm" card={card} config={config} save={save} editor={editor} />

      <section className="inspector-section">
        <button
          className="danger ghost"
          onClick={() => {
            onSelectActor(null)
            void editor.run(() => api.deleteActor(editor.sagaId, card.id))
          }}
        >
          Remove from panel
        </button>
      </section>
    </div>
  )
}

function AddCreatures({ set, editor, onClose }: { onClose: () => void } & Pick<SetInspectorProps, 'set' | 'editor'>) {
  const [characters, setCharacters] = useState<Resource[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const content = set.content as CreaturePanelContent
  const already = new Set(content.cards.map((c) => c.resource_id))

  useEffect(() => {
    api.resources(editor.sagaId, 'character').then(setCharacters).catch(() => setCharacters([]))
  }, [editor.sagaId])

  const add = async (hidden: boolean) => {
    await editor.run(() => api.addActors(editor.sagaId, set.id, picked, hidden))
    onClose()
  }

  return (
    <>
      {characters.length === 0 && <p className="muted">No characters yet. Create them in the Characters tab.</p>}
      <div className="pick-grid">
        {characters.map((c) => {
          const portrait = c.attributes.portrait as { url?: string; face?: { x: number; y: number; size: number } } | undefined
          const on = picked.includes(c.id)
          return (
            <button key={c.id} type="button" className={`pick ${on ? 'on' : ''}`} onClick={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])}>
              <Picture url={portrait?.url} mode="face" face={portrait?.face} className="mini-pic" />
              <span>{c.name}</span>
              <span className="muted small">{c.type.toUpperCase()}{already.has(c.id) ? ' · on panel' : ''}</span>
            </button>
          )
        })}
      </div>
      <div className="button-row end">
        <button disabled={!picked.length} onClick={() => add(false)}>Add and reveal</button>
        <button className="primary" disabled={!picked.length} onClick={() => add(true)}>Add {picked.length || ''} hidden</button>
      </div>
    </>
  )
}

function PanelSettings({ set, editor, onSelectActor }: Pick<SetInspectorProps, 'set' | 'editor' | 'onSelectActor'>) {
  const { saga } = useSaga()
  const content = set.content as CreaturePanelContent
  const config = content.config as PanelConfig
  const [name, setName] = useState(set.name)
  const [adding, setAdding] = useState(false)
  useEffect(() => setName(set.name), [set.id, set.name])
  const setPanel = (changes: Partial<PanelConfig>) => editor.run(() => api.updateSet(editor.sagaId, set.id, { config: changes }))
  const hiddenCount = content.cards.filter((c) => c.hidden).length

  return (
    <div className="inspector">
      <section className="inspector-section">
        <div className="inspector-kind">Creature panel</div>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== set.name && editor.run(() => api.updateSet(editor.sagaId, set.id, { name }))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <div className="field">
          <span className="field-label">Who sees this panel</span>
          <VisibilityPicker
            value={set.visibility || { groups: [], members: [] }}
            groups={saga.groups}
            members={saga.members}
            emptyLabel="Hidden (admins only)"
            onChange={(visibility) => editor.run(() => api.updateSet(editor.sagaId, set.id, { visibility }))}
          />
        </div>
        <div className="field">
          <span className="field-label">Card style</span>
          <Segmented value={config.card_style} options={[['face', 'Face'], ['full', 'Full picture'], ['none', 'No picture']]} onChange={(card_style) => setPanel({ card_style })} />
          <span className="muted small">Each card can override it.</span>
        </div>
        <label className="check">
          <input type="checkbox" checked={Boolean(set.transparent)} onChange={(e) => editor.run(() => api.updateSet(editor.sagaId, set.id, { transparent: e.target.checked }))} />
          Transparent (no background; title bar only in Build and on hover)
        </label>
        <p className="muted small">Arrange cards, highlight and grab attention from the Play view.</p>
      </section>

      <section className="inspector-section">
        <div className="inspector-kind">Creatures ({content.cards.length})</div>
        <button className="primary wide" onClick={() => setAdding(true)}>＋ Add creatures</button>
        <div className="creature-list">
          {content.cards.map((c) => (
            <button key={c.id} className={`creature-row ${c.hidden ? 'hidden' : ''}`} onClick={() => onSelectActor(c.id)}>
              <span>{c.real_name}</span>
              <span className="muted small">
                {c.hidden ? 'hidden' : c.player_name !== c.real_name ? `as ${c.player_name ?? '???'}` : 'visible'}
                {c.dm_hidden ? ' · hidden from DM' : ''}
              </span>
            </button>
          ))}
        </div>
        <div className="button-row">
          <button disabled={!hiddenCount} onClick={() => editor.run(() => api.revealAll(editor.sagaId, set.id, true))}>Reveal all{hiddenCount ? ` (${hiddenCount})` : ''}</button>
          <button disabled={hiddenCount === content.cards.length} onClick={() => editor.run(() => api.revealAll(editor.sagaId, set.id, false))}>Hide all</button>
        </div>
      </section>

      <section className="inspector-section">
        <button className="danger ghost" onClick={() => editor.run(() => api.deleteSet(editor.sagaId, set.id))}>Delete panel</button>
      </section>

      <Modal open={adding} title="Add creatures" onClose={() => setAdding(false)}>
        <AddCreatures set={set} editor={editor} onClose={() => setAdding(false)} />
      </Modal>
    </div>
  )
}

export default function CreaturePanelInspector({ set, editor, selectedActorId, onSelectActor }: SetInspectorProps) {
  const content = set.content as CreaturePanelContent
  const card = selectedActorId !== null ? content.cards.find((c) => c.id === selectedActorId) : undefined
  return card ? (
    <CardSettings card={card} set={set} editor={editor} onSelectActor={onSelectActor} />
  ) : (
    <PanelSettings set={set} editor={editor} onSelectActor={onSelectActor} />
  )
}
