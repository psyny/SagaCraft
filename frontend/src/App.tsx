import DocumentPage from './saga/lore/DocumentPage'
import EventPage from './saga/lore/EventPage'
import RelationshipsPage from './saga/lore/RelationshipsPage'
import TimelinePage from './saga/lore/TimelinePage'
import CalendarPage from './saga/CalendarPage'
import ItemPage from './saga/lore/ItemPage'
import ResourceList from './saga/lore/ResourceList'
import SagaTemplatePage from './saga/template/SagaTemplatePage'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import SystemPage from './pages/SystemPage'
import TemplateEditor from './saga/templates/TemplateEditor'
import TemplatesPage from './saga/templates/TemplatesPage'
import CharactersPage from './saga/CharactersPage'
import GroupsPage from './saga/GroupsPage'
import LocationPage from './saga/locations/LocationPage'
import LocationsPage from './saga/locations/LocationsPage'
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
          <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/system" element={<RequireAuth><SystemPage /></RequireAuth>} />
          <Route path="/s/:sagaId" element={<RequireAuth><SagaRoute /></RequireAuth>}>
            <Route index element={<StageTab />} />
            <Route path="stages" element={<StagesPage />} />
            <Route path="characters" element={<CharactersPage />} />
            <Route path="characters/groups" element={<GroupsPage />} />
            <Route path="locations" element={<LocationsPage />} />
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
            {/* The Saga page: how the Saga is set up */}
            <Route path="saga" element={<Navigate to="members" replace />} />
            <Route path="saga/members" element={<MembersPage />} />
            <Route path="saga/template" element={<SagaTemplatePage />} />
            <Route path="saga/displays" element={<TemplatesPage />} />
            <Route path="saga/displays/:templateId" element={<TemplateEditor />} />
            <Route path="saga/calendar" element={<CalendarPage />} />
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
