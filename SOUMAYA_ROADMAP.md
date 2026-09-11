# Soumaya System Roadmap & Gaps

This document tracks identified architectural gaps, technical debt, and proposed improvements for the Soumaya Autonomous Agent. This is a living document for **Claude (Lead Engineer)** and **Gemini** to coordinate on system evolution.

## 🚩 Critical Gaps

### 0. Graph Read Reliability and Render Budget (2026-09-11)
- [~] **Graph-read safety:** HTTP/malformed graph responses now surface recovery UI rather
  than replacing the galaxy with an empty state; concurrent client refreshes are
  sequence-protected. Remaining: add browser-level regression coverage.
- [~] **Multi-tenant graph query cost:** degree aggregation is now `space_id` scoped.
  Remaining: add/query-plan composite indexes and profile at production cardinality.
- [ ] **Effective render-rate cap:** Graph3D caps its own work but the underlying
  force-graph render loop still needs explicit render-rate control on mobile.
- [ ] **Autonomy fairness:** the server-side autonomy loop processes every space serially;
  persist fair scheduling and bound per-tick work as tenant count grows.

### 1. Frontend Execution Dependency
- **Issue:** Soumaya only operates when the web client is open. Background maintenance stops when the browser is closed.
- **Proposed Fix:** Migrate job fetching and execution logic to a server-side background worker (e.g., a simple `setInterval` or `node-cron` in the server workspace) so the brain evolves 24/7.

### 2. Physical/Visual Desync
- **Issue:** For multi-node jobs (Merge, Synthesis), the ship only visits one node. The other node just "disappears" or "appears" without visual interaction.
- **Proposed Fix:** Update `soumaya.ts` to support multi-point flight paths for complex jobs (e.g., Fly to A -> "Beam Up" -> Fly to B -> "Fuse").

### 3. Destructive Merging (No Safety Net)
- **Issue:** Memory fusions permanently delete the redundant node. Hallucinations could cause data loss.
- **Proposed Fix:** Implement a `deleted_at` soft-delete column or a `merged_into_id` reference in the `nodes` table instead of hard deletion.

### 4. Performance Bottleneck (Full Scans)
- **Issue:** `/next-job` performs a full table scan and KNN for every node to find redundancy.
- **Proposed Fix:** Add a `last_maintained_at` timestamp. Only scan nodes added or modified since the last patrol.

### 5. Interaction Gap
- **Issue:** Users cannot "ping" Soumaya to prioritize a specific node for research.
- **Proposed Fix:** Add a "Request Maintenance" button in the Node Inspector UI that pushes a high-priority job to the queue.

## 🛠️ Planned Improvements (Gemini's Task List)

- [x] **Background Evolution:** Implement a basic server-side heartbeat for Soumaya to handle non-visual maintenance (e.g., pruning, calibration) while offline.
- [x] **Soft-Delete Safety:** Update `maintenanceRoutes.ts` to move merged nodes to a "tombstone" state instead of calling `repo.delete()`.
- [x] **Multi-Stop Flight:** Enhance the frontend ship logic to visit all `targets` in a job sequence.
- [~] **Research Prioritization:** Partially addressed — a free `POST /api/nodes/:id/tend`
  lets the client "touch" a memory (resets entropy) on focus; a true high-priority
  job-queue endpoint is still open.
- [ ] **Daily Log Onboarding:** Lower the node count threshold (currently 5) or add a "Genesis Log" for new users so the UI doesn't look empty.
- [ ] **Latency Feedback:** Add a "Writing..." state to nodes in the 3D scene while the LLM is processing research/synthesis to prevent "pop-in" desync.
- [ ] **Multi-Agent Registry:** Implement the logic to support multiple ships/agents (Librarian, Scout, etc.) using the existing `agent` column.

## 🌌 Celestial Economy & Companions (Claude, 2026-06-17)
- [x] **Fuel economy:** earned by tending (ingest/links/clearing actions), spent by
  Soumaya only on discretionary expansion (research + sector_vibe); core duties stay
  free so her purpose never stalls. USD budget remains the hard cap. (`economy.ts`)
