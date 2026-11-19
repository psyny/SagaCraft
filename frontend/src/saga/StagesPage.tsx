import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { SetTypeInfo, StageSummary, StageView } from '../api/types'
import Segmented from '../components/Segmented'
import StageCanvas, { type Selection } from '../stage/StageCanvas'
import { SET_TYPE_UIS } from '../stage/sets/registry'
import type { StageEditor } from '../stage/types'
import { useSaga } from './SagaContext'

type View = 'build' | 'play'

/**
 * The DM's Stages. Every Stage has two views:
 * - Build: put Sets on it, move/resize them; the side panel shows the settings of what you clicked.
 * - Play: the Stage as players see it; click things to act (change values, arrange, highlight...).
 */
export default function StagesPage() {
  const { sagaId, isAdmin, onStageUpdated, live } = useSaga()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [stages, setStages] = useState<StageSummary[]>([])
  const [stage, setStage] = useState<StageView | null>(null)
  const [setTypes, setSetTypes] = useState<SetTypeInfo[]>([])
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)

  // The open Stage, view and selection live in the URL, so the Stage tab can link straight to a card's settings
  const currentId = params.get('stage') ? Number(params.get('stage')) : null
  const view: View = params.get('view') === 'play' ? 'play' : 'build'
  const selection: Selection | null = params.get('set')
    ? { setId: Number(params.get('set')), actorId: params.get('card') ? Number(params.get('card')) : null }
    : null
  const go = useCallback(
    (changes: { stage?: number | null; view?: View; selection?: Selection | null }) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        const put = (key: string, value: string | null) => (value === null ? next.delete(key) : next.set(key, value))
        if (changes.stage !== undefined) {
          put('stage', changes.stage === null ? null : String(changes.stage))
          put('set', null)
          put('card', null)
        }
        if (changes.view) put('view', changes.view === 'play' ? 'play' : null)
        if (changes.selection !== undefined) {
          put('set', changes.selection ? String(changes.selection.setId) : null)
          put('card', changes.selection?.actorId ? String(changes.selection.actorId) : null)
        }
        return next
      }, { replace: true })
    },
    [setParams],
  )

  const loadList = useCallback(async () => {
    const list = await api.stages(sagaId)
    setStages(list)
    return list
  }, [sagaId])

  useEffect(() => {
    if (!isAdmin) return
    loadList().then((list) => {
      if (currentId === null && list.length) go({ stage: list.find((s) => s.is_live)?.id ?? list[0].id })
    })
    api.setTypes(sagaId).then(setSetTypes).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, sagaId])

  useEffect(() => {
    if (currentId === null) return setStage(null)
    api.stage(sagaId, currentId).then(setStage).catch((e: Error) => setError(e.message))
  }, [currentId, sagaId])

  // Someone (another DM tab, a player's HP change...) changed a Stage: refresh what's open
  useEffect(
    () =>
      onStageUpdated((ids) => {
        if (currentId !== null && ids.includes(currentId)) api.stage(sagaId, currentId).then(setStage).catch(() => undefined)
        void loadList()
      }),
    [onStageUpdated, currentId, sagaId, loadList],
  )

  // Keep the live marker in sync with the socket
  useEffect(() => {
    setStages((list) => list.map((s) => ({ ...s, is_live: s.id === live?.id })))
    setStage((st) => (st ? { ...st, is_live: st.id === live?.id } : st))
  }, [live?.id])

  const editor: StageEditor | undefined = useMemo(() => {
    if (!stage) return undefined
    return {
      sagaId,
      stage,
      apply: (next) => setStage(next),
      run: async (action) => {
        setError('')
        try {
          const result = await action()
          if (result && typeof result === 'object' && 'sets' in result && (result as StageView).id === stage.id) {
            setStage(result as StageView)
          }
        } catch (e) {
          setError((e as Error).message)
        }
      },
      openSettings: (setId, actorId) => go({ view: 'build', selection: { setId, actorId } }),
    }
  }, [stage, sagaId, go])

  if (!isAdmin) return <div className="page-message">Only the Saga's admins prepare Stages.</div>

  const createStage = async () => {
    const created = await api.createStage(sagaId, `Stage ${stages.length + 1}`)
    await loadList()
    setStage(created)
    go({ stage: created.id, view: 'build' })
  }

  const goLive = async (stageId: number | null) => {
    setError('')
    try {
      await api.setLive(sagaId, stageId)
      await loadList()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const selectedSet = stage?.sets.find((s) => s.id === selection?.setId)
  const Inspector = selectedSet ? SET_TYPE_UIS[selectedSet.type]?.Inspector : undefined

  return (
    <div className={`workshop view-${view}`}>
      <aside className="stage-list">
        <div className="stage-list-head">
          <h3>Stages</h3>
          <button className="primary small" onClick={createStage}>＋ New</button>
        </div>
        {stages.map((s) => (
          <div key={s.id} className={`stage-item ${s.id === currentId ? 'current' : ''}`} onClick={() => go({ stage: s.id })}>
            <span className="stage-item-name">{s.name}</span>
            {s.is_live ? (
              <span className="live-pill">LIVE</span>
            ) : (
              <button className="small ghost go-live" title="Show this Stage to the players" onClick={(e) => {
                e.stopPropagation()
                void goLive(s.id)
              }}>▶ Go live</button>
            )}
          </div>
        ))}
        {stages.length === 0 && <p className="muted small">No stages yet. Create one to start.</p>}
      </aside>

      <section className="workshop-main">
        {stage ? (
          <>
            <div className="toolbar stacked">
              <div className="toolbar-title">
              {renaming !== null ? (
                <input className="stage-name-input" autoFocus value={renaming}
                  onChange={(e) => setRenaming(e.target.value)}
                  onBlur={async () => {
                    if (renaming.trim() && renaming !== stage.name) await editor!.run(() => api.renameStage(sagaId, stage.id, renaming))
                    setRenaming(null)
                    void loadList()
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
              ) : (
                <h2 className="stage-name" onClick={() => setRenaming(stage.name)} title="Click to rename">{stage.name}</h2>
              )}
              </div>
              <div className="toolbar-row">
              <Segmented<View> value={view} options={[['build', '✎ Build'], ['play', '▶ Play']]} onChange={(v) => go({ view: v })} />
              {stage.is_live ? (
                <button className="live-button on" onClick={() => goLive(null)} title="Stop showing (players see a dark stage)">● Live · Stop</button>
              ) : (
                <button className="live-button" onClick={() => goLive(stage.id)} title="Show this Stage to the players">Go live</button>
              )}
              </div>
            </div>
            <AnimatePresence>
              {error && (
                <motion.div className="error floating" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => setError('')}>
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="workshop-canvas">
              <StageCanvas
                stage={stage}
                mode={view}
                editor={editor}
                selection={view === 'build' ? selection : null}
                onSelect={(sel) => go({ selection: sel })}
              />
              {view === 'play' && (
                <div className="play-hint">Click a value to change it, a card for its menu, a panel title to arrange it. Drag cards to move them.</div>
              )}
            </div>
          </>
        ) : (
          <div className="page-message">Create a Stage to start building scenes.</div>
        )}
      </section>

      {view === 'build' && stage && editor && (
        <aside className="workshop-inspector">
          {selectedSet && Inspector ? (
            <Inspector
              key={`${selectedSet.id}-${selection?.actorId ?? 'set'}`}
              set={selectedSet}
              editor={editor}
              selectedActorId={selection?.actorId ?? null}
              onSelectActor={(actorId) => go({ selection: { setId: selectedSet.id, actorId } })}
            />
          ) : (
            <div className="inspector">
              <section className="inspector-section">
                <div className="inspector-kind">Stage</div>
                <strong>{stage.name}</strong>
                <span className="muted small">{stage.sets.length} {stage.sets.length === 1 ? 'Set' : 'Sets'} · {stage.is_live ? 'live now' : 'not live'}</span>
                <div className="field">
                  <span className="field-label">Add a Set</span>
                  <div className="button-row">
                    {setTypes.map((t) => (
                      <button key={t.key} onClick={() => editor.run(() => api.addSet(sagaId, stage.id, t.key))}>＋ {t.name}</button>
                    ))}
                  </div>
                </div>
                <p className="muted small">Click a Set or a card on the canvas to see its settings. Drag a Set by its title; resize it from the corner.</p>
              </section>
              <section className="inspector-section">
                <div className="button-row">
                  <button onClick={async () => {
                    const copy = await api.duplicateStage(sagaId, stage.id)
                    await loadList()
                    go({ stage: copy.id })
                  }}>Duplicate stage</button>
                  <button className="ghost danger" onClick={async () => {
                    if (!window.confirm(`Delete "${stage.name}"? This can't be undone.`)) return
                    await api.deleteStage(sagaId, stage.id)
                    go({ stage: null })
                    await loadList()
                    navigate(`/s/${sagaId}/stages`, { replace: true })
                  }}>Delete stage</button>
                </div>
              </section>
            </div>
          )}
        </aside>
      )}
    </div>
  )
}
