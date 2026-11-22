# 23 - The dice roller

Status: Done
Requirements: SET-62, SET-63, SET-64, SET-65, SET-66, TPL-14, SAGA-11, UX-15
Depends on: 20-character-item-editors-user-page (player colour, dice style), 22-desktop-set

From the draft `docs/drafts/dice_roller.md` (deleted once built).

## Goal

A **Dice roller** Set:

- **Roll types** come from the Saga template and the DM changes them per Set. A roll type is some dice and how to read
  them: sum, highest, lowest, sum of the dice above or below a number, plus a modifier.
- **The tray**: on the live Stage, clicking a roll type puts its dice in a row at the bottom of the Set, for everyone
  to see. **Roll** throws them: 3D dice fly, bounce off the Set's edges and each other, tumble, and land.
- The DM can pick, unseen, the number a die in the tray will land on.
- Each die is drawn in its owner's **colour** and **dice style**. There are ten styles, from Minimalist to Orcish, with
  textures, normal maps, glow and shapes.

## Out of scope

- Real rigid-body physics: the motion only needs to look like flying and rolling.
- Dice commands typed in text ("/roll 2d6+3"). The roll types are the commands for now; voice and AI can use them later.
- Rolls written to a character's values. This stays light tracking: the result is shown, nobody's HP changes.
- Private rolls (to the DM only).

## UX

- **Build**: "＋ Dice roller". Its panel lists the **roll types**, starting from the Saga template's. For each:
  - its name;
  - its dice, as a few lines of count and sides (d4, d6, d8, d10, d12, d20, d100);
  - how to read them: Sum, Highest, Lowest, Sum above X, Sum below X;
  - a modifier (+/−).

  Add, remove, reorder. The Template page has the same editor for the Saga's defaults ("Dice rolls").
- **On the Stage** (players and the DM; viewers and the live link watch):
  - A strip of **roll-type buttons**. Clicking one adds its dice to the **tray**, a row along the bottom of the Set,
    in the clicker's colour and style. Everyone sees them appear (they drop in).
  - A group in the tray has a small ✕ for whoever added it (the DM: any). **Roll** throws everything in the tray;
    **Clear** (DM) empties it.
  - Rolling: the dice fly up from the tray, bounce off the Set's edges and each other, tumble and come to rest
    showing their numbers. Every screen sees the same throw.
  - Then a **results** card shows, for each roll type: its name, who added it, each die's number (the ones counted
    stand out), and the result in large. The last few rolls stay listed, smaller.
  - **The DM's control**: clicking a die in the tray (the DM only) opens its faces. The pick lands that number and
    shows to the DM as a small dot on the die; players never see it, nor that it was picked.
- **Saga → User → Dice**: the ten styles, each with a live 3D preview in your colour:

  | Style | Look |
  |-------|------|
  | Minimalist | Default. Your colour, a little glossy, rounded edges, numbers in a high-contrast complementary colour. |
  | Ember | Black stone, low gloss, with glowing cracks and glowing numbers in your colour. |
  | Metal | Very reflective brushed metal (normal map) in your colour; numbers black or white, whichever contrasts most. |
  | Raw wood | Light beige wood grain; numbers in your colour. |
  | Polished wood | Dark varnished wood with a clear coat; numbers inlaid in your colour. |
  | Noble | Your colour as deep lacquer with a gold filigree border on each face; gold numbers. |
  | Elven | Pearly, near-white and slender (sharp edges), with a sheen of your colour and fine leaf lines; numbers in your colour. |
  | Dwarven | Heavy dark iron with thick bevels and riveted rims; runic-cut numbers filled with your colour. |
  | Orcish | Rough, chipped bone-and-iron (an uneven shape), with crude daubs of your colour; numbers like scratches. |
  | Nature | Mossy stone: moss in shades of your colour; numbers like carved stone. |

## Design

- **Dice rules** (`domain/dice.py`):
  - `SIDES = 4, 6, 8, 10, 12, 20, 100`.
  - A roll type is `{id, name, dice: [{count, sides}], read: sum|highest|lowest|sum_above|sum_below, x, modifier}`.
  - `clean_roll_types`, `roll_value`, `read_result`.
  - A d100 is drawn as two d10s (tens and units) and counts as one die.
- **Saga template**: `starting.dice_rolls` (DnD Lite):
  - d20, Advantage (2d20 highest), Disadvantage (2d20 lowest);
  - d4, d6, d8, d10, d12, d100;
  - Ability (4d6), Damage 2d6.

  It's edited on the Template page (`dice.set`) and travels with template files.
- **Set type** `set_types/dice.py`, key `dice`:
  - Config: `{roll_types, tray: [{id, group, type_id, sides, member_id, forced}], next_id, roll, history}`.
  - The roll is `{id, seed, by, groups: [{group, type_id, name, member, color, style, dice: [{id, sides, value,
    counted}], result}], at}`.
  - Players never get `forced`.
