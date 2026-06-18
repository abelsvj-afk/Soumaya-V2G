# Gemini Changes Tracker

This document tracks all changes made by Gemini to the Soumaya Brain repository. This is a mandatory reference for Claude to maintain project continuity.

## Completed Tasks

### 2026-06-18 (Claude): Galaxy polish (GLB/camera/autofocus), temporal memories, generative score
- [x] **Verified by Claude** — typecheck clean, **63 tests** pass, web build clean.
- **GLB models render properly + premium feel:** added a PMREM environment map
  (`RoomEnvironment`) to the scene in `graph/Graph3D.tsx`. The ship / space station /
  Aura satellites use metallic PBR materials that rendered as black silhouettes with
  no env map — now they catch light + soft reflections (also gives every body sheen).
- **Camera no longer buggy:** OrbitControls now use inertial damping
  (`enableDamping`), `zoomToCursor` (dolly toward the planet you point at), tuned
  rotate/zoom/pan speeds, and a single `controls.update()` per frame (previously
  update ran only while following an object, so free-fly movement/zoom never settled).
- **Auto-focus snaps to a real "best view":** new `frameGalaxy()` frames the galaxy's
  bounding sphere from a consistent cinematic 3/4 angle (yaw + lift) instead of
  `zoomToFit` locking to whatever angle the camera had drifted to. Used by recenter,
  exit-cluster, and isolate-system.
- **Temporal + tagged memories** (full stack): new optional `occurred_at` (backdatable
  event time), `remind_at` (future reminder), and `tags` (JSON) columns on `nodes`
  (schema + idempotent migration + bootstrap). Threaded through `NodesRepo`, the
  ingest pipeline (`IngestMeta`), and `POST /api/ingest` (zod-validated). Web: the
  dump panel gains a curated tag-chip blend (life-areas + moods, `SUGGESTED_TAGS`) with
  free-form add, plus optional "when did this happen?" / "remind me" datetime pickers;
  `NodeInspector` shows tags + friendly relative dates. (Reminder *surfacing* in the
  daily digest/Telegram is a noted follow-up — storage + display land now.)
- **Generative "interstellar" score:** rebuilt `graph/audio.ts` into an evolving,
  infinite Web-Audio engine — organ-like detuned voices gliding through an i–VI–III–VII
  progression, a high shimmer pad, a rising arpeggio motif, cathedral feedback-delay
  tail, sweeping filter + slow dynamic swells. No file, no loop seam, zero deps,
  nothing copyrighted. Slow cinematic fade-in on toggle.
- Tests: added `occurredAt/remindAt/tags` round-trip to `pipeline.test.ts`.

### 2026-06-18 (Claude): Telegram Phase B — multi-brain linking + proactive daily digest
- [x] **Verified by Claude** — typecheck clean, **62 tests** pass, web build clean.
- This deployment is multi-brain (anyone can open a brain), so Telegram is now
  per-brain: a chat must **link** before it can do anything.
  - **`/link <name> <passcode>`** authenticates via `SpacesRepo.authOrCreate`
    (creates the brain if the name is new, rejects a wrong passcode) and binds the
    chat → brain. `/unlink` disconnects. Until linked, `/log` + questions are refused.
  - New `telegram_links(chat_id PK, space_id, space_name, last_digest_date, created_at)`
    table (bootstrap + idempotent migration in `db/client.ts`); `telegram/links.ts`
    owns the SQL (`TelegramLinksRepo`). Removed the old single-brain env resolution
    (`TELEGRAM_SPACE_ID` / `TELEGRAM_ALLOWED_CHAT_ID`).
  - **Proactive nudges:** `sendDailyDigests` (bot.ts) sweeps every linked chat once
    per UTC day and pushes that brain's digest — fresh memories, latent connections,
    **"going cold" cooling beacons**, expired actions — via an hourly `setInterval`
    in `index.ts` (gated on `TELEGRAM_BOT_TOKEN`, idempotent on `last_digest_date`).
    Free: `buildDailyDigest` never calls the LLM. `/digest` pulls it on demand.
  - Web: Command Center Telegram card now shows the `/link <name> <passcode>` flow
    instead of the obsolete Brain-ID/`TELEGRAM_SPACE_ID` copy.
  - Tests: `server/src/__tests__/telegram.test.ts` (linking, isolation between two
    brains, digest sweep + idempotency); updated the bridge tests in `features.test.ts`.
  - Docs: `plans/telegram-and-autonomy.md` updated (Phase B + multi-brain SHIPPED).

