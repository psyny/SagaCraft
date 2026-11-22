# 20 - Character and item editors, tokens, Saga → User

Status: Done
Requirements: CHR-16, CHR-17, CHR-18, CHR-19, ITEM-7, SAGA-9, SAGA-10 (UX-13 updated)
Depends on: 19-access-folders-timeline-set-live-link

From the draft `docs/drafts/editors.md` (deleted once built).

## Goal

The character and item editors were a long modal form. They become a **full-screen editor with tabs**:

- Admin: the DM's settings.
- Identity: name, pictures, token, sharing.
- Variables.
- Inventory: items, with a **Use** for items that can be used up.

Characters get **Is Active** and a **token style**, drawn in their player's colour. Everyone gets a **Saga → User** page:
display name, password, their colour and dice style.

## Out of scope

- The dice roller itself: only the style choice exists, and "Minimalist" is the only style.
- Pings: they are only planned to use the colour.
- Tokens outside maps: relationship graph nodes and list pictures keep their look for now.
- Players adding items to inventories against the Saga template. The template's rule for the inventory decides; in DnD
  Lite, a character's players may.

## UX

- **Characters**: clicking one shows its sheet. Its **✎ Edit** opens the editor full screen, for the DM and for its
  players.
- **Items**: the item page shows the sheet, with **✎ Edit** in its header (DM). "＋ New item" opens the same editor.
- **Tabs** (each holds groups of settings):
  - **Admin** (the DM only):
    - Kind: category, Active, Instanceable, groups, tags.
    - Who: players in control (characters) or Owner (items), who can edit, who can see ("admins always see
      everything").
    - Its name for players: the name players see.
  - **Identity** (the DM and its players):
    - Name: the name, Hide the name, Relationships.
    - For its players only: who else can see it ("Only its players", "All players" or some players).
    - Pictures: the main picture with its face crop, icon, other pictures, and the **Token**, a live preview with
      the five border styles.
  - **Variables**: everything else the template defines (level, HP, initiative, item stats…). Who may change each
    one comes from the template.
  - **Inventory** (characters):
    - Each item shows its icon, name, category and what's left ("Uses 1 / 1").
    - **Use** takes one off at once.
    - Add and remove items (kept with Save), for whoever may change the inventory.

  One **Save** at the bottom saves every tab.
- **Token**: the character's icon (else its face, else its initial) in a border of its player's colour.
  - Several players: white. No player: grey.
  - Styles: Simple, Gradient, Chip (stripes like a poker chip), Double, Studded.
  - It shows on maps wherever a character is linked on a tile.
- **Active** (DM): an inactive character, for example one resting or retired:
  - stays off Actor Sets: players aren't sent its card, and the DM sees it faded with an "Inactive" badge in Build
    only;
  - is left out when its group or party is added to a Set.
- **Saga → User** (everyone; for players it's the only section, so there's no section bar):
  - The display name, shown in every Saga.
  - The password, which needs the current one.
  - **Your colour** in this Saga: a palette colour until you pick one; a token preview.
  - **Dice**: Minimalist.

## Design

- Migration `d4a8e2c6f190` adds:
  - `saga_members.color` (null means a palette colour by join order: `access.member_colors`);
  - `saga_members.die_style`;
  - `resources.active`.
- Token style: `presentation.token` (`resources.TOKEN_STYLES`). `serialize` sends `token_style` and `active` for
  characters.
- What a character's players may do, through the same `PATCH /resources/{id}`:
  - They receive its `presentation`, and may change `hide_name` and `token` (not the alias).
  - They receive `sharing`: the players group and members of its visibility. They may set only those; the DM's
    custom groups and Owner stay as they are (`resources._share`).
- `POST /resources/{id}/use-item {item_id}`: takes one off the item's first counter.
  - Allowed for the DM, and for whoever may change that character's inventory variable (a list of items).
  - Refused when the item isn't in that inventory, has no counter, or has nothing left.
- Map links of characters carry `token: {style, color}` (`resources.token_of`).
- Account and cosmetics routes:
  - `PATCH /api/me {display_name | password, new_password}`;
  - `PATCH /api/sagas/{id}/me {color, die_style}`.
  - The overview's `me` carries color and die_style; `members[].color` is the resolved colour.
- `expand_groups` skips inactive characters. The Actors Scene drops them for players and marks them `inactive` for
  admins.
- Frontend:
  - `CharacterForm` gets `tabbed`. `tabOf(attr)` sorts variables into tabs by what they are (pictures and the
    required name: Identity; item lists: Inventory; the members in control: Admin; the rest: Variables).
  - Other kinds (documents, locations, events) keep the single-column form.
  - New components: `components/Token.tsx` (`TokenRing`, `tokenColor`); `Modal` `full`; `saga/UserPage.tsx`.

## Steps

- [x] Backend: columns, colours, account and cosmetics routes, token style, sharing, use-item, inactive.
- [x] Frontend: the tabbed full-screen editor (characters, items), inventory with Use, token preview and styles,
  sharing for players.
- [x] Map tokens; inactive cards.
- [x] Saga → User.
- [x] Tests; checked in the running app; docs.

## Tests

- **Backend** (`tests/test_editors.py`):
  - inactive characters on Sets and when adding groups;
  - players styling and sharing their character (and what they can't change);
  - map token colours (one player, several, none);
  - using items (counts, refusals);
  - the User page: colours, dice style, display name, password.
- **Frontend**: `tokenColor`, `shade`, `tabOf`; the Saga section bar with User.

## Changes from the draft

- "Who can see" for the character's players is a separate, narrower choice on Identity: all players and some players,
  added on top of whatever the DM set. The DM's full choice stays on Admin.
- Players in control sit in Admin (the draft listed them there); "Hide the name" is on Identity for the DM and its
  players. "Name players see" stays the DM's.
- Player colour and dice style are per Saga (the page lives in the Saga); display name and password are the account's
  (every Saga).
- "Usable" items are the ones with a counter (DnD Lite: a consumable's Uses): nothing is hard-coded.
- "Relationship" opens the character's relationships panel (the same one as on resource pages), not a jump away.
