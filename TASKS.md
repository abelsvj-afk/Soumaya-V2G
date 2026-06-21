# Soumaya Task Board

Last audited: 2026-06-20. Tracks all open work, each item tagged with its zone and current state.

**Zone key:**
- 🟢 Green — `agy` can build freely
- 🔴 Red — Claude only (shared types, DB schema, provider seams, route contracts, multi-tenancy)
- 🟡 Both — split across the boundary; coordinate before starting

**Status key:** `[ ]` open · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Autonomy & Agent Hardening

- [ ] 🔴 **Performance fix: `last_maintained_at` filter in `/next-job`** — Critical Gap #4, never resolved. Every maintenance cycle does a full table scan. Fix belongs in the maintenance repo SQL query.
- [ ] 🔴 **Job claiming / idempotency (`claimed_at` lock)** — prevent double-execution when server loop + browser tab both run. Requires new nullable column in `db/schema.ts` → `migrateSchema` additive migration.
- [ ] 🔴 **LLM planning agent: replace fixed job-selection ladder** — swap the if/else chain in `maintenance/agent.ts` with a tools-based LLM planner; keep the deterministic ladder as a fallback. Touches LlmProvider seam.
- [ ] 🟡 **Sub-agents running real maintenance jobs** — Scout sub-agent should feed Research Mode targets via the `agent` column on nodes. The `agent` column wiring is Red; visual subagent loop update in `graph/subAgents` is Green.
- [ ] 🟡 **Request-Maintenance high-priority queue** — `POST /api/nodes/:id/tend` is partial. Route contract / priority field = Red; UI trigger button = Green.
- [ ] 🟡 **Surface `remind_at` reminders in daily digest + Telegram** — `DailyDigest` service touch = Red-ish; Telegram message formatting = Green. Noted in GEMINI_CHANGES.md as a known follow-up.

---

## Fleet & Visitor Visuals

- [ ] 🟡 **Defender sub-agent 3D model (`defense-ship.glb`)** — logic exists, no visual. Asset must be provided by user; wiring into `graph/subAgents` procedural fallback → GLB swap is Green.
- [ ] 🟡 **Visitor craft models (`visitor-traveler.glb` / `visitor-wanderer.glb`)** — procedural saucers are placeholders. Asset = user provides; GLB loader swap = Green.
- [x] 🟢 **Literal beacon dispatch animation** — Soumaya flies to position and releases a beacon visually. Pure `graph/soumaya.ts` animation work, no backend touch.
- [x] 🟢 **Defender live drifter intercept** — wire real visitor positions from `visitors.ts` into `subAgents.update` so the Defender actually flies to intercept drifters. `graph/subAgents` only.
- [ ] 🟡 **Formalize alien attraction scoring function** — `visitors.ts` scoring logic (emotional intensity, rarity, mass, degree, recency, revisit frequency). Server service = Red-adjacent; visual feedback on hover / in List = Green.

---

## Memory & UX

- [x] 🟢 **"Writing..." latency feedback on nodes during LLM processing** — show a pulsing state on a node's orb while its job is in flight. Frontend component state only.
- [x] 🟢 **Brain-like filaments at macro zoom** — neuron-like connecting filaments visible when zoomed far out. three.js / `Graph3D.tsx`, no backend.
- [x] 🟢 **Neural recall-signal animation** — fire synapse-style pulses along the path from seed node to each cited node during a chat response (`fireRecall(citationIds)` in `Graph3D.tsx`).
- [x] 🟢 **Per-memory story arcs in object lore** — space station + ship lore tied to specific memory relationships (`graph/objectLore.ts`). Explicitly Green Zone file.
- [x] 🟢 **In-app PWA Install button** — capture `beforeinstallprompt` event and show an "Install" button in the UI. Frontend only.
- [ ] 🟡 **Daily Log Onboarding / Genesis Log** — lower threshold for brand-new brains + a welcome log entry. Ingestion heuristic tweak = Red; onboarding UI screen = Green.
- [x] 🟢 **Make link curvature/opacity zoom-bias live** — `linkColor`/`linkCurvature` read `camera.position.length()`, but react-force-graph only re-evaluates link accessors on `refresh()`/data change, so the "curve more when zoomed out" bias is currently inert during a pinch/scroll. Drive it from the tick (or periodic `refresh()`) if we want it continuous. (Claude review note, 2026-06-20.)
- [x] 🟢 **Cap idle-pulse density for very large brains** — `idlePulse` scales links/frequency by node count (`floor(numNodes/10)` links, down to every 1s). Fine now; add an upper clamp before brains hit thousands of nodes so it can't flood `emitParticle`. (Claude review note, 2026-06-20.)

---

## AI Companion & Persona

