# Spec — Smart Lenses (self-updating constellation views)

> **STATUS: SHIPPED (2026-07-10).** Built per this spec with my recommended defaults
> (dedicated Lenses panel + pinned chips; "save as lens" captures the focused node as a
> `linkedTo` lens). Server: `lenses` table + `LensesRepo` + `evalLens` + CRUD routes
> (7 tests). Web: `LensesPanel` + `Graph3D.isolateSet` + live-count refresh + nav ⧉ entry
> + active-lens banner (2 tests). Gate green. LLM-proposed lenses remain the fast-follow.
> Frontier feature chosen post-runway. Imports the briefing's "self-updating view" pattern
> natively into the galaxy. Offline-safe, space-scoped, additive-migration.

## The idea

A **Lens** is a *saved query* over your memories that renders as a **live constellation**:
open it and the galaxy isolates to just the stars that match, and it **stays current** —
new memories that match appear in it automatically, ones that stop matching drop out. It's
the difference between manually hunting and having a standing view: *"my heavy projects,"*
*"everything about Mara,"* *"what's fading and due for review,"* *"this month's sparks."*

It reuses machinery we already have: the **isolate-system** render path (dim everything
but the matching set), the existing **filters** language, and the `selectedId` highlight.
Nothing here needs an LLM — evaluation is deterministic SQL. Soumaya *can* propose a lens
later (like she proposes hubs), but that's a follow-on, not the MVP.

## Why this one (alignment)

- The briefing repeatedly names "self-updating view" as the single most useful Obsidian
  pattern to import (Dataview). We have the visual; this makes it *queryable*.
- It's **retrieval-first** (NEURO north star): a lens is a reusable retrieval path, and the
  act of framing one ("what do I want to see?") is itself active recall.
- Pure reuse + pure SQL → high ROI, low RED surface. No new physics, no new LLM cost.

## Data model (additive)

New table `lenses` (space-scoped, same pattern as every per-user table):

| col | type | note |
|-----|------|------|
| id | INTEGER PK | |
| space_id | TEXT NOT NULL | scoped like all per-user tables; add to `TABLES_WITH_SPACE` |
| name | TEXT NOT NULL | user-facing label ("Heavy projects") |
| query | TEXT NOT NULL | JSON of the predicate set (below) |
| pinned | INTEGER DEFAULT 0 | pinned lenses show as quick chips |
| created_at | TEXT DEFAULT (datetime('now')) | |

Migration = one additive `migrateSchema` step (idempotent) + `space_meta`-style claim on
first-account. No change to `nodes`/`edges`.

## The query DSL (flat, deterministic, offline)

A lens query is a small AND-set of predicates — deliberately flat (like our zod schemas):

```jsonc
{
  "kinds":     ["memory","project"],   // node kind/type filter (optional)
  "tags":      ["work"],               // any-of tag match (optional)
  "emotion":   "heavy",                // positive | heavy | neutral (optional)
  "minImportance": 0.5,                 // 0..1 (optional)
  "withinDays":   30,                   // created/occurred within N days (optional)
  "linkedTo":     123,                  // memories linked to this node id (optional)
  "state":     "due" | "orphan" | "archived" | "active",  // lifecycle lens (optional)
  "text":      "roasters"              // FTS keyword (optional; reuses fts.ts)
}
```

Evaluation = one parametrised SQL SELECT over `nodes` (JOIN `edges` for `linkedTo`, the
FTS table for `text`, the review columns for `state:"due"`, the orphan `NOT EXISTS` for
`state:"orphan"`, `status` for archived/active). Every clause is optional; an empty query
matches all active memories. Returns node ids. **Always `space_id`-scoped.**

## API (thin routes → a `LensesRepo` + evaluator; the established pattern)

- `GET  /api/lenses` → the space's lenses (with a live `count` per lens).
- `POST /api/lenses` `{ name, query, pinned? }` → create (zod-validated; `query` validated
  against the DSL schema; unknown keys rejected).
- `PATCH /api/lenses/:id` `{ name?, query?, pinned? }` → edit.
- `DELETE /api/lenses/:id`.
- `GET  /api/lenses/:id/nodes` → evaluate → `{ ids: number[] }` (what the galaxy isolates).

## Client

- **A Lenses surface** (a 🔭/⧉ entry in the panel dock, or a NavRail FAB): lists saved
  lenses as chips with live counts; tap → the galaxy isolates to the matches (reuse the
  existing isolate path + a subtle "Lens: <name>" banner with an ✕ to exit, mirroring the
  "Exit system view" control).
- **A tiny builder**: dropdowns/toggles for the DSL predicates (no free-form query
  language for the MVP) + name + pin. "Save as lens" also offered from the current
  filter/selection so a view you've made by hand becomes reusable in one tap.
- **Self-updating**: re-evaluate on the `brain-memory-added` event (same hook the galaxy +
  NoticingCard already listen to) and on an interval while a lens is active, so the
  constellation stays live.
- Reduced-motion + colorblind honored automatically (isolate path already respects them).

## Non-goals (MVP)

- No free-text/Dataview-style query language (dropdowns only).
- No LLM-proposed lenses yet (fast follow: Soumaya suggests a lens at a "squeeze point,"
  same shape as hub suggestions).
- No cross-space / shared lenses.

## Verification

- Server: `LensesRepo` + evaluator unit tests — each predicate filters correctly, combined
  predicates AND, `space_id` isolation holds (a lens in brain A never returns brain B's
  nodes), empty query = all active, `state:"archived"` only returns archived.
- Web: a smoke test that the builder posts a valid DSL and the lens chip renders its count.
- Gate green; offline path proven (no LLM anywhere in the feature); additive migration
  covered by `migration.test.ts`.

## Open question for the user

1. Entry point: a **dedicated Lenses panel** (cleaner, discoverable) vs. **NavRail chips**
   for pinned lenses (faster, but crowds the rail)? *(Recommend: a panel, with pinned
   lenses also surfaced as chips.)*
2. Should "Save as lens" capture the **current isolate/selection** as a `linkedTo` lens, or
   only the explicit builder? *(Recommend: both — the one-tap capture is the magic.)*
