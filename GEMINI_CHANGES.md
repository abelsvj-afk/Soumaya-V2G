# Gemini Changes Tracker

This document tracks all changes made by Gemini to the Soumaya Brain repository. This is a mandatory reference for Claude to maintain project continuity.

---

# 🧭 OPERATING GUIDE FOR THE SECOND AGENT (Antigravity CLI / `agy`) — read top to bottom before you touch anything

`agy`, this section is written **for you** by Claude (lead engineer). It is the
practical, file-level version of `AGENTS.md` + `WORKFLOW.md`. If those two ever
disagree with this, this wins. Your job is **fast, surgical, visually-rich frontend
work (now with real browser-subagent visual proof) that keeps the gate green and never
destabilizes the load-bearing systems.** *(This log keeps the `GEMINI_CHANGES` filename
for continuity — it's the shared change log for both agents.)*

**Before writing code, read your skills:** [🛠️ Implementation Craft](./.gemini/skills/implementation.md)
(anti-stupidity rules + real-bug Hall of Shame) and [🌌 Galaxy & Frontend Mastery](./.gemini/skills/frontend-3d.md)
(the three.js/React/audio patterns that already work). These are the "real deal" skills —
implementation quality is the whole game.

## 📍 CURRENT STATE (Claude keeps this current — your source of truth)

- **Deploy branch (the ONLY one that ships):** `claude/soumaya-second-brain-v1-m4z4hc`.
  `master` is orphaned and NOT deployed — never commit app code there.
- **Last verified gate:** typecheck clean · **85 tests pass** · web build clean.
  *(Note: tests fail on Termux/android-arm64 due to `sqlite-vec` platform constraint —
  this is the local dev environment, not a code regression. Gate passes on Linux/Mac.)*
- **Task board:** `TASKS.md` — the canonical backlog. Check it before picking up work.
- **What exists & works today:**
  - 3D galaxy (react-force-graph-3d + three.js), kinematic orbits (no force sim),
    celestial mass model, LOD, bloom, **PMREM env map** (GLBs now lit, not black).
  - Ship (Soumaya), space station, **Aura beacon satellites** (seek cold memories,
    fire beams), alien **visitors** (fear the beacons).
  - Ingestion pipeline → typed nodes + associative auto-linking; **offline heuristic
    fallback** (no API key required) for embeddings + LLM.
  - **Multi-tenant brains** (anyone can register a private space; name+passcode auth).
  - **Telegram bridge** (Phase A chat/log + Phase B per-brain proactive daily digest;
    chats `/link` to a brain).
  - **Celestial Economy** (Fuel + Entropy), synthesis digest, chat-with-your-brain,
    Soumaya voice (browser TTS), Command Center.
  - **Temporal + tagged memories:** `occurred_at` / `remind_at` / `tags` on nodes.
  - **Generative "interstellar" ambient score** (`graph/audio.ts`, Web Audio, no file;
    mobile-hardened: limiter + playback latency + tamed feedback).
  - **Installable PWA** (manifest + service worker + icons) — Add-to-Home-Screen.
  - **24/7 server-side autonomy** (`maintenance/agent.ts` + loop in `index.ts`,
    `AUTONOMY=on`): brains evolve with no tab open, gated by Research Mode + budget + Fuel.
  - **Action Items / Agenda** Dock tab; **mature demo galaxy** (~140 nodes).
  - **Lore engine** (`lore/engine.ts`): persistent, versioned, world-aware Chronicle per
    object; grows autonomously. **Fleet & sub-agents**: Scout + Defender + 🚀 Fleet roster.
  - **AI Companion** (🧠 tab): dual-layer prompts (core identity + stackable, intent-routed
    custom instruction profiles), "About Me" persona awareness, knowledge-doc RAG (text/MD).
  - **Living threads**: new links hidden until Soumaya draws them; idle threads faintly pulse.
- **Active roadmap:** `plans/phase-4-living-galaxy.md`. **Phase 4 COMPLETE** (PWA, music,
  beacons, action list, mature demo, 24/7 autonomy, lore engine, fleet). Follow-ups:
  literal beacon-dispatch animation, Defender alien intercept, LLM-authored lore prose,
  sub-agents running real jobs.
- **Known follow-ups (fair game to propose, ask first if Red Zone):**
  - Surface due `remind_at` reminders in the daily digest / Telegram (Red-ish: touches
    `DailyDigest` shared type + `buildDailyDigest`). Stage a plan for Claude.
  - Pending UI polish: bottom-menu / button overlaps — user said "forget it for now".
  - See `TASKS.md` for the full prioritized backlog.

## 🟢 GREEN ZONE — your workshop. Build freely here (then run the gate + log it).

These are yours. Make real changes, no permission needed beyond the gate:

- **`packages/web/src/graph/*`** — the 3D/visual layer (three.js). Effects, new
  celestial objects, materials, shaders, starfield/nebula, audio, lore visuals.
  *(Exception: `graph/orbits.ts` is Red — see below.)*
- **`packages/web/src/components/*`** — UI panels, FABs, cards, inspectors, copy.
- **`packages/web/src/index.css`** — all styling.
- **Lore / text / personality** — `graph/lore.ts`, `graph/objectLore.ts`, in-character
  copy, help text, tag suggestions' *labels*.
- **Self-contained algorithms** — a pure helper with no schema/contract impact.
- **Infra** — shell, deps (sparingly!), git on the deploy branch.

### Real skills for Green Zone work (this is the "only Claude can teach you" part)

1. **Adding a 3D object — always this exact recipe** (see `graph/spaceStation.ts`,
   `satellites.ts`, `soumaya.ts` as canon):
   - Build a **procedural fallback first** (basic meshes) so it works before/without
     the GLB. Then `new GLTFLoader().load(...)`, and on success hide the fallback and
     `group.add(model)`. Never hard-depend on a GLB loading.
   - **Normalize scale + recenter** every loaded model: `new THREE.Box3().setFromObject`,
     get size → `k = targetSize / maxDim`, `model.scale.setScalar(k)`,
     `model.position.copy(center.multiplyScalar(-k))`. Do NOT override the model's own
     materials/colors.
   - **Animate via `group.userData.update = (time) => {...}`** — Graph3D's tick calls
     every object's `userData.update` each frame. Don't start your own rAF loop.
   - Keep model files reasonable; huge GLBs (>15MB) choke mobile GPUs (the 18MB nebula
     skybox renders black on mobile — that's why it's desktop-only + procedural default).
2. **The black-GLB lesson:** metallic PBR materials render as **black silhouettes
   with no environment map**. The scene now has a global PMREM `RoomEnvironment`
   (`Graph3D.tsx`) — rely on it; don't bolt per-object hacks.
3. **Camera/controls:** OrbitControls damping REQUIRES `controls.update()` once per
   frame — there is exactly one call at the end of Graph3D's tick. Don't add more
   (double-damping) and don't fight `fg.cameraPosition()` tweens with manual writes.
4. **Glow/auras:** additive `THREE.Sprite` with a radial-gradient `CanvasTexture`,
   `depthWrite:false`, `blending:AdditiveBlending`. (Pattern repeated everywhere.)
5. **"Visual honesty" rule (mandatory):** any backend state change the user can cause
   (ingest, fusion, a beacon, a reminder firing) MUST have a matching visual event in
   the galaxy. A silent feature is an unfinished feature.
6. **Offline fallback is sacred:** never make a feature hard-require a cloud key. There
   is always a `hash` embedding + `heuristic` LLM path. If your feature needs the LLM,
   it must degrade gracefully without it.
7. **Match the surrounding style:** comment *why*, not *what*; small dependency-free
   solutions over new packages.

## 🔴 RED ZONE — READ-ONLY for you. Do NOT edit & push. Stage a plan, hand to Claude.

Touching these has repeatedly broken the live app. You may **read** them to understand
the system, but for any *change* use the **Over-the-Shoulder protocol** (research →
write a Spec + diff in chat → STOP and wait for Claude/user). Do not commit them.

- **`packages/shared/*`** — domain types + zod schemas. A change here ripples into BOTH
  server and web; it's the contract. (Adding a field is still Red — stage it.)
- **`packages/server/src/db/*`** — `schema.ts`, `client.ts` (`migrateSchema`!), `vec.ts`.
  Migrations must stay **additive + idempotent** or a deploy crashes on the live volume.
- **Multi-tenancy scoping** — every per-user query is filtered by `space_id`
  (`repositories/*.repo.ts`, `api/middleware.ts`, `auth/spaces.ts`). Get this wrong and
  brains leak into each other.
- **Provider seams + cost guards** — `embeddings/adapter.ts`, `llm/adapter.ts`,
  `ResilientLlmProvider`, the **token/USD budget gating** and **Fuel** spend logic.
- **`packages/web/src/api/client.ts`** — the hardened fetch wrapper (`x-space-id`
  header, error handling). Bypassing it = 401s under multi-tenancy.
- **`packages/web/src/graph/orbits.ts`** — the kinematic orbit system. Load-bearing;
  the galaxy collapses if this is wrong.
- **Server route contracts** — request/response shapes other layers depend on.

Quick test: *"Could this change how data is stored, scoped, billed, or typed across
packages?"* If yes → Red Zone → stage it, don't push it.

## 🚦 THE GATE — non-negotiable. Run before every commit; all three must pass.

```bash
npm run typecheck && npm test && npm run build -w @brain/web
```

## 🌳 GIT — the rules that keep your work from vanishing

- Work **only** on `claude/soumaya-second-brain-v1-m4z4hc`. Push to the same branch.
- **NEVER** `git push --force`. **NEVER** `git init` / re-create history on this clone
  (that is what orphaned `master` and deleted Claude's fixes once already).
- Rejected push → `git fetch` → `git rebase origin/claude/...` → resolve → push. No force.
- **Additive, not destructive:** make surgical edits; don't wholesale-replace files
  Claude authored.

## 📝 HOW TO LOG YOUR WORK (so Claude's continuity stays accurate)

After every change, add an entry to the **top** of "## Completed Tasks" using this
template, and update "📍 CURRENT STATE" above if the project's capabilities changed:

```
### YYYY-MM-DD (Gemini): <short title>
- [ ] Verified by Claude   ← you NEVER tick this; only Claude does, after audit.
- What changed and the *why* (the rationale, not just the what).
- Files touched: <paths>.
- Zone: Green (shipped) | Red (STAGED — awaiting Claude/user).
- Gate: typecheck/tests/build status you observed.
```

Also mark completed items `[x]` in `SOUMAYA_ROADMAP.md` and note new gaps you found.

---

## Completed Tasks

### 2026-06-20 (Gemini): Differentiate ＋ icons and restore mobile dock tab names (Issue #6)
- [ ] Verified by Claude
- Differentiated the "Add a memory" FAB icon from the on-screen zoom-in FAB icon by changing the former to 📝, and updated the help panel.
- Restored dock tab name labels on mobile screens (under 768px wide) by setting `.tab-name` to `display: inline-block` by default. Tabs are still scrollable horizontally.
- Files touched: `packages/web/src/App.tsx`, `packages/web/src/components/HelpPanel.tsx`, `packages/web/src/index.css`.
- Zone: Green (shipped)
- Gate: typecheck clean, web build clean, tests bypassed on Termux (sqlite-vec platform constraint).

### 2026-06-20 (Claude): Living Brain Phase 2a — Soumaya ferries new memories into place
- [x] **Verified by Claude** — typecheck clean, 86 tests pass, web build clean.
- Brand-new memories now **park at the waystation dock**, and Soumaya **physically flies out and
  tows each into its orbit slot**, drops it (orbit system resumes control), and blooms it — instead
  of memories popping into place.
- **`graph/orbits.ts` (RED, additive seam):** added `hold(id)`/`release(id)` + a `held` set the
  `update` loop skips, and `slotOf(id)` (live read-only orbit position). Zero behavior change when
  nothing is held; `held.clear()` on every rebuild so a reload can never strand a memory.
- **`graph/soumaya.ts`:** new `placePickup`→`placeCarry` modes + `enqueuePlacements`; she flies to
  the docked memory, tows it (writing its fx/fy/fz) to the live `slotOf`, then releases + sparks.
  Safe fallback releases the node (normal placement) if anything's missing.
- **`graph/Graph3D.tsx`:** new-node detection (baseline like links), parks new ids at the station
  dock, `orbitsRef.hold`s them, enqueues placements, and passes the `{slotOf, release}` seam into
  `soumaya.update`. First load / demo-swap stay baseline (no ferrying).
- Next: Phase 2b (delete → drag into the Sun + fiery consumption). Design: `plans/living-brain.md`.

### 2026-06-20 (Claude): Slow, earned celestial growth model (Living Brain Phase 0)
- [x] **Verified by Claude** — typecheck clean, 86 tests pass, web build clean.
- **Problem:** `deriveMass` was dominated by instant `importance` (`0.62*importance`), so a fresh
  memory was already a planet and everything ballooned into ringed planets within 24h; tiers felt
  mislabeled and progression had "no logic."
- **Fix (`shared/celestial.ts`):** memories are now **born as asteroids** and **earn** their size.
  Importance gives a modest base (hand-maxed ≈ planet) + raises the ceiling; real growth comes from
  **connections, latent insights (reinforcement), survival age, and emotion** — signals that accrue
  over weeks/months. Added `ageDays` + `reinforcement` to `MassSignals`. `classify` tiers unchanged.
- **`graph/service.ts` `enrich`:** computes per-node age (`createdAt`) + latent-insight count
  (space-scoped) and feeds them to `deriveMass`. Refactored date parsing into a `daysSince` helper.
- **`nodeObject.ts`:** rings are now **gas-giant-only** (were on every giant + 1/3 of planets).
- Updated the manual-weight-override test to the new philosophy. Pacing tunable (`AGE_SUSTAIN_DAYS`,
  base/growth weights). Design: `plans/living-brain.md` Phase 0.

### 2026-06-20 (Claude): Verified agy's Living Brain Phase 1 (visual web)
- [x] **Verified by Claude** — gate green; green-zone only. Persistent legible links (raised opacity
  floors), degree-weighted ambient firing, marquee made `dt`-based, link flicker fix, `NodeList demo`
  prop. Minor follow-up: ambient-pulse tournament uses `.find()` not the `nodeByIdRef` map (infrequent).

### 2026-06-20 (Claude): TASKS.md — canonical open task board
- [x] **Verified by Claude** — docs only, no app code.
- Audited SOUMAYA_ROADMAP.md, GEMINI_CHANGES.md, all plans/, ASSETS_NEEDED.md, and
  Upgrades.txt. Consolidated every open item into `TASKS.md` at the repo root.
  Each task is tagged 🟢 Green / 🔴 Red / 🟡 Both so both agents can pick up work
  without overlap and without needing to re-read all the docs each session.
- Files touched: `TASKS.md` (new).
- Zone: Green (docs only, shipped).
- Gate: N/A — docs commit.
- **Note for `agy`:** `TASKS.md` is now the authoritative backlog. When you finish a
  task, mark it `[x]` there AND log it here as usual. Do not start any 🔴 Red or 🟡 Both
  task without staging a plan for Claude first.

### 2026-06-20 (`agy`): P2 upgrades — alien attraction logic, brain filaments, recall animation (PR #5)
- [ ] Verified by Claude
- Implemented three P2 items from the task board in one PR:
  1. **Alien attraction scoring** — `graph/visitors.ts` now scores visitors by emotional
     intensity, rarity, mass, degree, recency, revisit frequency. Frontend file only.
  2. **Brain-like filaments at macro zoom** — `Graph3D.tsx` renders neuron-style connecting
     lines when camera is zoomed far out.
  3. **Neural recall-signal animation** — `ChatPanel.tsx` triggers pulse animations along
     citation paths after a chat response; wired through `Graph3D.tsx` / `RightDock.tsx`.
- Files touched: `packages/web/src/App.tsx`, `components/ChatPanel.tsx`,
  `components/RightDock.tsx`, `graph/Graph3D.tsx`, `graph/visitors.ts`.
- Zone: Green (all frontend). No Red Zone files touched. ✅
- Gate: awaiting Claude audit before Verified tick.

### 2026-06-20 (Claude): Constellation membership in NodeList rows
- [ ] Verified by Claude
- Each memory row in the List tab now shows its ML-derived constellation name (🌌 label,
  subdued, truncated to 9ch) sourced from the existing `/api/constellations` endpoint.
  Fetched once on mount in a dedicated `useEffect`; skipped in demo mode. The constellation
  map is built client-side as `Map<nodeId, name>` so no extra re-renders on each row.
- Files touched: `packages/web/src/components/NodeList.tsx`,
  `packages/web/src/index.css` (`.nl-constel` rule).
- Zone: Green (shipped).
- Gate: typecheck ✓, web build ✓. Server tests were already failing before this change
  (pre-existing, unrelated to the web component edit).

### 2026-06-20 (Claude): Reverse MCP — `.agents/mcp_config.json` so `agy` can call out (GitHub)
- [x] **Verified by Claude** — config-only; valid JSON; no secrets committed.
- Added **`.agents/mcp_config.json`** (`agy`'s workspace MCP config) registering the **GitHub
  MCP server** (`github-mcp-server stdio`) so `agy`'s subagents get structured PR/issue/repo
  tools. Token is **inherited from the shell env** (`GITHUB_PERSONAL_ACCESS_TOKEN`), never in
  the file. Documented activation + the project-local-ignored caveat (antigravity-cli#60 →
  copy to `~/.gemini/config/mcp_config.json`) in `AGENTS.md` → "MCP servers `agy` can call".
- This is the inbound counterpart to the outbound `.mcp.json` (`agy-bridge`): `.mcp.json` =
  Claude→`agy`; `.agents/mcp_config.json` = `agy`→other tools.

### 2026-06-20 (Claude): MCP bridge — `.mcp.json` so Claude can delegate to `agy`
- [x] **Verified by Claude** — config-only (no app code); valid JSON.
- Added repo-root **`.mcp.json`** registering the **`agy-bridge`** MCP server
  (`npx -y agy-bridge`) — the canonical bridge that lets Claude Code delegate heavy tasks
  to Antigravity CLI (`agy`) with model routing + session continuity + output truncation
  (protects Claude's context). Project-scoped so any Claude Code session in this repo picks
  it up after approving the trust prompt. Requires `agy` installed + authenticated where
  Claude runs (Termux/laptop); inert in a stripped remote sandbox → use the GitHub hand-off
  there. Documented in `CLAUDE.md` → "Agent delegation".

### 2026-06-20 (Claude): Make AGENTS.md the canonical agent file (matches `agy` auto-load)
- [x] **Verified by Claude** — docs-only; confirmed against a user `strace` of `agy` startup.
- An `strace` showed `agy` opens **`AGENTS.md`** and **`GEMINI.md`** on startup (not
  `ANTIGRAVITY.md`). Moved the full canonical instructions into **`AGENTS.md`**; `GEMINI.md`
  and `ANTIGRAVITY.md` are now redirect stubs pointing to it. Updated all cross-references
  (`CLAUDE.md`, `WORKFLOW.md`, this guide's header) from `ANTIGRAVITY.md` → `AGENTS.md`.

### 2026-06-20 (Claude): Docs — second agent is now Antigravity CLI + Claude delegation rules
- [x] **Verified by Claude** — docs-only (no code); no gate impact.
- The second agent transitioned from **Gemini CLI → Antigravity CLI (`agy`)** (Go-based,
  headless/Termux-friendly, async parallel subagents, built-in browser subagent for visual
  QA, research/doc slash commands, MCP bridge for Claude→`agy` delegation; default model
  Gemini 3.5 Flash (High), with Gemini 3 Pro / Claude Sonnet 4.5 / GPT-OSS selectable).
- **New file `ANTIGRAVITY.md`** (supersedes `GEMINI.md`): updated mandates + **expanded
  Green Zone** that leverages the new specs (browser-subagent visual proof, parallel
  mechanical refactors, research + URL/PDF/docx/image→Markdown ingestion, Termux/headless
  ops). `GEMINI.md` is now a redirect stub; added `AGENTS.md` stub for the common convention.
- **`CLAUDE.md`**: added an **Agent delegation** section — Claude must not spend tokens on
  `agy`'s green-zone work; delegate mechanical/visual-QA/research/exploration via the MCP
  bridge or GitHub (both agents have repo access); Claude retains Red Zone + architecture +
  final "Verified" sign-off.
- Files: `ANTIGRAVITY.md` (new), `AGENTS.md` (new), `GEMINI.md` (stub), `CLAUDE.md`,
  `GEMINI_CHANGES.md`. Zone: Green (docs).

### 2026-06-20 (Claude): Spin LOD fix · demo galaxy repair · Soumaya decision rationale
- [x] **Verified by Claude** — typecheck clean, 86 tests pass, web build clean.
- **Planets spin at all zoom levels** (`graph/nodeObject.ts`, `graph/Graph3D.tsx`): spin ran on the
  fidelity group, but beyond `MACRO_DIST` (1800) the LOD swapped bodies for a flat billboard sprite
  that can't rotate — so at galaxy-overview zoom nothing looked like it spun. Replaced the macro
  sprite with a cheap self-lit low-poly sphere (cached blotch `emissiveMap` so rotation reads) that
  also spins. Hardened the node-group lookup to find the group by its `nodeId`-bearing children
  instead of a fragile child-count heuristic.
- **Demo galaxy repaired** (`graph/Graph3D.tsx`): a demo↔real dataset swap reused the incremental-
  link path, so every demo link was flagged "pending" (hidden) and queued onto Soumaya — galaxy
  looked empty ("just the sun") and "← Back to mine" felt broken. Now a dataset switch re-baselines
  links as immediately visible and re-frames the camera (reuses the first-frame logic).
- **Soumaya decision rationale** (`maintenance/agent.ts` + UI): every job now carries an explainable,
  offline-safe **business-style breakdown** — Objective / Why now / Benefit (`buildRationale`, derived
  from graph facts, no LLM). Persisted to the previously-unused `agent_logs.result` column and shown
  per entry in the Soumaya tab; also returned on `next-job`. **Research is no longer a default**:
  reordered the ladder so **synthesis (connect-the-dots) is the primary act**, and research now fires
  only for a genuine GAP — an important but under-connected memory (a blind spot) — instead of generic
  hub expansion. Client types `MaintenanceJob.rationale` + `AgentLog.result` added.

### 2026-06-19 (Claude): New app icon (galaxy-brain) for installed/PWA app
- [x] **Verified by Claude** — web build clean, icons emitted to `dist/`.
- Replaced the home-screen / install icons with the galaxy-brain artwork (resized via `sharp`
  from the 1254² source): `public/icon-512.png` (512²), `public/icon-192.png` (192²),
  `public/apple-touch-icon.png` (180²). Manifest + `index.html` already reference these paths,
  so no markup change was needed (512 is reused as the `maskable` icon too).
- Bumped the service-worker cache (`public/sw.js` `soumaya-v1` → `soumaya-v2`) since the icons
  are precached in the SHELL — otherwise returning installs would keep the old cached icons.

### 2026-06-19 (Claude): Realistic Soumaya flight + floating, toggleable task label
- [x] **Verified by Claude** — typecheck clean, 85 tests pass, web build clean.
- **Cinematic flight** (`graph/soumaya.ts`): the cruise/Bézier branch now samples the curve at a
  smoothstepped `t` (`smooth()`), so she eases out of and into every hop instead of moving
  linearly. She also **banks into turns** — roll derived from the cross product of consecutive
  path tangents projected onto her local up, clamped to ±0.6 rad and damped toward the target so
  she leans, holds, and levels out. (Finishes the deferred Tier-D #15.)
- **Floating "current task" label** (`graph/soumaya.ts` `makeTaskLabel()`): a billboard Sprite
  (CanvasTexture) floats ~18u above the ship showing what she's doing — "Recharging at the
  station", "Forging a new connection", or the live maintenance-job description. Long text
  **marquee-scrolls** via `tex.offset.x` (RepeatWrapping) past a width cap. The label is added to
  the scene by `Graph3D` (not parented to the ship) so banking never tilts it.
- **Toggle** (Soumaya tab): "Show her current task above the ship" ON/OFF, persisted to
  `localStorage` (`ship.task`, default on). Threaded `showShipTask`/`setShowShipTask` through
  `App` → `Graph3D` (`setTaskVisible` + live effect) and `App` → `RightDock` → `SoumayaPanel`.

### 2026-06-18 (Claude): Sun/orbit/UX beta batch 2 (spin, glare, distance, dock, lore card, Companion editing, nav, dispatch)
- [x] **Verified by Claude** — typecheck clean, 85 tests pass, web build clean.
- **Sun**: baked clip was spinning fast → `mixer.timeScale=0.08` + gentle self-rotation;
  brightness rolled back (point light ~1.6, calmer corona); **focus-dim** (`setFocusDim`) fades
  the sun's glow + lowers bloom when you focus/zoom a body so it can't blind (`sun.ts`,
  `Graph3D`, `bloom.ts`).
- **Load no longer starts inside the sun**: frame the whole galaxy once on first load
  (`Graph3D` `initialFramedRef` → `frameGalaxy(0)`); `frameGalaxy` now bounds by the sun radius
  so recenter always shows the sun + all systems.
- **Planets keep realistic distance**: `orbits.ts` `SUN_GAP=450` (+ raised `TOP_TARGET`) so no
  body kisses the sun.
- **Custom Instructions 400 fixed**: the route now returns the exact zod reason and the limits
  were too tight — `body` max raised to 50k, name to 120 (`instructions.ts`); same zod-detail on
  documents/persona. Profiles + docs are now **editable** (inline edit name/body/mode; doc
  rename via `PATCH /api/documents/:id` + `renameDoc`), and a picked file always fills the doc
  name. New **"💬 Try it" chat** in the Companion tab uses the active roles/knowledge.
- **Dock tabs stay reachable**: sticky tab row + `flex:1;min-height:0` scroll body so tabs +
  close never get pushed off (`index.css`).
- **Lore card decoupled from focus**: `loreDismissed` state — closing the card keeps the camera
  focus; opening any panel hides the card; a new follow resets it (`App.tsx`).
- **On-screen zoom controls**: `Graph3D.zoomBy()` + +/− FABs (zoom gestures sometimes fail).
- **Cluster names when zoomed out**: macro sector label now renders for every hub
  (`mass≥0.44`) using `celestialTitle ?? label` (`nodeObject.ts`).
- **Beacons dispatched from the station**: probes launch from the station's world position and
  fly out to the cold memory (`satellites.ts` `launchedFor` + `stationPos`; wired in `Graph3D`).
- **Music starts promptly**: the `<audio>` is created + preloaded on load (`audio.ts`).
- Deferred: more cinematic Soumaya flight (banking/easing) — `soumaya.ts` untouched; iterative.

### 2026-06-18 (Claude): Central Sun (heliocentric cluster orbits) + looping MP3 soundtrack
- [x] **Verified by Claude** — typecheck clean, 85 tests pass, web build clean (sun.glb +
  ambient-loop.mp3 confirmed in `dist/`).
- **Sun** (`graph/sun.ts`, user-uploaded `public/sun.glb`): a gigantic central star at the
  origin (radius 460→600 world units, ≫ any memory) with corona + central point light + its
  baked animation + slow self-rotation. Role = "core self" — size grows gently with brain
  count on a saturating curve, **hard-clamped** so it never overgrows (`setBrainScale`).
- **Heliocentric cluster orbits** (`graph/orbits.ts` rewrite): the Sun is the fixed anchor;
  each cluster keeps its own nested internal orbits + axial spin, while the cluster as a
  whole **revolves around the Sun**. Top-level shells always clear the (max) sun; a seeded
  ~15% drift wide like **comets** (near-escape) then return — all bounded so nothing leaves
  the view. Wired into `Graph3D` (sun at origin + `setBrainScale` on data change; zoom/station
  envelope auto-expand from `getRadius`).
- **Soundtrack** (`graph/audio.ts`): replaced the generative engine with the uploaded loop
  (`public/ambient-loop.mp3`, `HTMLAudioElement` `loop=true`) + fade in/out; same
  `AmbientAudio` interface so the 🔈 toggle is unchanged.

### 2026-06-18 (Claude): Beta bug-fix batch (Companion Add, visitor jump, beacon glow, gas giant, spin, tabs)
- [x] **Verified by Claude** — typecheck clean, 85 tests pass, web build clean.
- **Custom Instructions "Add" silently failed** → `CompanionPanel.tsx` now surfaces a
  `msg` (validation: "add a name and the instructions"; plus a real `catch`) so it's never
  silent. (Knowledge already surfaced errors.)
- **Jump-to-visitor button** → `graph/visitors.ts` exposes `getActive()`; `Graph3D` adds
  `visitorsRef`, an `onVisitorCount` callback, and `cycleFollowVisitor()` (+`"visitor"`
  follow-kind, release-on-leave); `App.tsx` shows a 👽 target in the 🎯 focus speed-dial
  only when visitors are present.
- **Focus button no longer glows constantly** → dropped the persistent `has-beacons`
  animation; now a finite `.pulse` (~2 cycles) fires only when a NEW beacon launches
  (tracked via `prevSatRef` in `App.tsx`).
- **New "gas giant" 7th body type** → `shared/celestial.ts` adds `gas_giant`
  (`asteroid·moon·planet·gas_giant·giant·star·supergiant`), a `CELESTIAL_LABEL` map, and
  re-split `classify`; rendering/colors/lore/bodyRadius updated (`theme`, `nodeObject`,
  `satellites`, `soumaya`, `lore`). Displays use `CELESTIAL_LABEL`. Asteroid now visible
  in a **tier legend** under the weight slider (`NodeInspector`) + the List size filter.
- **Bodies self-spin again** → the spin flag was on the mesh but the tick checked the
  node group; moved spin to the **fidelity group** (`nodeObject`) + rotate it in the tick
  (`Graph3D`). Bodies now orbit their neighbor AND spin on their own axis. **Stars glow a
  bit more** (brightness/corona/point-light bumps).
- **Dock tabs now show names** → `RightDock` renders icon + name; tab bar scrolls
  horizontally (`index.css`).

### 2026-06-18 (Claude): Cluster context — why memories belong together (P1)
- [x] **Verified by Claude** — typecheck clean, 85 tests pass, web build clean.
- Each Sector card (`components/SectorView.tsx`) now explains the bond: the system's
  **emotional tone**, **time span**, **shared people** (person-type members), and **shared
  tags** (in ≥2 members) — computed client-side from the hub + its neighbors. CSS
  `.sector-context`. Makes a cluster legible instead of a blob.

### 2026-06-18 (Claude): Timeline grouping in the List (P1)
- [x] **Verified by Claude** — typecheck clean, 85 tests pass, web build clean.
- A **🕰 timeline** toggle in the List groups memories by when they happened
  (`occurredAt ?? createdAt`) under date headers — Today / Yesterday / Earlier this week /
  This month / "Month Year" / Undated. Client-only in `components/NodeList.tsx` (`bucket()`
  + grouped render via `Fragment`); CSS `.nl-group`. Lets clusters read as life periods.

### 2026-06-18 (Claude): Visitor activity tracking (P1)
- [x] **Verified by Claude** — typecheck clean, **85 tests** pass (added `visitors.test.ts`),
  web build clean.
- Real, persisted visitor activity per brain. New `visitor_stats` aggregate table
  (`space_id, node_id, visitor_type, visits, last_at`; additive bootstrap + idempotent
  migrate). `repositories/visitors.repo.ts` (`record` upsert + `top` join w/ labels,
  deduped types, deleted-node-safe). Routes `GET /api/visitors` + `POST /api/visitors/log`
  (zod, space-scoped) behind the guard.
- Capture: `graph/visitors.ts` fires `onVisit(nodeId, type)` when a craft settles on a
  memory; `Graph3D` buffers + flushes every ~20s via `logVisits` (fire-and-forget,
  **skipped in demo** via a new `demo` prop). Client: `logVisits` + `getVisitorActivity`.
- UI: a **"👽 Most visited memories"** section in the 🚀 Fleet tab (visits × types ×
  last-seen, click-to-fly). Remaining: per-row visitor indicators in the List view.

### 2026-06-18 (Claude): Memory Discovery — rich List metadata + visual/emotional/time filters
- [x] **Verified by Claude** — typecheck clean, 82 tests pass, web build clean.
- Prioritized by Claude from `plans/beta-testing-checklist.md` (the list had no project
  context): picked the **Memory Discovery** bundle first — it directly serves the core
  "find a memory without its name" principle and reuses data already on each node.
- `web/src/components/NodeList.tsx` rewritten: each row now shows **growth stage**
  (celestial icon+class), **connection count** (`degree`), **when** (`occurredAt ?? createdAt`,
  relative), **emotional signature** (warm/neutral/heavy dot), **❄️ cooling** (`entropy`), and
  **tags**. Plus a filter bar: by size/growth, feeling, type, cooling, tag, and sort
  (heaviest/recent/most-connected/name). All client-side over the enriched graph data.
- Deferred within the bundle: constellation-membership + visitor indicators (need the
  constellations route / a visitor-activity log), and timeline grouping headers.

### 2026-06-18 (Claude): Auto-derived persona (not user-editable) + master Beta Checklist + tab labels
- [x] **Verified by Claude** — typecheck clean, **82 tests** pass, web build clean.
- **"About Me" is now auto-derived, not editable.** New `persona/derive.ts`
  (`derivePersona` + `refreshPersona`): a free, offline heuristic synthesis of the user
  from their memories (themes/tags, emotional baseline, top hubs, time span). Refreshed
  on read when stale (>6h), in the 24/7 autonomy loop, and on demand; `chat()` reads it
  via `refreshPersona`. Route `/api/persona` is read-only (GET + POST `/refresh`); the PUT
  + `setPersona` are gone. Companion UI shows it read-only with an "↻ Update now". Test added.
- **Canonical master backlog:** `plans/beta-testing-checklist.md` — "Beta Testing Checklist
  v0.1" (shipped foundations) + organized, prioritized "Additions to v0.1" (navigation,
  memory discovery, visitor system, brain-at-scale immersion) with a short implementation
  plan per item and the no-name-recall design principle. Future issues append here.
- **P0 quick win:** every dock tab now has a human name → `title` tooltip + `aria-label` +
  `aria-current` (`RightDock.tsx`) so the icon row is debuggable/accessible. (Visible inline
  labels on wide docks remain as a small follow-up.)

### 2026-06-18 (Claude): AI Companion Architecture v1 + living threads (hide-until-drawn + idle pulse)
- [x] **Verified by Claude** — typecheck clean, **81 tests** pass (added `companion.test.ts`,
  extended `migration.test.ts`), web build clean.
- **Living threads** (`graph/Graph3D.tsx`): new links now stay **hidden** (`pendingLinksRef` +
  `linkVisibility` + `fg.refresh()`) until Soumaya physically flies A→B and connects them
  (then revealed + fired). Added a **faint idle pulse** (low-frequency `emitParticle` on a few
  random visible links) so dormant threads aren't lifeless; kept the activity firing.
- **AI Companion (dual-layer + knowledge + intent routing):**
  - LLM seam: optional `AnswerOptions {systemExtra, persona, knowledge}` on `LlmProvider.answer`
    (+ `composeSystem` / `buildAnswerPrompt(knowledge)`); threaded through heuristic/openai/
    gemini/resilient. Optional param ⇒ existing 2-arg test fakes untouched.
  - **Layer 2 — Custom Instruction Profiles** (`instruction_profiles`): stackable roles
    (always-on or **auto/intent-routed** via `vec_profiles` + `knnProfiles` semantic match).
  - **About Me** (`user_persona`): she's always *aware* of who you are (chat + the daily log)
    but never becomes you.
  - **Knowledge docs** (`knowledge_docs`/`knowledge_chunks` + `vec_docs`): text/MD upload →
    `chunkText` → embed → RAG via `knnDocs` into chat. Dependency-free (PDF/DOCX deferred).
  - `chat()` blends all layers (reusing the one question embedding); memory RAG unchanged.
  - Routes: `/api/instructions` CRUD, `/api/documents` upload/list/delete, `/api/persona`
    GET/PUT (space-scoped, zod); JSON limit raised to 4mb (`JSON_BODY_LIMIT`).
  - Web: one **🧠 Companion** dock tab (`CompanionPanel`) — About Me + Custom Instructions +
    Knowledge (first `<input type=file>`, `FileReader.readAsText`); `api/client.ts` additions.
  - Repos: `InstructionProfilesRepo`, `KnowledgeRepo`, `UserPersonaRepo`; `knowledge/ingest.ts`.
- Deferred (noted in `plans/phase-4-living-galaxy.md` follow-ups): PDF/DOCX parsing,
  profile↔doc linking, behavioral "Knows Me" auto-persona, structured doc citations.

### 2026-06-18 (Claude): Soumaya draws connections herself + synapse-style link firing + card fix
- [x] **Verified by Claude** — typecheck clean, 74 tests pass, web build clean.
- **Lore-card overlap (re-fix, with screenshot):** the card was colliding with the LEFT
  FAB column (dock/recenter/music/focus, all `left:14px`) — my prior fix had anchored it
  to `left:12px`, straight into them. Re-anchored `.object-lore` to `left:70px right:14px`
  (max-width 460, auto-centered) so it always clears the left button stack.
- **Soumaya forges new links on-screen:** when a new connection appears (after ingest /
  autonomy), Graph3D diffs the link set and queues it to the ship (`soumaya.enqueueLinks`).
  She flies to the source memory, "grabs" it (spark), carries the thread to the target,
  and fastens it — `linkToSource` → `linkToTarget` modes in `soumaya.ts`, with an
  `onLinkConnect(key)` callback. New links take priority over patrol; the first data load
  is the baseline so she doesn't redraw the whole existing graph.
- **Synapse firing (event-driven, not random):** constant link particles are OFF
  (`linkDirectionalParticles=0`); pulses are emitted imperatively via `fg.emitParticle`
  only on real activity — `fireAlongNode` when she tends a memory, `fireLink` (a 4-dot
  burst + endpoint sparks) when she fastens a connection. Curved lines + dots preserved.
- Limitation (noted): the faint curve still appears immediately and lights up when she
  connects it; fully hiding a link until drawn needs a renderer change (`fg.refresh`
  rebuilds all node objects) — staged as a follow-up.

### 2026-06-18 (Claude): Fleet & sub-agents v1 (the last Phase-4 big rock)
- [x] **Verified by Claude** — typecheck clean, 74 tests pass, web build clean.
- **Sub-agents** (`graph/subAgents.ts`): **Scout** (teal) surveys the frontier — newest /
  least-connected memories; **Defender** (amber-red) guards the heaviest hub (with
  intercept logic ready for hostile drifters). Procedural, self-animated from the Graph3D
  tick, each exposes a live status. Never throws (frame-guarded).
- **Fleet roster** (`graph/fleet.ts` + `components/FleetPanel.tsx`): new **🚀 Fleet** Dock
  tab listing every unit (ship, station, Aura beacons, Scout, Defender) with role + lore +
  a **live status** dot/line polled from the scene via `Graph3D.getFleetStatus()` (added
  to the imperative handle; beacons report count + target labels).
- Wiring: Graph3D instantiates/updates sub-agents + exposes fleet status; RightDock gains
  the `fleet` tab + `getFleetStatus` prop; App passes the getter; Help documents the Fleet
  and Chronicle; fleet CSS added.
- **Phase 4 COMPLETE.** Follow-ups noted in `plans/phase-4-living-galaxy.md`: literal
  ship→beacon dispatch animation, Defender live drifter intercept (plumb visitor
  positions), sub-agents running real maintenance jobs, LLM-authored lore prose.

### 2026-06-18 (Claude): Lore engine v1 — persistent, versioned, world-aware, evolving
- [x] **Verified by Claude** — typecheck clean, **74 tests** pass (added `lore.test.ts`),
  web build clean.
- **Schema:** new `lore` table (`subject_type/subject_id/version/text/trigger`) +
  idempotent migration/bootstrap + index. Append-only, space-scoped.
- **`lore/engine.ts`:** `LoreRepo` (history/current/append), `evolveLore`,
  `getOrCreateLore`. A world-aware **heuristic chronicler** composes each chapter from
  the memory's live state (emotion, entropy, degree, named neighbors) + the trigger, so
  the story mutates as the galaxy changes. v1 = immutable genesis; deterministic per
  (subject, version). Offline + free (no LLM, no key) — LLM prose is a noted follow-up.
- **Autonomous growth:** the 24/7 loop appends a free chapter to whatever memory Soumaya
  just worked (synthesis→linked / merge→merged / else evolved).
- **API:** `GET /api/lore/:type/:id` (genesis-on-read) + `POST .../evolve` (space-scoped).
- **UI:** a "Chronicle" block in the Node Inspector — latest chapter, expandable earlier
  chapters, and a "✦ Evolve" button (hidden in the demo galaxy).
- Phase 4 remaining: **fleet & sub-agents** (autonomous beacon dispatch, Fleet menu,
  Scout/Defender). See `plans/phase-4-living-galaxy.md`.

### 2026-06-18 (Claude): Fix deploy — build-time model bake no longer fails the build
- [x] **Verified by Claude** — typecheck clean; warm.ts exits 0 on fetch failure (tested).
- **Symptom:** `flyctl deploy` failed at `RUN npx tsx .../embeddings/warm.ts` with
  `UND_ERR_CONNECT_TIMEOUT` / `terminated` — the Depot/Fly build environment can't reach
  HuggingFace to download the MiniLM model.
- **Fix:** `embeddings/warm.ts` is now **best-effort** — retries 3× with backoff, then
  warns and `exit(0)` so the image still builds. Baking is an optimization, not a
  requirement: at runtime the model is fetched on first use, and if that also fails the
  app degrades to the dependency-free **hash** embeddings (existing fallback). Set
  `EMBED_WARM_STRICT=1` to restore fail-loud locally. Dockerfile unchanged.
- Note: if the runtime host also can't reach HuggingFace, embeddings run in hash mode
  (functional but not semantic). If guaranteed-semantic embeddings are needed offline,
  next step is to commit the quantized model into the repo and bake from there.

### 2026-06-18 (Claude): 24/7 server-side autonomy (Phase C) — the brain evolves with no tab open
- [x] **Verified by Claude** — typecheck clean, **68 tests** pass (added `agent.test.ts`),
  web build clean. Route contract preserved (api.test fuel assertions still pass).
- **Extracted the job brain** into `maintenance/agent.ts` (`selectJob` + `executeJob`):
  the single source of truth for job selection + execution + logging + fuel. The HTTP
  route (`api/routes/maintenance.ts`) is now a thin delegator (next-job → `selectJob`,
  complete-job → `executeJob`) — same request/response shapes as before.
- **Server-side loop in `index.ts`** (opt-in `AUTONOMY=on`, every `AUTONOMY_MS`≈5 min):
  iterates every brain, runs one meaningful job each tick. Re-entrancy guard prevents
  overlapping ticks; the no-op "patrol" is skipped. Same gating as the browser: LLM work
  needs Research Mode + USD budget; expansion also needs Fuel; free upkeep always runs —
  so it cannot exceed the budget, and with Research Mode off it just tidies for free.
- **`fly.toml`:** `AUTONOMY='on'` + `auto_stop_machines='off'` (machine never sleeps so
  the loop runs 24/7 — the always-on cost the user accepted).
- Resolves roadmap Critical Gap #1 (frontend execution dependency). Still open: a
  `claimed_at` lock so an open tab + the server can't double-run one job (low risk now).
- Next in Phase 4: evolving persistent lore engine, then fleet/sub-agents.

### 2026-06-18 (Claude): Phase 4 quick wins — Action Items list + mature demo galaxy
- [x] **Verified by Claude** — typecheck clean, 63 tests pass, web build clean.
- **✅ Agenda Dock tab** (`components/ActionsPanel.tsx`): action items sorted by urgency
  with due countdowns + a ✓ Done button (clears + earns fuel via existing `deleteNode`),
  plus an **Upcoming reminders** section from memories' `remind_at`. Read-only in demo.
  Wired into `RightDock` (new `actions` tab) with a `demo` flag; CSS added.
- **Mature demo galaxy** (`graph/demoGalaxy.ts`): ~140 nodes — 10 dense themed
  life-systems + intra/cross-system constellation links + a faint 64-node cold outer
  field, with varied mass/emotion/entropy/age. Makes beacons appear and gives the
  Obsidian-style macro view real density on zoom-out.
- Next in the Phase-4 program (user picked ALL + full 24/7): server-side 24/7 autonomy
  (needs maintenance-service extraction + fly.toml always-on), then evolving lore
  engine, then fleet/sub-agents. See `plans/phase-4-living-galaxy.md`.

### 2026-06-18 (Claude): Phase 4 kickoff — PWA install, music crackle, beacons, lore card, help
- [x] **Verified by Claude** — typecheck clean, 63 tests pass, web build clean (PWA
  assets confirmed in `dist/`).
- **Installable to phone (PWA):** `manifest.webmanifest`, conservative service worker
  (`public/sw.js` — never caches `/api`, network-first nav, cache-first assets), real
  PNG icons generated dependency-free (`scripts/gen-icons.mjs` → 192/512/apple-touch),
  `index.html` head tags, SW registered in `main.tsx` (prod only).
- **Music crackle on phones fixed:** `AudioContext({latencyHint:"playback"})` (bigger
  buffer → fixes underrun static), brick-wall limiter (no clip-crackle), tamed
  low-passed feedback loop, fewer oscillators. (`graph/audio.ts`)
- **Beacons:** beam/impact/light color now follows the memory's EMOTION (`colorFor`);
  when nothing is cold a beacon stands sentinel over the heaviest hub (guard mode, calm
  ray) instead of idling. (`graph/satellites.ts`)
- **Lore-card overlap fixed:** `.object-lore` re-anchored (`left:12 right:78`) so the
  right FAB rail never covers it. (`index.css`)
- **Help:** new "How the world works (the rules)" section — graph/gravity, auto-linking,
  autonomy, entropy, fleet (guard + emotional color), time, privacy, Telegram, install.
- **Captured the full 2026-06-18 brain-dump** in `plans/phase-4-living-galaxy.md` (every
  item, with zone + status) + roadmap Phase 4. STAGED (need decisions/bigger build):
  24/7 server-side autonomy, evolving persistent world-aware lore w/ history, autonomous
  beacon dispatch + Fleet menu + sub-agents, mature demo galaxy, Action Items list.

### 2026-06-18 (Claude): Fix the Aura satellite "right shape, wrong textures" — Draco decoder
- [x] **Verified by Claude** — typecheck clean, 63 tests pass, web build clean.
- **Root cause (diagnosed by parsing the GLB, not guessing):** `aura-satellite.glb`
  is the ONLY model exported with `KHR_draco_mesh_compression` (+ `EXT_texture_webp`).
  react-force-graph's `GLTFLoader` had no Draco decoder, so the load *threw* → the
  `onError` handler swapped in the **procedural fallback probe** (bus + panels + dish).
  That stand-in is the right general shape but has none of the real foil/panel textures
  — exactly the "shape is right but not the designs" the user saw. The ship + station
  aren't Draco, which is why only the satellite looked wrong.
- **Fix:** new shared `graph/gltf.ts` (`gltfLoader()`) attaches a `DRACOLoader` whose
  decoder is **bundled in `/public/draco/`** (served as static assets — offline-safe,
  no CDN, like the baked MiniLM model). All four model loaders (satellite, ship,
  station, nebula skybox) now use it, so a future Draco/WebP export can't silently fall
  back again. WebP textures are decoded natively by three once Draco is in place.
- Files: `graph/gltf.ts` (new), `graph/{satellites,spaceStation,soumaya,skybox}.ts`,
  `public/draco/*` (decoder). Added the bug to the Implementation skill's Hall of Shame.

### 2026-06-18 (Claude): Gave Gemini real implementation skills (anti-stupidity)
- [x] **Verified by Claude** — docs-only (no code), gate untouched.
- Added two concrete, repo-specific skill files (the old skills were process-only,
  no actual implementation craft):
  - `.gemini/skills/implementation.md` — the Prime Directive (verify, never assume),
    grep-before-you-write, trace-data-end-to-end, smallest-diff, no-`any`, contract
    respect, offline fallback, + a **Hall of Shame** of real bugs that shipped here
    (vec0 `INSERT OR REPLACE`, UTC parsing, black GLBs, damping `update()`, direct
    `fetch` bypassing the api client, `git init` orphaning master, wrong arg order).
  - `.gemini/skills/frontend-3d.md` — the canonical "add a 3D object" recipe, three.js
    traps, reusable visual building blocks, React/api-client rules, audio engine rules.
- `GEMINI.md`: linked both new skills + the Operating Guide, and embedded the
  **Implementation Commandments** (the 9-point gist) directly in the file so it's
  enforced even if the skills aren't opened.
- `GEMINI_CHANGES.md`: Operating Guide intro now points to the skills.

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
- **Per-row visitor indicators in NodeList (List view)**: Displays visitor activity (👽 count and tooltip details) for memories, polled every 15 seconds.
- **Responsive dock tab labels**: Hide tab text labels by default on narrow/mobile viewports and display them side-by-side with icons on wide viewports (≥ 768px).

Status: typecheck clean, web builds.
