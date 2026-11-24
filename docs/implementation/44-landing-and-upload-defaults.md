# 44 - Landing on the Saga tab; upload limits' defaults

Status: Done
Requirements: SAGA-16 (UPL-2 reworded)
Depends on: 43-system-administration

From the user's request (no draft file): "When logging into the app, if there's no Stage active, default to the Saga
tab. Also, look at my current app image settings, make them the default of the app."

## 1. Where entering a Saga lands

- `/me` says, per Saga, whether a Stage is **live** there (`sagas[].live`).
- The home page (after signing in, or the SagaCraft link) sends a member of one Saga to its Stage when one is live,
  else to its Saga tab (`/s/:id/saga`: the DM's Members, everyone else's User page); the Sagas list's links do the
  same (`sagaEntry`). It refreshes `/me` first (a Stage may have gone live since signing in).
- The Stage tab is unchanged: clicking it shows the Stage (or that nothing is live).

## 2. Upload limits' defaults

The limits saved on the user's instance become `domain/uploads.DEFAULT_LIMITS` (what a new instance starts with;
saved ones still win). Changed: Character pictures 4 MB / 2048 px (were 1 MB / 1024 px); Icons 1 MB (0.2); Item
pictures 1 MB (0.5); Document images 2048 px and 100 each (2560 px, 60); Location map pictures 100 each (24);
Desktop pictures 5 each (1). Environment and Token pictures were already the same.

## Steps

- [x] `/me`'s `live`; the home page's landing; tests (backend: `live` follows the live Stage; frontend: where the home
  page lands, both ways).
- [x] Defaults; the upload tests that leaned on the old ones (a character picture over 2048 px).
- [x] Checked in the running app: Map check's player signing in with nothing live lands on the Saga tab (their User
  page), with the Stage live on the Stage (its live Stage put back after).
- [x] Docs.

## Changes from the request

- "The Saga tab" for a player is their User page (the only Saga section they have).
- Only entering a Saga changes: going to the Stage tab yourself still shows it.
