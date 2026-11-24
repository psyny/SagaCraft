/**
 * The app's routes. The sign-in, home and live Stage tab load at once; every other page is its own chunk, loaded the
 * first time it's opened (a player rarely opens the DM's editors), so the first load stays small.
 */
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import { SagaProvider, useSaga } from './saga/SagaContext'
import SagaLayout from './saga/SagaLayout'
import StageTab from './saga/StageTab'

const DocumentPage = lazy(() => import('./saga/lore/DocumentPage'))
const EventPage = lazy(() => import('./saga/lore/EventPage'))
const RelationshipsPage = lazy(() => import('./saga/lore/RelationshipsPage'))
const TimelinePage = lazy(() => import('./saga/lore/TimelinePage'))
const CalendarPage = lazy(() => import('./saga/CalendarPage'))
const SagaSettingsPage = lazy(() => import('./saga/SagaSettingsPage'))
const UserPage = lazy(() => import('./saga/UserPage'))
const ItemPage = lazy(() => import('./saga/lore/ItemPage'))
const ResourceList = lazy(() => import('./saga/lore/ResourceList'))
const SagaTemplatePage = lazy(() => import('./saga/template/SagaTemplatePage'))
const LiveScreen = lazy(() => import('./pages/LiveScreen'))
const SystemPage = lazy(() => import('./pages/SystemPage'))
const TemplateEditor = lazy(() => import('./saga/templates/TemplateEditor'))
const CharactersPage = lazy(() => import('./saga/CharactersPage'))
const GroupsPage = lazy(() => import('./saga/GroupsPage'))
const LocationPage = lazy(() => import('./saga/locations/LocationPage'))
const LocationsPage = lazy(() => import('./saga/locations/LocationsPage'))
const FogPresetsPage = lazy(() => import('./saga/locations/LocationsPage').then((m) => ({ default: m.FogPresetsPage })))
const LocationGraphPage = lazy(() => import('./saga/locations/LocationGraphPage'))
const EnvironmentsPage = lazy(() => import('./saga/efx/EnvironmentsPage'))
const MembersPage = lazy(() => import('./saga/MembersPage'))
const StagesPage = lazy(() => import('./saga/StagesPage'))

/** While a page's chunk loads (the first time it opens). */
const pageLoading = <div className="page-message">Loading…</div>

function RequireAuth({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth()
  if (loading) return <div className="page-message">Loading…</div>
  if (!me) return <Navigate to="/login" replace />
  return children
}

/** Saga: its set-up for the DM (Members first), the User page for everyone else. */
function SagaIndex() {
  const { isAdmin } = useSaga()
  return <Navigate to={isAdmin ? 'members' : 'user'} replace />
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

/** Display templates are a sub-tab of Saga → Template → Characters / Items (plan 38; a tab since plan 34). */
function MovedDisplays() {
  const { sagaId } = useParams()
  const [params] = useSearchParams()
  return <Navigate to={`/s/${sagaId}/saga/template?${params.get('kind') === 'item' ? 'tab=item&' : ''}sub=displays`} replace />
}

function MovedTemplate() {
  const { sagaId, templateId } = useParams()
  return <Navigate to={`/s/${sagaId}/saga/displays/${templateId}`} replace />
}

function MovedDocument() {
  const { sagaId, documentId } = useParams()
  return <Navigate to={`/s/${sagaId}/lore/documents/${documentId}`} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={pageLoading}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/live/:token" element={<LiveScreen />} />
          <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/system" element={<RequireAuth><SystemPage /></RequireAuth>} />
          <Route path="/s/:sagaId" element={<RequireAuth><SagaRoute /></RequireAuth>}>
            <Route index element={<StageTab />} />
            <Route path="stages" element={<StagesPage />} />
            <Route path="characters" element={<CharactersPage />} />
            <Route path="characters/groups" element={<GroupsPage />} />
            <Route path="locations" element={<LocationsPage />} />
            <Route path="locations/fog" element={<Navigate to="../efx/fog" replace />} />
            <Route path="locations/map" element={<LocationGraphPage />} />
            <Route path="locations/:locationId" element={<LocationPage />} />
            <Route path="items" element={<ResourceList key="item" kind="item" />} />
            <Route path="items/:itemId" element={<ItemPage />} />
            {/* Lore: documents, events (the timeline), relationships */}
            <Route path="lore" element={<Navigate to="documents" replace />} />
            <Route path="lore/documents" element={<ResourceList key="document" kind="document" />} />
            <Route path="lore/documents/:documentId" element={<DocumentPage />} />
            <Route path="lore/events" element={<TimelinePage />} />
            <Route path="lore/events/:eventId" element={<EventPage />} />
            <Route path="lore/relationships" element={<RelationshipsPage />} />
            {/* EFX: environments (and later other effects) */}
            <Route path="efx" element={<Navigate to="environments" replace />} />
            <Route path="efx/environments" element={<EnvironmentsPage />} />
            <Route path="efx/fog" element={<FogPresetsPage />} />
            {/* The Saga page: how the Saga is set up */}
            <Route path="saga" element={<SagaIndex />} />
            <Route path="saga/user" element={<UserPage />} />
            <Route path="saga/members" element={<MembersPage />} />
            <Route path="saga/template" element={<SagaTemplatePage />} />
            <Route path="saga/displays" element={<MovedDisplays />} />
            <Route path="saga/displays/:templateId" element={<TemplateEditor />} />
            <Route path="saga/calendar" element={<CalendarPage />} />
            <Route path="saga/settings" element={<SagaSettingsPage />} />
            {/* Old addresses (bookmarks) */}
            <Route path="groups" element={<Navigate to="../characters/groups" replace />} />
            <Route path="members" element={<Navigate to="../saga/members" replace />} />
            <Route path="template" element={<Navigate to="../saga/template" replace />} />
            <Route path="characters/templates" element={<Navigate to="../saga/displays" replace />} />
            <Route path="characters/templates/:templateId" element={<MovedTemplate />} />
            <Route path="documents" element={<Navigate to="../lore/documents" replace />} />
            <Route path="documents/:documentId" element={<MovedDocument />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
