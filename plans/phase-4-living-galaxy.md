# Phase 4 — Living Galaxy: download, 24/7 autonomy, evolving lore, the fleet

Captured from the user's 2026-06-18 brain-dump. **Nothing here is dropped** — each item
is logged with its zone (🟢 green / 🔴 red) and status. Claude keeps statuses current.
Legend: ✅ shipped · 🚧 in progress · 📋 spec'd/staged (needs build) · ❓ needs a decision.

---

## A. Installable to the phone (PWA "download") — ✅ SHIPPED (🟢)
- `manifest.webmanifest`, a conservative service worker (`public/sw.js` — never caches
  `/api`, network-first navigations, cache-first assets), generated PNG icons
  (`scripts/gen-icons.mjs` → 192/512/apple-touch), `index.html` head tags, SW registered
  in `main.tsx` (prod only).
- Result: Add-to-Home-Screen on Android + iOS; launches standalone; galaxy shell works
  offline (live brain data still needs a connection).
- Follow-ups: an in-app "Install" button using the `beforeinstallprompt` event; richer
  offline (queue ingests made offline and sync later).

## B. Run the brain 24/7 with true autonomy — 📋 SPEC (🔴 Phase C)
Today the *thinking* agent is browser-driven (`web/src/graph/soumaya.ts` polls
`/maintenance/next-job`); it stops when the tab closes. The server heartbeat only does
free upkeep (prune/expire).
- **Plan:** a server-side loop (in `index.ts`, like the heartbeat) that calls the
  existing `next-job`/`complete-job` logic on a timer, **gated by Research Mode + USD
  budget + Fuel** (move those checks fully server-side; they already live there).
- **Job claiming/idempotency:** a `claimed_at`/lock on the chosen target so the server
  loop and an open browser tab can't double-execute the same job.
- **❓ Hosting decision:** Fly machines auto-stop when idle. True 24/7 needs
  `auto_stop_machines=false` / `min_machines_running=1` in `fly.toml` — which costs more
  (a machine always on). Confirm before enabling.
- **❓ Cost guard:** autonomous LLM work spends real money. Default OFF behind an env
  flag (`AUTONOMY=on`) + Fuel + budget; ship dark, you flip it on.
- Visual honesty: the browser still animates the ship for jobs while open; when closed,
  work happens server-side and shows next time you open (and via Telegram digest).

## C. Music static / crackle on phones — ✅ FIXED (🟢)
- Root causes addressed: `AudioContext({ latencyHint: "playback" })` (bigger buffer →
  far fewer underruns, the main "radio static"), a brick-wall **limiter** so swells
  can't clip into crackle, a **tamed/low-passed feedback** loop (can't resonate into a
  howl), and fewer simultaneous oscillators.
- If a specific phone still crackles, next levers: drop the feedback delay entirely on
  low-power devices, or precompute the pad into a short `AudioBuffer` and loop-crossfade.

## D. Demo mode = a MATURE galaxy + the Obsidian zoom-out phase — ✅ SHIPPED (🟢)
- `demoGalaxy.ts` now generates ~140 nodes: 10 dense themed life-systems with
  intra-theme density links, cross-system constellation links, a faint outer field of
  64 long-tail "fragments" (mostly gone cold), and varied mass/emotion/entropy/age. The
  cold periphery makes the Aura beacons appear and gives the existing LOD/macro swap
  (`MACRO_DIST` in `Graph3D.tsx`) a real Obsidian-style field of lights on zoom-out.
- Follow-up: a guided "zoom-out tour" and even larger optional density if wanted.

## E. The fleet & sub-agents — partly ✅, mostly 📋 (🟢/🔴)
- **Beacon color follows emotion** — ✅ (`satellites.ts colorFor`: gold=positive,
  blue=heavy, amber=neutral; uses the node's LLM color when present).
- **Guard the heaviest hub when nothing's cold** — ✅ (`reassign` falls back to a
  sentinel over the top `hubWeight` node; calm steady ray vs urgent rescue beam).
