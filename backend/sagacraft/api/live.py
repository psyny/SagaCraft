"""The live link: the DM's switch (Saga settings) and the guest screen's routes (no sign-in).

- PUT /api/sagas/{id}/live-link {on}, POST /api/sagas/{id}/live-link/new (admins)
- GET /api/live/{token}: the Saga's name and calendar, and the live Stage as a viewer
- WS /api/live/{token}/ws: the live Stage as it changes (live_stage), live_closed when the link stops
See services/live_link.py.
"""
from fastapi import APIRouter, BackgroundTasks, Body, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from api.deps import current_member
from db.session import SessionLocal, get_db
from models import SagaMember
from services import live_link
from services.errors import ServiceError
from services.realtime import Connection, hub

router = APIRouter()


@router.put("/api/sagas/{saga_id}/live-link")
def set_live_link(saga_id: int, tasks: BackgroundTasks, body: dict = Body(...),
                  member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: turn the live link on or off (screens on it stop when it's off)."""
    token = live_link.set_live_link(db, member, bool(body.get("on")))
    tasks.add_task(hub.notify, saga_id, set(), True)
    return {"live_token": token}


@router.post("/api/sagas/{saga_id}/live-link/new")
def replace_live_link(saga_id: int, tasks: BackgroundTasks, member: SagaMember = Depends(current_member),
                      db: Session = Depends(get_db)):
    """Command: a new live link (screens on the old one stop)."""
    token = live_link.replace_live_link(db, member)
    tasks.add_task(hub.notify, saga_id, set(), True)
    return {"live_token": token}


@router.get("/api/live/{token}")
def live_screen(token: str, db: Session = Depends(get_db)):
    return live_link.live_screen(db, token)


def _open(token: str) -> tuple[int, dict]:
    with SessionLocal() as db:
        saga = live_link.saga_for_token(db, token)
        return saga.id, live_link.guest_view(db, saga)


@router.websocket("/api/live/{token}/ws")
async def live_socket(websocket: WebSocket, token: str):
    try:
        saga_id, stage = await run_in_threadpool(_open, token)
    except ServiceError:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    connection = Connection(websocket=websocket, member_id=0, token=token)
    hub.add(saga_id, connection)
    try:
        await websocket.send_json({"type": "live_stage", "stage": stage})
        while True:
            if await websocket.receive_text() == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        hub.remove(saga_id, connection)
