import { useState } from 'react'
import { api } from '../api'
import type { Group } from '../api/types'
import MemberPicker from '../components/MemberPicker'
import Modal from '../components/Modal'
import AddMember, { ROLES } from './AddMember'
import { useSaga } from './SagaContext'

export default function MembersPage() {
  const { sagaId, saga, isAdmin, refreshSaga } = useSaga()
  const [error, setError] = useState('')
  const [group, setGroup] = useState<{ id: number | null; name: string; member_ids: number[] } | null>(null)

  if (!isAdmin) return <div className="page-message">Only the Saga's admins manage members.</div>

  const act = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
      await refreshSaga()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
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
            <thead><tr><th>Name in this Saga</th><th>Login</th><th>Role</th><th /></tr></thead>
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
          <AddMember sagaId={sagaId} onAdd={(body) => act(() => api.addMember(sagaId, body))} />
        </section>

        <section className="panel">
          <h2>Member groups</h2>
          <p className="muted small">Member groups decide who sees what. Everyone is in the group of their role. (Groups of characters, like the party, are under Characters → Groups.)</p>
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
            <div className="field">
              <span className="field-label">Members</span>
              <MemberPicker title={`Who is in ${group.name || 'the group'}`} value={group.member_ids} members={saga.members} roles={['player', 'viewer']}
                emptyLabel="No one yet" onChange={(ids) => setGroup({ ...group, member_ids: ids })} />
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
