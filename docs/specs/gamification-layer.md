# Spec — Gamification & Space-Sim Layer (retroactive)

> **The missing design record.** This whole layer shipped without a spec; this
> documents it against the actual code so it can be reasoned about and grown under
> the [`AI_ENGINEERING_WORKFLOW.md`](../AI_ENGINEERING_WORKFLOW.md) lifecycle.
> Companion specs: the black-hole asset pipeline lives in
> [`blackhole-singularity.md`](./blackhole-singularity.md); flight FX in
> [`soumaya-flight-fx.md`](./soumaya-flight-fx.md). North star:
> [`SECOND_BRAIN_ALIGNMENT.md`](../SECOND_BRAIN_ALIGNMENT.md) — see the Alignment
> note at the end.

## 1. Scope & rationale

The galaxy isn't only a data viz — it's a light space-sim wrapped around the
knowledge graph. The intent: turn the **maintenance habits the second-brain
actually needs** (capture daily, connect ideas, revisit/warm neglected memories)
into legible game mechanics, so the boring-but-valuable upkeep feels rewarding.
Every reward ladder is pinned to a graph signal that maps to a real curation
behavior — capture, linking, breadth, anti-decay — not to vanity metrics.

The layer is deliberately split:
- **Server-authoritative economy & streak** (`economy.ts`, `streak.ts`) — fuel and
  streak live in `space_meta`, consistent across devices, offline-safe (no LLM).
- **Client-side progression & cosmetics** (`components/{achievements,quests,rank}.ts`,
  `HangarPanel`, `graph/*`) — ranks, badges, quests, ship skins, figurines, the
  fleet. Pure presentation derived from the graph + a little `localStorage` stat
  bag.

## 2. Fuel economy — the "Celestial Economy" (`packages/server/src/economy.ts`)

Free in-app energy that powers Soumaya's autonomous LLM work, **on top of** the
hard USD budget. Per-brain (space-scoped), regenerated lazily on read.

| Constant | Value | Meaning |
|---|---|---|
| `FUEL_START` | 25 | starting balance |
| `FUEL_CAP` | 120 | soft ceiling |
| `FUEL_JOB_COST` | 2 | per autonomous LLM job |
| `EARN_MEMORY` | 3 | logging a real memory |
| `EARN_LINK` | 0.5 | each associative link formed |
| `EARN_ACTION_DONE` | 1.5 | clearing an action item |
| `FUEL_REGEN_PER_HOUR` | 2 | passive trickle (~2.5 days empty→full) |
| `STREAK_DAY_BONUS` | 2 | first tending of a new day (`streak.ts`) |

**Role in gating:** fuel throttles only the *discretionary expansion* jobs
(`FUEL_JOBS` = research, sector_vibe). Free upkeep (pruning, calibration,
harmonization, patrol, daily_log) runs at zero fuel. So fuel is a soft pacing knob;
the USD budget + Research Mode are the hard gates (see §6 and `architecture.md`).

## 3. Streak (`packages/server/src/streak.ts`)

Daily-tending streak in `space_meta` (`streak`, `streak_best`, `last_active_date`),
UTC-day granularity. `touch()` advances the count when a new day is tended
(continuing if yesterday was active, else restarting at 1); same-day repeats no-op.
A streak is "alive" only if tended **today or yesterday**, else it reads 0.
`advanced: true` is returned exactly once per day so the caller credits
`STREAK_DAY_BONUS` once. Surfaced as the header 🔥 flame and the Awards streak banner.

## 4. Rank (`packages/web/src/components/rank.ts`)

