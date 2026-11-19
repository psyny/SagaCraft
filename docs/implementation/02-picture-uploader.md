# 02 - Picture uploader

Status: Done
Requirements: UPL-1..8
Depends on: 01-first-version

## Goal

One picture uploader for the whole app. Before choosing a file the user sees the limits; then they crop,
rotate/mirror and adjust colours; the browser resizes and compresses the result to the category's limits
and uploads it. The server checks everything again.

## UX

- Opened from wherever a picture is needed (v1: the character form: "Upload picture", "Crop / adjust").
- Pick: click, drop or paste (Ctrl+V). The limit is shown on the drop zone ("Character pictures: up to
  1 MB and 1024 px. Bigger pictures are resized for you"). Any size of original is fine (up to 60 MB).
- Edit: crop box with handles (ratios Free, 1:1, 3:4, 4:3, 16:9), rotate left/right, mirror; brightness,
  contrast, saturation, hue sliders (double-click a slider to reset it). Live preview.
- Info: original size, and the size that will be uploaded. One "Upload" button.
- "Crop / adjust" re-opens the current picture; the face crop is kept.

## Design

- **Limits**: system setting `upload_limits` (table `system_settings`), per category `character`, `item`,
  `document`, `map`: `max_mb` and `max_px` (longest side). Defaults in `domain/uploads.py`. `MAX_UPLOAD_MB`
  (env, default 20) is the hard ceiling. Edited in System administration by holders of the new
  permission `system_settings.manage`. `GET /api/upload-limits` for every signed-in user.
- **Browser** (`frontend/src/components/imageEditor/`): orient (rotate/mirror) on a canvas, crop, downscale
  in halving steps, apply colour adjustments with the CSS filter formulas (so the preview matches), encode
  WebP (JPEG where the browser can't encode WebP), lowering quality and then size until it fits `max_mb`.
- **Server** (`services/uploads.py`): category known, size under `max_mb`, decodes the file with Pillow (it
  must be a real PNG/JPEG/WebP/GIF; the stored content type comes from the decoded format), longest side
  under `max_px`, decompression-bomb guard. Files now record `category`, `width`, `height`.

## Tools chosen

| Need | Choice | Why |
|------|--------|-----|
| Server image checks | Pillow | Standard, decodes and verifies every format we accept |
| Browser editing | Canvas 2D, no library | Crop/rotate/adjust are small; no dependency needed |

## Tests

Backend: limits defaults, update, permission, ceiling, unknown category; upload over size, over pixels,
fake file, content type from the real format, viewers can't upload. Frontend: crop geometry (ratios,
moving, resizing with and without a locked ratio, bounds), output size, colour adjustments.

## Changes from plan

- Animated GIFs are flattened (the editor works on one frame).
- Modals now render in a portal and stack (the uploader opens above the character form; Escape closes the top one).
