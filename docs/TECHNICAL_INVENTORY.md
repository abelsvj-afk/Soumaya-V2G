# Soumaya · Second Brain — Complete Technical Inventory

> Exhaustive architecture reference for an AI architect with no prior context.
> Ground truth as of the `claude/soumaya-second-brain-v1-m4z4hc` branch.
> Where a feature does not exist, it is stated explicitly.

---

## 1. Project Overview

**Overall purpose.** A single-user (multi-tenant-capable) "second brain": you dump raw
thoughts in natural language; an ingestion pipeline extracts typed knowledge nodes and
relationships, embeds them, auto-links them associatively, and renders the whole thing as
a navigable 3D **memory galaxy** where each memory is a celestial body with real
gravitational mass. An autonomous AI companion named **Soumaya** (a starpilot flying a
small craft) continuously tends the graph, and you can talk to your brain (GraphRAG chat
with cited answers).

**Design philosophy.**
- **Link-first, not folders.** Structure emerges from meaning-based auto-linking; there is
  no filesystem folder tree. Maps of Content ("constellations") are hub nodes, not folders.
- **Provider seams with offline fallbacks.** Embeddings and LLM are swappable interfaces;
  the app is fully functional with **no API key** (deterministic hash embeddings + a
  heuristic LLM). Never hard-depend on a cloud key.
- **Grows with you over years.** A memory is born small (asteroid) and must *earn* its
  size through connections, AI-surfaced latent insights, survival age, and emotional charge
  — nothing balloons in 24h.
- **The AI maintains; the human curates** (Karpathy pattern): a 24/7 agent does synthesis,
  dedup, decay/repair, research, consolidation.
- **Prove behavior by measurement**, keep the gate (typecheck + tests + web build) green,
  additive-idempotent migrations only.

**Core user experience.** Sign in with name + passcode → cinematic fly-in → Observatory
home (greeting, her daily question, discovery, foresight, away-report) → the 3D galaxy with
a right-side dock of panels and a chat companion. Soumaya flies around tending memories,
answers questions from your own memories, initiates a daily "contact," and reveals patterns
and beliefs she's consolidated about you.

**Primary goals.** Effortless capture; associative recall; make latent connections visible;
a companion that knows you and gets wiser over time; a galaxy legible enough to read your
own mind at a glance.

---

## 2. Galaxy Structure (every celestial / 3D object)

All 3D lives in `packages/web/src/graph/`. Rendering is `react-force-graph-3d` (Three.js).
Motion is **kinematic**, not a force simulation: bodies are pinned each frame (`fx/fy/fz`)
onto computed orbit positions (`orbits.ts`), and the d3 force engine is kept hot only to
push positions to the renderer (all forces zeroed).

### 2.1 Memory bodies (nodes) — `nodeObject.ts`, `orbits.ts`, `shaders.ts`
- **Name:** memory node / celestial body.
- **Visual:** a sphere sized/colored by class; large classes (`giant+`) render as a spinning
  macro sphere with a procedural surface canvas texture so rotation reads; small classes use
  a lit sphere + a radial-gradient glow sprite; a floating text label sprite (marquee scrolls
  when wider than ~470px); gas giants may carry a **ring**; big bodies may have a drifting
  **asteroid-belt** particle ring. Star/planet classes use custom `ShaderMaterial`
  (`makeStarMaterial`, `makePlanetMaterial`) with a `uBrightness` uniform.
- **Purpose / data:** represents one extracted memory (`nodes` row).
- **Size rules (`shared/celestial.ts` `deriveMass` + `classify`):** mass 0..1 from a blend —
  `base = 0.26*importance + 0.04*emotion`; `growth = 0.4*degreeSaturation + 0.22*reinforceSaturation + 0.14*ageSurvival`; a per-node `ceiling = 0.55 + 0.45*importance`. Classes:
  asteroid `<0.12`, moon `≥0.12`, planet `≥0.24`, gas_giant `≥0.36`, giant `≥0.48`,
  star `≥0.6`, supergiant `≥0.8`. Enriched on read by `GraphService`, never denormalized.
- **Color rules (`theme.ts`):** LLM-suggested `color` wins; else a deterministic pick from
  the class palette by `id % palette.length`. Type chips use `TYPE_COLORS`.
- **Motion / orbit:** each non-top body orbits its heaviest connected neighbor on a fixed
  path; top-level systems revolve around the Sun (origin), breathing radially OUTWARD only
  (comet-like swings, never inward). Constants: `SUN_GAP=600`, `TOP_STEP=360`,
  `TOP_MIN_STEP=260`, `TOP_TARGET=3200`, `MARGIN=32`, per-child `childMax`.
- **Interaction:** click to select/focus (camera flies to it, opens Details); hover dims
  non-neighbors; "isolate system" shows only it + descendants.
- **Animation:** idle "alive" shimmer pulse; a tended memory sparks a burst; entropy
  (coolness) tints/dims over ~3 weeks untended; hover/selected dim.
- **Status:** ✅ Implemented.

### 2.2 The Sun — `sun.ts`
- **Name:** the Sun (galaxy core). **Visual:** `sun.glb` model (procedural fallback sphere +
  corona sprite at 3.2× radius) with a central `PointLight`. **Purpose:** the gravitational
  center every top-level system orbits; also the "furnace" a deleted memory is dragged into.
- **Size:** `SUN_RADIUS=460`, clamps to `SUN_RADIUS_MAX=600`; grows slightly with galaxy size.
- **Color:** `SPECIAL_COLORS.sun` `#ffcf6b`; light `#fff2d0` intensity ~1.2–1.8 (focus-dims).
- **Motion:** slow self-rotation (baked GLB clip slowed to `timeScale 0.08`); `flare()` on
  memory consumption. **Interaction:** focusable via HUD. **Status:** ✅ Implemented.

