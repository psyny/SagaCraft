import { useState, type FormEvent } from 'react'
import { api } from '../api'
import type { Group, Role } from '../api/types'
import Modal from '../components/Modal'
import { useSaga } from './SagaContext'

const ROLES: [Role, string][] = [['admin', 'Admin (DM)'], ['player', 'Player'], ['viewer', 'Viewer']]

export default function MembersPage() {
  const { sagaId, saga, isAdmin, refreshSaga } = useSaga()
  const [error, setError] = useState('')
  const [form, setForm] = useState({ login: '', display_name: '', password: '', role: 'player' })
  const [group, setGroup] = useState<{ id: number | null; name: string; member_ids: number[] } | null>(null)

  if (!isAdmin) return <div className="page-message">Only the Saga's admins manage members.</div>

  const act = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
      await refreshSaga()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const add = (event: FormEvent) => {
    event.preventDefault()
    void act(async () => {
      await api.addMember(sagaId, { ...form, password: form.password || null })
      setForm({ login: '', display_name: '', password: '', role: form.role })
    })
  }

  const custom = saga.groups.filter((g) => !g.is_default)
  const defaults = saga.groups.filter((g) => g.is_default)
  const name = (id: number) => saga.members.find((m) => m.id === id)?.display_name || '?'

  return (
    <div className="page">
      <header className="page-header"><h1>Members</h1></header>
      {error && <div className="error">{error}</div>}
      <div className="columns">
        <section className="panel">
          <h2>People</h2>
          <table className="table">
            <thead><tr><th>Name</th><th>Login</th><th>Role</th><th /></tr></thead>
            <tbody>
              {saga.members.map((m) => (
                <tr key={m.id}>
                  <td>{m.display_name}{m.id === saga.me.member_id && <span className="muted"> (you)</span>}</td>
                  <td className="muted">{m.login}</td>
                  <td>
                    <select value={m.role} onChange={(e) => act(() => api.updateMember(sagaId, m.id, e.target.value))}>
                      {ROLES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </td>
                  <td>
                    {m.id !== saga.me.member_id && (
                      <button className="ghost danger small" onClick={() => window.confirm(`Remove ${m.display_name} from the saga?`) && act(() => api.removeMember(sagaId, m.id))}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="form" onSubmit={add}>
            <h3>Add someone</h3>
            <div className="grid-2">
              <label>Login<input value={form.login} autoCapitalize="off" onChange={(e) => setForm({ ...form, login: e.target.value })} /></label>
              <label>Display name<input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
            </div>
            <div className="grid-2">
              <label>Password <span className="muted small">(empty: existing account)</span>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </label>
              <label>Role
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
            </div>
            <button className="primary" disabled={!form.login}>Add to saga</button>
          </form>
        </section>

        <section className="panel">
          <h2>Groups</h2>
          <p className="muted small">Groups decide who sees what. Everyone is in the group of their role.</p>
          {[...defaults, ...custom].map((g: Group) => (
            <div key={g.id} className="group-row">
              <div>
                <strong>{g.name}</strong> {g.is_default && <span className="role-badge">default</span>}
                <div className="muted small">{g.member_ids.map(name).join(', ') || 'Nobody yet'}</div>
              </div>
              {!g.is_default && (
                <div className="row">
                  <button className="ghost small" onClick={() => setGroup({ id: g.id, name: g.name, member_ids: g.member_ids })}>Edit</button>
                  <button className="ghost danger small" onClick={() => act(() => api.deleteGroup(sagaId, g.id))}>Delete</button>
                </div>
              )}
            </div>
          ))}
          <button onClick={() => setGroup({ id: null, name: '', member_ids: [] })}>＋ New group</button>
        </section>
      </div>

      <Modal open={group !== null} title={group?.id ? 'Edit group' : 'New group'} onClose={() => setGroup(null)}>
        {group && (
          <div className="form">
            <label>Name<input value={group.name} autoFocus onChange={(e) => setGroup({ ...group, name: e.target.value })} /></label>
            <div className="chips">
              {saga.members.filter((m) => m.role !== 'admin').map((m) => (
                <button key={m.id} type="button" className={`chip ${group.member_ids.includes(m.id) ? 'on' : ''}`}
                  onClick={() => setGroup({ ...group, member_ids: group.member_ids.includes(m.id) ? group.member_ids.filter((x) => x !== m.id) : [...group.member_ids, m.id] })}>
                  {m.display_name}
                </button>
              ))}
            </div>
            <div className="button-row end">
              <button className="primary" disabled={!group.name.trim()} onClick={() => act(async () => {
                await api.saveGroup(sagaId, group.id, group.name, group.member_ids)
                setGroup(null)
              })}>Save</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
