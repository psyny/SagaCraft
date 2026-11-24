/** Build view settings: the scene's and the tab being built, or one card's (only what was clicked). */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../../api'
import Picture from '../../../components/Picture'
import Segmented from '../../../components/Segmented'
import VisibilityPicker from '../../../components/VisibilityPicker'
import { useSaga } from '../../../saga/SagaContext'
import TemplatePicker from '../../../saga/templates/TemplatePicker'
import type { SetInspectorProps } from '../../types'
import { sceneCommands, type SceneCommands } from './commands'
import { TabLayoutSettings, TabsOfCard } from './PlayMenus'
import { tabView, type ActorsSceneContent, type SceneConfig, type SceneTab, type TabCard } from './types'
import { openAddCreatures, setViewedTab, useViewedTab } from './viewedTab'

/** A card has no display settings of its own: it shows the character with the scene's template for its type. */
function CardSettings({ card, tab, content, set, editor, commands, onSelectActor }: {
  card: TabCard
  tab: SceneTab
  content: ActorsSceneContent
  commands: SceneCommands
} & Pick<SetInspectorProps, 'set' | 'editor' | 'onSelectActor'>) {
  const { characterTypes } = useSaga()
  const navigate = useNavigate()
  const type = characterTypes.find((t) => t.key === card.type)
  return (
    <div className="inspector">
      <section className="inspector-section">
        <div className="inspector-kind">{card.instance ? 'Instance' : 'Card'}</div>
        <div className="inspector-card-head">
          {card.picture ? <Picture url={card.picture.url} mode="face" face={card.picture.face} className="mini-pic" /> : <div className="mini-pic picture picture-empty">✦</div>}
          <div>
            <strong>{card.real_name}</strong>
            <div className="muted small">{type?.name ?? card.type} in {set.name}</div>
            {card.player_name !== card.real_name && <div className="muted small">Players see: {card.player_name ?? '???'}</div>}
            {card.instance ? <div className="muted small">Its own values: changing them here doesn't change the character.</div> : null}
          </div>
        </div>
        <div className="attr-setting-row">
          <span className="field-label">Players ({tab.name})</span>
          <Segmented<'shown' | 'hidden'>
            value={card.hidden ? 'hidden' : 'shown'}
            options={[['shown', 'Shown'], ['hidden', 'Hidden']]}
            onChange={(v) => void commands.showCard(tab.id, card.id, v === 'shown')}
          />
        </div>
        {card.group && <div className="muted small"><span className="color-dot" style={{ background: card.color ?? undefined }} /> {card.group.name}</div>}
        <TabsOfCard card={card} content={content} commands={commands} />
        <div className="field">
          <span className="field-label">Display</span>
          <span>{card.template?.name ?? 'Default'} <span className="muted small">template</span></span>
          {card.template?.id && (
            <button className="small" onClick={() => navigate(`/s/${editor.sagaId}/saga/displays/${card.template!.id}`)}>Edit this template</button>
          )}
          <span className="muted small">How cards show is set in display templates; the scene picks one per type.</span>
        </div>
      </section>

      <section className="inspector-section">
        <div className="button-row">
          <button className="danger ghost" onClick={() => { onSelectActor(null); void editor.run(() => api.deleteActor(editor.sagaId, card.id)) }}>
            Remove from the scene
          </button>
        </div>
      </section>
    </div>
  )
}

/** The scene's template per character type: "Default" unless the DM picks another. */
function SceneTemplates({ set, editor }: Pick<SetInspectorProps, 'set' | 'editor'>) {
  const { characterTypes } = useSaga()
  const [picking, setPicking] = useState<string | null>(null)
  const [names, setNames] = useState<Record<number, string>>({})
  const config = (set.content as ActorsSceneContent).config as SceneConfig
  const chosen = config.templates || {}

  useEffect(() => {
    api.displayTemplates(editor.sagaId)
      .then((data) => setNames(Object.fromEntries(data.templates.map((t) => [t.id, t.name]))))
      .catch(() => undefined)
  }, [editor.sagaId, picking])

  const type = characterTypes.find((t) => t.key === picking)
  return (
    <div className="field">
      <span className="field-label">Templates</span>
      <div className="template-slots">
        {characterTypes.map((t) => (
          <button key={t.key} className="template-slot" onClick={() => setPicking(t.key)}>
            <span className="muted small">{t.plural}</span>
            <strong>{chosen[t.key] !== undefined ? names[chosen[t.key]] ?? '…' : 'Default'}</strong>
          </button>
        ))}
      </div>
      <TemplatePicker
        open={picking !== null}
        title={type ? `Template for ${type.plural} in ${set.name}` : ''}
        value={picking !== null ? chosen[picking] ?? null : null}
        defaultLabel="Default"
        onPick={(id) => picking !== null && void editor.run(() => api.updateSet(editor.sagaId, set.id, { config: { templates: { [picking]: id } } }))}
        onClose={() => setPicking(null)}
      />
    </div>
  )
}

/** The scene's tabs: pick the one to build, rename, reorder, delete, add; show one to the players. */
function SceneTabs({ content, tab, commands, setId }: { content: ActorsSceneContent; tab: SceneTab; commands: SceneCommands; setId: number }) {
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const tabs = content.tabs || []
  return (
    <div className="field">
      <span className="field-label">Tabs</span>
      <div className="tab-list">
        {tabs.map((t, i) => (
          <div key={t.id} className={`tab-row ${t.id === tab.id ? 'on' : ''}`}>
            {renaming?.id === t.id ? (
              <input
                autoFocus
                value={renaming.name}
                onChange={(e) => setRenaming({ id: t.id, name: e.target.value })}
                onBlur={() => {
                  if (renaming.name.trim() && renaming.name !== t.name) void commands.renameTab(t.id, renaming.name)
                  setRenaming(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <button className="tab-row-name" onClick={() => setViewedTab(setId, t.id)} onDoubleClick={() => setRenaming({ id: t.id, name: t.name })} title="Build this tab (double-click to rename)">
                {t.id === content.active_tab && <span className="scene-tab-dot" title="Players see this tab" />}
                {t.name} <span className="muted small" title="Shown to players">{content.cards.filter((c) => c.tabs?.[String(t.id)]?.shown).length}</span>
              </button>
            )}
            <button className="small ghost" aria-label={`Rename ${t.name}`} onClick={() => setRenaming({ id: t.id, name: t.name })}>✎</button>
            <button className="small ghost" aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => void commands.moveTab(t.id, i - 1)}>▲</button>
            <button className="small ghost" aria-label={`Move ${t.name} down`} disabled={i === tabs.length - 1} onClick={() => void commands.moveTab(t.id, i + 1)}>▼</button>
            <button
              className="small ghost danger"
              aria-label={`Delete ${t.name}`}
              disabled={tabs.length === 1}
              onClick={() => {
                if (window.confirm(`Delete the tab "${t.name}"? The creatures stay in the scene.`)) void commands.deleteTab(t.id)
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="button-row">
        <button className="small" onClick={() => void commands.addTab()}>＋ Tab</button>
        {tab.id !== content.active_tab && (
          <button className="small" onClick={() => void commands.switchTab(tab.id)}>Show “{tab.name}” to players</button>
        )}
      </div>
    </div>
  )
}

function SceneSettings({ set, editor, onSelectActor }: Pick<SetInspectorProps, 'set' | 'editor' | 'onSelectActor'>) {
  const { saga } = useSaga()
  const content = set.content as ActorsSceneContent
  const built = useViewedTab(set.id)
  const { tab, cards } = tabView(content, built)
  const commands = sceneCommands(editor, set.id)
  const [name, setName] = useState(set.name)
  useEffect(() => setName(set.name), [set.id, set.name])
  const hiddenCount = cards.filter((c) => c.hidden).length

  return (
    <div className="inspector">
      <section className="inspector-section">
        <div className="inspector-kind">Actors Scene</div>
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
          <span className="field-label">Who sees this scene</span>
          <VisibilityPicker
            value={set.visibility || { groups: [], members: [] }}
            groups={saga.groups}
            members={saga.members}
            emptyLabel="Hidden (admins only)"
            onChange={(visibility) => editor.run(() => api.updateSet(editor.sagaId, set.id, { visibility }))}
          />
        </div>
        <SceneTemplates set={set} editor={editor} />
        <label className="check">
          <input type="checkbox" checked={Boolean(set.transparent)} onChange={(e) => editor.run(() => api.updateSet(editor.sagaId, set.id, { transparent: e.target.checked }))} />
          Transparent (no background; title bar only in Build and on hover)
        </label>
      </section>

      <section className="inspector-section">
        <SceneTabs content={content} tab={tab} commands={commands} setId={set.id} />
      </section>

      <section className="inspector-section">
        <div className="inspector-kind">Tab “{tab.name}”</div>
        <TabLayoutSettings set={set} content={content} tab={tab} editor={editor} commands={commands} />
      </section>

      <section className="inspector-section">
        <div className="inspector-kind">Creatures ({cards.length}) · shown in “{tab.name}”</div>
        <button className="primary wide" onClick={() => openAddCreatures(set.id)}>＋ Add creatures</button>
        <div className="creature-list">
          {cards.map((c) => (
            <button key={c.id} className={`creature-row ${c.hidden ? 'hidden' : ''}`} onClick={() => onSelectActor(c.id)}>
              <span>{c.real_name}</span>
              <span className="muted small">
                {c.hidden ? 'hidden' : c.player_name !== c.real_name ? `as ${c.player_name ?? '???'}` : 'visible'}
              </span>
            </button>
          ))}
        </div>
        <div className="button-row">
          <button disabled={!hiddenCount} onClick={() => void commands.showAll(tab.id, true)}>Reveal all{hiddenCount ? ` (${hiddenCount})` : ''}</button>
          <button disabled={hiddenCount === cards.length} onClick={() => void commands.showAll(tab.id, false)}>Hide all</button>
        </div>
      </section>

      <section className="inspector-section">
        <button className="danger ghost" onClick={() => editor.run(() => api.deleteSet(editor.sagaId, set.id))}>Delete scene</button>
      </section>
    </div>
  )
}

export default function ActorsSceneInspector({ set, editor, selectedActorId, onSelectActor }: SetInspectorProps) {
  const content = set.content as ActorsSceneContent
  const built = useViewedTab(set.id)
  const { tab, cards } = tabView(content, built)
  const inTab = selectedActorId !== null ? cards.find((c) => c.id === selectedActorId) : undefined
  const card = inTab ?? (selectedActorId !== null ? content.cards.find((c) => c.id === selectedActorId) : undefined)
  return card ? (
    <CardSettings card={card} tab={tab} content={content} set={set} editor={editor} commands={sceneCommands(editor, set.id)} onSelectActor={onSelectActor} />
  ) : (
    <SceneSettings set={set} editor={editor} onSelectActor={onSelectActor} />
  )
}
