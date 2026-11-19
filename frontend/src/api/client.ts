const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TOKEN_KEY = 'sagacraft_token'

export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${API_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

export function wsUrl(path: string): string {
  return apiUrl(path).replace(/^http/, 'ws')
}

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; loc?: unknown[] }
      const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : ''
      return field ? `${String(field)}: ${first.msg}` : first.msg || fallback
    }
  }
  return fallback
}

async function handle<T>(response: Response, hadToken: boolean, path: string): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && hadToken && !path.startsWith('/api/auth/login')) {
      clearToken()
      window.location.href = '/login'
    }
    throw new ApiError(response.status, errorMessage(body, `Request failed (${response.status})`))
  }
  return body as T
}

/** JSON request with the stored token. A 401 sends the user back to the login page. */
export async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(apiUrl(path), {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  return handle<T>(response, Boolean(token), path)
}

export async function upload<T>(path: string, file: Blob, filename = 'upload', fields: Record<string, string> = {}): Promise<T> {
  const token = getToken()
  const form = new FormData()
  form.append('file', file, filename)
  Object.entries(fields).forEach(([key, value]) => form.append(key, value))
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  return handle<T>(response, Boolean(token), path)
}
