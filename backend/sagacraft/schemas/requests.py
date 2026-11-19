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


class ResourceIn(BaseModel):
    kind: str
    type: str
    attributes: dict[str, Any] = Field(default_factory=dict)
    visibility: Visibility | None = None


class ResourceUpdate(BaseModel):
    attributes: dict[str, Any] | None = None
    visibility: Visibility | None = None


class CounterChange(BaseModel):
    key: str
    delta: float | None = None
    current: float | None = None


class StageIn(BaseModel):
    name: str = ""


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
    visibility: Visibility | None = None
    config: dict[str, Any] | None = None


class ActorsIn(BaseModel):
    resource_ids: list[int]
    hidden: bool = True


class ActorUpdate(BaseModel):
    config: dict[str, Any] | None = None
    position: dict[str, int] | None = None
    visibility: Visibility | None = None
    revealed: bool | None = None


class RevealIn(BaseModel):
    revealed: bool = True


class OrderIn(BaseModel):
    actor_ids: list[int]


class AttentionIn(BaseModel):
    set_id: int
    actor_id: int | None = None
