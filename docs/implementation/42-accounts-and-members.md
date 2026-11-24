# 42 - Accounts and Saga members

Status: Done
Requirements: SYS-8, SYS-9, SYS-10, SAGA-13, SAGA-14, SAGA-15 (SYS-5, SAGA-2, SAGA-7, SAGA-9 reworded)
Depends on: 01-first-version (access), 26 (Saga → User)

From the conversation (no draft file): "Users are the same across the entire system. A system admin needs an area to
admin users: look users up, edit user details, delete a user, reset their password, and create new users. A DM can
look up users to add to their Saga, and create new users that are added to the Saga: that needs to be clear on the
Members page. Display name is a user parameter in the Saga, as are the dice options: not global for that user."

## How it is today

- One account per person on the whole server (a unique login, a password, a display name); a Saga membership links
  an account to a Saga with a role (admin/DM, player, viewer), the member's colour and dice options (style,
  animations off, simplified: already per Saga).
- System admins create accounts only as new system admins or as a new Saga's first DM; there's no list of accounts.
  The permission `users.manage` exists, unused.
- DMs add members on Saga → Members with one form: a login and a password make a new account; a login with no
  password adds an existing account (the field's hint says so). They can't look accounts up.
- The display name is the account's: changing it on Saga → User changes it in every Saga.

## UX

### System → Users (system admins with "Manage accounts", `users.manage`)

- A search box (login) and the list: login, its Sagas (name, role, its display name there), system admin or not,
  active or not.
- **＋ New account**: login and password. It's in no Saga yet: a DM adds it, or System → Sagas makes it a Saga's DM.
- Opening one: **login** (rename), **active** (a disabled account can't sign in), **reset password** (the admin types
  a new one), its Sagas, **Delete** (after a confirm: it leaves every Saga; what it made stays without its name).
  Refused for the root admin, for yourself, and while it's a Saga's only DM ("make someone else DM of X first").

### Saga → Members (the DM): "Add someone", two clear ways

- **Add an existing account**: search by login (2 letters or more; up to 10 matches, those already in the Saga left
  out), pick one, its role and its display name in this Saga (the login until changed).
- **Create a new account for this Saga**: login, password, display name in this Saga, role. Said plainly: "Creates
  an account they sign in with, and adds it to this Saga."
- The member list shows each member's display name in this Saga with the login beside it.

### The display name is the Saga's

- Saga → User: **Display name** "in this Saga" (no longer every Saga), next to the colour and dice options.
- Everywhere a member's name shows (members, dice rolls, pings, notices, "its players", relationship creators…) it's
  their display name in that Saga. The Sagas list shows the login at the top.

## Design

- `saga_members.display_name` (migration: each membership takes its account's name); `users.display_name` goes.
  Everything that read the account's name reads the member's.
- Routes: `GET /system/users?q=`, `POST /system/users`, `PATCH /system/users/{id}` (login, active, password),
  `DELETE /system/users/{id}` (`users.manage`); `GET /sagas/{id}/accounts?q=` (the Saga's admins: logins only);
  adding a member says which way: `{"account": "existing", "login", ...}` or `{"account": "new", "login",
  "password", ...}`.
- Deleting an account: its memberships go (what references them already falls back: files, relationships, rolls keep
  no creator), its system admin entry too; "created by" on system admins it made is cleared.

## Decisions (the user's answers)

1. **The DM's lookup is a search**: logins with what they type, from every account on the server (so a DM can find
   out which logins exist). **Logins aren't case sensitive** (stored and matched lowercase; the migration lowered
   any that weren't).
2. **An account has no name of its own** ("do what you think is best"): only its login; system admins see its display
   name in each Saga.
3. **Deleting removes it from every Saga.** Refused for the root admin, your own account and a Saga's only DM (a
   Saga without a DM couldn't be managed).

## Steps

- [x] Migration `e4b8d2f6a913` (each membership takes its account's name; logins lowercase; `users.display_name`
  dropped) and model; names read from memberships (`services/access.member_name`: members, dice rolls, pings, action
  notices, "its players").
- [x] System → Users (`pages/SystemUsers.tsx`: list, search, new account, an editor per account); the DM's lookup and
  the two ways to add (`saga/AddMember.tsx`).
- [x] Saga → User: the display name in the Saga's card; the account's card holds the password and Sign out.
- [x] Tests: backend 170 (names per Saga, logins not case sensitive, the DM's lookup and adding, System → Users:
  permissions, create, rename, turn off and on, new password, the root and self rules, delete; making and removing
  system admins, deleting a system admin's account, a new Saga's DM both ways), frontend 232 (Add
  someone's two ways). Checked in the running app: the migration (every member kept their name), System → Users and
  an account's editor (as the root, signed in as "ADMIN"), Add someone's search on Saga → Members (as Saga 4's DM),
  Saga → User (as the player).
- [x] Docs: requirements, sagas-and-access.md, glossary, decision log (the account scope question), roadmap, AGENTS.md.

## Changes from the request

- The account editor turns an account **off** besides deleting it (it was already in the model, `is_active`): a way
  to lock someone out without losing their place in their Sagas.
- Only the root admin changes the root account's login or password; a system admin can't turn off or delete their
  own account (so nobody locks themselves out).
- A new system admin's form lost its display name (accounts have none); a new Saga's form asks for the DM's display
  name in that Saga.
- `PATCH /me` no longer takes a display name (it says to use Saga → User); older clients get a clear error.
- After the first build, the user's follow-up: **an account becomes a system admin from its editor** (System → Users →
  Edit: Make system admin, its permissions, Remove system admin) instead of the separate "New system admin" form,
  which went ("why do I need to create a new user as the sys admin?"). Removing a system admin is new
  (`DELETE /system/admins/{id}`: never the root, never yourself, only one whose permissions you all hold).
- Then: **a new Saga's DM** is picked the same two ways (System → New saga → Its DM: an existing account, looked up
  by login through `GET /system/logins` for system admins who assign Saga admins or manage accounts, or a new one;
  `admin_account` on `POST /system/sagas`). Both forms share `AccountChoice` (`saga/AddMember.tsx`).
