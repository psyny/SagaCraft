# 31 - Performance overhaul (pictures, data, the backlog)

Status: Done
Requirements: NFR-9, NFR-10, NFR-11, NFR-12, NFR-13, NFR-14 (NFR-3 rescheduled)
Depends on: 02-picture-uploader, 27-map-layers, 30-actions-and-calculated-variables

From the draft `docs/drafts/performance_overhaul.md` (deleted once built): go through the backlog, rethink the
database and data structures now that most features exist, and make sure pictures don't burn the hosting plan
(load on demand, CDN-ready, cached by the frontend).

## What we found

Measured on the running app (the demo Saga) and read in the code:

- **Pictures were re-downloaded all the time.** A signed picture URL changed every 10 minutes (its expiry was
  rounded to 10 minutes), so every picture on screen got a new URL, and was downloaded again, six times an hour.
  Responses were `private`: no CDN could keep them.
- **Small places loaded big pictures.** A 40 px face on a card downloaded the whole portrait (up to 1024 px, 1 MB).
- **Nothing was compressed.** API JSON (a ruleset: 30 KB, display templates: 47 KB, Stages: 8 to 17 KB) and the
  frontend's code (one 1.3 MB script) went uncompressed.
- **Everything loaded at once.** The app was one 1.3 MB script; three.js (the 3D dice: half of it) loaded for
  everyone, even on pages without dice.
- **File bytes loaded for nothing.** Reading a file's size or category (a map's pictures on every picture command,
  temporary files, tokens) loaded its bytes too: up to 24 map pictures of 8 MB each.
- **Lists asked per row.** The calculated values of plan 30 loaded each character's items in their own query (and
  each item's owners loaded every character).
- **Lookups without indexes**: a member's groups (every request), a character's groups, the Stages showing a
  resource (every change), a Saga's resources of a kind.
- **The schema had drifted** from the models in two places (`alembic check`).

## The database: keep PostgreSQL

Having the whole app in view, PostgreSQL is still the right choice: the data is relational (Sagas, members,
groups, resources, relationships, Stages, Sets, actors) with flexible parts in JSON columns (attributes, configs,
maps), and everything is scoped and checked per Saga in queries. A document store would lose the joins and
constraints the visibility rules lean on; nothing needs a graph or search engine yet (relationship graphs are
small and built per request).

**Files stay in Postgres for now.** Postgres keeps large values out of the row (TOAST), the bytes now load only
when served, and with the caching below most picture requests never reach the API. The cost to watch is the
database's size (a Railway volume) once Sagas hold many maps. **Object storage** (an S3-compatible bucket;
Cloudflare R2 has no egress fees) is the next step when the database passes a few GB: the files' bytes would move
there and `/api/files` would redirect to signed bucket URLs. Pictures are already read through one place
(`services/files.py`, `services/resources.get_file`, map composing), so the move is contained. NFR-3 moves to Later.

Data structures stay as they are (JSON attributes per resource, maps as one document per location, Stage content
per Set): they match how the app reads them (a whole resource, a whole map, a whole Set at a time).

## Design

### Pictures: one URL per window, cached by everyone

- A signed picture URL now stays the same for a **window** (`FILE_URL_WINDOW_HOURS`, 6 h) and works
  `FILE_URL_MINUTES` (2 h) past it, so a picture is downloaded once per window, at most (`security.url_expiry`).
- Pictures and players' composed map pictures are served `Cache-Control: public, max-age=<until the URL stops
  working>, immutable` with an **ETag** (a 304 when revalidated): browsers keep them, and a **CDN** in front of the
  API can too (`docs/railway/setup.md`). A file never changes; a composed map's URL names the map's version (every
  change but tokens makes a new one).
- Who sees what is unchanged: URLs are only handed to members who may see the picture. A member who once got a
  URL can use it until it stops working (up to 8 h instead of 2 h 10 min); they had already seen the picture.

### Pictures at the size they show

- `GET /api/files/{id}?w=` serves a **smaller copy** (WebP, keeping transparency) at the first of 96, 192, 384, 768,
  1536 px covering the width asked; made the first time, then kept (`file_variants`, deleted with its file). Wider
  than the file, or a GIF: the file itself. The width isn't signed (the same picture, smaller).
- **`Picture`** measures its box before loading (face crops: the drawn picture's width), asks for that width (screen
  density up to 2) and loads lazily; nothing loads before it's measured (so the full file isn't fetched by
  accident); a box growing past its copy gets a bigger one. Tokens on maps and graph nodes ask for 384 px. Maps,
  EFX pictures, documents and the image editor keep the full file (they're drawn large or edited).

### Compression and splitting

- The API gzips JSON over 1 KB (pictures, already compressed, are left alone): a ruleset goes from 30 KB to 2 KB.
- nginx gzips the frontend's scripts and styles; hashed assets are cached a year (`immutable`).
- Pages load the first time they open (route chunks); the 3D dice (three.js, 516 KB) load with the first Dice
  roller or the User page's preview. The main script went from 1.3 MB to 660 KB (215 KB compressed).

### The database

- `files.data` is **deferred**: read only when a picture is served, composed or copied.
- New indexes: `group_members.member_id`, `character_group_members.resource_id`, `stage_actors.resource_id`,
  `resources (saga_id, kind)`.
- Calculated values read their sources once per list or Stage render (`services/calculated.Lookup`).
- The two drifted columns (`character_groups.attributes`, `location_maps.updated_at`) are made required, like
  the models (older empty rows get the defaults): `alembic check` is clean.

### The backlog

The open questions already settled by what's built move to Decided (`open_questions.md`): the template file format
(JSON, checked by parsing), the formula language (plan 30), drawing heavy Sets (WebGL), tokens on maps (plan 21),
players on Stages (pings, dice; tokens are the DM's), and object storage (above). The rest are product choices for
the user and stay open.

## Steps

- [x] Measure (query counts, payload sizes, what pictures load), read the file paths.
- [x] Stable URL windows, public immutable caching, ETags; smaller copies (`file_variants`, migration).
- [x] `Picture` asks for its size and loads lazily; tokens and graph nodes sized.
- [x] Gzip (API JSON, nginx), long cache for assets, route chunks, lazy three.js.
- [x] Deferred file bytes, indexes, batched calculated values, schema drift.
- [x] Tests (backend: windows, headers, copies, 304, gzip; frontend: widths), checks in the running app, docs.

## Changes from the draft

- **No database switch**: PostgreSQL stays (reasons above); object storage is planned for when the database
  grows, with the point to switch named, instead of moving files now (more services to run and pay for before
  they're needed).
- **The backlog**: only the open questions the app already answers were closed; the others are the user's
  product choices and stay open.
- **Frontend caching** is the browser's HTTP cache, made to work (stable URLs, immutable): no service worker or
  in-app picture store, which would duplicate it.
- Not done: the Stage view still takes 30 to 55 queries for a DM (fast enough: under 20 ms on the demo); real-time
  scaling past one API process is still open.