- **Fleet size ~3, but Soumaya DEPLOYS them when she sees fit (autonomous, not random)**
  — 📋. Plan: the ship physically dispatches a beacon (flies out, releases it) when a
  memory crosses cold, instead of beacons just appearing. Needs a small dispatch state
  machine in `soumaya.ts` + `satellites.ts`.
- **A "Fleet" menu** listing each satellite/agent and what it does — 📋 (new Dock tab or
  Command-Center section).
- **Sub-agents that report to Soumaya** (small ships/satellites = Scout/Librarian/Defender)
  that she dispatches for research / defense / other tasks, feeding her Research Mode —
  📋 🔴. The roadmap already notes a `Multi-Agent Registry` using the `agent` column.
  This is a big system; spec separately before building.
- **Starter system for new users** (a seeded beginning so it's never empty) — 📋, ties
  to D (demo) and the roadmap "Genesis Log".
- **❓ Beacon types:** different beacon classes with different jobs/colors (warmth relay
  vs guard vs scout). Confirm the taxonomy when we build the Fleet menu.

## F. Lower cards hidden behind side buttons — ✅ FIXED (🟢)
- The object-lore card (shown while following ship/station/beacon) sat under the right
  FAB rail (z-index). Re-anchored it (`left:12px; right:78px`) so it always clears the
  focus/music/beacon buttons. (Watch for the same with any future bottom cards.)

## G. Lore as a persistent, evolving, world-aware game mechanic — 📋 SPEC (🔴, big)
This is the heart of what the user wants and the largest item.
- **Persist lore per object.** Today lore is generated on the fly (`graph/lore.ts`,
  `objectLore.ts`) and not saved. Plan: a `lore` table (`id, space_id, subject_type,
  subject_id, text, version, created_at, parent_version`) so each memory/ship/station/
  beacon has a saved, versioned lore entry. 🔴 schema → stage migration.
- **Stable origin + build-on-top.** Each lore has a v1 "genesis" that never changes;
  new versions extend/mutate it (append-only history), so you can scroll its evolution.
- **World-aware.** Lore generation gets context about *neighbors* (linked memories),
  nearby objects (which beacon/ship/station relates), and that it lives in space — so
  stories reference each other and stay consistent.
- **Mutates as memories change.** When memories are added/linked/merged or go cold/warm,
  affected lore gets a new version (for good or worse — stories shift). Gated by Fuel +
  budget (LLM), with an offline heuristic fallback.
- **History UI.** A lore timeline on each object (Node Inspector / lore card) to read how
  it changed over time — ties directly to the memory dates/timestamps (already added).
- ❓ Decisions: how aggressively lore re-writes (every change vs batched), and the
  Fuel/budget cost ceiling for lore generation.

## H. Action items need a dedicated list — ✅ SHIPPED (🟢)
- New **✅ Agenda** Dock tab (`components/ActionsPanel.tsx`): action items
  (`kind:"action"`) sorted by urgency with due countdowns + a ✓ Done button (clears the
  item, earns fuel via the existing `deleteNode` path), plus an **Upcoming reminders**
  section listing memories whose `remind_at` is in the future. Read-only in demo mode.

## I. Help = real understanding, not just how-tos — ✅ (ongoing) (🟢)
- Added a "How the world works (the rules)" section to the Help panel: graph/gravity,
  auto-linking, autonomy, entropy, the beacon fleet (guard + emotional color), time
  (dates/reminders/tags), privacy, Telegram, install. Keep expanding as mechanics land.

---

## Carried over from SOUMAYA_ROADMAP.md (still open)
- Daily-Log onboarding / Genesis Log for empty new brains (ties to D + E starter).
- "Writing…" latency state on nodes during LLM jobs (anti pop-in).
- Multi-stop flight already done; Request-Maintenance high-priority queue still open.
- Surface due `remind_at` reminders in the daily digest / Telegram (from temporal work).
