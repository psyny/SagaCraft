"""SQLAlchemy tables. Importing this package registers all of them on Base.metadata."""
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Accounts and system administration
# ---------------------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    login: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    system_admin: Mapped["SystemAdmin | None"] = relationship(
        back_populates="user", uselist=False, foreign_keys="SystemAdmin.user_id"
    )


class SystemAdmin(Base):
    __tablename__ = "system_admins"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    is_root: Mapped[bool] = mapped_column(Boolean, default=False)
    permissions: Mapped[list] = mapped_column(JSON, default=list)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="system_admin", foreign_keys=[user_id])


class SystemSetting(Base):
    """Instance-wide settings edited by system admins (e.g. upload limits). Value is JSON."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ---------------------------------------------------------------------------
# Sagas, members and groups
# ---------------------------------------------------------------------------


class Saga(Base):
    __tablename__ = "sagas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    ruleset_key: Mapped[str] = mapped_column(String(80))
    live_stage_id: Mapped[int | None] = mapped_column(
        ForeignKey("stages.id", ondelete="SET NULL", use_alter=True, name="fk_sagas_live_stage"), nullable=True
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    # Default display template per kind and type: {"character": {"pc": template_id, ...}}
    display_defaults: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SagaMember(Base):
    __tablename__ = "saga_members"
    __table_args__ = (UniqueConstraint("saga_id", "user_id", name="uq_member_saga_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # admin | player | viewer
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship()


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    # Default groups have a key (admins, players, viewers); custom groups have none.
    key: Mapped[str | None] = mapped_column(String(20), nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GroupMember(Base):
    """Membership of custom groups. Default groups follow the member's role and have no rows here."""

    __tablename__ = "group_members"

    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("saga_members.id", ondelete="CASCADE"), primary_key=True)


# ---------------------------------------------------------------------------
# Resources and files
# ---------------------------------------------------------------------------


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(40))  # document | character | location | item | event
    type: Mapped[str] = mapped_column(String(80))  # ruleset type key, e.g. pc, npc
    name: Mapped[str] = mapped_column(String(200))  # copy of the "name" attribute, for lists and search
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    visibility: Mapped[dict] = mapped_column(JSON, default=dict)
    # How non-admins see the name: {"alias": "Hooded figure" | None, "hide_name": bool}
    presentation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_by_member_id: Mapped[int | None] = mapped_column(
        ForeignKey("saga_members.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class DisplayTemplate(Base):
    """How a kind's resources (characters for now) are displayed in each display mode. See domain/display.py."""

    __tablename__ = "display_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(40), default="character")
    name: Mapped[str] = mapped_column(String(120))
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class StoredFile(Base):
    """Uploaded file. v1 keeps the bytes in Postgres (Railway-safe); object storage comes later."""

    __tablename__ = "files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(40), default="character")
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_by_member_id: Mapped[int | None] = mapped_column(
        ForeignKey("saga_members.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------------------
# Stages
# ---------------------------------------------------------------------------


class Stage(Base):
    __tablename__ = "stages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sets: Mapped[list["StageSet"]] = relationship(
        back_populates="stage", cascade="all, delete-orphan", order_by="StageSet.layer"
    )


class StageSet(Base):
    __tablename__ = "stage_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stage_id: Mapped[int] = mapped_column(ForeignKey("stages.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(60))
    name: Mapped[str] = mapped_column(String(160))
    x: Mapped[int] = mapped_column(Integer, default=0)
    y: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int] = mapped_column(Integer, default=800)
    height: Mapped[int] = mapped_column(Integer, default=500)
    layer: Mapped[int] = mapped_column(Integer, default=0)
    # No background, border or title bar for players: lets Sets sit over a background image
    transparent: Mapped[bool] = mapped_column(Boolean, default=False)
    visibility: Mapped[dict] = mapped_column(JSON, default=dict)
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    stage: Mapped[Stage] = relationship(back_populates="sets")
    actors: Mapped[list["StageActor"]] = relationship(
        back_populates="stage_set", cascade="all, delete-orphan", order_by="StageActor.sort_order"
    )


class StageActor(Base):
    __tablename__ = "stage_actors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    set_id: Mapped[int] = mapped_column(ForeignKey("stage_sets.id", ondelete="CASCADE"), index=True)
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    position: Mapped[dict] = mapped_column(JSON, default=dict)  # {x, y} inside the Set (free layouts)
    visibility: Mapped[dict] = mapped_column(JSON, default=dict)
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    stage_set: Mapped[StageSet] = relationship(back_populates="actors")
    resource: Mapped[Resource | None] = relationship()
