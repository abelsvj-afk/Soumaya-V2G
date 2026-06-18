# Gemini Changes Tracker

This document tracks all changes made by Gemini to the Soumaya Brain repository. This is a mandatory reference for Claude to maintain project continuity.

---

# 🧭 OPERATING GUIDE FOR GEMINI — read this top to bottom before you touch anything

Gemini, this section is written **for you** by Claude (lead engineer). It is the
practical, file-level version of `GEMINI.md` + `WORKFLOW.md`. If those two ever
disagree with this, this wins. Your job is **fast, surgical, visually-rich frontend
work that keeps the gate green and never destabilizes the load-bearing systems.**

**Before writing code, read your skills:** [🛠️ Implementation Craft](./.gemini/skills/implementation.md)
(anti-stupidity rules + real-bug Hall of Shame) and [🌌 Galaxy & Frontend Mastery](./.gemini/skills/frontend-3d.md)
(the three.js/React/audio patterns that already work). These are the "real deal" skills —
implementation quality is the whole game.

## 📍 CURRENT STATE (Claude keeps this current — your source of truth)

- **Deploy branch (the ONLY one that ships):** `claude/soumaya-second-brain-v1-m4z4hc`.
  `master` is orphaned and NOT deployed — never commit app code there.
- **Last verified gate:** typecheck clean · **63 tests pass** · web build clean.
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
- **Active roadmap:** `plans/phase-4-living-galaxy.md`. **Phase 4 COMPLETE** (PWA, music,
  beacons, action list, mature demo, 24/7 autonomy, lore engine, fleet). Follow-ups:
  literal beacon-dispatch animation, Defender alien intercept, LLM-authored lore prose,
  sub-agents running real jobs.
- **Known follow-ups (fair game to propose, ask first if Red Zone):**
  - Surface due `remind_at` reminders in the daily digest / Telegram (Red-ish: touches
    `DailyDigest` shared type + `buildDailyDigest`). Stage a plan.
  - Pending UI polish: bottom-menu / button overlaps (see "Pending Tasks" below).

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

Status: typecheck clean, 29 tests pass, web builds.
