import DocumentPage from './saga/lore/DocumentPage'
import EventPage from './saga/lore/EventPage'
import RelationshipsPage from './saga/lore/RelationshipsPage'
import TimelinePage from './saga/lore/TimelinePage'
import CalendarPage from './saga/CalendarPage'
import SagaSettingsPage from './saga/SagaSettingsPage'
import UserPage from './saga/UserPage'
import ItemPage from './saga/lore/ItemPage'
import ResourceList from './saga/lore/ResourceList'
import SagaTemplatePage from './saga/template/SagaTemplatePage'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import HomePage from './pages/HomePage'
import LiveScreen from './pages/LiveScreen'
import LoginPage from './pages/LoginPage'
import SystemPage from './pages/SystemPage'
import TemplateEditor from './saga/templates/TemplateEditor'
import TemplatesPage from './saga/templates/TemplatesPage'
import CharactersPage from './saga/CharactersPage'
import GroupsPage from './saga/GroupsPage'
import LocationPage from './saga/locations/LocationPage'
import LocationsPage, { FogPresetsPage } from './saga/locations/LocationsPage'
import LocationGraphPage from './saga/locations/LocationGraphPage'
import EnvironmentsPage from './saga/efx/EnvironmentsPage'
import MembersPage from './saga/MembersPage'
import { SagaProvider, useSaga } from './saga/SagaContext'
import SagaLayout from './saga/SagaLayout'
import StagesPage from './saga/StagesPage'
import StageTab from './saga/StageTab'

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
            <Route path="saga/displays" element={<TemplatesPage />} />
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
      </BrowserRouter>
    </AuthProvider>
  )
}
