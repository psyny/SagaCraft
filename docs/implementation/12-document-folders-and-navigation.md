# 12 - Document folders and the Saga page

Status: Done
Requirements: DOC-7, DOC-8, DOC-9, UX-10, UX-11, UX-12 (and CHR-5, CHR-13, TPL-3, DSP wording updated)
Depends on: 11-saga-templates-items-documents

## Goal

The DM files documents in **folders** (one level, no sub-folders) and everyone browses them by folder. The top
bar gets fewer tabs: **Groups** becomes a section of **Characters**, and a new **Saga** page holds what's about
how the Saga is set up: **Members**, **Template** (the Saga template) and **Display templates**.

## Out of scope

- Sub-folders; folders for items, locations or characters (the table has a `kind`, so they can come later).
- Ordering folders by hand (they sort by name, numbers in order: "Chapter 2" before "Chapter 10").
- Folders in the Saga template export (they're content, not set-up).
- Saga settings beyond the three sections (name, calendar...): they'll join the Saga page when they exist.

## UX

- **Documents tab** (everyone, prep and play): a folder list on the left: *All documents*, each folder with its
  count, *Not in a folder*. *All* shows the documents grouped under folder headings; picking a folder shows only
  its documents (the address keeps it: `?folder=12`, so the back link from a document returns there).
- **DM**: *＋ New folder* (type a name, Enter: the new folder opens); rename (✎) and delete (✕) on hover;
  **drag a document card onto a folder** to file it (or onto *Not in a folder*). A new document made while a
  folder is open goes in it. On a document's page, a **Folder** picker in the header moves it in one step.
- Deleting a folder never deletes documents: they go to *Not in a folder* (the confirmation says how many).
- **Players** see a folder only when it holds a document shared with them, with the count of those only. An
  empty or secret folder never shows.
- **Top bar** (DM): Stage, Stages, Characters, Locations, Items, Documents, **Saga**. Players: Stage,
  Characters, Locations, Items, Documents. Sections inside a page are tabs under its title (like Locations:
  Places | Fog presets): Characters | Groups; Saga: Members | Template | Display templates.
- Old addresses (`/groups`, `/members`, `/template`, `/characters/templates…`) redirect to the new ones.

## Design

- Table `resource_folders` (`saga_id`, `kind`, `name`, `created_at`); `resources.folder_id` (nullable,
  `ON DELETE SET NULL`). Names are unique per Saga and kind (case ignored), 80 characters, at most 200 folders.
- `services/folders.py`: list (per viewer: the DM all, others only folders holding a resource they can see,
  with their own counts), create, rename, delete (documents stay), `file_resources` (the command behind dragging),
  `folder_for` (checks a folder belongs to the Saga and kind).
- API: `GET/POST /sagas/{id}/folders`, `PATCH/DELETE /sagas/{id}/folders/{folder_id}`,
  `POST /sagas/{id}/folders/file` `{folder_id, resource_ids}`. Resources take `folder_id` on create and update
  (`0` takes it out of its folder); `serialize` returns `folder_id`.
- Frontend: `saga/lore/Folders.tsx` (sidebar, drop targets, helpers `groupByFolder`, `inFolder`,
  `parseFolderPick`), `ResourceList` (documents: sidebar + grouped grid, draggable cards), `DocumentPage` (folder
  picker, back link to the folder). `saga/SectionTabs.tsx` (`CharacterSections`, `SagaSections`) as links; routes
  `characters/groups`, `saga/members`, `saga/template`, `saga/displays[/:id]`.

## Steps

- [x] Backend: model, migration `c7e2a9b4d351`, folder service and routes, `folder_id` on resources.
- [x] Frontend: folder sidebar with drag and drop, grouped list, folder picker on the document page.
- [x] Frontend: section tabs, Groups under Characters, the Saga page, redirects, links and wording updated.
- [x] Docs: requirements, concepts, glossary, decisions, roadmap.

## Tests

- API (`tests/test_saga_templates.py::test_document_folders`): name order with numbers, duplicate and empty names
  refused, players can't make folders or file documents, filing, a hidden document's folder hidden from players
  (counts per viewer), items refused, moving out with `0`, rename conflicts, deleting a folder keeps its
  documents, another Saga's folder refused.
- Frontend (`saga/lore/lore.test.tsx`): the address's folder pick, grouping (unknown folders with the unfiled),
  picking a folder and dropping cards on a folder and on *Not in a folder*.
- Checked in headless Chrome: Documents as DM and player, dragging a card onto a folder, the document page's
  folder picker, Characters | Groups, the Saga page's three sections, the old `/template` address.
