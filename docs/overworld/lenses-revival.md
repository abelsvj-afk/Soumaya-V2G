# Reviving Lenses (Stage 2.32, task #72)

> Per Rule #1. A real orphaned feature, confirmed by direct investigation before writing
> anything: the server route (`/api/lenses`, `packages/server/src/api/routes/lenses.ts`) and its
> repo (`lenses.repo.ts`) are fully alive and unchanged — a Lens is a saved, deterministic (no-
> LLM) filter over the `nodes` table (kinds/tags/emotion/minImportance/withinDays/linkedTo/state/
> text). The entire CLIENT side (`api/lenses.ts`, `LensChips.tsx`, `LensesPanel.tsx`) was deleted
> outright in the galaxy-deletion commit, leaving a real, live server feature with zero way to
> reach it from the Overworld.

## What already exists that this must reuse, not reinvent

- **The server contract, unchanged.** `GET/POST /api/lenses`, `PATCH/DELETE /api/lenses/:id`,
  `GET /api/lenses/:id/nodes`. `LensQuery`/`Lens` types already exported from `@brain/shared`.
- **The deleted client's own real shape** (recovered via `git show` on the pre-deletion commit):
  `api/lenses.ts` exported exactly `getLenses()`, `createLens(name, query, pinned?)`,
  `updateLens(id, patch)`, `deleteLens(id)`, `lensNodes(id)` — thin `afetch`-wrapped calls with
  safe fallbacks (`[]`/`null`/`false`) on error. Recreated verbatim, same signatures, same
  fallback shape — not redesigned.
- **`api/client.ts`'s own re-export convention** (`export * from "./features.js"` etc.) — the
  revived file is wired in the same way, not a special case.
- **`LibraryOverlay.tsx`** — the real in-world home. A Lens is literally "a saved way to browse
  the shelves" (the exact same `graph.nodes` Library already reads and folders), so this is the
  natural, non-invented place for it — not a new building.

## Resolved decisions

**1. A real, minimal vertical slice: text-only lenses this round.** The server query shape
supports 8 real filter fields; the Library's existing search box already exposes exactly one of
them (`text`). Rather than build a 7-field lens editor from nothing, this round saves what you
just searched — the query you already typed becomes the lens's `query.text`. Every other field
(`kinds`/`tags`/`emotion`/`minImportance`/`withinDays`/`linkedTo`/`state`) is real, already
supported server-side, and explicitly deferred to a later round rather than half-built.

**2. Viewing a saved lens re-uses the exact same results list the live search already renders.**
`lensNodes(id)` returns real matching node ids; the Library filters its own already-loaded
`graph.nodes` down to those ids and shows them the same way a live search's hits already
display — no second rendering path invented.

**3. Pinned is a real, honest toggle, not a new invented tier.** Matches the server's own
`pinned: boolean` field exactly — a saved lens can be pinned or not, nothing else implied.

## Data model / wiring

`api/lenses.ts` (recreated, verbatim signatures from git history):
```ts
export async function getLenses(): Promise<Lens[]>;
export async function createLens(name: string, query: LensQuery, pinned = false): Promise<Lens | null>;
export async function updateLens(id: number, patch: Partial<{ name; query; pinned }>): Promise<Lens | null>;
export async function deleteLens(id: number): Promise<boolean>;
export async function lensNodes(id: number): Promise<number[]>;
```
`client.ts` gains `export * from "./lenses.js"`.

`LibraryOverlay.tsx` gains a "Saved Lenses" section: each lens's name + real count + pinned
star, a "View" button (filters the shelf to that lens's real matching nodes) and "Delete"; a
"Save this search as a Lens" button appears once you've typed and run a query, using the typed
text as both the lens's name (editable) and its `query.text`.

## Deferred, explicitly

The 7 non-text query fields (kinds/tags/emotion/minImportance/withinDays/linkedTo/state) and any
UI to build a lens from them; `LensChips.tsx`'s old "pinned lenses as a quick-access strip"
UX (folded into the single Library section instead — a second dedicated UI surface for pinned-
only lenses is a real widening, not this round's job); the `stat.lenses_made` achievement counter
bump the old panel did (Gym/achievements.ts territory, not touched here to avoid inventing a new
achievement trigger point without checking its own real gating first).
