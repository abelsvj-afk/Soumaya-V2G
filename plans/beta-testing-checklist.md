# Beta Testing Checklist — Master Backlog

**Canonical.** This is the project's master backlog. New issues are appended as
"Additions" beneath the canonical base, never by rebuilding the doc. Status keys:
✅ shipped · 🟡 partial · ⬜ todo. Each ⬜/🟡 item carries a short implementation
plan (approach + the real files it touches) so it can be picked up directly.

Priority keys: **P0** (do next) · **P1** (soon) · **P2** (vision / larger).

---

## Beta Testing Checklist v0.1 (Canonical — already shipped)

These are the foundations already in the app (so the backlog reflects reality):

- ✅ 3D galaxy with celestial mass model, kinematic orbits, LOD/macro view, bloom, env-map.
- ✅ Ingestion → typed nodes + associative auto-linking; offline heuristic fallback (no key).
- ✅ Multi-tenant private brains (name + passcode), per-brain `space_id` scoping.
- ✅ Chat-with-your-brain (GraphRAG, cited) · synthesis insights · daily digest.
- ✅ Celestial Economy (Fuel + Entropy) · Aura beacons (emotion-tinted, guard mode).
- ✅ Soumaya autonomy: 24/7 server-side loop (Research Mode + budget + Fuel gated).
- ✅ Temporal + tagged memories (`occurred_at` / `remind_at` / `tags`) · Action Items / Agenda.
- ✅ Telegram bridge (link + chat/log + proactive daily digest).
- ✅ Lore engine (persistent, versioned, world-aware Chronicle).
- ✅ Fleet & sub-agents (Scout/Defender + 🚀 roster) · installable PWA · generative score.
- ✅ AI Companion: dual-layer prompts (identity + stackable, intent-routed instruction
  profiles) + knowledge-doc RAG (text/MD) + **auto-derived "About Me" persona** (not editable).
- ✅ Living threads: new links hidden until Soumaya draws them; idle pulse; synapse firing on activity.

---

## ➕ Additions to v0.1 (organized + prioritized)

### 🗺 Navigation & Traversal

- 🟡 **P0 — Label every sidebar/dock tab.** Tabs are emoji-only → hard to tell which is
  active and hard to map to code.
  - *Done:* each tab now has a human `name` used as `title` tooltip + `aria-label`, plus
    `aria-current` on the active tab (`RightDock.tsx`).
  - *Remaining:* show the visible text label beside the icon on wide docks (responsive CSS).

### 🧠 Memory Discovery System

- 🟡 **P0 — Expand memory metadata in the List view.** (mostly shipped)
  - *Done:* `NodeList.tsx` rows now show growth stage (`celestial` + `CELESTIAL_ICON`),
    connection count (`degree`), when (`occurredAt ?? createdAt`, relative), emotional
    signature (warm/neutral/heavy dot), cooling (❄️ via `entropy`), and tags.
  - *Remaining:* constellation membership (needs `/api/constellations`) + visitor indicators
    (needs the Visitor-activity item below).
- ⬜ **P1 — Timeline context / grouping.** Locate memories by *when* (day / week / month /
  year / life period).
  - *Plan:* a timeline grouping mode in the List (or a new "🕰 Timeline" sub-view) that
    buckets by `occurredAt ?? createdAt`. The List already sorts "most recent"; grouping
    headers are the next step. Files: `NodeList.tsx` (+ maybe a `TimelinePanel.tsx`).
- ✅ **P1 — Visual-based discovery (find without the name).** Shipped: `NodeList` filter bar
  filters by size/growth stage, emotional signature (warm/neutral/heavy), memory type,
  ❄️ cooling/brightness, and tags, with sort by heaviest/recent/most-connected/name. (Literal
  ring/moon filters skipped — not first-class features; size tier covers "large … planet".)
- 🟡 **P1 — Cluster context (why these belong together).** Sectors/constellations exist but
  don't explain the bond.
  - *Plan:* in `SectorView.tsx` / constellations, surface shared signals across a cluster:
    shared tags, shared people (person-type nodes), shared time window (`occurredAt` span),
    shared emotional tone. Compute server-side in the constellations route or client-side
    from cluster members. Files: `api/routes/constellations.ts`, `SectorView.tsx`.
- 🟡 **P1 — Improve identification without the title (umbrella).** Satisfied collectively by
  Timeline + Visual discovery + Cluster context above; track as the rollup acceptance item.

### 👽 Visitor System

- ⬜ **P1 — Visitor activity tracking.** Show most-visited memories, visitor history, types,
  frequency.
  - *Plan:* a `visitor_log(space_id, node_id, visitor_type, at)` table (additive migration)
    written when `visitors.ts` parks a craft on a memory; a small read API + a panel/section.
    Files: `db/schema.ts`+`db/client.ts`, new `repositories/visitors.repo.ts`, a route, and
    a UI surface (Fleet tab or List indicators). Feeds the "visitor indicators" in List view.
- ⬜ **P2 — Define alien attraction logic.** Make *why* a visitor picks a memory explicit.
  - *Plan:* formalize target scoring in `web/src/graph/visitors.ts` from emotional intensity
    (`|emotionalWeight|`), emotional rarity (distance from brain average), importance/mass,
    connection density (`degree`), recency (`lastTendedAt`), revisit frequency (visitor_log).
    Keep it the single scoring function so it's tunable. Files: `visitors.ts`.

### 🧠 UX / Immersion

- 🟡 **P2 — Brain-like structure at scale.** At high memory counts the galaxy should read as
  an active brain (neurons, glowing pathways, signals).
  - *Plan:* builds on the shipped threads. At macro zoom, bias link rendering toward
    neuron-like filaments (curvature/opacity by activity), and intensify the idle pulse +
    activity firing density with node count. Files: `web/src/graph/Graph3D.tsx` (link
    accessors, `idlePulse`, LOD branch).
- 🟡 **P2 — Simulate neural signal activity (recall events).** Connected memories pulse when
  *recalled*, signals travel pathways during real events.
  - *Plan:* extend the existing event-driven firing: when a chat answer cites nodes, fire
    pulses along the path from the seed to each cited node (a "recall" animation); when
    autonomy works a node, fire its synapses (already partly done via `fireAlongNode`).
    Files: `Graph3D.tsx` (a `fireRecall(citationIds)` driven by `ChatPanel` citations),
    `App.tsx` wiring.

### 🤖 AI Companion (continued)

- ✅ **Persona auto-updates, not user-editable.** `persona/derive.ts` synthesizes "About Me"
  from the brain (themes, emotion, hubs, span); refreshed on read (stale >6h) + in the
  autonomy loop; UI is read-only with an "↻ Update now". (Shipped.)
- ⬜ **P2 — Behavioral "Knows Me" deepening.** Fold conversation history + interaction
  patterns (not just memories) into the derived persona. *Plan:* extend `derivePersona`
  inputs once a chat/interaction log exists; optional LLM-authored persona when budget allows.

### 📌 Core Design Principle (acceptance lens)
> A user should be able to find a memory **without remembering its name** — via visual,
> emotional, timeline, activity, relationship, or visitor-activity recognition. The
> Discovery items above are "done" only when this holds end-to-end.

---

## Suggested order
1. **P0:** ✅ tab labels → ✅ expanded List metadata + ✅ visual discovery filters.
2. **P1 (next):** visitor activity tracking → timeline grouping → cluster context.
3. **P2:** attraction logic → brain-at-scale + recall-signal animation → behavioral persona.