8 memory-count pilot tiers (drive the Awards rank banner + a level-up toast; the same
count also speeds Soumaya's flight, `pilotSpeed`):

| Lv | Title | At ≥ |
|---|---|---|
| 1 | Cadet | 0 | 
| 2 | Ensign | 10 |
| 3 | Pilot | 25 |
| 4 | Navigator | 50 |
| 5 | Captain | 100 |
| 6 | Commander | 250 |
| 7 | Starfarer | 500 |
| 8 | Voyager of the Deep | 1000 |

## 5. Achievements (`packages/web/src/components/achievements.ts`)

Badges evaluated client-side against the live graph + a small `localStorage` stat
bag (`beacons_deployed`, `travel_hops`, `memories_tended`). Each carries a progress
hint; many **unlock a Hangar cosmetic** (the throughline that ties badges to §7).

**Core mechanics**
- `first_light` 🌱 — first memory (`memories ≥ 1`)
- `synapse` 🔗 — first link (`links ≥ 1`)
- `connector` 🕸️ — `links ≥ 25`
- `nexus` 🧠 — a memory reaches `degree ≥ 8`
- `star_born` ⭐ — a memory reaches `celestial ∈ {star, supergiant}`
- `gardener` 🌿 — `memories ≥ 10` and none cold (`entropy < 0.45`)
- `full_tank` ⛽ — `fuel ≥ capacity`

**Milestone unlocks (memory count)**
- `star_center_figurine` 🌟 — 100 → Solar Monument figurine **+ Organic ship skin**
- `organic_ship_skin` 🛸 — 150
- `fleet_commander` 🚀 — 200
- `dyson_sphere_figurine` 🪐 — 250 → Dyson Megastructure
- `singularity` 🕳️ — **365** ("A Year of Memories") → **The Singularity** black-hole figurine

**Behavioral unlocks (→ cosmetic)**
- `pathfinder_quest` 🧭 — a connected chain of 5+ memories (DFS) → Aegis Shield Spire
- `consistent_pilot` 📅 — memories on 3+ distinct days → Hyperdrive Neon trail
- `sector_pioneer` 🌌 — 4+ distinct node types → Solar Gold trail
- `sentinel_command` 📡 — 5+ beacons deployed → Holographic Sentinel hull
- `deep_cluster` 🧲 — 6+ memories in one type → Quantum Singularity Core
- `cosmic_voyager` 💫 — Soumaya completes 15+ travel hops → Fusion Core Destroyer hull
- `galactic_megastructure` 🏟️ — `links ≥ 50` → Synapse Hyper-Array
- `grand_restorer` 🌟 — tend high-entropy memories 10+ times → Void Purple trail

Memory milestone markers surfaced in Awards: 10, 25, 50, 100, 150, 200, 250, 365,
500, 1000.

## 6. Quests (`packages/web/src/components/quests.ts`)

Up to 3 **daily tending nudges** in the Observatory, each a direct curation prompt:
- `log` ✍️ — "Log a memory today" (done → "Fed your brain today"), opens capture.
- `warm` ❄️ — "Warm a cooling memory · N drifting cold" (shown when any
  `entropy ≥ 0.45`), focuses the coldest.
- `connect` 🪐 — "Revisit a drifting memory · N unlinked" (shown when any
  `degree === 0`), focuses an orphan.

These are the gamified surface of the maintenance loop's anti-decay / anti-orphan
goals.

## 7. Hangar — cosmetics (`packages/web/src/components/HangarPanel.tsx`, `graph/{soumaya,gltf}.ts`)

All assets are `.glb` in `packages/web/public/` with **procedural three.js
fallbacks**, so nothing breaks if a model fails to load.

**Ship skins:** `default` (Scout Craft, `soumaya-ship.glb`) · `organic`
(`organic-spaceship.glb`, unlock 100) · `fusion_core` (unlock via `cosmic_voyager`)
· `holographic` (procedural wireframe, unlock via `sentinel_command`).

**Engine trails:** `blue` (default) · `neon` (`consistent_pilot`) · `gold`
(`sector_pioneer`) · `purple` (`grand_restorer`).

**Deep-space figurines / megastructures** (two equippable slots, placed far back at
~(±8–9k, ±2–3k, −9.5k)):

| Figurine | Asset | Unlock |
|---|---|---|
| Waystation | `space_station_3.glb` | default |
| Aura Beacon | `aura-satellite.glb` | default |
| Solar Monument | `star-center.glb` | 100 memories |
| Dyson Megastructure | `dyson-sphere.glb` | 250 memories |
| Quantum Singularity Core | (proc + reused) | `deep_cluster` |
| Synapse Hyper-Array | (proc + reused) | `galactic_megastructure` |
| Aegis Shield Spire | (proc + reused) | `pathfinder_quest` |
| **The Singularity** (black hole) | `blackhole.glb` (Draco) | **365 memories** |

**The Singularity** is the prestige object: it renders at ~10,000 world units
(~5× the Sun's visual extent), is pushed farthest back (≈1.6× position multiplier),
and gets a special camera framing distance (~13,000) so its scale reads. It is the
intended capstone of a full year of capture. Asset conversion + licensing
(CC-BY-4.0 attribution) are specced separately in `blackhole-singularity.md`.

## 8. Autonomous fleet (`packages/web/src/graph/{fleet,soumaya,satellites,visitors,subAgents,spaceStation}.ts`)

The fleet dramatizes the maintenance loop — each craft is a *visualization of a
real or ambient graph behavior*, not idle decoration.

- **Soumaya** 🛸 (the ship) — the commander. Runs a task queue: removals (drag to
  Sun), placements (ferry new memories to orbit), link-forging, beacon dispatch,
  periodic docking/recharge (every ~4 jobs), then backend maintenance jobs. Glow
  color encodes state (distress/low-fuel red, docking green, ferry cyan, synthesis
  purple, patrol blue). Flight FX in `soumaya-flight-fx.md`.
- **Waystation Soumaya-Prime** 🌐 — fixed home dock she returns to between rounds.
- **Aura beacons** 🛰️ (`satellites.ts`) — up to 3 concurrent; seek the coldest
  memories (`entropy ≥ 0.45`) and pin a warm, emotion-tinted beam on them so none
  fade unseen; when nothing is cold they stand sentinel over the heaviest hub. The
  visual embodiment of the entropy/anti-decay signal.
- **Scout** 🛰 (`subAgents.ts`) — fast probe to the newest, least-connected
  frontier memories. **Gated behind Research Mode** (it represents the agent's
  fuel-spending curiosity).
- **Defender** 🚀 — guards the heaviest hub, intercepts hostile drifters that stray
  too close.
- **Visitors** 👽 (`visitors.ts`) — ambient roaming craft (Luminous Traveler /
  Drifter / Void Wanderer) chosen by a memory's emotional weight; they spawn at
  intervals, loiter, and flee from beacons. Arrivals are batched to the server
  (`api/routes/visitors.ts` → `visitor_stats`) to drive the Fleet tab's
  "most-visited memories." Not recorded in demo mode.

## 9. Research Mode gating (the one hard line)

Research Mode is the global `research_enabled` setting. It (with the USD budget)
gates everything that spends real tokens: the Scout craft, and the agent loop's
`PAID_JOBS` (synthesis/merging/research/sector_vibe) — re-checked in both `selectJob`
and `executeJob` (see `architecture.md` §maintenance). With it off, the fleet still
flies and the free upkeep still runs, but no cosmetic or quest can cause spend. This
is the boundary that keeps gamification from ever becoming a way to drain the shared
deployment budget.

## 10. Alignment note — is this serving the north star, or drifting?

The briefing ([`SECOND_BRAIN_BRIEFING.md`](../SECOND_BRAIN_BRIEFING.md)) is explicit
that the value of a second brain is **link density, atomic nodes, MOC hubs, and a
maintenance loop** — and it warns against **plugin/feature maximalism** ("import the
*patterns*, not a pile of features").

**Where this layer is aligned (engagement in service of curation):**
- Every economic and badge incentive is wired to a **real curation signal** —
  capture (`EARN_MEMORY`, `log` quest, rank), linking (`EARN_LINK`, `synapse`/
  `connector`/`galactic_megastructure`), breadth (`sector_pioneer`/`deep_cluster`),
  and **anti-decay** (the `warm`/`connect` quests, the entropy color shift, the Aura
  beacons, `gardener`/`grand_restorer`). That's exactly the habit set the briefing
  says a personal KB lives or dies on — gamified, not gamed.
- The fleet is a *legible visualization of the Karpathy "AI maintains" loop* the
  alignment doc already calls one of our strongest areas — it makes invisible
  background maintenance visible and trustworthy.
- Spend is hard-gated (Research Mode + USD), so the fun can never cost the user.

**Where it risks drift (honest assessment):**
- **Surface area.** This is the single largest concentration of feature volume in
  the app (20 badges, 8 figurines, 4+4 cosmetics, 5 craft types, visitors), and the
  briefing's loudest warning is against exactly this kind of accretion. Several
  figurines reuse the same model/condition family — breadth without proportional new
  value.
- **Cosmetics are pure vanity.** Ship skins / trails / megastructures are unlocked by
  curation but reward *nothing structural* — they don't deepen link density or
  navigation. They are retention scaffolding, defensible only as long as they cost
  little to maintain and don't crowd out the **one real gap the alignment doc names:
  the MOC / constellation-hub layer** (`moc` node kind exists in the model but has no
  gamified emergence path yet).
- **The prestige curve points at volume, not quality.** Rank, milestones, and The
  Singularity all key off raw **memory count**, which can mildly incentivize dumping
  over distilling — the opposite of the briefing's "atomicity + distill" emphasis.

**Recommendation for future growth (not in scope here):** hold this layer roughly
flat — resist adding more cosmetics/craft — and instead point the *next* reward at
the structural gap: make **promoting a dense cluster into a named constellation hub**
(Stage 1) a celebrated, gamified moment. That keeps the engagement machinery serving
the knowledge graph rather than orbiting it.
</content>
