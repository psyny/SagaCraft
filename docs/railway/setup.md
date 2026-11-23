# Deploying on Railway

Three services in one Railway project: Postgres, the API and the frontend. Same images as
`docker-compose.prod-local.yml`, so test there first (`make.bat prod-local`).

## 1. Postgres

Add a **PostgreSQL** database. Railway exposes `DATABASE_URL` (a `postgres://` URL is fine).

## 2. Backend API

- Source: this repo, **Root directory** `SagaCraft/backend` (or `backend` if SagaCraft is its own repo),
  **Dockerfile path** `Dockerfile.api`.
- Variables:

```
APP_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET_KEY=<long random string, 32+ characters>
CORS_ORIGINS=https://<your-frontend>.up.railway.app
RUN_MIGRATIONS_ON_STARTUP=true
ROOT_ADMIN_LOGIN=<your login>
ROOT_ADMIN_PASSWORD=<a strong password>
```

- Health check path: `/health`.
- The container waits for Postgres, runs `alembic upgrade head`, then starts uvicorn on `$PORT`.
- The API refuses to start in production with the default `JWT_SECRET_KEY`.
- `ROOT_ADMIN_*` only matter on the first start (they create the root system admin when there is none).
  You can remove them afterwards.

**Real-time**: the WebSocket hub is in memory, so keep the API at **one replica** for now.

**Files**: uploaded pictures are stored in Postgres (v1), so no volume is needed. Picture URLs stay the same for
`FILE_URL_WINDOW_HOURS` (default 6) and work `FILE_URL_MINUTES` (default 120) past it; the API serves them
`public, immutable` with an ETag, so browsers download each once per window.

**A CDN (optional, recommended once players are many)**: put Cloudflare (free plan) in front of the API's domain
(a custom domain on the API service, proxied). Add a **Cache Rule**: URI path starts with `/api/files/` or
`/api/maps/` → *Eligible for cache*, *Edge TTL: use cache-control header*, cache key with the query string (the
default). Cloudflare then serves repeated pictures without reaching Railway (the paths have no file extension, so
they aren't cached without the rule). Everything else under `/api/` must stay uncached (the default). Point
`VITE_API_URL` at the CDN domain and add the frontend's origin to `CORS_ORIGINS` as before.

## 3. Frontend

- Source: this repo, **Root directory** `SagaCraft/frontend`, Dockerfile `Dockerfile`.
- Variable (used at **build** time): `VITE_API_URL=https://<your-api>.up.railway.app`
- nginx listens on Railway's `$PORT` and falls back to `index.html`, so links like `/s/1/stages` work. It gzips
  scripts and styles and caches the hashed `/assets/` files for a year (`index.html` is never cached).

## First run

Open the frontend, sign in with `ROOT_ADMIN_LOGIN` / `ROOT_ADMIN_PASSWORD`, go to **System
administration**, and create a Saga with its first admin (the DM).

## Migrations after model changes

```sh
make.bat be-migration "describe the change"   # against the local Docker Postgres (make.bat up first)
```

Review the generated file (Alembic doesn't handle every case: see the initial migration's note on the
sagas/stages foreign key), commit it, and deploy: the API runs it on startup.