- [ ] 🟡 **Behavioral "Knows Me" persona deepening** — fold conversation history + interaction patterns into the auto-derived persona (`persona/derive.ts`). Server service = Red; any UI display of persona depth = Green.
- [ ] 🔴 **LLM-authored lore prose** — optional `chronicle?` method on the `LlmProvider` seam so cloud providers can generate richer narrative lore text. Provider seam extension = Claude only.

---

## Telegram

- [ ] 🔴 **Phase D: Voice notes via cloud TTS** — OGG/MP3 replies reusing `dramatize.ts` prosody, gated behind `TELEGRAM_TTS_*` env var. Requires new provider seam extension + secrets wiring.

---

## Infrastructure

- [ ] 🟢 **Restore CI (`ci.yml`)** — typecheck → test → build, no deploy step. Template documented in `DEPLOYMENT.md`. Green Zone infra/YAML work; only unblock when GitHub Actions runners are available on this account.
- [ ] 🟡 **Richer offline ingestion queue** — queue ingests while offline, sync to server when back online. Service worker + client queue = Green; server sync endpoint = Red.
- [ ] 🟡 **PDF/DOCX parsing for knowledge docs** — server-side parser addition = Red; upload UI = Green. Currently deferred per original roadmap.

---

## Beta polish — "living neural web" feel (new, 2026-06-20, from user session)

> **Design:** [`plans/living-brain.md`](./plans/living-brain.md) — phased plan agreed with the user.
> Phase 1 (visual web, 🟢) delegated to agy; Phases 2–4 (placement/decay/fuel) led by Claude.

- [x] 🔴 **Phase 0 — slow, earned celestial growth** (Claude) — memories born as asteroids, grow
  via connections/insights/age (not instant importance); rings gas-giant-only; tiers stay distinct.
  Fixes "everything's a ringed planet in 24h." See design doc Phase 0.
- [x] 🟢 **Phase 1 — persistent glowing web + ambient firing** (agy) — legible links at distance
  (cures "connections gone = faint"), neuron-style ambient firing/cluster lights, marquee `dt`
  fix, link flicker-when-close fix, `NodeList` `demo` prop. Pure `Graph3D.tsx`/CSS. See design doc.
- [x] 🔴 **Phase 2a — Soumaya ferries & places new memories** (Claude) — new memories park at the
  waystation dock; she flies out, tows each into its live orbit slot, drops it (orbit system resumes),
  blooms it. Additive `hold/release/slotOf` seam in `orbits.ts`; `placePickup/placeCarry` modes in
  `soumaya.ts`; new-node detection in `Graph3D.tsx`. Safe fallback (releases → normal placement).
- [x] 🔴 **Phase 2b — deletion into the Sun** (Claude) — on delete, Soumaya flies to the memory's
  spot, drags a cargo replica into the Sun (clamped so she never enters), and it's consumed in a
  fiery burst + corona flare. `effects.ts` (consume pool) + `sun.ts` (flare/getRadius) +
  `soumaya.ts` (removeTravel/removeCarry + cargo) + `Graph3D.tsx` (deletion detection).
- [x] 🟡 **Phase 3 — links decay & she repairs them** (Claude) — link freshness decays with neglect
  (folded into `getLinkActivity`, so stale links fade), and a throttled scan hands the most-degraded
  visible links to Soumaya to re-forge (refreshing them via `fireLink`). Client-only (no schema);
  `Graph3D.tsx` only.
- [x] 🟡 **Phase 4 — fuel legible + slow regen** (Claude) — ⛽ fuel gauge on the main HUD with an
  earn/spend tooltip (`App.tsx`/`index.css`); lazy passive regen (~2/hr, on read) in `economy.ts`
  (RED). Visual growth (placement/web/firing/repair/deletion) stays fully ungated.
- [x] 🟢 **Confirm edges persist + return on reload** — verified: edges persist (weight ≥0.6) and
  the graph route returns them space-scoped; "gone" was faint rendering (→ Phase 1), not data loss.
- [x] 🟢 **Differentiate ＋ icons (add vs zoom)** — delegated to agy as issue #6.
- [x] 🟢 **Restore dock tab names on mobile** — delegated to agy as issue #6 (regressed by #4's wide-screen-only labels).

---

## 🎮 Gamification / Immersion (make the brain-galaxy *fun*, not just useful)

> Goal: reward returning + exploring, give Soumaya real warmth, and make growth feel earned and
> celebrated — without breaking the Obsidian-grade utility or the offline path. Sequenced quick-wins →
> deeper. Builds on systems we already have: **Fuel/economy**, **entropy** (cooling), **insights**
> (latent links), **constellations**, **daily_logs**, the **lore engine**, and **Soumaya** herself.
> Rewards are always ADDITIVE — they must never gate core utility. Keep the gate green + offline-safe.

