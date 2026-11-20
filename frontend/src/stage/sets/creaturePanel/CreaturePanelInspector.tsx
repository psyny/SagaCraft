/** Build view settings: either the panel's or one card's, never both (only what was clicked). */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../../api'
import type { Resource } from '../../../api/types'
import Modal from '../../../components/Modal'
import Picture from '../../../components/Picture'
import Segmented from '../../../components/Segmented'
import VisibilityPicker from '../../../components/VisibilityPicker'
import { useSaga } from '../../../saga/SagaContext'
import type { SetInspectorProps } from '../../types'
import TemplatePicker from '../../../saga/templates/TemplatePicker'
import type { Card, CreaturePanelContent, PanelConfig } from './types'

/** A card has no display settings of its own: it shows the character with the panel's template for its type. */
function CardSettings({ card, set, editor, onSelectActor }: { card: Card } & Pick<SetInspectorProps, 'set' | 'editor' | 'onSelectActor'>) {
  const { ruleset } = useSaga()
  const navigate = useNavigate()
  const typeName = ruleset.kinds.character?.types[card.type]?.name || card.type
  return (
    <div className="inspector">
      <section className="inspector-section">
        <div className="inspector-kind">Card</div>
        <div className="inspector-card-head">
          {card.picture ? <Picture url={card.picture.url} mode="face" face={card.picture.face} className="mini-pic" /> : <div className="mini-pic picture picture-empty">✦</div>}
          <div>
            <strong>{card.real_name}</strong>
            <div className="muted small">{typeName} in {set.name}</div>
            {card.player_name !== card.real_name && <div className="muted small">Players see: {card.player_name ?? '???'}</div>}
          </div>
        </div>
        <div className="attr-setting-row">
          <span className="field-label">Players</span>
          <Segmented<'shown' | 'hidden'>
            value={card.hidden ? 'hidden' : 'shown'}
            options={[['shown', 'Shown'], ['hidden', 'Hidden']]}
            onChange={(v) => void editor.run(() => api.updateActor(editor.sagaId, card.id, { revealed: v === 'shown' }))}
          />
        </div>
        <div className="field">
          <span className="field-label">Display</span>
          <span>{card.template?.name ?? 'Default'} <span className="muted small">template</span></span>
          {card.template?.id && (
            <button className="small" onClick={() => navigate(`/s/${editor.sagaId}/characters/templates/${card.template!.id}`)}>Edit this template</button>
          )}
          <span className="muted small">How cards show is set in display templates; the panel picks one per character type.</span>
        </div>
      </section>

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

/** The panel's template per character type: "Default" unless the DM picks another. */
function PanelTemplates({ set, editor }: Pick<SetInspectorProps, 'set' | 'editor'>) {
  const { ruleset } = useSaga()
  const [picking, setPicking] = useState<string | null>(null)
  const [names, setNames] = useState<Record<number, string>>({})
  const config = (set.content as CreaturePanelContent).config as PanelConfig
  const chosen = config.templates || {}
  const types = Object.entries(ruleset.kinds.character?.types || {})

  useEffect(() => {
    api.displayTemplates(editor.sagaId)
      .then((data) => setNames(Object.fromEntries(data.templates.map((t) => [t.id, t.name]))))
      .catch(() => undefined)
  }, [editor.sagaId, picking])

  const typeName = (key: string) => ruleset.kinds.character?.types[key]?.plural || key
  return (
    <div className="field">
      <span className="field-label">Templates</span>
      <div className="template-slots">
        {types.map(([key]) => (
          <button key={key} className="template-slot" onClick={() => setPicking(key)}>
            <span className="muted small">{typeName(key)}</span>
            <strong>{chosen[key] !== undefined ? names[chosen[key]] ?? '…' : 'Default'}</strong>
          </button>
        ))}
      </div>
      <TemplatePicker
        open={picking !== null}
        title={picking ? `Template for ${typeName(picking)} in ${set.name}` : ''}
        value={picking ? chosen[picking] ?? null : null}
        defaultLabel="Default"
        onPick={(id) => picking && void editor.run(() => api.updateSet(editor.sagaId, set.id, { config: { templates: { [picking]: id } } }))}
        onClose={() => setPicking(null)}
      />
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
          <span className="muted small">Each style's layout is set in the display templates.</span>
        </div>
        <PanelTemplates set={set} editor={editor} />
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
