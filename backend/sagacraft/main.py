"""SagaCraft API entry point: uvicorn main:app (PYTHONPATH=backend/sagacraft)."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import access, characters, displays, locations, resources, stages, ws
from db.session import SessionLocal
from domain.ruleset import load_rulesets
from infrastructure.config.settings import settings
from services.access import bootstrap_root_admin
from services.errors import ServiceError

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_rulesets()
    if settings.is_production and settings.jwt_secret_key == "dev-secret-change-me-in-production-0123456789":
        raise RuntimeError("Set JWT_SECRET_KEY in production")
    with SessionLocal() as db:
        bootstrap_root_admin(db, settings.root_admin_login, settings.root_admin_password)
    yield


app = FastAPI(title="SagaCraft API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ServiceError)
async def service_error_handler(_request: Request, exc: ServiceError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(access.router)
app.include_router(resources.router)
app.include_router(characters.router)
app.include_router(displays.router)
app.include_router(locations.router)
app.include_router(stages.router)
app.include_router(ws.router)