### Wave 1 — quick wins (cheap, high delight; mostly 🟢 frontend)
- [x] 🟢 **Return greeting** — on open, Soumaya greets you by space name + references the last daily log /
  what changed while away ("Welcome back — 3 memories cooled, I found 1 new connection"). Uses
  `daily_logs` + `getGraph`. UI in `App`/`SoumayaPanel`.
- [~] 🟢 **Discovery toasts** — transient celebratory banner on notable events: "✦ New constellation: <name>",
  "Soumaya linked '<a>' ↔ '<b>'", "'<label>' grew into a planet". Diff `insights`/`constellations`/mass-tier
  on refresh; pure client.
- [x] 🟢 **Milestone bodies** — your Nth memory (10/50/100/365) gets a one-time celebration + a permanent
  badge/glow. Client-side from node count + creation order.
- [ ] 🟢 **First-run / genesis moment** — empty brain shows a warm "drop your first thought" prompt; first
  memory gets a big bloom + Soumaya's first words. (Pairs with the Daily-Log onboarding item above.)
- [ ] 🟢 **Fuel feedback** — the ⛽ HUD chip shows progress to the next "tank" + a tiny "+N" pop when you
  log/link/clear an action. (Fuel is already surfaced; add the juice.)

### Wave 2 — engagement loop (🟡 light server)
- [ ] 🟡 **Streaks** — consecutive days you tended the galaxy; streak flame + small fuel bonus to keep it.
  Counter = additive `space_meta` field (🔴 migration) + UI (🟢).
- [ ] 🟡 **Daily quests / tend list** — 1–3 concrete nudges ("warm 2 cooling memories", "review Soumaya's
  newest insight"); completing earns fuel. Built from `entropy` + `insights` (server read) + UI.
- [x] 🟢 **Achievements** — ✅ done (Wave 2). 7 qualitative feats (First Light, Synapse, Connector, Nexus,
  Star Born, Gardener, Fully Fueled) in `components/achievements.ts`; unlock-detect effect in `App.tsx`
  persists per-brain in localStorage (`brain.achv.${space.id}`), seeds silently on first eval, toasts new
  unlocks. Offline-safe, no migration. (localStorage v1; `space_meta` JSON sync is a future 🔴 upgrade.)

### Wave 3 — companion warmth + progression (🟡/🔴)
- [ ] 🔴 **Behavioral persona deepening** — Soumaya's tone adapts to your patterns/history (also under AI
  Companion). Makes her feel like she *knows* you. `persona/derive.ts`.
- [ ] 🟢 **Soumaya reactions** — she emotes to events (excited on a new link, concerned when many memories
  cool, celebratory at a milestone) via her task label / a speech bubble + the existing voice.
- [ ] 🟢 **Galaxy "rank" / level-up** — visible progression: sun grows a touch at milestones (exists,
  clamped), sectors auto-name as they densify (`celestialTitle`), a subtle brain rank (Nebula → Cluster →
  Galaxy) from size/connectivity.
- [ ] 🟢 **Cinematic intro** — on load, a brief camera flythrough that settles into the framed galaxy (now
  that framing is fixed), so opening *feels* like arriving somewhere.

### Guardrails
Offline-safe (no reward hard-requires the LLM), bounded, gate stays green. Server bits (streak/achievement
persistence) are 🔴 additive `space_meta`/migration; all the feedback/visual juice is 🟢.

---

## Deferred / Parked

- [ ] 🟢 **Audit follow-ups from agy's clumping batch (minor, non-blocking)** — (1) `Graph3D` does a
  per-frame `O(n)` `.find()` to position each mesh; reuse the existing `nodeByIdRef` map. (2) repeated
  `fg.graphData()` calls per frame — cache once per tick. (3) `SoumayaPanel.moveTask()` should null-guard
  `tasks[index]`. All cosmetic/defensive; verified not to cause current bugs (2026-06-21 audit).

- [ ] 🟢 **Fix UI layout overlaps** (bottom-menu / "Add thought" button / volume controls) — user said "forget it for now" on 2026-06-20.
- [ ] **`InstancedMesh` renderer rewrite (phase-1-density-core.md)** — full spec committed and ready but hold until real devices drop below ~50fps. Not blocking anything.

---

## Done (for reference)

All Phase 1–4 milestones, Celestial Economy, Telegram A/B/C, lore engine, Fleet v1, AI Companion, visitor tracking, constellation membership, PWA, MCP bridge. See `GEMINI_CHANGES.md` for the full log.

- [x] 🟢 **Perf: O(1) id→node map for link accessors** — `getLinkActivity` was O(links×nodes) per refresh (mobile jank); now a Map rebuilt on data change. (Claude, 2026-06-20, from review of agy's P2 link-activity feature.)