- **Members acting on a Set** (Set contract): `SetType.act(ctx, stage_set, member, name, args)`, through
  `POST /sets/{id}/act`.
  - Players and the DM can act on a Set of the live Stage they see; the DM can also act on any Stage, to rehearse.
  - Each type decides its own acts (the DM's commands stay `command`).
  - The dice acts: `tray.add {type_id}`, `tray.remove {group}`, `tray.clear`, `tray.force {die_id, value}` (DM) and
    `roll`.
- **`RenderContext.members`** (MemberBook): each member's name, colour and dice style, which the tray and the roll
  carry.
- **Member dice styles**: `access.DIE_STYLES` has the ten. The overview's members carry `die_style`.
- **Frontend**:
  - `color/theory.ts` (pure, tested): rgb/hsl, relative luminance, WCAG contrast, `bestInk`, `readableComplement`,
    `mix`, `shade`. Used by dice, and there for tokens and pings later.
  - `dice/geometry.ts` (pure, tested):
    - polyhedra (tetra, cube, octa, pentagonal trapezohedron, dodeca, icosa), each face with its value and normal;
    - chamfered (rounded) edges by insetting faces; an uneven "rough" variant;
    - per-face UVs into a number atlas.
  - `dice/textures.ts`: canvas atlases per style: the base pattern, the numbers, the emissive map (glow), and a
    normal map from a height field (Sobel).
  - `dice/styles.ts`: per style, the material settings and textures (`MeshPhysicalMaterial`; a room environment
    lighting reflections).
  - `dice/physics.ts` (pure, deterministic, tested):
    - spheres in a box: gravity, bounces on the floor and walls, die-to-die pushes;
    - spin that slows on contact; a seeded random throw.
  - The landing trick: the whole throw is simulated first; each die then gets a fixed rotation in its own frame so
    that its final pose shows its value face up. Every frame keeps that rotation, so the motion looks the same, just
    "painted" so it lands right.
  - `dice/DiceScene.tsx`: three.js renderer, camera, lights, shadows on a see-through floor; the tray, the throw, and
    clicks on dice (the DM's pick).
  - `dice/DicePreview.tsx` for the User page.
  - `stage/sets/dice/` (view, inspector, `RollTypesEditor`, shared with the Template page).

## Tools chosen

| Need | Choice | Why |
|------|--------|-----|
| 3D dice (meshes, PBR materials, lights, shadows, reflections) | **three.js** (`three`, MIT) | The standard WebGL library; no physics library needed (a small deterministic sim of our own). |

## Steps

- [x] Backend: dice rules, Saga template defaults (+ Template page command), Set type with acts, act route, MemberBook,
  dice styles; tests.
- [x] Frontend: colour theory, geometry, physics (tests), textures and styles, the scene, the Set view and inspector,
  the Template page section, the User page previews.
- [x] Checked in the running app; docs.

## Tests

- **Backend**:
  - roll types' validation;
  - reading results (each mode, the modifier, d100);
  - the tray: who adds and removes;
  - the DM's pick: honoured, and never sent to players;
  - rolling: results, history, the tray emptied;
  - viewers refused;
  - the Template defaults used by a new Set.
- **Frontend**: contrast and complements; each die's faces (count, values, outward normals, planar faces); the throw
  (deterministic, stays in the box, settles); the landing rotation.

## Changes from plan

- The results show as a strip along the bottom (where the tray was), not a corner card: the card covered dice.
- The throw stays clear of the roll buttons (top) and the tray and results (bottom); the Set's toolbar sits outside it.
- Every screen gets the same values; the same throw on Sets of the same size (an interface Stage's sizes differ per
  screen, so their throws differ while landing on the same numbers).
- The User page shows one live preview (a d20 and a d6) of the style picked or pointed at, instead of ten 3D previews
  (browsers allow few WebGL canvases at once).
- `inkOn` (colour theory) keeps numbers readable on light styles (Elven, Raw wood) when the member's colour is light.

## After the first review (2026-11-25)

- Softer lighting (exposure, environment, lights), so Raw wood and Elven read; their bases are a little deeper and
  their numbers pushed to a readable contrast (`inkOn`).
- Ember: cracks glow in the colour's vivid complement (`vividComplement`), numbers in the colour.
- Orcish redone: blackened rusted iron, a more uneven shape, three claw slashes of war paint in the colour, studs,
  hacked bone-white numbers (doubled rough strokes), gouges and dents in the normal map.
- Nature redone: a living pebble in a green-tinted shade of the colour, a vine with leaves in shades of the colour,
  little flowers in its complement, cream numbers with a dark edge.
- The roll buttons, the tray's list and the results are toolbars ("Rolls", "Tray", "Results"), so they follow the
  DM's Controls placement; the tray's edge is a setting (`tray_edge`: the throw is laid out and simulated as from the
  bottom, then turned about the vertical axis).
- The same roll type added again by the same member joins their group ("d12 ×3": one sum).
- The results' ✕ (`roll.clear`) clears them and the rolled dice for everyone.
- Settings: Transparent. With no dice on it the Set lets clicks through: the Set contract's `passThrough` can be a
  function of the Set.

## Changes from the draft

- Dice faces show their number on the face (a d4 too, read on its top face); a d100 is two d10s (tens and units).
- "Elven, dwarven, orcish, nature… play with shapes": Elven dice are slender with sharp edges, Dwarven ones heavily
  bevelled, Orcish ones uneven and chipped, Nature ones softly rounded stone.
- Roll types also take a modifier (+N), and the results show which dice counted.
- Players take back only their own dice; the DM clears the tray. Viewers and the live link watch.
