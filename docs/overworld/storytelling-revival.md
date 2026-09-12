# Reviving the dormant memory-storytelling systems (Stage 2.33, task #71)

> Per Rule #1. Investigated first, not guessed: this is genuinely **3 distinct systems**
> (confirmed by reading the real routes/tables/types), not 2 — a real naming collision in the
> codebase calls both Lore and Timeline "the Chronicle" in different comments, but they have
> separate DB tables, routes, and shared types.

## What already exists that this must reuse, not reinvent

- **Lore** — `GET/POST /api/lore/:subjectType/:subjectId(/evolve)`, backed by `lore.repo.ts`'s
  version-append-only `lore` table. Client wrappers `getLore()`/`evolveLore()` already exist,
  fully working, in `api/client.ts` — never called from the Overworld. Per-memory, not town-wide.
- **Timeline** — `GET/POST /api/timeline`, `DELETE /api/timeline/:id`, backed by
  `analysis/timeline.ts`'s auto-backfill/auto-generate logic over the `timeline_chapters` table.
  Client wrappers `getTimeline()`/`addTimelineChapter()`/`deleteTimelineChapter()` already exist
  in `api/features.ts` — never called.
- **Codex** — `GET /api/codex/discoveries` (Soumaya's autonomous field notes) +
  `POST /api/maintenance/codex-claim` (one-time fuel reward, idempotent server-side). Client
  `getCodexDiscoveries()`/`claimCodexReward()` already exist — never called. The COMPUTATION
  layer (`components/codex.ts`'s `buildCodex`/`codexProgress`) is NOT orphaned — it already
  feeds a real "Codex completionist" meta-achievement in the Gym today. Only the browsable panel
  and the two discovery/claim calls are missing.
- **The deleted old UI's real shape** (recovered via `git show` on the pre-deletion commit):
  `Chronicle.tsx` (the Lore viewer — latest chapter, expandable history, "✦ Evolve" button),
  `TimelineView.tsx` (a scrollable chapter list with real gap-compression layout math),
  `CodexPanel.tsx` (tabbed catalog + claim). Reused for CONTENT/behavior, not literally ported —
  the Overworld's own overlay conventions (`OverlayShell`, existing per-building overlays) are
  followed instead of the old dedicated panels.

## Resolved decisions

**1. Each system gets the real in-world home its data already implies — no new building.**
- **Lore** → `CreatureSummaryOverlay.tsx` (per-memory detail screen). A memory's own evolving
  story belongs right where you already read everything else about that memory.
- **Timeline** → `TownHallOverlay.tsx` (Journeys). A life chapter is the same concept Journeys
  already represent at Town Hall — Vision 2.0's own "everything belongs to a meaningful life
  chapter" framing, not a new place.
- **Codex** → `GymOverlay.tsx` (Progress/achievements). Already the real home of the one Codex
  meta-achievement that exists today — a browsable Codex panel joins its own achievement family
  rather than living somewhere unrelated.

**2. Deleting a Timeline chapter is only offered for chapters YOU wrote (`origin === "user"`).**
Soumaya's own auto-generated chapters (`origin === "auto"`) are her real, computed narrative of
change — not something a stray click should erase. The server itself doesn't forbid deleting an
auto chapter, but the UI doesn't offer the button for one, matching the same "never dark-pattern,
never take something away that wasn't yours to remove" instinct used elsewhere this session.

**3. Codex claiming has no pre-existing "already claimed" signal to check against, so it isn't
invented.** `AgentDiscovery` carries no `claimed` field and no list-of-claims endpoint exists
client-side. `claimCodexReward` is already idempotent server-side (confirmed from its own doc
comment) — clicking Claim shows the real result (`awarded: true/false` + fuel amount) and
disables only that button for the rest of the session, rather than guessing persisted claim
state that isn't actually exposed.

## Data model / wiring

No new data modules — every function used already exists and is correctly typed. Three overlay
files gain a new section each:
- `CreatureSummaryOverlay.tsx`: fetch `getLore("memory", String(creature.nodeId))` on open; show
  the latest real chapter + a real "✦ Evolve" button.
- `TownHallOverlay.tsx`: fetch `getTimeline()` on open; list real chapters (title, trend badge,
  summary, period), a "+ Mark this chapter now" button (`addTimelineChapter()`), Delete only for
  `origin === "user"` chapters.
- `GymOverlay.tsx`: fetch `getCodexDiscoveries()` on open; list real discoveries (icon, title,
  lore text) with a per-entry Claim button.

## Deferred, explicitly

`TimelineView.tsx`'s real gap-compression scroll layout math (`gapFor`/`buildRows`/
`daysBetween`) — worth reusing verbatim in a future round if the chapter list ever needs to
render as a visual scrolling river again, but a plain list is the honest minimal slice here.
Any Codex "browse by category" tabbing (sectors/bodies/constellations/etc. from
`components/codex.ts`) — this round surfaces the real discoveries feed only, not the full static
catalog browse, which is a real widening, not this round's job.