### 2.3 Constellation hub (MOC) — `nodeObject.ts` + `api/routes/constellations.ts`
- **Name:** constellation / Map of Content. **Visual:** a bright starlight-gold hub body,
  macro label. **Purpose/data:** a `kind:"moc"` node summarizing a cluster; `summarizes`
  edges (weight 0.9) to members; `origin:"agent"`. **Color:** `#ffe9a8`. **Interaction:** fly
  to / enter system; created via Insights "✦ Save as constellation". **Status:** ✅ Implemented.

### 2.4 Belief body — `analysis/dreamCycle.ts` (server) + galaxy render
- **Name:** belief. **Visual:** indigo body (`#9686ff`), distinct chip in the inspector.
  **Purpose/data:** a `kind:"belief"` node consolidated from a dense cluster (dream cycles);
  `summarizes` edges to its evidence; `origin:"agent"`; entropy-exempt (never cools).
  **Status:** ✅ Implemented.

### 2.5 Soumaya (the ship) — `soumaya.ts`
- **Name:** Soumaya, the starpilot. **Visual:** `soumaya-ship.glb` (skins:
  organic-spaceship.glb, spaceship_with_fusion_core.glb) with a procedural cone fallback; a
  banking flight model, an engine plume (world-space puffs), and a floating marquee task
  label. **Purpose:** the autonomous maintenance agent's avatar; performs jobs, ferries new
  memories to their orbit slot, draws/energizes links, drags deletions to the Sun, docks at
  the station to recharge. **Motion:** eased Bézier cruise with bank/roll into turns; real
  recorded engine audio audible only when focused on her. **Interaction:** tap her ship →
  opens the Soumaya ops tab + follows; can be set to cockpit/orbit camera. **Animation:**
  Night Replay re-enacts real overnight `agent_logs` events; propulsion beam scales with
  velocity. **Status:** ✅ Implemented.

### 2.6 Space station — `spaceStation.ts`
- **Name:** Waystation Soumaya-Prime. **Visual:** `space_station_3.glb`. **Purpose:** the
  fleet's dock/home base; Soumaya orbits and pulses recharge beams here. **Interaction:**
  focusable; shows an evolving `ObjectLoreCard`. **Status:** ✅ Implemented.

### 2.7 Aura-class beacons (satellites) — `satellites.ts`
- **Name:** Aura beacons. **Visual:** `aura-satellite.glb` (procedural probe fallback) with a
  colored beam. **Purpose:** dispatched to cold memories (`entropy ≥ 0.45`), projecting a warm
  beam tinted by the memory's emotion color; stand sentinel over the heaviest hub when nothing
  is cold. Up to 3 concurrent. **Motion:** launch from the station/ship, orbit a standoff point.
  **Interaction:** focusable; drifters flee them. **Status:** ✅ Implemented (assigns/releases;
  release now reflects mid-session tending).

