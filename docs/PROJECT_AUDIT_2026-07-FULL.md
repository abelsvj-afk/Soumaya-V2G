# Full Project Audit — 2026-07-01 (post-Codex)

Four parallel deep audits (UI/tab redundancy · server · 3D client · gamification), synthesized
and prioritized. Supersedes the follow-ups section of `PROJECT_AUDIT_2026-07.md` where they
overlap. Severity: **P0** = money/security, **P1** = user-visible correctness, **P2** =
redundancy/merge work (the user's explicit ask), **P3** = performance, **P4** = cleanup.

---

## P0 — Money & security holes (fix before anything else)

1. **Gemini usage is never metered → the USD budget cap does not exist on the default
   provider.** `llm/adapter.ts:143-147` builds `GeminiProvider` without `recordUsage` (only the
   OpenAI branch passes it) and `usage.ts` PRICE has no Gemini rates. `UsageTracker` stays at $0,
   so every budget gate (`overBudget`, agent gating, ResilientLlmProvider `blocked`) is inert.
   *Fix: record `usageMetadata.promptTokenCount/candidatesTokenCount` + add Gemini pricing.*
2. **Any tenant can neutralize the shared budget when `ADMIN_TOKEN` is unset.**
   `api/routes/usage.ts:12-19` skips the admin check entirely if the env var is missing —
   any space can `POST /api/usage {budget:…}` or `/reset`. *Fix: fail closed.*
3. **`research_enabled` is global but writable by every space** (`maintenance.ts:20-27`,
   read globally at `agent.ts:162-167`) — tenant A can enable paid autonomous work for all
   brains. *Fix: move to `space_meta` per-space; keep only true deployment settings global.*
4. **Codex-claim keys are client-invented.** `maintenance.ts:110` accepts any ≤80-char string:
   +4 fuel per made-up key (bounded by the cap) and unbounded `codex_claims` row growth on the
   Fly volume. *Fix: server-side allow-list of legal ids (share the catalog enum via
   `@brain/shared`); `constellation-*` keys must reference an existing MOC hub in that space.*
5. **Fuel farm: create-action → delete-action loop** pays `EARN_ACTION_DONE` 1.5 with no LLM
   cost, fully offline (`nodes.ts:235`). *Fix: only pay for actions older than a minimum age.*
   Related: repeated ingest+delete doesn't farm fuel (cap) but burns real USD per extraction.
6. **`/complete-job` trusts client targets without re-validating preconditions**
   (`agent.ts:584-624`): crafted `merging` fuses any two owned nodes with no similarity
   re-check; `sector_vibe`/`research` can double-append. *Fix: re-validate in `executeJob`.*
7. **Prompt/telemetry leaks:** chat system prompt injects shared-deployment budget/key facts to
   every tenant (`chat/graphrag.ts:82-165`); `GET /maintenance/settings` returns ALL global
   settings rows; `GET /health` leaks the global node count unauthenticated; central error
   handler echoes raw `err.message`. *Fix: allowlist/strip.*
8. **Auth brute force ceiling is low:** ~120 passcode guesses/min/IP, 4-char minimum, unlimited
   free space creation (each new space adds autonomy-loop work). *Fix: tight per-route limit
   keyed IP+gamerTag; cap creation rate.*
9. **Legacy claim misses newer tables** (`auth/spaces.ts:18` covers 5 tables): `lore`,
   `attachments`, `instruction_profiles`, `knowledge_*`, `codex_claims`, `user_persona`,
   `visitor_stats`, `space_meta` rows under `'legacy'` are never claimed by first signup.

## P1 — Correctness bugs (user-visible)

1. **Demo mode drives the real maintenance API.** Soumaya has no demo flag: in the demo galaxy
   she fetches real jobs and POSTs `complete-job` with demo node ids (`soumaya.ts:543,583,1055`).
   Demo flights also increment real progression stats (`Graph3D.tsx:1020-1025, 1259-1262`).
2. **Hover/selected dim never works on star/planet bodies** — they use ShaderMaterials that
   ignore `opacity`/`emissiveIntensity` (`Graph3D.tsx:1467-1482`); the pulse loop overwrites the
   dim next frame; `transparent=true` is set permanently on all node materials. *Fix: dim via
   the `uBrightness` uniform.*
3. **Link glow reads the wrong node**: `??` chain lets a stale source timestamp shadow a fresh
   target tend (`Graph3D.tsx:1596`) — should be `max(source, target)` freshness. Soumaya's
   re-forge freshness is in-memory only, so her tending visually resets on reload.
4. **Browser loop vs 24/7 server loop can double-run the same job** (20s claim TTL,
   `agent.ts:180-195`): research/sector_vibe double-append content and double-spend fuel.
5. **Merging can create self-loops/duplicate edges** and leaves insights pointing at the
   soft-deleted node (`agent.ts:600-604`).
6. **`knn` over-fetch cap (500 global rows, `db/vec.ts:118`)** silently truncates a tenant's
   recall once the deployment holds >500 foreign vectors — search/linking/synthesis degrade.
7. **Bloom pass never disposed + re-init doubles it** (`bloom.ts:31`, cleanup at
   `Graph3D.tsx:1427-1463`); `disposeObject3D` also destroys module-shared cached textures
   (moons/macro bodies) on every single-node rebuild.
8. **GLB load races**: figurine re-equip mid-flight stacks models; a late older ship skin can
   replace a newer one (`Graph3D.tsx:280-317`, `soumaya.ts:249-321`). *Fix: request tokens.*
9. **Stale-closure seams:** `fireRecall` captures `activeId` at last data refresh
   (`Graph3D.tsx:1874`); `onSoumayaClick`/count callbacks captured once in the main effect.
10. **Engine audio ignores the SFX volume slider** (`engineAudio.ts:61-63`, hard-coded 0.9) and
    isn't part of the duck path.
11. **Isolate view leaves the fleet working invisible nodes** (beams/labels at empty space).
12. **DB bootstrap SQL exists twice and has drifted** (`db/client.ts:23-181` vs the dead copy at
    `:309-406` — the copy's `space_meta` lacks streak columns); `last_seen_at` exists only as an
    ALTER. Drizzle `spaceMeta` schema also omits the streak columns. *Fix: delete the dead
    block; add the column to bootstrap; true-up schema.ts.*
13. **Telegram `/log` never touches the streak** (`bot.ts:184-187`).
14. **`daily_log` genesis quirk:** with a cloud LLM, brains ≤5 nodes never get a first log.
15. **`stat.memories_tended` counts every node click** (`App.tsx:613-618`) — "Grand Restorer"
    and codex "The Gardener" are really "click 10 nodes."
16. **`brain.spaceId` fallback mismatch** — `"default"` in Toasts/RightDock/InboxPanel vs
    `"legacy"` in achievements.ts; `ship.task` localStorage key is global while everything else
    is per-space.

## P2 — Redundancy & merges (the explicit ask)

### Tabs: 13 → 7 (recommendation)

Current dock overflows on phones — ~5-6 tabs are off-screen with no affordance
(`index.css:212-226`). Proposed structure:

| New tab | Absorbs | Notes |
|---|---|---|
| ⓘ Details | — | unchanged |
| 📚 Browse | **List + Library + Sectors** | view toggle: flat / folders / timeline / hubs; export button. Library's only uniques are grouping+preview+export; SectorView is a "hubs" lens. Rename "Sectors" (3 conflicting meanings today; Help's description is factually wrong). |
| ✅ Agenda | — | canonical home of actions/reminders; digest & welcome-back link here instead of re-rendering the lists |
| ✨ Insights | + **Captain's Log** (from Soumaya tab) | two sub-sections: "Today" (daily digest + log) / "Patterns" (weather, evolution, dormant, life-areas, self-check) — the 8-section scroll needs structure either way |
| 🛰️ Soumaya | + **Fleet** (93-line roster → section) | move "Most visited memories" out (memory data, not fleet data); single home of the Research-Mode + ship-label toggles (both currently duplicated in Settings, unsynced) |
| 🏆 Progress | **Awards + Codex** (+ Hangar as section or link) | one progression surface; Codex already has category chips — Awards becomes a chip |
| 🔔 Inbox | — | unchanged |

Companion stays separate (config vs telemetry) but linked from the Soumaya tab = 8 total.

### Gamification dedupe (rule: **Codex = discovery, Achievements = feats**)

- **Four memory-count ladders** fire up to 3 toasts for one event (milestones + rank +
  count-achievements + codex Singularity). *Keep Pilot Rank as the single ladder* (only one
  with a mechanical effect — ship speed); hang Hangar unlocks off rank tiers; delete
  `MEMORY_MILESTONES` toasts + pure-count achievements.
- **Direct achievement⇄codex duplicates to delete/re-predicate:** `cartographer` (literally
  re-reports the codex tab's own counter), `singularity`, `star_born`, `synapse`,
  `first_light`; name collisions with different predicates: `gardener` vs "The Gardener",
  `deep_cluster` vs "Deep Cluster".
- `fleet_commander` gates nothing in Hangar (dead unlock); HangarPanel duplicates unlock
  thresholds inline (drift risk with Awards).
- Fleet lore is triplicated (graph/fleet.ts, codex.ts, HelpPanel).
- Streak/daily-log/away-digest coexist fine (incentive / record / re-entry) but should
  cross-reference: WelcomeBackCard should show streak + fuel accrued; `consistent_pilot`
  should read the server streak instead of rebuilding day-sets from node dates.

### Fuel economy is decorative

Regen alone (6/hr = 144/day) exceeds the 120 cap; spends are rare (only research/sector_vibe
at −2) and **completely invisible** (fuel pops render gains only, `App.tsx:168`; no
player-chosen spend exists anywhere). Options: cut regen to 1-2/hr, price more jobs, show −
pops, and add at least one player-priced action (e.g. "Deep-dive this memory — 2 ⛽").

### Server logic duplication

- **Research/synthesis apply-logic exists 3×** — `nodes.ts:129-196` + `:259-310` copy
  `executeJob`'s branches **without** the researchEnabled/fuel gates. Extract one gated
  service fn.
- **Five KNN-pair scanners** share copy-pasted structure (synthesis, contradictions,
  temporalChains, merging scan, constellationReconcile); `pairKey` defined 3×. One shared
  `forEachSimilarPair` iterator.
- **Thresholds diverged:** 0.72 in two files; latent-connection 0.82 vs 0.85; prune 0.15
  (heartbeat, not space-scoped!) vs 0.25 (agent job). One constants module.
- **Four "cooling/neglect" definitions** (0.55 entropy / >14d ×3 / >21d).
- Digest family (daily/away/daily_log/telegram) re-derives the same events 3-4×.
- index.ts `expireActionItems` duplicates unused `NodesRepo.dueActionItems`.

### Client code duplication

- Timestamp parse/format helpers re-implemented in ~7 components → `lib/time.ts`.
- `vecOf` ×4, `bodyRadius` ×3, glow-sprite factory ×6, dispose helper ×2, marquee label ×2,
  sun-clearance constant with **different values** (920 vs 950) → one `graph/util.ts`.
- **Four divergent emotion→hue mappings** (links, particles, beacons, visitors — different
  thresholds AND palettes) → single `emotionHue()` in theme.
- `getVisitorActivity` polled independently by NodeList and FleetPanel every 15s.
- satellites/visitors/subAgents: three hand-rolled "small craft" chassis (~930 lines).

## P3 — Performance (mobile matters)

1. **`getTasks` + `JSON.stringify` every rAF frame** (`Graph3D.tsx:924-931`) — O(tasks×nodes)
   scans + serialization at 60fps just to detect change. Dirty-flag or throttle to 2-4 Hz.
2. Per-frame Map/Vector3 allocation churn (orbits currentById, live-node sync map, follow
   clones) → reuse `nodeByIdRef` + scratch vectors.
3. `getLinkActivity`: 7 accessors × per link × 250ms refresh, each doing `Date.parse` — memoize
   with ~1s TTL.
4. engineAudio runs a second permanent rAF and reads localStorage/matchMedia per frame; easing
   is frame-rate dependent. Drive from the existing tick, cache the flag, dt-based easing.
5. Craft systems do `nodes.find`/`filter` per slot per frame.
6. d3 sim kept hot forever while all nodes are pinned (deliberate; revisit if mobile GC hitches).
7. dailyDigest loads the whole graph (`GraphService.full()`) to count cooling — use SQL.
8. `edges` table has no `space_id` index.

## P4 — Dead code / stale text

- `"chat"` DockTab enum + alias (nothing sets it); `current_space_id` localStorage write.
- sfx recipes never played: `thrust`, `decel`, `open`, `close`, `confirm`, `error`.
- `satellites.ts` `onLaunch` param, `sun.ts` `getRadius`, `visitors.ts` `loadedModel`,
  `soumaya.ts` `acquireJob` (near-unreachable duplicate), `AppContext.graph` (would be a
  tenancy bug if used), `NodesRepo.findByLabel`/`dueActionItems`, `deleteDocEmbedding`,
  `multiHopDirected` (test-only), seed.ts test exports.
- Dead route: `GET /api/nodes/:id` (client never calls it).
- **Help menu**: missing entries for Fleet tab/visitor activity, Active Flight Tasks,
  Consistency grid, Telegram linking, API budget, NotificationsBar chips, research-questions
  form, ObjectLoreCard. Wrong entries: two near-duplicate "Sectors" cards describing a
  by-type grouping that doesn't exist; cockpit toggle said to be in "companion tab"; stale
  "Companion Command Center" name. CompanionPanel + ship-tap both point to a chat that isn't
  there (real chat = 💬 ChatDock FAB).

## Suggested sequencing

1. **Batch 1 (P0):** Gemini metering + fail-closed admin + per-space research_enabled +
   codex-claim allow-list + action-age payout + executeJob re-validation + telemetry strips.
2. **Batch 2 (P1 quick):** demo isolation, link-freshness max(), engine volume, spaceId
   fallback unification, double-run guard, DB bootstrap dedupe + schema true-up.
3. **Batch 3 (P2 UI):** tab consolidation 13→7/8 + Help rewrite (needs user sign-off).
4. **Batch 4 (P2 gamification):** dedupe ladders/achievements, economy rebalance (user
   sign-off on feel), visible spends + one player-priced action.
5. **Batch 5 (P3/P4):** perf passes + dead-code sweep + helper consolidation (largely
   delegable to `agy` as mechanical work).
