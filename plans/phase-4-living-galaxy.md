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

## B. Run the brain 24/7 with true autonomy — ✅ SHIPPED (🔴 Phase C) — user chose full 24/7
- Extracted the job brain into `maintenance/agent.ts` (`selectJob` + `executeJob`), the
  single source of truth now used by BOTH the browser route
  (`api/routes/maintenance.ts`, now thin) and a new **server-side loop in `index.ts`**.
- The loop (opt-in `AUTONOMY=on`, default every 5 min, set in `fly.toml [env]`)
  iterates every brain, picks one meaningful job and runs it. Re-entrancy guard stops
  overlapping ticks; the no-op "patrol" is skipped to avoid log spam.
- **Gating is unchanged + fully server-side:** LLM work needs Research Mode + USD
  budget; expansion (research/sector_vibe) also needs Fuel; free upkeep always runs. So
  with Research Mode off it just keeps every brain tidy for free, and it can never
  exceed the budget. Telegram digest already surfaces what she did.
- `fly.toml`: `auto_stop_machines='off'` so the machine never sleeps (accepted cost).
- Follow-ups: per-target `claimed_at` lock so an open browser tab + the server can't
  double-run the same job (currently low-risk: jobs are idempotent-ish + tend-guarded);
  smarter per-space cadence as brain count grows.

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

## E. The fleet & sub-agents — ✅ SHIPPED v1 (🟢)
- **Beacon color follows emotion** — ✅ (`satellites.ts colorFor`).
- **Guard the heaviest hub when nothing's cold** — ✅ (`reassign` sentinel; calm ray vs
  urgent rescue beam).
- **Sub-agents that report to Soumaya** — ✅ `graph/subAgents.ts`: **Scout** (teal) flies
  the frontier surveying the newest/least-connected memories; **Defender** (amber-red)
  guards the heaviest hub and has intercept logic for hostile drifters. Procedural,
  self-animated from the Graph3D tick, each exposes a live status.
- **A "Fleet" menu** — ✅ new **🚀 Fleet** Dock tab (`components/FleetPanel.tsx` +
  `graph/fleet.ts` roster): every unit (ship, station, beacons, scout, defender) with its
  role, lore, and a **live status** polled from the scene (`Graph3D.getFleetStatus`).
- **Remaining (follow-ups):**
  - Literal **dispatch animation** — the ship flies out and *releases* a beacon when a
    memory goes cold (currently beacons auto-appear). Needs a dispatch state machine
    across `soumaya.ts` + `satellites.ts`.
  - **Defender live intercept:** wire real drifter positions (`visitors.ts` getter) into
    `subAgents.update` so the Defender actually chases aliens (logic is ready, data isn't
    plumbed yet).
  - **Sub-agents doing real maintenance jobs** (Scout feeding Research Mode targets) via
    the `agent` column / Multi-Agent Registry.
  - **Starter system** for brand-new brains; beacon-type taxonomy.

## F. Lower cards hidden behind side buttons — ✅ FIXED (🟢)
- The object-lore card (shown while following ship/station/beacon) sat under the right
  FAB rail (z-index). Re-anchored it (`left:12px; right:78px`) so it always clears the
  focus/music/beacon buttons. (Watch for the same with any future bottom cards.)

## G. Lore as a persistent, evolving, world-aware game mechanic — ✅ SHIPPED v1 (🔴 schema)
The heart of the request. v1 is a complete, offline-first vertical slice:
- **Persisted + versioned.** New `lore` table (`id, space_id, subject_type, subject_id,
  version, text, trigger, created_at`) + idempotent migration/bootstrap. Append-only:
  v1 = genesis (immutable), each later chapter extends it. `lore/engine.ts` (`LoreRepo`,
  `evolveLore`, `getOrCreateLore`), space-scoped.
- **World-aware + mutating.** The chronicler composes each chapter from the memory's
  LIVE state — emotion, entropy (warm/cooling/cold), degree, and named neighbors — plus
  the trigger (genesis/linked/merged/cooled/warmed/manual), so the story shifts as the
  galaxy changes. Deterministic per (subject, version) so history is stable.
- **Autonomous growth.** The 24/7 loop appends a free chapter to whatever memory Soumaya
  just worked (synthesis→linked, merge→merged, else evolved) — lore builds on its own.
- **History UI.** A "Chronicle" block in the Node Inspector: latest chapter + expandable
  earlier chapters + a "✦ Evolve" button. Genesis is created on first view.
- **API.** `GET /api/lore/:type/:id` (history, genesis-on-read), `POST .../evolve`.
- Tests: `lore.test.ts` (versioning, immutable genesis, determinism, world-aware,
  agent lore, per-space scoping).
- **Follow-up (next layer):** LLM-authored prose via an optional `chronicle?` on the
  LlmProvider seam (heuristic stays the offline base); richer agent/object cross-awareness.

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
