/**
 * Saga → User (everyone): your account (display name, password) and how you show in this Saga: your colour (your
 * characters' token borders, pings) and your dice style (the Dice roller's 3D dice; a live preview of the one picked or
 * pointed at, in your colour).
 * See docs/concepts/sagas-and-access.md ("Your account").
 */
import { useRef, useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import ColorPicker from '../components/ColorPicker'
import Token from '../components/Token'
import DiceScene from '../dice/DiceScene'
import { DIE_STYLE_GROUPS, DIE_STYLES } from '../dice/styles'
import { useSaga } from './SagaContext'

export default function UserPage() {
  const { sagaId, saga, refreshSaga } = useSaga()
  const { me, reload } = useAuth()
  const mine = saga.members.find((m) => m.id === saga.me.member_id)
  const [name, setName] = useState(me?.display_name ?? mine?.display_name ?? '')
  const [password, setPassword] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const color = mine?.color ?? '#d6a84a'
  const [hover, setHover] = useState<string | null>(null)
  const shownStyle = hover ?? saga.me.die_style ?? 'minimal'
  // The styles' group on show (only here: a member's style is just its key): the picked style's, until another is opened
  const pickedGroup = DIE_STYLES.find(([k]) => k === saga.me.die_style)?.[3] ?? DIE_STYLE_GROUPS[0]
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const group = openGroup ?? pickedGroup

  const noteTimer = useRef(0)
  const run = async (action: () => Promise<unknown>, done: string) => {
    setError('')
    setNote('')
    try {
      await action()
      setNote(done)
      window.clearTimeout(noteTimer.current)
      noteTimer.current = window.setTimeout(() => setNote(''), 2500)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const saveName = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => { await api.updateAccount({ display_name: name }); await reload(); await refreshSaga() }, 'Name saved.')
  }
  const savePassword = (e: FormEvent) => {
    e.preventDefault()
    if (next !== again) return setError('The new passwords differ')
    void run(async () => {
      await api.updateAccount({ password, new_password: next })
      setPassword(''); setNext(''); setAgain('')
    }, 'Password changed.')
  }
  const cosmetic = (body: { color?: string | null; die_style?: string }) =>
    void run(async () => { await api.updateMyMember(sagaId, body); await refreshSaga() }, 'Saved.')

  return (
    <div className="page user-page">
      {/* "Saved." in the header's own spot: the page doesn't move when it comes and goes */}
      <header className="page-header"><h1>User</h1><span className={`save-note ${note ? 'on' : ''}`} role="status">{note}</span></header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <div className="user-columns">
        <section className="settings-card">
          <h2>Account</h2>
          <form className="form" onSubmit={saveName}>
            <label>Display name<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
            <div className="button-row"><button className="primary" disabled={!name.trim() || name.trim() === (me?.display_name ?? '')}>Save the name</button>
              <span className="muted small">Shown to everyone, in every Saga you're in.</span></div>
          </form>
          <form className="form" onSubmit={savePassword}>
            <label>Current password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <label>New password<input type="password" autoComplete="new-password" minLength={6} value={next} onChange={(e) => setNext(e.target.value)} /></label>
            <label>New password again<input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></label>
            <div className="button-row"><button disabled={!password || next.length < 6 || !again}>Change the password</button>
              <span className="muted small">At least 6 characters.</span></div>
          </form>
        </section>
        <section className="settings-card">
          <h2>In {saga.name}</h2>
          <div className="field">
            <span className="field-label">Your colour</span>
            <div className="user-color">
              <Token id="me" icon={null} name={mine?.display_name ?? '?'} color={color} size={64} />
              <ColorPicker label="Your colour" value={color} onChange={(c) => cosmetic({ color: c })} />
            </div>
            <span className="muted small">The border of your characters' tokens on maps (several players: white), and later your pings.
              {saga.me.color === null && ' This one was given to you: pick your own.'}</span>
          </div>
          <div className="field">
            <span className="field-label">Dice</span>
            <div className="dice-style-picker">
              <DiceScene width={200} height={150} preview tray={[
                { id: 1, sides: 20, color, style: shownStyle }, { id: 2, sides: 6, color, style: shownStyle },
              ]} />
              <div className="dice-style-choice">
                <span className="dice-style-row-label">Group</span>
                <div className="chips" role="tablist" aria-label="Dice style groups">
                  {DIE_STYLE_GROUPS.map((g) => (
                    <button key={g} type="button" role="tab" aria-selected={g === group} className={`chip ${g === group ? 'on' : ''}`}
                      onClick={() => setOpenGroup(g)}>
                      {g}{g === pickedGroup && g !== group && <span className="dice-style-mine" title="Your style is in this group" />}
                    </button>
                  ))}
                </div>
                <span className="dice-style-row-label">Style</span>
                <div className="dice-styles" onPointerLeave={() => setHover(null)}>
                  {DIE_STYLES.filter(([, , , g]) => g === group).map(([key, label, hint]) => (
                    <button key={key} type="button" title={hint} className={`dice-style ${saga.me.die_style === key ? 'on' : ''}`}
                      onPointerEnter={() => setHover(key)} onFocus={() => setHover(key)} onClick={() => cosmetic({ die_style: key })}>
                      <strong className="small">{label}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <span className="muted small">{DIE_STYLES.find(([k]) => k === shownStyle)?.[2]} Your dice on the Dice roller, in your colour.</span>
          </div>
        </section>
      </div>
    </div>
  )
}
