# Project Audit — 2026-07-01 (correctness + gamification)

> Full read-only audit of the whole project (server + web + shared) plus a dedicated gamification
> design/balance review. Run via three parallel review agents + spot-verification. Items marked
> **[FIXED]** were fixed in the same pass; the rest are triaged with severity for follow-up.

## A. Correctness / security bugs

### HIGH
1. **[FIXED] "While you were away" digest silently shows nothing in production.**
   `analysis/awayDigest.ts`. `last_seen_at` is stored ISO (`…T…Z`) but `agent_logs.created_at` /
   `insights.created_at` use SQLite `CURRENT_TIMESTAMP` (`YYYY-MM-DD HH:MM:SS`). The `created_at > since`
   **string** compare never matches (`' '` < `'T'`), so the flagship welcome-back feature reports
   `agentActions: []` / `newContradictions: 0` for real data. Verified empirically (raw compare → 0,
   `datetime()` → 1). Fixed by wrapping both sides in SQLite `datetime()`.
2. **[FIXED] `/api/usage` mounted before the auth guard — anonymous shared-budget DoS.**
   `api/server.ts`. `POST /api/usage {budget:0}` (unauthenticated) blocks all cloud-LLM for every brain;
   `POST /api/usage/reset` zeroes the accrued-cost cap. Fixed: moved behind `requireSpace`, and the
   mutating routes now honor an optional `ADMIN_TOKEN` (`x-admin-token`) so the deploy owner can lock
   budget changes down entirely.

### MEDIUM
3. **[FIXED] Deleting a memory orphaned its attachments.** `repositories/nodes.repo.ts` `delete()`
   removed edges/insights/embedding but not `attachments`, leaking multi-MB base64 blobs forever. Fixed.
4. **[FIXED] Offline-queued ingest could misfile a note into the wrong brain.** `api/client.ts`
   `ingestQueueKey()` fell back to `brain.ingestQueue.default` when `getSpaceId()` was null (queued
   pre-auth), then flushed under whatever brain was active. Fixed: the queue is skipped/keyed only when a
   real space id exists.
5. **Autonomy-on has no per-tick spend ceiling across brains.** `index.ts`. Each 5-min tick can fire one
   paid job per space; `synthesis`/`merging` are USD-paid but not Fuel-gated, and cost is only recorded
   after each call, so a burst of brains can each pass `overBudget()` before the counter catches up. Hard
   USD cap still bounds it, but a per-tick job budget is advisable. *(Follow-up.)*
6. **`daily_log` genesis can hit the cloud LLM with Research Mode off.** `maintenance/agent.ts`. Slips
   past the "Research off = no cloud spend" invariant (one call/brain/day, degrades on quota). *(Minor.)*

### Verified SAFE (checked, not bugs)
- `knn(spaceId)` + relational filter prevents cross-brain vector leaks; attachment download is
  space-scoped (`AttachmentsRepo.get` filters `space_id` + route checks `nodeId`).
- `executeJob` PAID_JOBS re-gate closes the crafted-`complete-job` bypass.
- All migrations additive + idempotent; the `spaces` rename de-dupes to avoid a UNIQUE boot crash.
- Emotional/temporal/dormant math guards NaN, empty arrays, div-by-zero.
- The removed `pendingLinksRef` link-hide system left **no** dangling references.
- `useCountUp` rAF cleanup, `sfx.ts` AudioContext lifecycle (try/caught, throttled, reduced-motion) — safe.

## B. Web performance / three.js leaks (follow-ups)
- **[FIXED] Figurine swap + ship-skin swap leaked geometries/materials.** `updateFigurine` and
  `setShipSkin` removed old objects without `dispose()`; now disposed on swap.
- **Scene-setup effect never disposes on unmount** (lights, PMREM env texture, bloom render targets,
  starfield/nebula/skybox, ship/station/satellites). Leaks on logout→remount. *Biggest remaining leak —
  worth a teardown pass.*
- **`idlePulse` / `repairScan` timers still do O(nodes) `.find()` scans** (the per-link accessors were
  migrated to `nodeByIdRef`, these hot timers weren't) → periodic frame hitches on large brains/mobile;
  and the link queue never fully quiesces. *Migrate to the id map + add a quiescence guard.*

## C. Gamification audit (design + balance)

**Verdict: the economy is sound — no soft-lock, not manipulative — but the reward *curve* drifts toward
volume over quality, and the layer's surface area is large.**

**What's solid**
- **No soft-lock.** Free upkeep (pruning/calibration/harmonization/patrol/genesis-log) always runs at 0
  fuel; Fuel only gates discretionary expansion (`research`/`sector_vibe`, 2 each). Earn (3/memory +
  0.5/link) + regen (~2/hr, ~2.5 days empty→full) far exceed burn. The ladder falls through to free rungs.
- **Retention loop is honest.** The away-digest is heuristic/offline, surfaces *real* autonomous work,
  omits routine jobs, and doesn't nag (<1h suppressed). Streak + quests + resurfacing are genuine.

**Risks / recommendations**
1. **Prestige rewards volume, not quality.** Rank tiers, memory milestones (10…1000), and the black-hole
   "Singularity" at **365 memories** all key off *raw count* — which can incentivize dumping over
   distilling, the opposite of the briefing's atomicity focus. → Add at least one prestige track keyed on
   **quality signals** already computed: constellations promoted (MOCs), link density, breadth of node
   types, streak longevity, contradictions reconciled.
2. **Surface-area drift (the briefing's loudest warning).** ~20 badges, 8 figurines, 4+4 cosmetics, a
   multi-craft fleet — much of it reusing models/conditions. It's defensible as cheap retention scaffolding
   *only while it doesn't crowd out the knowledge layer*. → Resist adding more cosmetics; make new rewards
   reinforce curation.
3. **The MOC/constellation-hub layer has no gamified emergence path.** The one structural gap the north
   star names isn't incentivized. → A quest/achievement for promoting a constellation, or fuel for it,
   would align gamification with the product's actual value.
4. **Fuel may sit near-empty under autonomy-on.** 12 ticks/hr × up to 2 fuel vs 2/hr regen means Research
   Mode work can drain the tank; the HUD gauge could read "empty" a lot. → Consider a small per-tick fuel
   floor or lower autonomy cadence; not a bug, a feel issue.

**Cut / hold:** don't expand the cosmetic/figurine catalog further until a curation-linked reward track
exists. Every new reward should answer "does this make the user curate/link/tend more?"
