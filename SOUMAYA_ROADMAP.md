# Soumaya System Roadmap & Gaps

This document tracks identified architectural gaps, technical debt, and proposed improvements for the Soumaya Autonomous Agent. This is a living document for **Claude (Lead Engineer)** and **Gemini** to coordinate on system evolution.

## 🚩 Critical Gaps

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
- [ ] **24/7 server-side autonomy** (Phase C) — spec'd; needs Fly always-on + cost sign-off.
- [ ] **Evolving, persistent, world-aware lore** with version history — spec'd (needs schema).
- [ ] **Autonomous beacon dispatch by the ship** + a Fleet menu + sub-agents (Scout/etc).
- [ ] **Mature demo galaxy** showcasing the Obsidian-style macro view.
- [ ] **Action Items list** view (uses existing `kind:"action"` + `remind_at`).

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
