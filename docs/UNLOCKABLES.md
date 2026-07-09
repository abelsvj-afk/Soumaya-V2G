# Unlockables — design (NOT yet enforced)

> **Current state (intentional):** nothing is locked. Every song, ship, trail, figurine,
> and scenery asset is available to everyone. This doc captures how unlocking **should**
> work when the app goes live, so the vision isn't lost. Enforcement is deferred until
> we're near launch; until then the pilot (and their partner) have everything.

## Principle

Content is **earned, not bought.** Unlocks reward *using your brain* — logging memories,
keeping streaks, forging real connections, climbing pilot ranks, discovering the Codex —
so progression is intrinsic to the product, never a paywall. A new user starts sparse and
the galaxy visibly grows richer (more music, better ship, cinematic scenery) as they do.

## What's unlockable

| Category | Items (assets that exist today) | Notes |
|---|---|---|
| **Music** | The 3 loops (Deep Space · Slow Tide · Interstellar) + future tracks | Start with **1**; unlock the rest over time. `graph/audio.ts` playlist. |
| **Ships** | `soumaya-ship.glb`, `organic-spaceship.glb`, procedural variants | Hangar already exists (`equippedShip`). |
| **Trails** | Blue / Void Purple / Hyperdrive Neon / Solar Gold … | Several already tied to achievements (see `components/achievements.ts` — e.g. "Unlocks Aegis Shield Spire", "Void Purple Trail"). |
| **Figurines** | `equippedFig1/2` cockpit companions | Hangar slots exist. |
| **Scenery** | `blackhole.glb`, `dyson-sphere.glb`, `nebula-skybox.glb`, procedural nebulae/galaxies/comets | **`blackhole.glb` + `dyson-sphere.glb` are NOT wired into the scene yet** — wiring them as distant background scenery is a visual pass (place + scale on a desktop browser). Gate behind a rare, high-tier unlock once wired. |

## Unlock conditions (draw from signals we already compute)

- **Memory count** → pilot rank ladder (`components/rank.ts`). Each rank can unlock a track / trail / ship.
- **Streak** (`getStreak`) → milestone unlocks (7-day, 30-day).
- **Achievements** (`components/achievements.ts`) → already the natural unlock trigger; extend it to grant music/scenery, not just trails.
- **Codex completion** (`components/codex.ts`) → the rarest scenery (black hole / Dyson sphere) as a capstone reward.
- **Fuel / research milestones** → optional cosmetic unlocks.

## Data model (when we enforce)

- Compute unlocked state **client-side** from the stats above (like achievements already do) — no server round-trip needed for a cosmetic gate. Persist "seen/claimed" per brain in `localStorage` (mirror `achvKey`).
- OR, if we want it authoritative/cross-device: a space-scoped `unlocks` table (`space_id`, `item_id`, `unlocked_at`) written when a condition is first met. Additive migration, same pattern as `candidate_links`.
- A **catalog** in `packages/shared` (single source of truth): `{ id, category, label, assetPath, condition }`, so server + web + the Hangar/Music UIs all agree.

## Dev / owner override (so testing is never blocked)

- A **`dev: unlock everything`** flag (per-account, e.g. gated to the owner's space or a `localStorage` `brain.devUnlockAll`). While on, `isUnlocked()` always returns true.
- This is how the owner + partner keep full access during development while the *logic* for real gating already exists behind the flag.

## Rollout order (later)

1. Build the shared **catalog** + `isUnlocked(item, stats)` helper + the dev-unlock-all flag (logic only, gate OFF).
2. Wire the **Music** picker + **Hangar** to read `isUnlocked` (start-with-1-song), with the owner override on.
3. Wire **black hole / Dyson** GLBs as scenery (visual pass), gate as capstone unlocks.
4. Add "🔓 Unlocked!" moments (reuse the rank-up celebration surface) when a new item is earned.
