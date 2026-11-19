import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import SystemPage from './pages/SystemPage'
import CharactersPage from './saga/CharactersPage'
import MembersPage from './saga/MembersPage'
import { SagaProvider } from './saga/SagaContext'
import SagaLayout from './saga/SagaLayout'
import StagesPage from './saga/StagesPage'
import StageTab from './saga/StageTab'

function RequireAuth({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth()
  if (loading) return <div className="page-message">Loading…</div>
  if (!me) return <Navigate to="/login" replace />
  return children
}

function SagaRoute() {
  const { sagaId } = useParams()
  const id = Number(sagaId)
  return (
    <SagaProvider sagaId={id} key={id}>
      <SagaLayout />
    </SagaProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/system" element={<RequireAuth><SystemPage /></RequireAuth>} />
          <Route path="/s/:sagaId" element={<RequireAuth><SagaRoute /></RequireAuth>}>
            <Route index element={<StageTab />} />
            <Route path="stages" element={<StagesPage />} />
            <Route path="characters" element={<CharactersPage />} />
            <Route path="members" element={<MembersPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
