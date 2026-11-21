/** Typed API calls. Each mutation is one named command (UX-6): buttons, shortcuts and later voice/AI call the same. */
import { request, upload } from './client'
import type {
  Category,
  CharacterGroup,
  DisplayTemplate,
  DisplayTemplates,
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
  }) => request('/api/system/sagas', { method: 'POST', body }),

  // Saga
  saga: (sagaId: number) => request<SagaOverview>(s(sagaId)),
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
  updateUploadLimits: (categories: Partial<Record<UploadCategory, { max_mb: number; max_px: number }>>) =>
    request<UploadLimits>('/api/system/settings/upload-limits', { method: 'PUT', body: { categories } }),

  // Display templates and sheets
  displayTemplates: (sagaId: number) => request<DisplayTemplates>(`${s(sagaId)}/display-templates`),
  createTemplate: (sagaId: number, name: string, copyFrom: number | null = null) =>
    request<DisplayTemplate>(`${s(sagaId)}/display-templates`, { method: 'POST', body: { name, copy_from: copyFrom } }),
  updateTemplate: (sagaId: number, id: number, body: { name?: string; color?: string; modes?: TemplateConfig['modes'] }) =>
    request<DisplayTemplate>(`${s(sagaId)}/display-templates/${id}`, { method: 'PATCH', body }),
  deleteTemplate: (sagaId: number, id: number) => request(`${s(sagaId)}/display-templates/${id}`, { method: 'DELETE' }),
  /** A category's default template (null: follow its type's). */
  setCategoryTemplate: (sagaId: number, categoryId: number, templateId: number | null, kind = 'character') =>
    request<DisplayTemplates['defaults']>(`${s(sagaId)}/display-defaults`, { method: 'PUT', body: { kind, category_id: categoryId, template_id: templateId } }),
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
  grabAttention: (sagaId: number, setId: number, actorId: number | null) =>
    request(`${s(sagaId)}/attention`, { method: 'POST', body: { set_id: setId, actor_id: actorId } }),
  stages: (sagaId: number) => request<StageSummary[]>(`${s(sagaId)}/stages`),
  stage: (sagaId: number, stageId: number) => request<StageView>(`${s(sagaId)}/stages/${stageId}`),
  createStage: (sagaId: number, name: string) =>
    request<StageView>(`${s(sagaId)}/stages`, { method: 'POST', body: { name } }),
  renameStage: (sagaId: number, stageId: number, name: string) =>
    request<StageView>(`${s(sagaId)}/stages/${stageId}`, { method: 'PATCH', body: { name } }),
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
