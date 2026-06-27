# PROJECT_STATE.md

> Living status snapshot, per [docs/AI_ENGINEERING_WORKFLOW.md](./docs/AI_ENGINEERING_WORKFLOW.md).
> Update whenever project status changes.

**Current Phase:** Feature growth on a shipped product (Soumaya · Second Brain is live on Fly.io).

**Current Sprint:** Gamification Waves 1–2, then the second-brain growth design pass.

## Completed (recent)
- Gamification **Wave 1** — celebratory toasts, return greeting, memory-count milestones, fuel pops,
  tier-up toasts.
- Gamification **Wave 2** — achievements (7 feats) + the **🏆 Awards tab** trophy case
  (`AchievementsPanel`); **daily-tending streaks** (server-authoritative `StreakRepo` over additive
  `space_meta` columns, 🔥 HUD chip + Awards banner, +2 fuel/day bonus).
- Fixed agy's stale `api.test.ts` (gamerTag auth migration) — gate green at **91 tests**.
- Adopted mandatory [AI engineering workflow](./docs/AI_ENGINEERING_WORKFLOW.md) +
  [second-brain north star](./docs/SECOND_BRAIN_BRIEFING.md); wrote
  [alignment + growth plan](./docs/SECOND_BRAIN_ALIGNMENT.md).

## In Progress
- **Design pass (Rule #1, no code yet)** for second-brain growth — specs drafted, awaiting approval:
  - [Stage 0 — Taxonomy expansion](./docs/specs/stage-0-taxonomy.md) 🔴 — **IMPLEMENTED.** `NodeType`
    is now person·project·decision·company·meeting·daily·knowledge·concept·other; legacy values
    (business_idea/relationship_reflection/random_thought) map via `normalizeNodeType` (no migration —
    type is free TEXT). Extraction prompt + offline heuristic classify into the new kinds (tested);
    per-kind color (`colorForType`, legacy-tolerant); List tab filters by kind + a color legend.
    Gate green (92 tests).
  - [Stage 1 — Constellation hubs / MOCs](./docs/specs/stage-1-mocs.md) 🔴 — **IMPLEMENTED (v1).**
    `moc` node kind + `summarizes` edges; `POST /api/constellations/promote` turns a detected cluster
    into a persistent, named hub with a curated summary (offline-safe via `summarizeSector`), space-
    scoped. Insights tab gains an inline "✦ Save as constellation"; the hub renders as a bright golden
    body with its name as a macro label, and clicking it shows summary + members. Gate green (94 tests).
    Deferred: Soumaya *auto-proposing* hubs at the squeeze point (manual human-curated promotion ships now).
  - [Stage 3 — Provenance & hygiene](./docs/specs/stage-3-provenance.md) 🔴 — **IMPLEMENTED.** Additive
    `nodes.origin` column (bootstrap + migration); `GraphNode.origin`; MOC hubs created as `origin:"agent"`.
    NodeInspector shows a "✦ Charted by Soumaya" badge on agent-authored nodes; List tab gains a
    "🪐 drifting" orphan-lint filter (link-less memories). Gate green (94 tests).
  - [Stage 2 — The Observatory (home)](./docs/specs/stage-2-observatory.md) 🟢 — **IMPLEMENTED.**
    `components/Observatory.tsx` fades in ~3.4s after load (after the cinematic settles; intro
    untouched): greeting + streak, capture, Soumaya's latest connection, your constellations
    (`getConstellations`), jump-back-in (recent), "Enter the galaxy". 🔭 FAB reopens it. New-brain
    hero for empty galaxies. Offline-safe; gate green (91 tests).
  - [Stage 4 — Identity layer wiring](./docs/specs/stage-4-identity-layer.md) 🔴 — **IMPLEMENTED.**
    `server/identity.ts` loads `soul.md` at boot (cached, frontmatter-stripped) and `graphrag` injects
    it into the chat system prompt's identity slot via `composeSystem({ soul })`. Offline-safe: missing
    file → falls back to the hardcoded ANSWER_SYSTEM voice. Gate green (95 tests). Deferred: wiring soul
    into the daily-log/maintenance voice; editable per-space soul from the Companion tab.

## Blocked
- **Deploy delivery** — GitHub Actions is blocked on this account; nothing ships until `agy` runs a
  manual `fly deploy`. The whole gamification batch (Waves 1–2) is pushed but **not yet live** — the
  user can't see the Awards tab / streak chip until a deploy.

## Next Tasks
1. User reviews the three specs (resolve the open questions in each).
2. On approval, implement Stage 0 → 1 → 2 in order (each: implement → test → review).
3. Delegate an `agy` `fly deploy` so the shipped gamification is actually visible.

## Known Issues / awaiting input
- User flagged (earlier) "a bunch of bugs" + controls/navigation UX (couldn't follow a planet that
  flew by) — **awaiting their specific list.**

## Technical Debt
- Web bundle > 500 kB (single chunk) — code-split later.
- Identity layer is DB-backed (persona/companion), not the briefing's editable `soul.md` file family
  (deferred to a later stage).

**Last Updated:** 2026-06-27
