/** Typed API calls. Each mutation is one named command (UX-6): buttons, shortcuts and later voice/AI call the same. */
import type { FogLook } from '../maps/shader'
import { request, upload } from './client'
import type {
  EfxCatalog,
  Environment,
  StageLayout,
  Calendar,
  CalendarView,
  Era,
  EventView,
  GraphData,
  GraphQuery,
  Relationship,
  RelationshipBody,
  RelationshipType,
  Timeline,
  Category,
  ResourceFolder,
  FogPreset,
  SagaTemplateDoc,
  SagaTemplateView,
  CharacterGroup,
  DisplayTemplate,
  DisplayTemplates,
  LocationMap,
  Me,
  Presentation,
  Sheet,
  SheetPreview,
  TemplateConfig,
  Resource,
  Ruleset,
  SagaOverview,
  SetTypeInfo,
  UploadCategory,
  UploadedFile,
  UploadLimits,
  StageSummary,
  StageView,
  Visibility,
} from './types'

const s = (sagaId: number) => `/api/sagas/${sagaId}`

type ResourceBody = {
  attributes?: Record<string, unknown>
  visibility?: Visibility
  presentation?: Presentation
  category_id?: number | null
  instanceable?: boolean
  group_ids?: number[]
  tags?: string[]
  /** 0 takes it out of its folder. */
  folder_id?: number | null
  /** Kinds without Players in control: its owners. */
  owners?: number[]
  /** Characters: who can edit. */
  editors?: Visibility
  /** Characters: inactive ones stay off Actor Sets and their groups. */
  active?: boolean
}