### 2.8 Visitors (alien drifters) — `visitors.ts`
- **Name:** visitors / drifters. **Visual:** procedural saucers (variants friendly/neutral/
  ominous; adopt the visited memory's color). **Purpose:** ambient craft drawn to your most
  gravitationally interesting memories; visits are logged (`visitor_stats`), surfaced as 👽
  counts on Browse rows. Up to 3 concurrent. **Interaction:** focusable lore card; flee
  beacons. **Status:** ✅ Implemented (procedural only — no GLB assets: `visitor-*.glb` NOT
  provided).

### 2.9 Sub-agents: Scout & Defender — `subAgents.ts`
- **Name:** Scout, Defender. **Visual:** procedural craft. **Purpose:** Scout surveys the
  newest/least-connected frontier memories; Defender holds station over the heaviest hub and
  intercepts hostile drifters. **Status:** ✅ Logic implemented; procedural visuals only
  (`defense-ship.glb` NOT provided).

### 2.10 Deep-space megastructures (Hangar figurines) — `Graph3D` figurine slots
- **Name:** Solar Monument (`star-center.glb`), Dyson Megastructure (`dyson-sphere.glb`), The
  Singularity (`blackhole.glb`), plus procedural Quantum Singularity Core / Synapse Hyper-
  Array / Aegis Shield Spire. **Purpose:** unlockable cosmetic monuments mounted in two far-
  space slots; focus button flies out to them. **Status:** ✅ Implemented (GLB + procedural).

### 2.11 Background celestials — `starfield.ts`, `skybox.ts`
- Starfield (6500 points), nebulae (4), comets (6), distant galaxies (3), a procedural space
  background texture + `nebula-skybox.glb`, and background "constellation" line art
  (`makeConstellations`). **Status:** ✅ Implemented.

### 2.12 Collision bursts / knowledge particles — `effects.ts`, link particles
- Pooled particle bursts per job type (synthesis/pruning/harmonization/calibration/merging/
  user/fuel/consume). Link "info flowing" directional particles fire only on high activity.
  **Status:** ✅ Implemented.

---

## 3. Memory System

**Memory types (`NodeType`):** person, project, decision, company, meeting, daily,
knowledge, concept, other, + structural `moc`. Legacy aliases (`business_idea→project`,
`relationship_reflection→person`, `random_thought→daily`) normalized on read. A separate
`kind` column distinguishes: `memory` (default/null), `action` (transient to-do with TTL),
`moc` (constellation hub), `belief` (consolidated understanding).

**Importance scoring.** 0..1. LLM rates it at extraction; the heuristic provider scores it
from weighty life/identity/emotional vocabulary + length (`heuristicImportance`). Feeds mass.

**Emotional weighting.** `emotionalWeight` −1..1. LLM-assigned or derived offline via
`analyzeSentiment` (hand-tuned lexicon). Drives link color, body tint, harmonization, and
chat delivery tone.

**Connection weighting.** `degree` (edge count) enriched on read; drives structural mass
(saturating at `DEGREE_SATURATION=4`) and entropy resistance (`1 + degree*0.6`).

**Decay ("entropy").** `entropyFrom(daysSinceTended, degree)`: ramps to 1 over ~21 days ×
resistance; hubs cool far slower; actions/moc/belief never cool. Enriched on read; resets
to 0 on any tend (visit/edit/link). Non-destructive — purely visual + nudge.

**Retrieval / Search.** Hybrid: vector KNN (sqlite-vec cosine over MiniLM/hash embeddings) +
BM25 keyword (FTS5 `nodes_fts`) fused via **Reciprocal Rank Fusion** (k=60). Used by
`GET /api/search` and the chat GraphRAG seed step. `knn` over-fetches then space-filters.

**Memory creation.** `POST /api/ingest` → `ingestion/pipeline.ts`: LLM `extract` (or
heuristic single-node) → create nodes (`NodesRepo.create` writes row + embedding + FTS) →
associative auto-link (`associativeLink.ts`, threshold 0.72, k=12, maxLinks 5, LLM
`validateLink` gate) → earn fuel + streak. Also: chat "save reply", Daily Contact answer,
Telegram `/log`, offline queue flush.

**Memory editing.** `PATCH /api/nodes/:id` (importance, with `null` = reset to heuristic).
Tags/dates set at ingest. Editing tends the node.

**Memory deletion.** `DELETE /api/nodes/:id`: hard delete (cascades edges, insights,
attachments, embedding, FTS). Soft delete (`softDelete`, sets `deleted_at` + `merged_into`)
used only by merging. Actions auto-expire (TTL sweep) — deletion is logged.

**Memory merging.** Autonomous `merging` job (or `complete-job`): near-duplicates
(cosine ≥ `MERGE_SIMILARITY=0.96`) fused — content synthesized, embedding refreshed, edges
rerouted with self-loop + duplicate cleanup, insights remapped, loser soft-deleted.

**Automatic organization.** Associative linking on ingest; constellation reconciliation
(pull drifted-in members into MOC hubs over time); dream-cycle belief consolidation; ML
clustering (`ml/cluster.ts`) for detected constellations; agent synthesis/pruning/
harmonization/calibration.

---

## 4. Knowledge Graph

**Nodes.** One table `nodes` (see §9). `type` = taxonomy; `kind` = structural role.

**Relationship (edge) types (`RelationshipType`):** resolves, complicates, is_analogous_to,
builds_on, relates_to, contradicts, caused_by, documentation, summarizes (hub→member). Edges
carry `weight` 0..1 and `relationship`. `EdgesRepo.exists` is DIRECTIONAL.

**Connection creation.** (a) LLM-proposed edges during extraction (by label); (b) associative
auto-linking by embedding similarity + LLM `validateLink`; (c) `summarizes` edges from
constellation promotion / belief consolidation / reconciliation; (d) Daily-Contact answers
link the reply to the asked memory.

**Edge weights.** From cosine similarity or LLM confidence (0..1); `summarizes` = 0.85–0.9.

**Similarity scoring.** Cosine over L2-normalized embeddings (`vec0 distance_metric=cosine`,
`similarity = 1 - distance`). Offline hash embeddings score lower, so thresholds are
provider-aware where it matters (e.g. contradictions 0.5 hash / 0.75 real).

**Semantic links.** Associative linking (0.72), constellation reconcile (shares that
constant), synthesis latent-connection (0.82), merging near-dup (0.96).

**Hierarchies.** Constellation hubs (MOC) → member memories via `summarizes`; belief nodes →
evidence memories. No deeper tree; orbits impose a visual parent/child hierarchy (heaviest
neighbor) at render time only.

**Clusters.** `ml/cluster.ts` detects dense clusters for the Insights "constellations" list
(promotable to MOC hubs). Dream cycles pick the densest hub neighborhood for consolidation.

**Graph algorithms implemented.** KNN (sqlite-vec); multi-hop neighborhood expansion
(recursive CTE, `graph/traversal.ts` `multiHopNeighbors`, `multiHopDirected` test-only);
degree computation; BFS shortest-path (client `fireRecall` citation animation);
Reciprocal Rank Fusion; DFS longest-path (client achievement predicate); k-means-ish
clustering (`ml/cluster.ts`). No PageRank / community detection / centrality beyond degree.

---

## 5. AI Architecture

**LLM provider seam (`llm/adapter.ts`, `LlmProvider`).** Methods: `extract`, `validateLink`,
`synthesize`, `detectContradiction`, `answer` (chat), `research`, `summarizeSector`,
`generateDailyLog`, optional `chronicle`, `planJob`, `distill`, `consolidate`.
Implementations: `GeminiProvider` (`@google/genai`, default model `gemini-2.5-flash`),
`OpenAiProvider` (fetch, `gpt-4o-mini`), `HeuristicProvider` (offline, no key). All cloud
calls wrapped by `ResilientLlmProvider` (timeout, degrade-to-heuristic, credit/quota cooldown,
budget gate). **Provider precedence:** explicit `kind` > OpenAI key > Gemini key > env
`LLM_PROVIDER` > heuristic. Chat `answer` runs at temperature 0.85; structured jobs 0.2.

**Embedding provider seam (`embeddings/adapter.ts`).** `LocalEmbeddingProvider`
(`@huggingface/transformers`, `Xenova/all-MiniLM-L6-v2`, 384-dim, baked into image) →
degrades to `HashEmbeddingProvider` (deterministic bag-of-words hash). `EMBED_DIM=384`.

**The autonomous agent — "Soumaya" (`maintenance/agent.ts`).** Single source of truth for BOTH
the browser maintenance loop and the server 24/7 loop. `selectJob` deterministic ladder
(with optional LLM `planJob` picking between the ladder pick and a research-gap alt);
`executeJob` runs it. **JobType:** synthesis, calibration, patrol, pruning, harmonization,
research, merging, sector_vibe, daily_log. Every job carries an explainable `JobRationale`
(objective/why/benefit) derived from graph facts (never an LLM call).

**Gating.** Paid/LLM jobs need per-space **Research Mode** (`space_meta.research_enabled`) +
under the USD budget; expansion jobs (research, sector_vibe) also burn **Fuel**; free upkeep
(pruning/harmonization/calibration/patrol, genesis daily_log) always runs. `withClaim`
in-process idempotency + 10-min execution dedupe prevent browser/server double-runs.

**Retrieval (GraphRAG, `chat/graphrag.ts`).** Embed question → hybrid seeds (KNN+BM25 RRF) →
multi-hop neighborhood → assemble subgraph context → layer: soul (`identity.ts` soul.md),
About-Me persona (`persona/derive.ts`), behavioral read (`persona/behavior.ts`), relevance-
gated knowledge docs (threshold 0.3), selectively-adopted custom instruction profiles,
qualitative telemetry → `llm.answer` → cited answer + mood + optional askBack + usedRoles.

**Reasoning.** LLM answer/synthesis/contradiction/consolidation; deterministic ladders for
job selection, research priority (`researchPriority.ts`), foresight, undertakings.

**Reflection.** Daily Captain's Log (`generateDailyLog`); self-review (`analysis/selfReview.ts`);
emotional trajectory; dormant detection; evolution chains; belief consolidation.

**Learning.** No model training/fine-tuning. "Learning" = accumulated structure: beliefs
(dream cycles), auto-derived persona, behavioral read vs baseline, foresight from repeated
patterns, per-space research-answer capture.

**Background jobs (server `index.ts`).** 24/7 autonomy loop (default on, every 5 min):
persona refresh, constellation reconcile, dream cycle (1/day/space), undertaking step,
one maintenance job, lore evolve. Heartbeat (15 min) + 60s sweep: action-item expiry.
Telegram digest sweep (hourly, idempotent per UTC day). Per-tick paid-job ceiling (default 4).

---

## 6. UI and UX

**Framework.** React 19 + Vite, single-page. `App.tsx` orchestrates; the galaxy is always
mounted behind overlays.

**Screens / overlays.**
- **LoginScreen** — name + gamer-tag + passcode; opens/creates a private brain.
- **Observatory** (home overlay) — auto-shows after the fly-in: greeting + memory count +
  streak; the **Daily Contact** (her question + inline answer box), her **discovery of the
  day**, **foresight** card ("she sees a pattern coming"), the **away report** ("while you
  were away"), quests, constellations, recent, and "Enter the galaxy". Scrolls internally
  with a sticky Enter + top-right ×.
- **Galaxy** (`Graph3D`) — the 3D scene.
- **Right dock** (`RightDock`, 8 tabs): Details (NodeInspector), Browse (List/Folders/Hubs
  view toggle — absorbs old List/Library/Sectors), Agenda (ActionsPanel), Insights
  (DigestPanel: beliefs, Captain's Log, daily digest, latent insights + reconcile, emotional
  weather, dormant, evolution, life-areas, self-check, constellations), Soumaya (ops console
  + Fleet section + undertaking progress card), Inbox (notification log), Progress
  (Codex + Awards chips + Hangar link), Hangar (cosmetics).
- **ChatDock** (💬 FAB) — the only real chat: cited GraphRAG answers, her blinking **eye**
  avatar (`SoumayaEye`, mood-colored), mic, voice readback, save-as-memory, 🎭 in-chat
  Companion controls, end-of-chat distill proposals, applied-role/doc chips.
- **IngestPanel** (📝), **SearchBox** (🔍), **SettingsPanel** (⚙️: account, voice, sounds),
  **HelpPanel** (searchable manual), **Legend** (🗺️ visual key, auto-shows once/brain),
  **CompanionPanel** (About-Me / roles + templates / knowledge docs), **Toasts**,
  **NotificationsBar** (alert chips), **ObjectLoreCard** (ship/station/beacon focus lore).

**Navigation.** FAB cluster (search, legend, help, dock, recenter, zoom ±, ingest,
observatory, flashback); dock tab row; back-button within Details.

**HUD.** Memory count · LLM status · fuel chip (with earn/spend pops) · streak flame ·
**self-insight pill** (foresight/newest belief → Insights) · install-PWA · switch-brain.

**Camera / controls.** OrbitControls (rotate/pan/pinch-zoom); on-screen zoom ± + recenter
FABs; fly-to on focus; follow modes (ship/station/beacon/visitor/figurine); cockpit vs orbit
follow; "isolate system" cluster view; initial galaxy framing.

**Animations.** Cinematic fly-in; idle synapse shimmer; link flares on tend; particle
bursts; body growth/tier-up toasts; the eye (blink/dilate/think-drift); fuel pops.

**Sound.** Procedural Web-Audio SFX kit (`sfx.ts`: tap/select/notify/achievement/delete/
welcome/dock, with music-ducking); ambient music loop (`audio.ts`, `ambient-loop.mp3`);
real recorded ship engine (`engineAudio.ts`, start mp3 → loop wav, focus-gated, honors SFX
volume). Browser voice readback (`voice.ts`, SpeechSynthesis).

**Accessibility.** `prefers-reduced-motion` respected (SFX + eye animation); aria-labels on
FABs/tabs/dialogs; keyboard: Enter-to-send (Shift+Enter newline). No full keyboard-nav map.

---

## 7. Visual Systems

- **Lighting:** central Sun `PointLight`; PMREM environment map from the scene; ambient scene
  light. **Bloom:** `UnrealBloomPass` (strength 0.35, radius 0.5, threshold 0.7); focus-dim
  ramps strength; removed+disposed on teardown.
- **Particles:** starfield (6500), nebulae, comets, asteroid-belt rings, pooled collision
  bursts, link directional "info" particles, engine plume puffs.
- **Trails:** ship engine plume + selectable Hangar exhaust trails (blue/neon/gold/purple).
- **Glows:** radial-gradient glow sprites on bodies/beacons/sun/station; link flare (bright
  wide tube → bloom).
- **Shaders:** `makeStarMaterial`, `makePlanetMaterial` (ShaderMaterial with `uBrightness`).
- **Post-processing:** the react-force-graph composer + bloom.
- **Skyboxes / background:** procedural space-background texture, `nebula-skybox.glb`,
  distant galaxies, background constellation line art.
- **Emotion palette (single source, `shared` `EMOTION_COLORS` / theme `EMOTION_RGB`):** gold
  joyful / indigo heavy / green neutral — links, particles, beacon beams, the chat eye.

---

## 8. Interaction Systems

- **Clicking:** select/focus a body (camera fly-to + Details); tap ship/station/beacon/
  visitor/figurine to focus/follow; tap HUD pills/chips; tap dock tabs/FABs; citation pills
  fly to a memory; belief/discovery cards fly to their node.
- **Hovering:** dims non-neighbor bodies (shader `uBrightness` path).
- **Dragging:** OrbitControls camera drag; **Soumaya** drags new memories to their slot and
  deletions to the Sun. User node-dragging / multi-select / marquee: **NOT implemented.**
- **Context menus:** **NOT implemented** (actions live in the Details panel).
- **Camera movement / zoom:** rotate/pan/pinch + zoom ± FABs + recenter + follow modes.
- **Keyboard shortcuts:** Enter-to-send in chat/ingest; no global shortcut system.
- **Voice:** mic speech-to-text (continuous, ~2.8s silence auto-send, no premature cutoff);
  browser voice readback with mood prosody. Cloud TTS / full-duplex voice: **NOT implemented.**
- **Gestures:** pinch-zoom via OrbitControls; no custom gesture recognizer.

---

## 9. Data Model

**Storage:** one SQLite database (better-sqlite3) with WAL, `sqlite-vec` loaded. Relational
schema is bootstrapped in raw SQL (`db/client.ts`) and mirrored by a Drizzle schema
(`db/schema.ts`, 9 tables typed). Additive idempotent migrations in `migrateSchema`.

**Multi-tenancy:** every per-user table carries `space_id` (default `'legacy'`); `settings`
is deployment-global. The first account claims all legacy rows.

**Tables (relational):**
- `nodes` — id, space_id, label, celestial_title, type, content, emotional_weight, importance,
  color, origin, agent, deleted_at, merged_into, kind, expires_at, last_tended_at, occurred_at,
  remind_at, tags(JSON), research_questions(JSON), research_answers(JSON), created_at.
- `edges` — id, space_id, source, target, relationship, weight, created_at. Indexed
  source/target/space.
- `insights` — id, space_id, node_a, node_b, text, score, kind('synthesis'|'contradiction'),
  created_at.
- `agent_logs` — id, space_id, agent, action, description, targets(JSON), result(JSON
  rationale), created_at.
- `settings` — key, value (GLOBAL: usage counters, budget, legacy research flag).
- `daily_logs` — id, space_id, content, date, created_at (Captain's Log).
- `spaces` — id (128-bit token = bearer key), name, gamer_tag(unique), passcode_hash,
  passcode_salt, created_at.
- `space_meta` — space_id, fuel, streak, streak_best, last_active_date, last_seen_at,
  research_enabled, last_dream_date, updated_at.
- `lore` — id, space_id, subject_type(memory|ship|station|beacon), subject_id, version, text,
  trigger, created_at (append-only versioned Chronicle).
- `telegram_links` — chat_id, space_id, space_name, last_digest_date, created_at.
- `instruction_profiles` — id, space_id, name, body, enabled, mode(always|auto), priority.
- `knowledge_docs` / `knowledge_chunks` — Companion RAG documents + chunks.
- `attachments` — id, space_id, node_id, filename, mime, size, data(base64), created_at.
- `codex_claims` — space_id, reward_key (one-time fuel reward ledger).
- `daily_contact` — space_id, date, payload(JSON), answered (her daily question).
- `undertakings` — id, space_id, kind, title, total, done, status, started_at, ends_at.
- `user_persona` — space_id, body, updated_at (auto-derived About-Me).
- `visitor_stats` — space_id, node_id, visitor_type, visits, last_at.

**Vector tables (vec0, cosine, 384-dim):** `vec_nodes` (memory embeddings, joined by node id),
`vec_docs` (knowledge chunk embeddings), `vec_profiles` (instruction-profile embeddings).

**Full-text:** `nodes_fts` (FTS5, rowid = node id, mirrors label+content).

**Repositories (`repositories/*.repo.ts`):** NodesRepo, EdgesRepo, InsightsRepo,
InstructionProfilesRepo, KnowledgeRepo/UserPersonaRepo, AttachmentsRepo, VisitorsRepo — each
space-scoped; services compose repos; routes stay thin (validate → delegate → json).

**Shared domain types (`packages/shared`):** GraphNode, GraphEdge, GraphData, NodeType,
RelationshipType, CelestialClass, ChatResponse/ChatMood, DailyDigest/DailyLog, Fuel, Streak,
LoreEntry, EmotionalTone/Mood, zod ExtractionResult schemas, celestial mechanics + palettes.

---

## 10. Background Systems

- **Embeddings:** MiniLM warmed at boot (`embeddings/warm.ts`); every node embed written to
  `vec_nodes` on create/merge/research-expand.
- **Indexing:** FTS5 kept in sync explicitly on node create/update/delete + idempotent boot
  backfill.
- **Search:** hybrid RRF (see §3/§4).
- **Scheduling:** 24/7 autonomy loop (5 min); action-expiry heartbeat (15 min) + sweep (60s);
  Telegram digest sweep (hourly).
- **Notifications:** in-app toasts + persistent Inbox log (localStorage) + NotificationsBar
  alert chips; Telegram proactive daily digest (carries her daily question). Web push:
  **NOT implemented.**
- **Backups:** SQLite persists on a Fly volume (`/data`); user-facing Markdown export (single
  note / folder / whole brain) in the Browse "Folders" view. Automated DB backup/restore:
  **NOT implemented.**
- **Analytics:** LLM USD usage/budget meter (`usage.ts`, per-token pricing incl. Gemini +
  OpenAI). Product analytics / telemetry pipeline: **NOT implemented.**
- **Synchronization:** offline ingest queue (localStorage) flushes on reconnect; PWA service
  worker with per-build cache id (`stamp-sw`) + `no-cache` shell so deploys reach installed
  PWAs. No cross-device real-time sync (single server, single DB).

---

## 11. Features Already Implemented

- Natural-language ingest → typed node + edge extraction (LLM or heuristic).
- Associative auto-linking (embedding similarity + LLM validation).
- 3D memory galaxy: kinematic orbits, celestial mass model, 7 body classes, rings,
  asteroid belts, shaders, bloom, starfield/nebulae/comets/galaxies/skybox.
- The Sun core; constellation hubs; belief bodies; deep-space megastructure figurines.
- Soumaya autonomous agent (browser + 24/7 server), 9 job types, explainable rationale,
  Research-Mode/budget/fuel gating, idempotency + dedupe.
- Fleet: ship, station, Aura beacons, Scout, Defender, visitors (logic; some procedural-only).
- Hybrid retrieval (vector + BM25 RRF); multi-hop GraphRAG chat with citations.
- Chat companion: conversation memory, emotional register/mood, interview instinct (rate-
  limited askBack), human back-and-forth (temp 0.85, anti-template prompt), blinking eye
  avatar, mic (no cutoff), voice readback, save-as-memory, end-of-chat distill.
- Custom instructions (roles, always/auto, selective adoption + reporting, showcase
  templates incl. a real in-chat IQ test) + knowledge-doc RAG (relevance-gated) + auto-
  derived persona + behavioral read + soul.md identity.
- Level-2 intelligence: **dream-cycle beliefs**, **foresight** (recurring-pattern warnings),
  **undertakings** (5-day autonomy arcs), constellation reconciliation.
- Daily Contact (she initiates a daily question that feeds the brain), Night Replay,
  live event bridge, away-digest, Captain's Log, emotional weather, dormant, evolution
  chains, life-areas, self-review, contradiction scan + reconcile.
- Entropy/decay + beacon warming; memory merging; tend; reminders + action items with TTL.
- Gamification: Fuel economy, daily streak, Pilot Rank, achievements, the **Codex** (living
  atlas with unlock/level + one-time fuel), Hangar cosmetics, Galaxy Reader/legend fluency.
- Living **Legend** visual key (derived from constants, can't drift); inline "why this size";
  ambient self-insight HUD pill.
- Multi-tenant private brains (name + passcode, scrypt); Telegram bridge (chat + /log +
  proactive digest); attachments; Markdown export; PWA + offline queue; security batch
  (metered Gemini spend, fail-closed admin, per-space research flag, sanitized errors, auth
  rate limit, precondition re-validation).
- Test suite: 164 tests (28 files), typecheck clean, web build clean.

---

## 12. Features Partially Implemented

- **Scout / Defender / Visitors visuals** — logic done; **procedural placeholders only**;
  remaining: user-supplied `defense-ship.glb`, `visitor-*.glb` + GLB swap wiring.
- **Voice** — browser STT + SpeechSynthesis readback done; remaining: cloud TTS / full-
  duplex conversational voice (design only).
- **Reminders** — surfaced (Agenda "due now" + alert chip + digest + acknowledge) but there
  is **no real-time push at the exact minute**; only pull surfaces + hourly Telegram.
- **Gamification durability** — several achievements read localStorage stats (travel_hops,
  beacons_deployed, memories_tended, types_seen), so those re-lock on a new device; remaining:
  move stats server-side.
- **Lore for craft** — server lore subjects exist for ship/station/beacon but only memory
  lore auto-evolves; craft focus cards recompute client-side instead.

---

## 13. Planned Features (roadmap)

- **Level 3 (product):** onboarding funnel, landing page, per-user API keys / paid tier,
  automated backups + restore, CI restoration.
- **Level 1 presence (deferred):** true web push, cloud voice conversations, share-sheet /
  email-forward capture, richer Telegram (voice notes both ways).
- **Embedding-model upgrade** (MiniLM → larger) — needs image rebuild + full re-embed + vec
  dim migration; its own project.
- **`InstancedMesh` renderer rewrite** (`phase-1-density-core.md`) — spec committed, hold
  until real devices drop below ~50fps.
- **Behavioral persona deepening** beyond the current read; LLM reranking of hybrid results.
- Codex-unlockable cosmetics; streak milestones (7/30/100-day); belief "Chronicler" gamified.

---

## 14. Current Technical Stack

- **Frontend:** React 19, Vite 7, TypeScript 6; `react-force-graph-3d` 1.29 + `three` 0.182;
  `pdfjs-dist` + `mammoth` (client doc→text extraction). PWA (manifest + service worker).
- **Backend:** Node (ESM) + Express 5, run via `tsx` (no build step for server); `zod` 4
  validation; `drizzle-orm` 0.45 (+ drizzle-kit for migration generation).
- **Database:** SQLite via `better-sqlite3` 12 + `sqlite-vec` 0.1.9 (vec0 virtual tables) +
  FTS5. Persisted on a Fly volume at `/data`.
- **Rendering engine:** Three.js (WebGL) through react-force-graph-3d; UnrealBloomPass; DRACO
  decoder (`public/draco`) for GLBs.
- **AI models:** Embeddings `Xenova/all-MiniLM-L6-v2` (384-dim, transformers.js) → hash
  fallback. LLM Gemini `gemini-2.5-flash` (`@google/genai`) / OpenAI `gpt-4o-mini` (fetch)
  → heuristic fallback. OpenAI takes precedence when both keys present.
- **APIs:** REST under `/api/*` (see §5 mounts); Telegram Bot webhook.
- **Storage:** SQLite (relational + vector + FTS); base64 attachment blobs in-DB; browser
  localStorage (client prefs, offline queue, gamification stats, chat history).
- **Authentication:** lightweight per-space name + gamer-tag + passcode; scrypt-hashed;
  the random space id is the client bearer key (`x-space-id` header), `requireSpace`
  middleware; optional `ADMIN_TOKEN` for budget mutation (fail-closed); auth rate-limited.
- **Deployment:** single Fly.io container (`Dockerfile` builds web, bakes the MiniLM model,
  Express serves API + static web via `WEB_DIR`). GitHub Actions blocked on the account;
  the working path is a manual `fly deploy --remote-only`. Env: `LLM_PROVIDER`/`GEMINI_API_KEY`
  /`OPENAI_API_KEY`, `ADMIN_TOKEN`, `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET`/`PUBLIC_URL`,
  `AUTONOMY`, `RESEARCH`/budget, `EMBED_DIM`/`EMBED_MODEL`.

---

## 15. Current Folder Structure (source)

```
packages/
  shared/src/         index.ts · types.ts · schema.ts · celestial.ts · dramatize.ts
  server/src/
    index.ts · context.ts · identity.ts · economy.ts · streak.ts · usage.ts · seed.ts
    api/server.ts · api/middleware.ts
    api/routes/       ingest graph nodes search digest chat maintenance constellations
                      lore instructions documents persona visitors contact space telegram usage
    auth/spaces.ts
    chat/graphrag.ts
    db/               client.ts schema.ts vec.ts fts.ts
    embeddings/       adapter.ts local.ts hash.ts warm.ts
    llm/              adapter.ts gemini.ts openai.ts heuristic.ts resilient.ts prompts.ts
    ingestion/        pipeline.ts associativeLink.ts
    knowledge/ingest.ts
    graph/            service.ts traversal.ts
    maintenance/      agent.ts researchPriority.ts
    synthesis/        engine.ts contradictions.ts dailyDigest.ts
    analysis/         awayDigest constellationReconcile dailyContact dormant dreamCycle
                      emotional foresight lifeAreas selfReview temporalChains undertakings
    persona/          derive.ts behavior.ts
    lore/engine.ts
    ml/cluster.ts
    telegram/         bot.ts links.ts
    repositories/     nodes edges insights instructions knowledge attachments visitors (.repo.ts)
    __tests__/        (28 vitest files)
  web/
    src/App.tsx · main.tsx · voice.ts
    src/api/client.ts
    src/components/   (RightDock, ChatDock, SoumayaEye, Observatory, NodeInspector, NodeList,
                       Browse via RightDock, SectorView, LibraryPanel, ActionsPanel, DigestPanel,
                       SoumayaPanel, FleetPanel, CompanionPanel, AchievementsPanel, HangarPanel,
                       InboxPanel, CodexPanel, Legend, HelpPanel, SettingsPanel, IngestPanel,
                       SearchBox, LoginScreen, NotificationsBar, ObjectLoreCard, Chronicle,
                       MemoryAttachments, Toasts, ErrorBoundary, achievements.ts, codex.ts,
                       quests.ts, rank.ts)
    src/graph/        Graph3D.tsx · orbits · nodeObject · shaders · sun · spaceStation ·
                      satellites · visitors · subAgents · soumaya · effects · bloom · skybox ·
                      starfield · fleet · gltf · lore · objectLore · theme · audio · engineAudio ·
                      sfx · demoGalaxy
    src/hooks/useCountUp.ts · src/lib/extractFileText.ts · src/types/shims.d.ts
    public/           *.glb (9 models) · draco/ · ambient-loop.mp3 · ship-engine-* · sw.js ·
                      manifest.webmanifest · icons
docs/                 AI_ENGINEERING_WORKFLOW · SECOND_BRAIN_BRIEFING · SECOND_BRAIN_ALIGNMENT ·
                      LEVEL2_INTELLIGENCE · PROJECT_AUDIT_2026-07* · PROMISES_VERIFIED ·
                      TECHNICAL_INVENTORY (this file)
CLAUDE.md · GEMINI_CHANGES.md · AGENTS.md · WORKFLOW.md · TASKS.md · Dockerfile · .mcp.json
```

---

## 16. Missing Systems / Gaps / Placeholders

- **Real-time notifications:** no web push; reminders are pull + hourly Telegram only.
- **Cloud voice / TTS:** only browser SpeechSynthesis + STT.
- **Server-side gamification stats:** travel_hops/beacons_deployed/memories_tended/types_seen
  live in localStorage → re-lock on a new device; codex "seen" + achievements largely local.
- **3D assets:** `defense-ship.glb`, `visitor-*.glb` not provided (procedural placeholders).
- **CI:** no working pipeline (GitHub Actions blocked on account).
- **Backups/restore:** relies on the Fly volume; only user Markdown export exists.
- **Product analytics:** none (only the LLM $ usage meter).
- **Collaboration / sharing / cross-device sync:** none (single DB, single user per brain).
- **User graph manipulation:** no node-drag, multi-select, marquee, or context menus.
- **Instance rendering:** density rewrite is spec-only; very large galaxies may strain mobile.
- **`AppContext` had a dead `graph` field (removed); `merged_into` written but no recover-merge
  UI. Heuristic chat ignores conversation history (offline is a simpler fallback).**
- **Deploy is manual** (`fly deploy --remote-only`); pushing does not ship.

---

## 17. Current State Summary

Today the app is a **fully working, deployable single-container product**. With no API key it
runs entirely offline (hash embeddings + heuristic LLM): you can capture thoughts, watch them
become typed, auto-linked celestial bodies in a live 3D galaxy, browse/search/export them,
get a daily digest, and a capable-but-limited chat. With a Gemini or OpenAI key it becomes
genuinely intelligent: LLM extraction, cited GraphRAG chat that talks like a human and knows
you, an autonomous companion that researches/merges/consolidates in the background, beliefs
distilled from your clusters, pattern foresight, multi-day undertakings, and a daily ritual
where she reaches out first. It is multi-tenant, secure (metered spend, fail-closed admin,
scoped data), gamified, Telegram-connected, installable as a PWA, and gate-green with 164
tests. The main things it is NOT yet: real-time push, cloud voice, device-independent
progression, automated backups, CI, and a public onboarding/landing funnel.

---

## ARCHITECT HANDOFF

**Repo shape.** npm-workspaces monorepo, 3 packages: `shared` (domain types + zod + celestial
mechanics — single source of truth, imported by both sides), `server` (Express 5 + better-
sqlite3 + sqlite-vec + FTS5, run directly via `tsx`, no build), `web` (Vite + React 19 +
react-force-graph-3d/Three.js). Branch: `claude/soumaya-second-brain-v1-m4z4hc`. Gate:
`npm run typecheck && npm test && npm run build -w @brain/web` — keep green.

**Mental model.** A memory = a `nodes` row with an embedding (`vec_nodes`) and an FTS row
(`nodes_fts`). `type` is the taxonomy; `kind` is the structural role (memory/action/moc/
belief). Physics (`degree`, `mass`, `celestial`, `entropy`) are **enriched on read** by
`GraphService`, never stored. The galaxy renders that enriched data; orbits are kinematic
(pinned each frame), not a force sim.

**Provider seams are the golden rule.** `llm/adapter.ts` and `embeddings/adapter.ts` are
interfaces with a mandatory offline fallback (`HeuristicProvider`, `HashEmbeddingProvider`).
`ResilientLlmProvider` wraps cloud providers for timeout/degrade/budget. Never make a feature
hard-depend on a key. OpenAI is preferred when both keys are present. Chat runs hot (0.85);
structured jobs cold (0.2).

**Where logic lives.** Routes are thin (`api/routes/*`, validate→delegate→json). Repos own SQL
(`repositories/*.repo.ts`), space-scoped, `spaceId` defaults to `DEFAULT_SPACE`. The one agent
brain is `maintenance/agent.ts` (used by both the browser loop and the 24/7 `index.ts` loop);
all gating (Research Mode per-space + USD budget + Fuel + idempotency) lives there. Chat is
`chat/graphrag.ts` (hybrid seeds → neighborhood → layered prompt → `llm.answer`). Analysis
modules (`analysis/*`) are deterministic + offline-safe.

**To add a feature safely:** (1) if it's a data table, add it to BOTH the `db/client.ts`
bootstrap AND `migrateSchema` (additive/idempotent — a deploy must never crash boot on a
populated Fly volume; covered by `migration.test.ts`), scope it by `space_id`, and mirror it
in `db/schema.ts` if you want typed access; (2) new node embeddings must call
`upsertEmbedding` + `ftsUpsert` at every create/content-update site; (3) new colors that both
server and web use go in `shared` (`SPECIAL_COLORS`/`EMOTION_COLORS`) so the Legend can't
drift; (4) any user-facing feature gets a Help entry (house rule); (5) write a test and keep
the gate green; (6) LLM-backed work must gate on Research Mode + budget and count toward the
per-tick paid ceiling.

**Gotchas.** `EdgesRepo.exists` is directional. Hash-embedding cosines run low → thresholds
that must work offline are provider-aware. Deploy is manual (`fly deploy --remote-only` via
the user's Fly token — this sandbox has no flyctl); pushing does not ship. Set `ADMIN_TOKEN`
and the three Telegram env vars in production or those features stay off. Gamification stats
in localStorage re-lock on new devices (known debt). Procedural craft render until user GLBs
are supplied.

**Highest-leverage next work.** Move gamification stats + codex/achievement state server-side;
web push for reminders + the daily question; cloud voice conversations (mood/tone/mic already
exist); then Level 3 (onboarding, per-user keys, backups, landing, CI). The intelligence
depth (beliefs/foresight/behavioral read) scales with a live Gemini/OpenAI key.
