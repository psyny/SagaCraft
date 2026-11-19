"""WebSocket for one Saga: /api/sagas/{saga_id}/ws?token=...

Browsers can't set headers on WebSockets, so the login token comes in the query string.
On connect the member immediately gets the live Stage; later messages come from the hub.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from api.deps import user_from_token
from db.session import SessionLocal
from services.access import get_member
from services.errors import ServiceError
from services.realtime import Connection, hub
from services.stages import live_view

router = APIRouter()


def _authorize(saga_id: int, token: str) -> tuple[int, dict | None]:
    with SessionLocal() as db:
        user = user_from_token(db, token)
        member = get_member(db, saga_id, user)
        return member.id, live_view(db, member)


@router.websocket("/api/sagas/{saga_id}/ws")
async def saga_socket(websocket: WebSocket, saga_id: int, token: str = ""):
    try:
        member_id, live = await run_in_threadpool(_authorize, saga_id, token)
    except ServiceError:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    connection = Connection(websocket=websocket, member_id=member_id)
    hub.add(saga_id, connection)
    try:
        await websocket.send_json({"type": "live_stage", "stage": live})
        while True:
            message = await websocket.receive_text()  # clients only send pings
            if message == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        hub.remove(saga_id, connection)