export const api = {
  login: (login: string, password: string) =>
    request<{ token: string }>('/api/auth/login', { method: 'POST', body: { login, password } }),
  me: () => request<Me>('/api/me'),

  // System administration
  permissions: () => request<{ key: string; description: string }[]>('/api/system/permissions'),
  rulesets: () => request<{ key: string; name: string; version: string }[]>('/api/system/rulesets'),
  systemAdmins: () =>
    request<{ user_id: number; login: string; display_name: string; is_root: boolean; permissions: string[] }[]>(
      '/api/system/admins',
    ),
  createSystemAdmin: (body: { login: string; password: string; display_name: string; permissions: string[] }) =>
    request('/api/system/admins', { method: 'POST', body }),
  updateSystemAdmin: (userId: number, permissions: string[]) =>
    request(`/api/system/admins/${userId}`, { method: 'PATCH', body: { permissions } }),
  allSagas: () =>
    request<{ id: number; name: string; ruleset_key: string; is_archived: boolean; admins: string[] }[]>(
      '/api/system/sagas',
    ),
  createSaga: (body: {
    name: string
    ruleset_key: string
    admin_login: string
    admin_password: string | null
    admin_display_name: string
    /** A Saga template file (instead of a built-in one). */
    template?: SagaTemplateDoc | null
  }) => request('/api/system/sagas', { method: 'POST', body }),

  // Saga
  saga: (sagaId: number) => request<SagaOverview>(s(sagaId)),
  /** My account: display name, or password (with the current one). */
  updateAccount: (body: { display_name?: string; password?: string; new_password?: string }) =>
    request<Me>('/api/me', { method: 'PATCH', body }),
  /** My colour and dice style in this Saga. */
  updateMyMember: (sagaId: number, body: { color?: string | null; die_style?: string }) =>
    request<SagaOverview>(`${s(sagaId)}/me`, { method: 'PATCH', body }),
  /** Command: use an item from a character's inventory (one less on its counter). */
  useItem: (sagaId: number, characterId: number, itemId: number) =>
    request<Resource>(`${s(sagaId)}/resources/${characterId}/use-item`, { method: 'POST', body: { item_id: itemId } }),
  /** The live link: on/off, or a new one (the old address stops). */
  setLiveLink: (sagaId: number, on: boolean) =>
    request<{ live_token: string | null }>(`${s(sagaId)}/live-link`, { method: 'PUT', body: { on } }),
  newLiveLink: (sagaId: number) => request<{ live_token: string }>(`${s(sagaId)}/live-link/new`, { method: 'POST' }),
  /** The live link's screen (no sign-in). */
  liveScreen: (token: string) =>
    request<{ saga: { id: number; name: string; calendar: Calendar; story_date: number }; stage: StageView | null }>(`/api/live/${encodeURIComponent(token)}`),
  ruleset: (sagaId: number) => request<Ruleset>(`${s(sagaId)}/ruleset`),
  addMember: (sagaId: number, body: { login: string; password: string | null; display_name: string; role: string }) =>
    request<SagaOverview>(`${s(sagaId)}/members`, { method: 'POST', body }),
  updateMember: (sagaId: number, memberId: number, role: string) =>
    request<SagaOverview>(`${s(sagaId)}/members/${memberId}`, { method: 'PATCH', body: { role } }),
  removeMember: (sagaId: number, memberId: number) =>
    request<SagaOverview>(`${s(sagaId)}/members/${memberId}`, { method: 'DELETE' }),
  saveGroup: (sagaId: number, groupId: number | null, name: string, member_ids: number[]) =>
    groupId === null
      ? request<SagaOverview>(`${s(sagaId)}/groups`, { method: 'POST', body: { name, member_ids } })
      : request<SagaOverview>(`${s(sagaId)}/groups/${groupId}`, { method: 'PUT', body: { name, member_ids } }),
  deleteGroup: (sagaId: number, groupId: number) =>
    request<SagaOverview>(`${s(sagaId)}/groups/${groupId}`, { method: 'DELETE' }),

  // Resources
  resources: (sagaId: number, kind?: string) =>
    request<Resource[]>(`${s(sagaId)}/resources${kind ? `?kind=${kind}` : ''}`),
  resource: (sagaId: number, id: number) => request<Resource>(`${s(sagaId)}/resources/${id}`),
  createResource: (sagaId: number, body: ResourceBody & { kind: string; type?: string; attributes: Record<string, unknown> }) =>
    request<Resource>(`${s(sagaId)}/resources`, { method: 'POST', body }),
  updateResource: (sagaId: number, id: number, body: ResourceBody) =>
    request<Resource>(`${s(sagaId)}/resources/${id}`, { method: 'PATCH', body }),
  changeCounter: (sagaId: number, id: number, key: string, change: { delta?: number; current?: number }) =>
    request<Resource>(`${s(sagaId)}/resources/${id}/counter`, { method: 'POST', body: { key, ...change } }),
  deleteResource: (sagaId: number, id: number) => request(`${s(sagaId)}/resources/${id}`, { method: 'DELETE' }),
  uploadFile: (sagaId: number, file: Blob, category: UploadCategory, filename = 'picture') =>
    upload<UploadedFile>(`${s(sagaId)}/files`, file, filename, { category }),
  uploadLimits: () => request<UploadLimits>('/api/upload-limits'),
  updateUploadLimits: (categories: Partial<Record<UploadCategory, { max_mb: number; max_px: number; max_count: number }>>) =>
    request<UploadLimits>('/api/system/settings/upload-limits', { method: 'PUT', body: { categories } }),

  // Display templates and sheets
  displayTemplates: (sagaId: number) => request<DisplayTemplates>(`${s(sagaId)}/display-templates`),
  createTemplate: (sagaId: number, name: string, copyFrom: number | null = null, kind: 'character' | 'item' = 'character') =>
    request<DisplayTemplate>(`${s(sagaId)}/display-templates`, { method: 'POST', body: { name, copy_from: copyFrom, kind } }),
  updateTemplate: (sagaId: number, id: number, body: { name?: string; color?: string; modes?: TemplateConfig['modes'] }) =>
    request<DisplayTemplate>(`${s(sagaId)}/display-templates/${id}`, { method: 'PATCH', body }),
  deleteTemplate: (sagaId: number, id: number) => request(`${s(sagaId)}/display-templates/${id}`, { method: 'DELETE' }),
  /** A category's default template (null: follow its type's). */
  setCategoryTemplate: (sagaId: number, categoryId: number, templateId: number | null, kind = 'character') =>
    request<DisplayTemplates['defaults']>(`${s(sagaId)}/display-defaults`, { method: 'PUT', body: { kind, category_id: categoryId, template_id: templateId } }),
  setTypeTemplate: (sagaId: number, kind: string, type: string, templateId: number) =>
    request<DisplayTemplates['defaults']>(`${s(sagaId)}/display-defaults`, { method: 'PUT', body: { kind, type, template_id: templateId } }),
  templatePreview: (sagaId: number, id: number, resourceId: number) =>
    request<SheetPreview>(`${s(sagaId)}/display-templates/${id}/preview?resource_id=${resourceId}`),
  sheet: (sagaId: number, resourceId: number, setId?: number | null, actorId?: number | null) => {
    const query = [setId ? `set_id=${setId}` : '', actorId ? `actor_id=${actorId}` : ''].filter(Boolean).join('&')
    return request<Sheet>(`${s(sagaId)}/resources/${resourceId}/sheet${query ? `?${query}` : ''}`)
  },

  // Categories and groups of characters
  categories: (sagaId: number) => request<Category[]>(`${s(sagaId)}/categories`),
  createCategory: (sagaId: number, body: Partial<Category>) =>
    request<Category>(`${s(sagaId)}/categories`, { method: 'POST', body }),
  updateCategory: (sagaId: number, id: number, body: Partial<Category>) =>
    request<Category>(`${s(sagaId)}/categories/${id}`, { method: 'PATCH', body }),
  deleteCategory: (sagaId: number, id: number) => request(`${s(sagaId)}/categories/${id}`, { method: 'DELETE' }),
  characterGroups: (sagaId: number) => request<CharacterGroup[]>(`${s(sagaId)}/character-groups`),
  createCharacterGroup: (sagaId: number, body: Partial<CharacterGroup>) =>
    request<CharacterGroup>(`${s(sagaId)}/character-groups`, { method: 'POST', body }),
  updateCharacterGroup: (sagaId: number, id: number, body: Partial<CharacterGroup>) =>
    request<CharacterGroup>(`${s(sagaId)}/character-groups/${id}`, { method: 'PATCH', body }),
  deleteCharacterGroup: (sagaId: number, id: number) => request(`${s(sagaId)}/character-groups/${id}`, { method: 'DELETE' }),

  // Stages
  setTypes: (sagaId: number) => request<SetTypeInfo[]>(`${s(sagaId)}/set-types`),
  live: (sagaId: number) => request<{ stage: StageView | null }>(`${s(sagaId)}/live`),
  setLive: (sagaId: number, stageId: number | null) =>
    request(`${s(sagaId)}/live`, { method: 'PUT', body: { stage_id: stageId } }),
  grabAttention: (sagaId: number, setId: number, actorId: number | null, target?: Record<string, unknown>) =>
    request(`${s(sagaId)}/attention`, { method: 'POST', body: { set_id: setId, actor_id: actorId, target } }),

  // The Saga's own Saga template (Template page)
  sagaTemplate: (sagaId: number) => request<SagaTemplateView>(`${s(sagaId)}/template`),
  templateCommand: (sagaId: number, name: string, args: Record<string, unknown>) =>
    request<SagaTemplateView>(`${s(sagaId)}/template/command`, { method: 'POST', body: { name, args } }),
  exportTemplate: (sagaId: number) => request<SagaTemplateDoc>(`${s(sagaId)}/template/export`),
  importTemplate: (sagaId: number, doc: SagaTemplateDoc) =>
    request<SagaTemplateView & { added: Record<string, number> }>(`${s(sagaId)}/template/import`, { method: 'POST', body: doc }),

  // Fog presets (the DM's: map Sets pick one)
  fogPresets: (sagaId: number) => request<FogPreset[]>(`${s(sagaId)}/fog-presets`),
  createFogPreset: (sagaId: number, body: { name?: string; look?: Partial<FogLook>; copy_of?: number }) =>
    request<FogPreset>(`${s(sagaId)}/fog-presets`, { method: 'POST', body }),
  updateFogPreset: (sagaId: number, id: number, body: { name?: string; changes?: Partial<FogLook> }) =>
    request<FogPreset>(`${s(sagaId)}/fog-presets/${id}`, { method: 'PATCH', body }),
  deleteFogPreset: (sagaId: number, id: number) => request(`${s(sagaId)}/fog-presets/${id}`, { method: 'DELETE' }),

  // Locations
  locationMap: (sagaId: number, locationId: number) => request<LocationMap>(`${s(sagaId)}/locations/${locationId}/map`),
  /** A map command (images.set, grid.set, fog.paint, links.add, paths.save...): the same from every tool. */
  mapCommand: (sagaId: number, locationId: number, name: string, args: Record<string, unknown> = {}) =>
    request<LocationMap>(`${s(sagaId)}/locations/${locationId}/map/command`, { method: 'POST', body: { name, args } }),
  // Lore: calendar, relationships, events, eras
  calendar: (sagaId: number) => request<CalendarView>(`${s(sagaId)}/calendar`),
  setCalendar: (sagaId: number, body: { preset: string } | Partial<Calendar>) =>
    request<CalendarView>(`${s(sagaId)}/calendar`, { method: 'PUT', body }),
  setStoryDate: (sagaId: number, date: number) => request<CalendarView>(`${s(sagaId)}/calendar/today`, { method: 'PUT', body: { date } }),
  relationshipTypes: (sagaId: number) => request<RelationshipType[]>(`${s(sagaId)}/relationship-types`),
  createRelationshipType: (sagaId: number, body: { group_id: number; label: string; inverse?: string; directed?: boolean }) =>
    request<RelationshipType>(`${s(sagaId)}/relationship-types`, { method: 'POST', body }),
  updateRelationshipType: (sagaId: number, id: number, body: { label?: string; inverse?: string; directed?: boolean }) =>
    request<RelationshipType>(`${s(sagaId)}/relationship-types/${id}`, { method: 'PATCH', body }),
  deleteRelationshipType: (sagaId: number, id: number) => request(`${s(sagaId)}/relationship-types/${id}`, { method: 'DELETE' }).then(() => true),
  relationships: (sagaId: number, filter: { resource_id?: number; group_id?: number; event_id?: number } = {}) => {
    const q = Object.entries(filter).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join('&')
    return request<Relationship[]>(`${s(sagaId)}/relationships${q ? `?${q}` : ''}`)
  },
  relationship: (sagaId: number, id: number) => request<Relationship>(`${s(sagaId)}/relationships/${id}`),
  createRelationship: (sagaId: number, body: RelationshipBody) =>
    request<Relationship>(`${s(sagaId)}/relationships`, { method: 'POST', body }),
  updateRelationship: (sagaId: number, id: number, body: RelationshipBody) =>
    request<Relationship>(`${s(sagaId)}/relationships/${id}`, { method: 'PATCH', body }),
  deleteRelationship: (sagaId: number, id: number) => request(`${s(sagaId)}/relationships/${id}`, { method: 'DELETE' }).then(() => true),
  /** Command: reveal a relationship to a member group (a copy there). */
  revealRelationship: (sagaId: number, id: number, groupId: number) =>
    request<Relationship>(`${s(sagaId)}/relationships/${id}/reveal`, { method: 'POST', body: { group_id: groupId } }),
  /** The location map: links between the places on their maps, and what's part of what. */
  locationGraph: (sagaId: number) => request<GraphData>(`${s(sagaId)}/locations/graph`),
  relationshipGraph: (sagaId: number, query: GraphQuery) =>
    request<GraphData>(`${s(sagaId)}/relationships/graph`, { method: 'POST', body: query }),
  timeline: (sagaId: number) => request<Timeline>(`${s(sagaId)}/timeline`),
  event: (sagaId: number, id: number) => request<EventView>(`${s(sagaId)}/events/${id}`),
  addSubEvent: (sagaId: number, eventId: number, body: { resource_id: number; what: string; note?: string }) =>
    request<EventView>(`${s(sagaId)}/events/${eventId}/sub-events`, { method: 'POST', body }),
  updateSubEvent: (sagaId: number, id: number, body: { what?: string; note?: string; move?: number }) =>
    request<EventView>(`${s(sagaId)}/sub-events/${id}`, { method: 'PATCH', body }),
  deleteSubEvent: (sagaId: number, id: number) => request<EventView>(`${s(sagaId)}/sub-events/${id}`, { method: 'DELETE' }),
  eras: (sagaId: number) => request<Era[]>(`${s(sagaId)}/eras`),
  createEra: (sagaId: number, body: Partial<Era>) => request<Era>(`${s(sagaId)}/eras`, { method: 'POST', body }),
  updateEra: (sagaId: number, id: number, body: Partial<Era>) => request<Era>(`${s(sagaId)}/eras/${id}`, { method: 'PATCH', body }),
  deleteEra: (sagaId: number, id: number) => request(`${s(sagaId)}/eras/${id}`, { method: 'DELETE' }).then(() => true),

  // Folders (documents)
  folders: (sagaId: number, kind = 'document') => request<ResourceFolder[]>(`${s(sagaId)}/folders?kind=${kind}`),
  createFolder: (sagaId: number, name: string, kind = 'document') =>
    request<ResourceFolder>(`${s(sagaId)}/folders`, { method: 'POST', body: { name, kind } }),
  renameFolder: (sagaId: number, id: number, name: string) =>
    request<ResourceFolder>(`${s(sagaId)}/folders/${id}`, { method: 'PATCH', body: { name } }),
  /** Who sees what's in a folder: null inherits (each keeps its own), else it overrides theirs. */
  setFolderVisibility: (sagaId: number, id: number, visibility: Visibility | null) =>
    request<ResourceFolder>(`${s(sagaId)}/folders/${id}`, { method: 'PATCH', body: visibility ? { visibility } : { inherit: true } }),
  deleteFolder: (sagaId: number, id: number) => request(`${s(sagaId)}/folders/${id}`, { method: 'DELETE' }).then(() => true),
  /** Command: file resources in a folder (null: out of folders). */
  fileResources: (sagaId: number, folderId: number | null, resourceIds: number[]) =>
    request<{ moved: number }>(`${s(sagaId)}/folders/file`, { method: 'POST', body: { folder_id: folderId, resource_ids: resourceIds } }),
  tags: (sagaId: number, kind?: string) => request<string[]>(`${s(sagaId)}/tags${kind ? `?kind=${kind}` : ''}`),
  stages: (sagaId: number) => request<StageSummary[]>(`${s(sagaId)}/stages`),
  stage: (sagaId: number, stageId: number) => request<StageView>(`${s(sagaId)}/stages/${stageId}`),
  createStage: (sagaId: number, name: string) =>
    request<StageView>(`${s(sagaId)}/stages`, { method: 'POST', body: { name } }),
  renameStage: (sagaId: number, stageId: number, name: string) =>
    request<StageView>(`${s(sagaId)}/stages/${stageId}`, { method: 'PATCH', body: { name } }),
  /** Switch a Stage's layout: canvas (a world to pan) or interface (Sets fixed to the screen). */
  /** EFX: the Stage's environment (null: none). */
  setStageEnvironment: (sagaId: number, stageId: number, environmentId: number | null) =>
    request<StageView>(`${s(sagaId)}/stages/${stageId}`, { method: 'PATCH', body: { environment_id: environmentId } }),
  efxCatalog: (sagaId: number) => request<EfxCatalog>(`${s(sagaId)}/efx/catalog`),
  environments: (sagaId: number) => request<Environment[]>(`${s(sagaId)}/environments`),
  createEnvironment: (sagaId: number, body: { name?: string; copy_of?: number; example?: string }) =>
    request<Environment>(`${s(sagaId)}/environments`, { method: 'POST', body }),
  updateEnvironment: (sagaId: number, id: number, body: Partial<Pick<Environment, 'name' | 'far' | 'near' | 'fore'>>) =>
    request<Environment>(`${s(sagaId)}/environments/${id}`, { method: 'PATCH', body }),
  deleteEnvironment: (sagaId: number, id: number) => request<void>(`${s(sagaId)}/environments/${id}`, { method: 'DELETE' }),
  setStageLayout: (sagaId: number, stageId: number, layout: StageLayout) =>
    request<StageView>(`${s(sagaId)}/stages/${stageId}`, { method: 'PATCH', body: { layout } }),
  /** Command: the Sets in this order, bottom layer to top. */
  orderLayers: (sagaId: number, stageId: number, setIds: number[]) =>
    request<StageView>(`${s(sagaId)}/stages/${stageId}/layers`, { method: 'PUT', body: { set_ids: setIds } }),
  duplicateStage: (sagaId: number, stageId: number) =>
    request<StageView>(`${s(sagaId)}/stages/${stageId}/duplicate`, { method: 'POST' }),
  deleteStage: (sagaId: number, stageId: number) => request(`${s(sagaId)}/stages/${stageId}`, { method: 'DELETE' }),
  addSet: (sagaId: number, stageId: number, type: string, name?: string) =>
    request<StageView>(`${s(sagaId)}/stages/${stageId}/sets`, { method: 'POST', body: { type, name } }),
  updateSet: (sagaId: number, setId: number, body: Record<string, unknown>) =>
    request<StageView>(`${s(sagaId)}/sets/${setId}`, { method: 'PATCH', body }),
  deleteSet: (sagaId: number, setId: number) => request<StageView>(`${s(sagaId)}/sets/${setId}`, { method: 'DELETE' }),
  /** Characters and/or groups (a one-time shortcut for their creatures); an Actors Scene puts them in one tab. */
  addActors: (sagaId: number, setId: number, body: { resource_ids?: number[]; group_ids?: number[]; tab_id?: number | null; hidden?: boolean }) =>
    request<StageView>(`${s(sagaId)}/sets/${setId}/actors`, { method: 'POST', body: { hidden: true, ...body } }),
  /** A Set type's named command, e.g. ('turn', {action: 'next'}). */
  setCommand: (sagaId: number, setId: number, name: string, args: Record<string, unknown> = {}) =>
    request<StageView>(`${s(sagaId)}/sets/${setId}/command`, { method: 'POST', body: { name, args } }),
  /** A card's counter: an instance's own value, or the character's. */
  actorCounter: (sagaId: number, actorId: number, key: string, change: { delta?: number; current?: number }) =>
    request<StageView>(`${s(sagaId)}/actors/${actorId}/counter`, { method: 'POST', body: { key, ...change } }),
  actorValues: (sagaId: number, actorId: number, attributes: Record<string, unknown>) =>
    request<StageView>(`${s(sagaId)}/actors/${actorId}/values`, { method: 'PATCH', body: { attributes } }),
  deleteActor: (sagaId: number, actorId: number) =>
    request<StageView>(`${s(sagaId)}/actors/${actorId}`, { method: 'DELETE' }),
}
