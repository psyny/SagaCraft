"""Real-time updates over WebSockets, one connection per open Saga.

Every message is built for its connection's member, so filtering stays on the server:
- live_stage: the live Stage as that member may see it (sent to everyone),
- stage_updated: ids of Stages that changed (admins refetch what they're editing),
- saga_updated: members, groups or Saga settings changed (clients refetch the overview),
- attention: grab attention target (only to members who can see the target),
- location_updated: a location's map changed (clients showing it refetch it, filtered for them),
- live_closed: (live link screens) the link was turned off or replaced,
- ping: a member pointing at a tile of a map Set (to whoever sees the Set; nothing stored).

Live link screens (services/live_link.py) are guest connections: member_id 0 and the token they came with; they
get the live Stage as a viewer, while the token is still the Saga's.

In-memory: works with one API process. Scaling out needs a shared pub/sub (e.g. Redis).
"""
import asyncio
import logging
from dataclasses import dataclass, field

from fastapi import WebSocket
from starlette.concurrency import run_in_threadpool

from db.session import SessionLocal
from domain.visibility import can_see
from models import SagaMember

log = logging.getLogger(__name__)


@dataclass(eq=False)
class Connection:
    websocket: WebSocket
    member_id: int  # 0: a live link screen (guest)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    token: str | None = None  # a guest's live link token

    @property
    def guest(self) -> bool:
        return self.token is not None


class Hub:
    def __init__(self) -> None:
        self.connections: dict[int, set[Connection]] = {}

    def add(self, saga_id: int, connection: Connection) -> None:
        self.connections.setdefault(saga_id, set()).add(connection)

    def remove(self, saga_id: int, connection: Connection) -> None:
        self.connections.get(saga_id, set()).discard(connection)

    async def _send(self, saga_id: int, connection: Connection, message: dict) -> None:
        try:
            async with connection.lock:
                await connection.websocket.send_json(message)
        except Exception:  # noqa: BLE001 - a dead socket must not break the others
            self.remove(saga_id, connection)

    async def notify(self, saga_id: int, stage_ids: set[int] | None = None, saga: bool = False) -> None:
        connections = list(self.connections.get(saga_id, set()))
        if not connections:
            return
        members = [c for c in connections if not c.guest]
        guests = [c for c in connections if c.guest]
        payloads = await run_in_threadpool(_build_payloads, saga_id, [c.member_id for c in members],
                                           sorted(stage_ids or []), saga)
        await asyncio.gather(*(
            self._send(saga_id, c, message) for c in members for message in payloads.get(c.member_id, [])
        ))
        if guests:
            token, stage = await run_in_threadpool(_guest_payload, saga_id)
            for c in guests:
                if c.token == token:
                    await self._send(saga_id, c, {"type": "live_stage", "stage": stage})
                else:
                    await self._close_guest(saga_id, c)

    async def _close_guest(self, saga_id: int, connection: Connection) -> None:
        """The live link was turned off or replaced: tell the screen, then hang up."""
        await self._send(saga_id, connection, {"type": "live_closed"})
        self.remove(saga_id, connection)
        try:
            await connection.websocket.close(code=4404)
        except Exception:  # noqa: BLE001
            pass

    async def broadcast(self, saga_id: int, message: dict) -> None:
        """A message with no hidden data for everyone in the Saga (e.g. "location 12 changed": each refetches
        what they may see)."""
        connections = [c for c in self.connections.get(saga_id, set()) if not c.guest]
        await asyncio.gather(*(self._send(saga_id, c, message) for c in connections))

    async def direct(self, saga_id: int, messages: dict[int, dict]) -> None:
        """One message per member (built for each: what they may see), to their open screens."""
        connections = [c for c in self.connections.get(saga_id, set()) if not c.guest and c.member_id in messages]
        await asyncio.gather(*(self._send(saga_id, c, messages[c.member_id]) for c in connections))

    async def ping(self, saga_id: int, message: dict) -> None:
        """A ping, to whoever sees its Set (live link screens too)."""
        connections = list(self.connections.get(saga_id, set()))
        if not connections:
            return
        allowed = await run_in_threadpool(_attention_targets, saga_id, [c.member_id for c in connections], message)
        public = {k: v for k, v in message.items() if k != "set_visibility"}
        await asyncio.gather(*(self._send(saga_id, c, public) for c in connections if c.member_id in allowed))

    async def attention(self, saga_id: int, message: dict) -> None:
        connections = list(self.connections.get(saga_id, set()))
        if not connections:
            return
        allowed = await run_in_threadpool(_attention_targets, saga_id, [c.member_id for c in connections], message)
        public = {k: message[k] for k in ("type", "stage_id", "set_id", "actor_id")}
        if message.get("target") is not None:
            public["target"] = message["target"]
        await asyncio.gather(*(self._send(saga_id, c, public) for c in connections if c.member_id in allowed))


def _build_payloads(saga_id: int, member_ids: list[int], stage_ids: list[int], saga: bool) -> dict[int, list[dict]]:
    from services.stages import live_view

    result: dict[int, list[dict]] = {}
    with SessionLocal() as db:
        for member_id in set(member_ids):
            member = db.get(SagaMember, member_id)
            if member is None or member.saga_id != saga_id:
                continue
            messages = []
            if saga:
                messages.append({"type": "saga_updated"})
            messages.append({"type": "live_stage", "stage": live_view(db, member)})
            if member.role == "admin" and stage_ids:
                messages.append({"type": "stage_updated", "stage_ids": stage_ids})
            result[member_id] = messages
    return result


def _guest_payload(saga_id: int) -> tuple[str | None, dict | None]:
    """The Saga's live link token now, and the live Stage as its guest sees it."""
    from models import Saga
    from services.live_link import guest_view

    with SessionLocal() as db:
        saga = db.get(Saga, saga_id)
        if saga is None or not saga.live_token or saga.is_archived:
            return None, None
        return saga.live_token, guest_view(db, saga)


def _attention_targets(saga_id: int, member_ids: list[int], message: dict) -> set[int]:
    from services.access import guest_viewer, viewer_for

    allowed = set()
    with SessionLocal() as db:
        for member_id in set(member_ids):
            if member_id == 0:  # live link screens: a viewer
                viewer = guest_viewer(db, saga_id)
            else:
                member = db.get(SagaMember, member_id)
                if member is None or member.saga_id != saga_id:
                    continue
                viewer = viewer_for(db, member)
            if not can_see(viewer, message.get("set_visibility")):
                continue
            if message.get("actor_id") is not None and not can_see(viewer, message.get("actor_visibility")):
                continue
            allowed.add(member_id)
    return allowed


hub = Hub()
