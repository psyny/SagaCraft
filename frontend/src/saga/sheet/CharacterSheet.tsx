import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { Sheet, SheetMode } from '../../api/types'
import Modal from '../../components/Modal'
import Picture from '../../components/Picture'
import Segmented from '../../components/Segmented'
import SheetValue from './SheetValue'

const MODE_KEY = 'sagacraft.sheetMode'

/** The sheet mode chosen on this device (each person picks how they like to read sheets). */
export function useSheetMode(): [SheetMode, (mode: SheetMode) => void] {
  const [mode, setMode] = useState<SheetMode>(() => (localStorage.getItem(MODE_KEY) === 'informative' ? 'informative' : 'immersive'))
  return [mode, (next) => {
    localStorage.setItem(MODE_KEY, next)
    setMode(next)
  }]
}

/**
 * A sheet, drawn from what the server sent for this viewer:
 * - immersive: the picture as the whole background, the name on top, values on the bottom half,
 * - informative: the face at the top left, highlighted values next to it, everything else below.
 */
export function SheetView({ sheet, mode }: { sheet: Sheet; mode: SheetMode }) {
  const name = sheet.name ?? '???'
  if (mode === 'immersive') {
    return (
      <div className="sheet sheet-immersive">
        <div className="sheet-bg">
          {sheet.picture ? <Picture url={sheet.picture.url} mode="full" className="sheet-bg-pic" /> : <div className="picture picture-empty sheet-initial">{name.slice(0, 1)}</div>}
        </div>
        <div className="sheet-title band">
          <h2>{name}</h2>
          <span className="muted small">{sheet.type_name}</span>
        </div>
        <div className="sheet-lower">
          {sheet.immersive.length === 0 && <p className="muted small">Nothing more to show.</p>}
          <div className="sheet-values">
            {sheet.immersive.map((v) => <SheetValue key={v.key} value={v} />)}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="sheet sheet-informative">
      <div className="sheet-top">
        <Picture url={sheet.picture?.url} mode="face" face={sheet.picture?.face} className="sheet-face" />
        <div className="sheet-side">
          <div>
            <h2 className="sheet-name">{name}</h2>
            <span className="muted small">{sheet.type_name}</span>
          </div>
          <div className="sheet-highlights">
            {sheet.informative.highlight.map((v) => <SheetValue key={v.key} value={v} big />)}
          </div>
        </div>
      </div>
      {sheet.informative.body.length > 0 && (
        <div className="sheet-rest">
          {sheet.informative.body.map((v) => <SheetValue key={v.key} value={v} />)}
        </div>
      )}
    </div>
  )
}

interface ModalProps {
  sagaId: number
  /** The character to show; null closes the sheet. */
  resourceId: number | null
  /** Opened from a Set: its template choice applies. */
  setId?: number | null
  /** Changes when the character may have changed (e.g. the Stage updated): the sheet reloads. */
  refreshKey?: string | number
  onClose: () => void
  /** "Edit" in the header, for those who may edit the character. */
  onEdit?: (resourceId: number) => void
}

/** The character sheet in a modal, with the immersive / informative switch. */
export default function CharacterSheetModal({ sagaId, resourceId, setId, refreshKey, onClose, onEdit }: ModalProps) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useSheetMode()

  useEffect(() => {
    if (resourceId === null) return setSheet(null)
    setError('')
    api.sheet(sagaId, resourceId, setId).then(setSheet).catch((e: Error) => setError(e.message))
  }, [sagaId, resourceId, setId, refreshKey])

  const shown = sheet && sheet.resource_id === resourceId ? sheet : null
  return (
    <Modal
      open={resourceId !== null}
      title={shown ? (shown.name ?? '???') : ''}
      onClose={onClose}
      className={`sheet-modal mode-${mode}`}
      actions={
        <>
          <Segmented<SheetMode> value={mode} options={[['immersive', 'Immersive'], ['informative', 'Informative']]} onChange={setMode} />
          {onEdit && resourceId !== null && <button className="small" onClick={() => onEdit(resourceId)}>✎ Edit</button>}
        </>
      }
    >
      {error && <div className="error">{error}</div>}
      {shown ? <SheetView sheet={shown} mode={mode} /> : !error && <p className="muted">Loading…</p>}
      {shown?.real_name && shown.player_name !== shown.real_name && (
        <p className="muted small sheet-note">Players see this character as {shown.player_name ?? '???'}.</p>
      )}
    </Modal>
  )
}