- [x] **Entropy:** memories cool when neglected (`last_tended_at` → `entropy`),
  visible as dimming/cold-shift + a "going cold" digest list; tending warms them.
  Autonomous synthesis/research/sector_vibe now also tend their nodes (consistency).
- [x] **Voice + dramatization filter:** offline TTS whose prosody follows the
  conversation's emotional tone (`shared/dramatize.ts`, `web/src/voice.ts`).
- [x] **Aura-class Beacons:** satellite fleet that beams memories going cold (always
  ≥1 on patrol); drifters fear/flee them; own evolving lore. (`graph/satellites.ts`)
- [x] **Offline emotion:** the heuristic provider now sets `emotionalWeight` from
  wording, so color/harmonization/visitors/voice all work with no API key.

## 🛰️ Phase 4 — Living Galaxy (Claude, 2026-06-18) — see `plans/phase-4-living-galaxy.md`
- [x] **Installable PWA:** manifest + service worker + generated icons → Add-to-Home-Screen
  on Android/iOS, standalone launch, offline shell (`/api` never cached).
- [x] **Music crackle fixed:** `latencyHint:"playback"` + brick-wall limiter + tamed
  feedback loop + fewer oscillators (mobile underruns/clipping were the cause).
- [x] **Beacons:** beam color now follows the memory's emotion; when nothing is cold a
  beacon stands sentinel over the heaviest hub (guard mode) instead of idling.
- [x] **Lore card overlap fixed:** re-anchored so the right-hand FAB rail never covers it.
- [x] **Help:** added a "How the world works" mechanics/understanding section.
- [x] **24/7 server-side autonomy** (Phase C): `maintenance/agent.ts` (`selectJob` +
  `executeJob`) shared by the route + a server loop in `index.ts` (`AUTONOMY=on`,
  every 5 min), gated by Research Mode + USD budget + Fuel; `fly.toml auto_stop='off'`.
  Resolves Critical Gap #1 (Frontend Execution Dependency).
- [x] **Evolving, persistent, world-aware lore** with version history (v1): `lore` table +
  `lore/engine.ts` (heuristic chronicler) + Chronicle UI + autonomous growth in the loop.
  Follow-up: LLM-authored prose layer.
- [x] **Fleet & sub-agents** (v1): Scout + Defender sub-agents (`graph/subAgents.ts`),
  a 🚀 Fleet roster Dock tab with live status (`FleetPanel` + `graph/fleet.ts` +
  `Graph3D.getFleetStatus`). Follow-ups: literal ship→beacon dispatch animation, wire
  live drifter positions into Defender intercept, sub-agents running real jobs.
- [x] **Mature demo galaxy** (~140 nodes, dense systems + cold outer field) showcasing
  the Obsidian-style macro view.
- [x] **Action Items list** (✅ Agenda Dock tab: actions w/ countdowns + Done, plus
  upcoming reminders from `remind_at`).

## 🤖 AI Companion Architecture (Claude, 2026-06-18) — see `plans/phase-4-living-galaxy.md`
- [x] **Dual-layer prompts:** core identity (Layer 1) + stackable custom instruction profiles
  (Layer 2), with **intent routing** for `auto` profiles (semantic match via `vec_profiles`).
- [x] **"About Me" persona awareness:** she's aware of who you are (chat + daily log), never becomes you.
- [x] **Knowledge documents (RAG):** text/MD upload → chunk → embed (`vec_docs`) → retrieved in chat.
- [x] One **🧠 Companion** dock tab (About Me / Custom Instructions / Knowledge).
- [x] **"About Me" is auto-derived, not user-editable** (`persona/derive.ts`): synthesized from
  the brain (themes/emotion/hubs/span), refreshed on read + in the autonomy loop.
- [x] **Visitor activity tracking:** `visitor_stats` + `VisitorsRepo` + `/api/visitors`;
  craft arrivals reported from the scene; "👽 Most visited" in the Fleet tab.
