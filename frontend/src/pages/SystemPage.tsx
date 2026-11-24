/**
 * System administration (plan 43: tabs, in the address as ?tab=): **Sagas** (5 at a time: search, order, on or off;
 * each opens its own page, /system/sagas/:id), **Users** (System → Users, plan 42), **System admins** (who holds which
 * permission; made and changed from Users), **Upload limits**.
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { UploadCategory, UploadLimits } from '../api/types'
import { useAuth } from '../auth'
import { refreshUploadLimits } from '../components/imageEditor/useUploadLimits'
import SystemSagas from './SystemSagas'
import SystemUsers from './SystemUsers'

type Admin = Awaited<ReturnType<typeof api.systemAdmins>>[number]

export default function SystemPage() {
  const { me, reload } = useAuth()
  const [admins, setAdmins] = useState<Admin[]>([])
  const [permissions, setPermissions] = useState<{ key: string; description: string }[]>([])
  const [rulesets, setRulesets] = useState<{ key: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [limits, setLimits] = useState<UploadLimits | null>(null)
  const [limitsSaved, setLimitsSaved] = useState(false)
  const mine = new Set(me?.system_admin?.permissions || [])
  const tabs: [string, string][] = [
    ['sagas', 'Sagas'], ...(mine.has('users.manage') ? [['users', 'Users'] as [string, string]] : []),
    ['admins', 'System admins'], ['limits', 'Upload limits'],
  ]
  const [params, setParams] = useSearchParams()
  const tab = tabs.some(([k]) => k === params.get('tab')) ? params.get('tab')! : 'sagas'

  const load = async () => {
    try {
      const [a, p, r] = await Promise.all([api.systemAdmins(), api.permissions(), api.rulesets()])
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

  const setLimit = (category: UploadCategory, key: 'max_mb' | 'max_px' | 'max_count', value: number) => {
    if (!limits) return
    setLimitsSaved(false)
    setLimits({ ...limits, categories: { ...limits.categories, [category]: { ...limits.categories[category], [key]: value } } })
  }
  const saveLimits = async () => {
    if (!limits) return
    setError('')
    try {
      const categories = Object.fromEntries(
        Object.entries(limits.categories).map(([k, v]) => [k, { max_mb: v.max_mb, max_px: v.max_px, max_count: v.max_count }]),
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
    <div className="page system-page">
      <header className="page-header">
        <div className="row">
          <Link to="/" className="ghost">← Home</Link>
          <h1>System administration</h1>
        </div>
      </header>
      <nav className="section-bar system-tabs" aria-label="System administration">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" className={`section-link ${tab === k ? 'on' : ''}`} aria-current={tab === k ? 'page' : undefined}
            onClick={() => setParams(k === 'sagas' ? {} : { tab: k })}>{label}</button>
        ))}
      </nav>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}

      {tab === 'sagas' && <SystemSagas canCreate={mine.has('sagas.create') && mine.has('saga_admins.assign')} rulesets={rulesets} onCreated={() => void reload()} />}
      {tab === 'users' && <SystemUsers myId={me?.id} mine={mine} permissions={permissions} onAdminsChange={() => void load()} />}
      {tab === 'admins' && (
          <section className="panel">
            <h2>System admins</h2>
            {admins.map((row) => (
              <div key={row.user_id} className="admin-row">
                <div><strong>{row.login}</strong> {row.is_root && <span className="role-badge">Root</span>}</div>
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
            <p className="muted small">To make an account a system admin, or change one, open it in <strong>Users</strong> (Edit).</p>
          </section>
      )}
      {tab === 'limits' && limits && (
            <section className="panel">
              <h2>Upload limits</h2>
              <p className="muted small">
                Pictures are cropped, resized and compressed in the browser to fit these limits, then checked
                again by the server. No limit can go over {limits.ceiling_mb} MB (MAX_UPLOAD_MB). "Icons" sets the icon size of
                every resource; "Pictures each" is how many a resource holds (a character's gallery, a location's map).
              </p>
              <table className="table">
                <thead><tr><th>Category</th><th>Max size (MB)</th><th>Longest side (px)</th><th title="How many per resource: a gallery, a location's map pictures">Pictures each</th></tr></thead>
                <tbody>
                  {(Object.keys(limits.categories) as UploadCategory[]).map((key) => {
                    const value = limits.categories[key]
                    const editable = mine.has('system_settings.manage')
                    return (
                      <tr key={key}>
                        <td>{value.label}</td>
                        <td><input type="number" min={0.05} max={limits.ceiling_mb} step={0.05} value={value.max_mb} disabled={!editable} onChange={(e) => setLimit(key, 'max_mb', Number(e.target.value))} /></td>
                        <td><input type="number" min={64} max={8192} step={64} value={value.max_px} disabled={!editable} onChange={(e) => setLimit(key, 'max_px', Number(e.target.value))} /></td>
                        <td><input type="number" min={1} max={100} step={1} value={value.max_count} disabled={!editable} onChange={(e) => setLimit(key, 'max_count', Number(e.target.value))} /></td>
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
  )
}