### 2026-06-17 (Claude): Telegram bridge (Phase A — chat + log)
- [x] **Verified by Claude** — typecheck clean, **55 tests** pass, web build clean.
- Talk to your brain from Telegram: message → GraphRAG answer (with sources);
  `/log <thought>` → ingest + fuel. Single brain, text replies, webhook.
  - `server/src/telegram/bot.ts` (`handleTelegramUpdate` with injected send → unit
    tested, `tgSend`, `setTelegramWebhook`, `resolveTelegramSpace`).
  - `server/src/api/routes/telegram.ts` — open `POST /api/telegram/webhook/:secret`
    (secret verified in path + `X-Telegram-Bot-Api-Secret-Token` header; acks then
    processes async). Auto-registers on boot when token+secret+`PUBLIC_URL` set.
  - Command Center shows your Brain ID (for the `TELEGRAM_SPACE_ID` secret).
- Fully opt-in (no token → no change; offline fallback intact).
- Evolution path documented in `plans/telegram-and-autonomy.md` (Phase B proactive
  nudges, Phase C full server-side autonomy, Phase D voice notes + multi-user).

### 2026-06-17 (Claude): Full audit pass — cohesiveness + pitfall fixes
- [x] **Verified by Claude** — gate green: typecheck clean, **52 tests pass**, web
  build clean. Working tree clean, branch up to date with origin.
- Ran a repo-wide review (docs, migrations, the four new feature areas) and fixed
  the real gaps found:
  - **Autonomous jobs now tend their nodes.** Synthesis/research/sector_vibe were
    expanding nodes without resetting `last_tended_at`, so a beacon could sit on a
    memory Soumaya just worked. Now consistent with the manual synthesize.
  - **Beam NaN guard.** `satellites.ts` skips the beam when the probe sits exactly
    on a node (zero-length direction would have produced a NaN quaternion).
  - **Offline emotion.** The heuristic provider now sets `emotionalWeight` from
    wording (via the shared `analyzeSentiment`), so emotion colour, harmonization,
    visitor variants, and the chat voice all work with no API key.
  - **Beacon lore-card auto-close.** If all beacons fade while you're following one,
    the follow releases and the card closes (no dangling card with no button).
- **Docs synced** (per WORKFLOW.md): `SOUMAYA_ROADMAP.md` change log + status,
  `ASSETS_NEEDED.md` (aura-satellite.glb now listed as present).
- Reviewed but intentionally left as-is: demo galaxy omits entropy (defaults to 0,
  a patrol beacon still appears); fuel cap has no UI toast (the gauge shows it);
  space_meta migration is additive/idempotent and fine for the current schema.

### 2026-06-17 (Claude): Focus speed-dial, always-visible beacons, "where did it land?"
- **Game-style focus cluster.** Replaced the three stacked focus FABs with ONE
  🎯 button that pops its targets upward (ship 🛸 / station 🪐 / beacon 🛰️) — a
  speed-dial. The main button glows while beacons are deployed; opening rotates it
  to ✕. (App.tsx `focusItemStyle` + `.focus-cluster` CSS.)