- [→] **Master backlog** now lives in `plans/beta-testing-checklist.md` (canonical; append there).
- [ ] Deferred: PDF/DOCX parsing, profile↔document linking, behavioral "Knows Me" auto-persona,
  structured clickable doc citations, role-profiles applied to all autonomous jobs.

## 📝 Change Log (Claude & Gemini)
*Track major architectural shifts and commit SHAs here.*

- **2026-06-16:** Initial roadmap established by Gemini. Identified 8 major gaps.
- **2026-06-16:** **Gemini implemented:** Soft-Delete Safety, Background Heartbeat, and Multi-Stop Navigation (`52f0cd0`).
- **2026-06-17:** **Claude — Celestial Economy:** fuel + entropy, `last_tended_at`
  column + `space_meta` table (additive migrations); vec0 `upsertEmbedding` bugfix
  (research/merging had been 500ing) (`9153d12`, `2226e33`).
- **2026-06-17:** **Claude — companions & voice:** Aura beacons (`9afce64`,
  `b95e4b1`, `e248c2e`), TTS dramatization, focus speed-dial.
- **2026-06-17:** **Claude — audit pass:** autonomous jobs now tend their nodes,
  beam NaN guard, offline `emotionalWeight`, beacon lore-card auto-close; docs synced.
- **2026-08-08:** **Gemini — Memory list chronological defaults + full date formatting & tooltips + robust test environment fix:** fixed `localStorage` undefined bug under happy-dom in vitest, defaulted Memory browse list sorting to `"recent"` and enabled `"timeline"` grouping by default, and displayed full date strings with relative tooltips inside `<abbr>` tags for rows.
- **2026-08-08:** **Gemini — Open Card Details Tab Mobile Scrollability & Layout Fix:** styled `.dock-body` as a flexbox with `min-height: 0` and `flex: 1` in `packages/web/src/index.css`, tracked reactive `isMobile` screen sizes, and wrapped Chronicle, MemoryAttachments, and research questions in `<details className="dock-section">` collapsible containers to prevent card overflows on mobile screens.
- **2026-08-08:** **Gemini — Interactive Alive Tags with Count Clouds & Hover Glows:** lifted `selectedTag` state into `RightDock.tsx`, made tags in `NodeInspector.tsx` clickable to transition users into the Browse tab, added relative font-size cloud scaling and tag frequency counts inside `NodeList.tsx` along with hover transitions, CSS pulse keyframe animations, and automated unit test suite verification.
- **2026-08-08:** **Gemini — Timeline 3D Scene Adaptive Performance Optimizations:** optimized WebGL capability scoring in `graphicsConfig.ts` to flag 4GB/8-core phones as `"performance"` tier, and refactored `TimelineView.tsx` to read graphics settings dynamically—skipping anti-aliasing on low-tier screens, scaling down river drift packets, and reducing WebGL geometry subdivisions for shapes and segments by up to 6x, and throttling scale-twinkles to maximize mobile performance.
- **2026-08-08:** **Gemini — Performance Override Persistence & Time/Location Alive Feel (Bug 5):** updated `resolveGraphics()` inside `graphicsConfig.ts` to respect user's manual mode setting for the `tier` property, implemented a monospace ambient Sci-Fi status strip in `RightDock.tsx` displaying current greetings and spaceport orbital coordinates updating every 30s, and surfaced daily added memories and upcoming 24h reminders inside a sticky today strip at the top of the Browse tab in `NodeList.tsx`.
- **2026-08-08:** **Gemini — DigestPanel API Concurrency & Loading Shimmer Skeletons (Bug 6):** optimized the Insights tab (`DigestPanel.tsx`) loading lifecycle on mount by parallelizing all 10 synchronous API fetches into a single `Promise.all` call, implementing inline `.catch()` fallback protection, designing a matching shimmer pulse skeleton loading UI with CSS animations in `packages/web/src/index.css`, and verifying correctness with custom Vitest smoke/unit tests.
