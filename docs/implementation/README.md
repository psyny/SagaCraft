# Implementation

This folder is where parts of SagaCraft are planned and then built. Product docs (`../vision.md`,
`../requirements.md`, `../concepts/`) say **what** the app does; plans here say **how** and **in what order**.

## Files

| File | Holds |
|------|-------|
| `roadmap.md` | The phases, their order and status. Start here. |
| `_template.md` | Template for a new plan. |
| `NN-<short-name>.md` | One plan per part (e.g. `01-access.md`). `NN` follows the roadmap order. |

## Process

1. **Pick** the next part from `roadmap.md`.
2. **Plan**: copy `_template.md` to `NN-<short-name>.md`. Fill in scope (requirement IDs), design, tools
   chosen, steps and tests. Set status `Draft`.
3. **Agree**: review the plan with the user. Open points go to `../open_questions.md`. When agreed, set
   status `Ready`.
4. **Build**: set status `In progress`. Tick steps as they are done. When the work differs from the plan,
   update the plan (and note why in its "Changes from plan" section) instead of leaving it stale.
5. **Close**: set status `Done`, update `roadmap.md`, and update product docs if the implementation
   settled anything (requirements, concepts, glossary, decisions).

Statuses: `Idea` (only in the roadmap) → `Draft` → `Ready` → `In progress` → `Done`. A plan can also be
`Paused` or `Dropped` (keep the file, say why).

## Rules for plans

- Every plan lists the requirement IDs it covers. A requirement that's missing from `../requirements.md`
  is added there first.
- Libraries and tools are chosen in the plan that first needs them, with a short reason. Record the choice
  in `../open_questions.md` (Decided).
- Keep plans short and concrete: a plan is done when someone can build from it.
- UX comes first: every plan has a UX section, and is reviewed against `../concepts/ux.md`.
- Keep the core rules from `../../AGENTS.md` in every design: Stages stay flexible (Set contract),
  Rulesets are data, everything is scoped to a Saga, visibility is filtered on the server.
