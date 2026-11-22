/**
 * Saga → User (everyone): your account (display name, password) and how you show in this Saga: your colour (your
 * characters' token borders, pings to come) and your dice style (the dice roller to come; Minimalist for now).
 * See docs/concepts/sagas-and-access.md ("Your account").
 */
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import ColorPicker from '../components/ColorPicker'
import Token from '../components/Token'
import { useSaga } from './SagaContext'

const DICE: [string, string, string][] = [['minimal', 'Minimalist', 'Clean faces in your colour']]

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

  const run = async (action: () => Promise<unknown>, done: string) => {
    setError('')
    setNote('')
    try {
      await action()
      setNote(done)
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
      <header className="page-header"><h1>User</h1></header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      {note && <p className="muted small" role="status">{note}</p>}
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
            <div className="chips">
              {DICE.map(([key, label, hint]) => (
                <button key={key} type="button" title={hint} className={`chip ${saga.me.die_style === key ? 'on' : ''}`}
                  onClick={() => cosmetic({ die_style: key })}>{label}</button>
              ))}
            </div>
            <span className="muted small">How your dice look when you roll, in your colour (the dice roller comes later).</span>
          </div>
        </section>
      </div>
    </div>
  )
}
