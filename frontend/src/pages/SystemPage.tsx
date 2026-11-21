import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { UploadCategory, UploadLimits } from '../api/types'
import { useAuth } from '../auth'
import { refreshUploadLimits } from '../components/imageEditor/useUploadLimits'

type Admin = Awaited<ReturnType<typeof api.systemAdmins>>[number]
type SagaRow = Awaited<ReturnType<typeof api.allSagas>>[number]

export default function SystemPage() {
  const { me, reload } = useAuth()
  const [sagas, setSagas] = useState<SagaRow[]>([])
  const [admins, setAdmins] = useState<Admin[]>([])
  const [permissions, setPermissions] = useState<{ key: string; description: string }[]>([])
  const [rulesets, setRulesets] = useState<{ key: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [limits, setLimits] = useState<UploadLimits | null>(null)
  const [limitsSaved, setLimitsSaved] = useState(false)
  const mine = new Set(me?.system_admin?.permissions || [])

  const load = async () => {
    try {
      const [s, a, p, r] = await Promise.all([api.allSagas(), api.systemAdmins(), api.permissions(), api.rulesets()])
      setSagas(s)
      setAdmins(a)
      setPermissions(p)
      setRulesets(r)
      setLimits(await api.uploadLimits())
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  // -- new saga
  const [saga, setSaga] = useState({ name: '', ruleset_key: 'dnd_lite', admin_login: '', admin_password: '', admin_display_name: '' })
  const createSaga = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await api.createSaga({ ...saga, admin_password: saga.admin_password || null })
      setSaga({ ...saga, name: '', admin_login: '', admin_password: '', admin_display_name: '' })
      await Promise.all([load(), reload()])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // -- new system admin
  const [admin, setAdmin] = useState({ login: '', password: '', display_name: '', permissions: [] as string[] })
  const createAdmin = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await api.createSystemAdmin(admin)
      setAdmin({ login: '', password: '', display_name: '', permissions: [] })
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const setLimit = (category: UploadCategory, key: 'max_mb' | 'max_px', value: number) => {
    if (!limits) return
    setLimitsSaved(false)
    setLimits({ ...limits, categories: { ...limits.categories, [category]: { ...limits.categories[category], [key]: value } } })
  }
  const saveLimits = async () => {
    if (!limits) return
    setError('')
    try {
      const categories = Object.fromEntries(
        Object.entries(limits.categories).map(([k, v]) => [k, { max_mb: v.max_mb, max_px: v.max_px }]),
      )
      const saved = await api.updateUploadLimits(categories)
      refreshUploadLimits(saved)
      setLimits(saved)
      setLimitsSaved(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const togglePermission = async (row: Admin, key: string) => {
    const next = row.permissions.includes(key) ? row.permissions.filter((p) => p !== key) : [...row.permissions, key]
    try {
      await api.updateSystemAdmin(row.user_id, next)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="row">
          <Link to="/" className="ghost">← Home</Link>
          <h1>System administration</h1>
        </div>
      </header>
      {error && <div className="error">{error}</div>}

      <div className="columns">
        <section className="panel">
          <h2>Sagas</h2>
          <table className="table">
            <thead><tr><th>Saga</th><th>Saga template</th><th>Admins</th></tr></thead>
            <tbody>
              {sagas.map((s) => (
                <tr key={s.id}><td>{s.name}</td><td>{s.ruleset_key}</td><td>{s.admins.join(', ')}</td></tr>
              ))}
            </tbody>
          </table>
          {mine.has('sagas.create') && mine.has('saga_admins.assign') && (
            <form className="form" onSubmit={createSaga}>
              <h3>New saga</h3>
              <label>Name<input value={saga.name} onChange={(e) => setSaga({ ...saga, name: e.target.value })} /></label>
              <label>
                Saga template
                <select value={saga.ruleset_key} onChange={(e) => setSaga({ ...saga, ruleset_key: e.target.value })}>
                  {rulesets.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
              </label>
              <div className="grid-2">
                <label>Saga admin login<input value={saga.admin_login} autoCapitalize="off" onChange={(e) => setSaga({ ...saga, admin_login: e.target.value })} /></label>
                <label>Display name<input value={saga.admin_display_name} onChange={(e) => setSaga({ ...saga, admin_display_name: e.target.value })} /></label>
              </div>
              <label>
                Password <span className="muted">(leave empty to use an existing account)</span>
                <input type="password" value={saga.admin_password} onChange={(e) => setSaga({ ...saga, admin_password: e.target.value })} />
              </label>
              <button className="primary" disabled={!saga.name || !saga.admin_login}>Create saga</button>
            </form>
          )}
        </section>

        <section className="panel">
          <h2>System admins</h2>
          {admins.map((row) => (
            <div key={row.user_id} className="admin-row">
              <div><strong>{row.display_name}</strong> <span className="muted">{row.login}</span> {row.is_root && <span className="role-badge">Root</span>}</div>
              {!row.is_root && (
                <div className="chips">
                  {permissions.map((p) => (
                    <button
                      key={p.key}
                      title={p.description}
                      className={`chip ${row.permissions.includes(p.key) ? 'on' : ''}`}
                      disabled={!mine.has('system_admins.manage') || !mine.has(p.key)}
                      onClick={() => togglePermission(row, p.key)}
                    >
                      {p.key}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {mine.has('system_admins.manage') && (
            <form className="form" onSubmit={createAdmin}>
              <h3>New system admin</h3>
              <div className="grid-2">
                <label>Login<input value={admin.login} autoCapitalize="off" onChange={(e) => setAdmin({ ...admin, login: e.target.value })} /></label>
                <label>Display name<input value={admin.display_name} onChange={(e) => setAdmin({ ...admin, display_name: e.target.value })} /></label>
              </div>
              <label>Password<input type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} /></label>
              <div className="chips">
                {permissions.filter((p) => mine.has(p.key)).map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    title={p.description}
                    className={`chip ${admin.permissions.includes(p.key) ? 'on' : ''}`}
                    onClick={() =>
                      setAdmin({
                        ...admin,
                        permissions: admin.permissions.includes(p.key)
                          ? admin.permissions.filter((x) => x !== p.key)
                          : [...admin.permissions, p.key],
                      })
                    }
                  >
                    {p.key}
                  </button>
                ))}
              </div>
              <button className="primary" disabled={!admin.login}>Create system admin</button>
            </form>
          )}
        </section>

        {limits && (
          <section className="panel">
            <h2>Upload limits</h2>
            <p className="muted small">
              Pictures are cropped, resized and compressed in the browser to fit these limits, then checked
              again by the server. No limit can go over {limits.ceiling_mb} MB (MAX_UPLOAD_MB).
            </p>
            <table className="table">
              <thead><tr><th>Category</th><th>Max size (MB)</th><th>Longest side (px)</th></tr></thead>
              <tbody>
                {(Object.keys(limits.categories) as UploadCategory[]).map((key) => {
                  const value = limits.categories[key]
                  const editable = mine.has('system_settings.manage')
                  return (
                    <tr key={key}>
                      <td>{value.label}</td>
                      <td><input type="number" min={0.05} max={limits.ceiling_mb} step={0.05} value={value.max_mb} disabled={!editable} onChange={(e) => setLimit(key, 'max_mb', Number(e.target.value))} /></td>
                      <td><input type="number" min={128} max={8192} step={64} value={value.max_px} disabled={!editable} onChange={(e) => setLimit(key, 'max_px', Number(e.target.value))} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {mine.has('system_settings.manage') && (
              <div className="button-row">
                <button className="primary" onClick={saveLimits}>Save limits</button>
                {limitsSaved && <span className="muted small">Saved.</span>}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
