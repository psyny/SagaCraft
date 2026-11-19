import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import { clearToken, getToken, setToken } from './api/client'
import type { Me } from './api/types'

interface AuthState {
  me: Me | null
  loading: boolean
  signIn: (login: string, password: string) => Promise<void>
  signOut: () => void
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(Boolean(getToken()))

  const reload = useCallback(async () => {
    if (!getToken()) {
      setMe(null)
      setLoading(false)
      return
    }
    try {
      setMe(await api.me())
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const signIn = async (login: string, password: string) => {
    const { token } = await api.login(login, password)
    setToken(token)
    await reload()
  }

  const signOut = () => {
    clearToken()
    setMe(null)
  }

  return <AuthContext.Provider value={{ me, loading, signIn, signOut, reload }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth outside AuthProvider')
  return value
}
