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
- [ ] 🟢 **Literal beacon dispatch animation** — Soumaya flies to position and releases a beacon visually. Pure `graph/soumaya.ts` animation work, no backend touch.
- [ ] 🟢 **Defender live drifter intercept** — wire real visitor positions from `visitors.ts` into `subAgents.update` so the Defender actually flies to intercept drifters. `graph/subAgents` only.
- [ ] 🟡 **Formalize alien attraction scoring function** — `visitors.ts` scoring logic (emotional intensity, rarity, mass, degree, recency, revisit frequency). Server service = Red-adjacent; visual feedback on hover / in List = Green.

---

## Memory & UX

- [x] 🟢 **"Writing..." latency feedback on nodes during LLM processing** — show a pulsing state on a node's orb while its job is in flight. Frontend component state only.
- [x] 🟢 **Brain-like filaments at macro zoom** — neuron-like connecting filaments visible when zoomed far out. three.js / `Graph3D.tsx`, no backend.
- [x] 🟢 **Neural recall-signal animation** — fire synapse-style pulses along the path from seed node to each cited node during a chat response (`fireRecall(citationIds)` in `Graph3D.tsx`).
- [ ] 🟢 **Per-memory story arcs in object lore** — space station + ship lore tied to specific memory relationships (`graph/objectLore.ts`). Explicitly Green Zone file.
- [ ] 🟢 **In-app PWA Install button** — capture `beforeinstallprompt` event and show an "Install" button in the UI. Frontend only.
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

- [ ] 🟢 **Marquee scroll is frame-rate-bound** — node/sector label scroll uses `mq.t += 0.006` per FRAME (`Graph3D.tsx` tick), so it slows/stops on slower phones. Make it time-based (multiply by `dt`). Same for any other per-frame scroll.
- [ ] 🟢 **Links flicker/vanish when close** — tapping/hovering a node drops unrelated links to 0.02 opacity (near-invisible), reading as a glitch up close. Raise the "unlit" link opacity to a faint-but-present value and/or smooth the transition.
- [ ] 🟡 **Connections legible + persistent at distance (the obsidian/neuron feel)** — existing persisted links should read as a faint glowing web when zoomed out (not lost against the starfield), and "cluster lights"/ambient firing should make the brain look alive from afar even with no new memories. Visual work in `Graph3D.tsx`/links = Green; any change to what counts as a persisted/visible edge = Red (coordinate). DESIGN PENDING (see user Qs).
- [ ] 🔴 **Confirm edges persist + return on reload** — verify `getGraph` returns all edges for a real (non-demo) brain and they show on load. Visibility logic is already correct (pending cleared on load); confirm it's not a server/persistence gap. Claude.
- [ ] 🟡 **Fuel discoverability + keep growth ungated** — Soumaya's line-drawing is NOT fuel-gated (only research/sector charting is), but the user can't tell. Surface fuel + how it's earned on the main HUD (not just buried in Help), and decide whether fuel regenerates passively. UI surfacing = Green; economy/regen logic in `economy.ts` = Red. DESIGN PENDING (see user Qs).
- [ ] 🟢 **Differentiate ＋ icons (add vs zoom)** — delegated to agy as issue #6.
- [ ] 🟢 **Restore dock tab names on mobile** — delegated to agy as issue #6 (regressed by #4's wide-screen-only labels).

---

## Deferred / Parked

- [ ] 🟢 **Fix UI layout overlaps** (bottom-menu / "Add thought" button / volume controls) — user said "forget it for now" on 2026-06-20.
- [ ] **`InstancedMesh` renderer rewrite (phase-1-density-core.md)** — full spec committed and ready but hold until real devices drop below ~50fps. Not blocking anything.

---

## Done (for reference)

All Phase 1–4 milestones, Celestial Economy, Telegram A/B/C, lore engine, Fleet v1, AI Companion, visitor tracking, constellation membership, PWA, MCP bridge. See `GEMINI_CHANGES.md` for the full log.

- [x] 🟢 **Perf: O(1) id→node map for link accessors** — `getLinkActivity` was O(links×nodes) per refresh (mobile jank); now a Map rebuilt on data change. (Claude, 2026-06-20, from review of agy's P2 link-activity feature.)