- **Beacons are now actually visible.** Before, beacons only deployed on memories
  already ≥3 weeks cold (entropy ≥ 0.45), which a young brain never has — so none
  ever showed. `satellites.reassign` now always keeps ≥1 beacon on patrol over the
  most-neglected memory, and the fleet GROWS as memories truly cool. Beam opacity
  still scales with entropy (faint patrol → bright rescue). Beacon lore updated for
  the patrol state.
- **See where new memories populate.** After an ingest, the camera now flies to
  the new memory (and selects it) right after the green/amber spawn bursts, so you
  watch where it landed in the galaxy. (App `refresh`.)
- Typecheck + web build clean; 51 tests green.

### 2026-06-17 (Claude): Beacons v2 — beam, focus button, alien fear, deeper lore
- **Real tractor beam.** `satellites.ts` now fires a tapered additive beam from
  each probe down to its memory's surface (orientation/length recomputed per
  frame), with an impact glow where it lands — replacing the "just floating +
  glowing" look. Beam width/opacity scale with how cold the memory is.
- **Beacon focus button.** New 🛰️ FAB that only appears + **pulses** while
  beacons are deployed; clicking cycles the camera through them
  (`Graph3D.cycleFollowSatellite`, fed by `satellites.getActive()` and an
  `onSatelliteCount` callback). The follow auto-releases when a beacon goes dark.
  The space-station FAB icon moved 🛰️ → 🪐 (it's a station, not a satellite).
- **Aliens fear/hate beacons.** `visitors.ts` takes a `VisitorHazard`
  (beaconed ids + positions): drifters won't target a beamed memory, and if a
  beacon strays within FLEE_RADIUS they flush hostile-red and bolt.
- **Beacon lore.** `objectLore.ts` gains a `satellite` kind with evolving,
  brain-aware text (names the coldest memory, counts the cooling ones, notes the
  drifters' fear); shown in the focus card (ObjectLoreCard). SATELLITE_LORE also
  updated to mention the beam + the aliens.
- Help menu updated (station 🪐, beacon 🛰️). Typecheck + web build clean; 51 tests
  green.

### 2026-06-17 (Claude): Aura-class Beacon satellites (asset + purpose + lore)
- Added `public/aura-satellite.glb` (user-supplied "Aura_B" model).
- New `web/src/graph/satellites.ts` — `makeSatellites()` system (procedural probe
  fallback + glTF swap-in, same pattern as the ship/station), wired into Graph3D
  beside `visitors`.
- **Purpose (ties into the entropy economy):** a small fleet that auto-seeks the
  COLDEST memories (`entropy >= 0.45`), orbits them, and pulses a warm beacon
  (brighter the colder the memory). Tend a beaconed memory → its entropy resets →
  the beacon releases and drifts to the next-coldest. Makes the cooling signal
  physical and points you at what to revisit.
- **Lore** in `SATELLITE_LORE` (shown in the Help menu): salvaged warmth-relays
  that can't rekindle a memory — only you can — so they refuse to let one cool
  unseen.
- Help menu gains a 🛰️ entry. Typecheck + web build clean; 51 tests still green.

### 2026-06-17 (Claude): Celestial Economy v2 — voice, visual entropy, fuel polish + a real bugfix
- **Soumaya's voice (dramatization filter).** New `shared/dramatize.ts` (pure,
  offline): `analyzeSentiment` + `toneFrom` blend the cited memories' emotional
  weight with her answer's wording into an `EmotionalTone`; `prosodyFor` maps it
  to speech prosody. Chat now returns `tone`. `web/src/voice.ts` speaks via the
  browser SpeechSynthesis, picking a natural (non-robot) voice and bending
  rate/pitch + per-sentence jitter to the tone. Toggle 🗣️ in Chat (localStorage,
  per-device). No API, no new deps.
- **Visual entropy.** `nodeObject.ts` now dims + cold-shifts neglected memories
  using the server's `entropy`; tending warms them back on the next refresh.
- **Fuel flourish.** Ingest returns `fuelEarned`; the new memory gets an amber
  spark (`effects.ts` "fuel" pool) and the panel shows `+N ⛽`.
- **Don't starve her purpose.** Fuel now gates ONLY discretionary expansion
  (research + sector_vibe). Her core duties (synthesis/merging/daily_log) run on
  Research Mode + USD budget alone, regardless of fuel.
- **Bugfix (it surfaced while testing the above):** `db/vec.ts` `upsertEmbedding`
  used `INSERT OR REPLACE`, which vec0 rejects with a UNIQUE-constraint error — so
  the autonomous **research & merging** jobs (which re-embed a grown node) had been
  silently 500ing. Switched to an atomic delete-then-insert. Regression-tested.
- Help menu updated (Fuel, Cooling/Entropy, Voice). Gate: 51 tests green,
  typecheck clean, web build clean.

### 2026-06-17 (Claude): Verified green-lane work + recovered the lost red-zone plans
- **Verified ✓** — green-lane web features build and pass the gate.
- **Red-zone audit fixes:** `SoumayaPanel` was calling `fetch('/api/maintenance/
  daily-log')` directly, bypassing the `x-space-id` wrapper (would 401 under
  multi-tenancy) → moved to a space-scoped `getDailyLog()` client helper. Removed
  a stray committed `.wget-hsts` artifact (+ gitignored).
- **Recovered the staged plans:** `plans/phase-1-density-core.md` and
  `plans/phase-3-gamification.md` were referenced below but never committed (lost
  with Gemini's container). Claude reconstructed both as committed specs. Phase 1
  (InstancedMesh) is spec'd + **deferred** until profiling needs it. Phase 3
  (Fuel/Entropy economy) needs schema → **awaiting user direction** before
  implementing (see the plan doc's open questions).

### 2026-06-17: Green Lane Gamification & Architecture Staging
- `[x] Verified by Claude`
- **Features Implemented (Green Zone):**
  - **Star Age Tints**: Memories now redshift as they age and remain unconnected.
  - **Sector Labels**: Hub titles are now visible in the Macro density view.
  - **Flashback Comet**: Added a serendipity button (`☄️`) to randomly visit old, high-mass nodes.
  - **Consistency Constellation**: Added a 14-day activity grid to the Soumaya Panel.
  - **Visitor Color Sync**: Alien ships now adopt the emotional color of the planet they orbit.
  - **LOD Optimization**: Fixed visual popping in `Graph3D` and improved tick-loop performance by isolating the `force-graph` group.
  - **Timezone Sync**: Fixed a bug where SQLite UTC timestamps were interpreted as local time on the client, breaking 'Star Age', 'Flashback Comet', and 'Action Expiry' calculations.
- **Red Zone Proposals Staged:**
  - `plans/phase-1-density-core.md`: Technical spec for transitioning to `InstancedMesh`.
  - `plans/phase-3-gamification.md`: Technical spec for the "Celestial Economy" (Fuel and Entropy).
- **Files Modified**: `packages/web/src/App.tsx`, `packages/web/src/components/*`, `packages/web/src/graph/*`, `packages/web/src/index.css`.

### 2026-06-16: Infrastructure & Assets
- **Git Installation**: Installed `git` via `apk`.
- **Spacecraft Implementation**:
    - Restored the original `soumaya-ship.glb` for the maintenance agent.
    - Added `space_station_3.glb` as a new orbiting entity in the 3D scene (with a procedural fallback if the model fails).
    - Created `packages/web/src/graph/spaceStation.ts` for station logic.
    - Updated `packages/web/src/graph/Graph3D.tsx` to include the station.
    - **Propulsion Physics**: Implemented dynamic engine glow scaling in `packages/web/src/graph/soumaya.ts` based on velocity.

### 2026-06-16: Soumaya Agent & Command Center
- **Agent Renaming**: Completely renamed the maintenance agent from "Samaya" to "Soumaya" across the entire codebase.
- **Command Center UI**: 
    - Added `packages/web/src/components/SoumayaPanel.tsx`.
    - Made the Soumaya ship clickable in the 3D scene to open the panel.
    - Added a live activity log of all autonomous actions.
    - Added a toggle for the token-consuming "Research Mode".
- **Maintenance Backend**:
    - Registered `maintenanceRoutes` in `server.ts` with ESM compatibility.
    - Created SQLite tables: `agent_logs`, `settings`, and `daily_logs`.
    - Implemented diverse job types: Synthesis, Calibration, Patrol, Pruning, Harmonization, Research, and Merging.
- **Strategic Hub Research**:
    - Restricted research only to established hubs (Degree > 1, Importance >= 0.4).
    - Research findings are injected back into the original node, increasing its importance and causing visual celestial growth.
- **Memory Fusion (Merging)**:
    - Soumaya detects near-identical memories (similarity > 0.96) and fuses them using the LLM.
    - Edges are re-routed to the surviving hub, and the redundant node is deleted.
- **Job-Specific Animations**:
    - Upgraded `packages/web/src/graph/effects.ts` with unique burst pools.
    - Synthesis (Cyan/Blue beam), Harmonization (Gold pulses), Pruning (Red fractures), Calibration (Indigo ripples), and Merging (Dark Purple Vortex implosion).

### 2026-06-16: Cosmic Personality Upgrades
- **Celestial Titling (Star-Namer)**: LLM autonomously generates poetic names for new memories (stored in `celestialTitle`).
- **Emotional Gravity Ripples**: LLM assigns a hex `color` based on the memory's vibe, directly influencing the 3D body's render color.
- **Dream Synthesis**: Rewrote the Synthesis prompt to act as a "Dream Interpreter," creating cryptic, profound connections.
- **Atmospheric Sector Summaries**: Soumaya autonomously charts "Sector Vibes" for memory clusters (appended to the center hub).
- **Captain's Log**: Soumaya autonomously generates a daily summary of new memories and her maintenance actions, displayed in the Command Center.

## Pending Tasks (User requested to "forget it" for now)
- [ ] Fix UI layout overlaps in the bottom menu/list content.
- [ ] Fix "Add thought" button overlap with other buttons.
- [ ] Fix volume/focus/list button blocking text.

## Git Commits
- `566aed8`: Add space station model and restore original ship
- `[recent]`: Upgrade Soumaya agent: Strategic Hub Research, Memory Fusion with Vortex animation, and Command Center UI
- `[recent]`: Enhance galaxy with cosmic personality: Celestial Titling, Sector Vibes, Dream Synthesis, and Captain's Log

## Claude Fixes (2026-06-16) — recovering Gemini's branch

Gemini's work lived on `master` (orphan history) while the deploy builds from the
`claude/...` branch, which was stuck 2 commits behind — so none of it deployed.
Adopted master's full content onto the deploy branch and fixed the build:

- **Compile errors fixed** (app could not build/deploy):
  - `llm/openai.ts`: `research`/`summarizeSector`/`generateDailyLog` passed the
    schema/name args in the wrong order — corrected.
  - `api/routes/maintenance.ts`: duplicate `nodesRepo` decl; `split("T")[0]`
    string|undefined → `slice(0,10)`; unchecked array indexing (`candidates[0]`,
    `randomNode`, `targets[0/1]`) → guarded / destructured.
  - test fakes (`FakeLlm`, `BrokeProvider`) implement the 3 new LlmProvider methods.
- **Nebula skybox "black inside" fixed**: the 16K/18MB glb exceeds mobile GPU
  limits (renders black). Made `makeSpaceBackground` a real procedural nebula
  (always works); the glb only loads on desktop (innerWidth ≥ 1100).
- **Space station now visible**: orbit radius 900 → 320 (was floating too far out).

Status: typecheck clean, 29 tests pass, web builds.
