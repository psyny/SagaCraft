"""Request bodies. Responses are plain dicts built by the services (already filtered per viewer)."""
from typing import Any

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    login: str
    password: str


class SystemAdminIn(BaseModel):
    login: str
    password: str = ""
    display_name: str = ""
    permissions: list[str] = Field(default_factory=list)


class SystemAdminUpdate(BaseModel):
    permissions: list[str]


class UploadLimitsIn(BaseModel):
    categories: dict[str, dict[str, float]]


class SagaIn(BaseModel):
    name: str
    ruleset_key: str = "dnd_lite"
    admin_login: str
    admin_password: str | None = None
    admin_display_name: str = ""
    template: dict[str, Any] | None = None  # a Saga template file (instead of a built-in one)


class MemberIn(BaseModel):
    login: str
    password: str | None = None
    display_name: str = ""
    role: str = "player"


class MemberUpdate(BaseModel):
    role: str


class GroupIn(BaseModel):
    name: str
    member_ids: list[int] = Field(default_factory=list)


class Visibility(BaseModel):
    groups: list[int] = Field(default_factory=list)
    members: list[int] = Field(default_factory=list)
    owner: bool = False  # resources and folders: their owners see it (elsewhere ignored)


class ResourceIn(BaseModel):
    kind: str
    type: str | None = None  # characters: the category picks it
    category_id: int | None = None
    instanceable: bool | None = None
    group_ids: list[int] | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    visibility: Visibility | None = None
    presentation: dict[str, Any] | None = None  # {"alias": ..., "hide_name": ...}: the name players see
    tags: list[str] | None = None
    folder_id: int | None = None  # documents, items, locations: the folder it's filed in
    owners: list[int] | None = None  # kinds without Players in control: its owners (members)
    editors: Visibility | None = None  # characters: who can edit (default: its owners)
    active: bool | None = None  # characters: an inactive one stays out of Actor Sets and its groups


class ResourceUpdate(BaseModel):
    attributes: dict[str, Any] | None = None
    category_id: int | None = None
    instanceable: bool | None = None
    group_ids: list[int] | None = None
    visibility: Visibility | None = None
    presentation: dict[str, Any] | None = None
    tags: list[str] | None = None
    folder_id: int | None = None  # 0 takes it out of its folder
    owners: list[int] | None = None
    editors: Visibility | None = None
    active: bool | None = None


class FolderIn(BaseModel):
    kind: str = "document"
    name: str


class FolderRename(BaseModel):
    """A folder's name and/or who sees it (inherit: its resources keep theirs; else visibility overrides them)."""
    name: str | None = None
    inherit: bool | None = None
    visibility: Visibility | None = None


class FileIn(BaseModel):
    """Move resources into a folder (folder_id None or 0: out of folders)."""
    folder_id: int | None = None
    resource_ids: list[int] = Field(default_factory=list, max_length=500)


class MapCommand(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class FogPresetIn(BaseModel):
    name: str | None = None
    look: dict[str, Any] | None = None
    copy_of: int | None = None  # start from another preset


class FogPresetUpdate(BaseModel):
    name: str | None = None
    changes: dict[str, Any] | None = None


class CounterChange(BaseModel):
    key: str
    delta: float | None = None
    current: float | None = None


class StageIn(BaseModel):
    name: str = ""


class StageUpdate(BaseModel):
    name: str | None = None
    layout: str | None = None  # canvas | interface
    environment_id: int | None = None  # EFX: its environment (null: none; leave it out to keep it)


class LayersIn(BaseModel):
    """The Stage's Sets from the bottom layer to the top."""
    set_ids: list[int]


class LiveIn(BaseModel):
    stage_id: int | None


class SetIn(BaseModel):
    type: str
    name: str | None = None
    x: int | None = None
    y: int | None = None
    config: dict[str, Any] | None = None


class SetUpdate(BaseModel):
    name: str | None = None
    x: int | None = None
    y: int | None = None
    width: int | None = None
    height: int | None = None
    layer: int | None = None
    transparent: bool | None = None
    off: bool | None = None  # put away: drawn for no one until the DM brings it back
    screen: dict[str, Any] | None = None  # interface layout: {anchor, width, height, x, y} in % of the screen
    toolbars: dict[str, Any] | None = None  # {key: {anchor, vertical, x, y, size, hidden, outside} or null (default)}
    visibility: Visibility | None = None
    config: dict[str, Any] | None = None


class ActorsIn(BaseModel):
    resource_ids: list[int] = Field(default_factory=list)  # repeat an instanceable one for several instances
    group_ids: list[int] = Field(default_factory=list)  # a one-time shortcut for adding their creatures
    tab_id: int | None = None  # Actors Scene: the tab they go to (default: the active tab)
    hidden: bool = True


class ActorValues(BaseModel):
    attributes: dict[str, Any]


class SetCommand(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class CategoryIn(BaseModel):
    name: str | None = None
    plural: str | None = None
    type: str | None = None
    player: bool | None = None
    instanceable: bool | None = None
    sort_order: int | None = None


class CharacterGroupIn(BaseModel):
    name: str | None = None
    player_party: bool | None = None
    active: bool | None = None
    favorite: bool | None = None
    color: str | None = None  # "#rrggbb"
    sort_order: int | None = None
    members: list[dict[str, int]] | None = None  # [{"resource_id": 3, "count": 2}]


class AttentionIn(BaseModel):
    set_id: int
    actor_id: int | None = None
    target: dict[str, Any] | None = None  # a Set type's own target, e.g. {"tiles": [[3, 4]]} on a map


class TemplateIn(BaseModel):
    name: str = ""
    copy_from: int | None = None
    kind: str = "character"  # characters or items


class TemplateUpdate(BaseModel):
    name: str | None = None
    color: str | None = None  # "#rrggbb"
    # Regions to replace: {"face": {"player": {"bottom": [{"key": "hp", "style": "discrete"}]}}}
    modes: dict[str, Any] | None = None


class DisplayDefaultIn(BaseModel):
    kind: str = "character"
    type: str | None = None  # the built-in default of a type
    category_id: int | None = None  # a category's default (what the DM picks)
    template_id: int | None = None  # null with category_id: follow the type's default
