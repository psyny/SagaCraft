# 43 - System administration: Sagas, their numbers, on/off and delete

Status: Done
Requirements: SYS-11, SYS-12, SYS-13, SYS-14, SYS-15, SYS-16 (SYS-5 reworded)
Depends on: 42-accounts-and-members

From the user's request (no draft file): "We need an option to delete a Saga. From the admin panel, enter a specific
Saga and activate or deactivate it. Some statistics for the Saga when we go there: how many players, last login, how
many NPCs, items, events, relationships, docs, maps, Stages; and total file size per file category. The list of
Sagas needs to be limited to 5 with search and order options (last login). Make the system administration page
better UI/UX in general."

## UX

- **System administration in tabs** (`?tab=`): **Sagas** (the default), **Users** (with "manage accounts"), **System
  admins**, **Upload limits**: one thing at a time instead of four panels on one page.
- **Sagas**: a search box (name, not case sensitive), **Order** (Last login, Name, Newest, Oldest), **All / Active /
  Inactive**, and ＋ New saga (a window now: name, template or file, its DM, the DM's name). 5 rows at a time, each
  with its name (an Inactive badge), DMs, members, template and **Last login** ("2 days ago", the date on hover);
  ‹ Previous · 1–5 of 12 · Next ›. A new search, order or filter starts at the first page. A row opens the Saga's
  page.
- **A Saga's page** (`/system/sagas/:id`): Active or Inactive; template, when it was made, last login.
  - **People**: DMs, players, viewers; each member's name there, login, role and last login; ＋ Add a DM.
  - **What it holds**: player characters, NPCs, items, documents, events, locations, maps, relationships, Stages.
  - **Files**: per upload category, how many and their size, and the total.
  - **Turn off / Turn on**; **Delete…**: a window saying what goes (and that accounts stay), pointing to Turn off for
    a pause, its name typed to enable the button.

## Design

- `services/system_sagas.py`: `list_sagas` (one query: members' latest `last_seen_at` and count per Saga, outer
  joined; order "last login" puts never-opened Sagas last), `saga_stats` / `saga_detail` (counts grouped by kind and
  type: NPCs are characters of non-player types; maps are locations whose map has a picture; files summed per
  category, labelled from the upload limits), `set_active` (`sagas.is_archived`), `delete_saga` (the live Stage
  cleared, then the Saga's row: every table of the Saga's goes with it through its foreign keys), `add_dm`,
  `touch_member`.
- Routes: `GET /system/sagas?q&order&status&offset&limit` (now a page: `{total, sagas}`), `GET|PATCH|DELETE
  /system/sagas/{id}` (`DELETE …?confirm=<its name>`), `POST /system/sagas/{id}/admins`.
- **Last logins** (migration `a7c3e9d1f264`): `users.last_login_at` (set when signing in; System → Users shows it) and
  `saga_members.last_seen_at` (set when the member opens their Saga, `GET /sagas/{id}`, at most every 5 minutes).
- `services/resources.ruleset_of(saga)`: a Saga's ruleset without the "is it open" check (`ruleset_for` refuses an
  inactive Saga, and its page still counts its NPCs).
- Frontend: `pages/SystemPage.tsx` (tabs), `pages/SystemSagas.tsx` (list, New saga window), `pages/SystemSagaPage.tsx`,
  `components/timeAgo.ts`.

## Steps

- [x] Last logins (migration, sign-in, opening a Saga).
- [x] Sagas list, a Saga's page, on/off, delete, add a DM (backend, routes).
- [x] The System page in tabs; the Sagas list; the Saga page.
- [x] Tests: backend 176 (the list's search, orders, filter and pages; a Saga's numbers and files, never its content;
  off closes it to members and on opens it; delete takes everything, confirms the name, needs the permission; add a
  DM three ways; last logins), frontend 234 (the list's paging and requests; timeAgo). Checked in the running app:
  the Sagas tab, Test Saga's and Map check's pages, the delete window (not confirmed), Turn off (a player gets 404) and
  Turn on again.
- [x] Docs.

## Changes from the request

- **Activate / deactivate** is the Saga's existing *archived* state, shown as Active / Inactive with Turn on / Turn
  off: an inactive Saga keeps everything; its members can't open it until it's on again.
- **Last login** of a Saga is the latest time one of its members opened it (sign-ins are per account, not per Saga);
  Sagas no one has opened since this change show "never".
- **NPCs** are characters of the types not marked as player characters; **maps** are locations with a map picture.
- Beyond the request: the people's breakdown (DMs, players, viewers) and each member's last login, Add a DM on a
  Saga's page, accounts' last login in System → Users, and an Active / Inactive filter on the list.
