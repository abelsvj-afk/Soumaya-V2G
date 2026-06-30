# Spec — Stage 1: Constellation Hubs (Maps of Content / MOCs)

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md).
> Parent plan: [SECOND_BRAIN_ALIGNMENT.md](../SECOND_BRAIN_ALIGNMENT.md). Depends on: nothing hard
> (works on the current model; richer with Stage 0). Status: **✅ IMPLEMENTED & SHIPPED** (verified by
> Claude 2026-06-30) — `moc` is a live node kind and `/api/constellations`
> (`packages/server/src/api/routes/constellations.ts`) is mounted. Retained as the design record.

## 🎯 Objective

Close the one true gap (alignment axis 3, the user's note #8): promote a dense cluster of memories
into a **persistent, named, annotated "constellation" hub node** — a Map of Content. It carries a
short curated summary ("summary of a body of work"), links its members, and renders as a bright,
labeled super-structure you navigate from. This is the briefing's "MOCs = constellations" made real
and the **"human curates, AI organizes"** loop: Soumaya *proposes*, the user *names/confirms*.

## 📐 Architecture / blast radius

| Layer | Change | Zone |
|-------|--------|------|
| `shared/types.ts` | Add node kind `moc` (constellation); add relationship `summarizes` (MOC→member). Optional `summary`/`memberCount` enrichment fields on `GraphNode`. | 🔴 |
| `db` | No new table — a MOC is a `nodes` row with `type='moc'`; membership is `edges`. (Reuses rendering, mass, lore, space-scoping.) Possibly an additive `nodes.subtitle` for the curated blurb, or reuse `content`. | 🔴 (migration additive if a column is added) |
| `server` constellations service | Detect candidates (reuse `ml/cluster.ts` `findConstellations`), promote-on-confirm (create the `moc` node + `summarizes` edges), generate the summary (reuse `synthesis/*`; offline = join top member labels). | 🔴 route contract |
| `maintenance/agent.ts` | A fuel/token-gated job that surfaces MOC *candidates* at the "squeeze point" (cluster density threshold) as a proposal (an insight). | 🟡 |
| `web` `nodeObject.ts` | Render the `moc` kind: a labeled nebula/super-structure, always-on macro label. | 🟢 |
| `web` panel | A MOC panel: curated title + summary (editable), member list (click to fly), "isolate system" (reuse `isolateSystem`). Proposal accept/name/dismiss UI (in Insights/Digest). | 🟢 |

## Logic

- **Detection:** reuse `findConstellations`. A cluster becomes a *candidate* when it crosses a
  density/size threshold (the "mental squeeze point") AND isn't already covered by an existing MOC
  (dedup by member-overlap > X%).
- **Proposal (AI organizes):** the maintenance agent emits a proposal: "These N memories about *…*
  look like a constellation — name it?" Gated behind fuel/Research Mode like other agent jobs.
- **Promotion (human curates):** on confirm, create a `type='moc'` node (label = user's name,
  content/subtitle = summary), wire `summarizes` edges to members, enrich with high mass so it reads
  as a hub. The galaxy service already enriches mass/degree/celestial on read — a MOC naturally
  classifies as a giant/star.
- **Summary:** LLM synthesis over member content → 1–3 sentences (reuse the synthesis engine);
  offline heuristic = "Consolidates: {top member labels}." Editable by the user.

## UX (Phase 4.5)

- **Render:** a constellation hub = a bright nebula core + persistent name at macro zoom (so
  zoomed-out clusters are *named*, Obsidian-style). Members visibly belong (existing orbit/links).
- **MOC panel:** title (editable) · curated summary (editable, with "regenerate" if Research Mode) ·
  member list (fly-to) · "Isolate this constellation."
- **Proposal surface:** a card in Insights/Digest — *Name it* (input) · *Dismiss*.
- **States:** *Empty* (no clusters yet) → "Your brain is still forming — constellations appear as
  themes deepen." *Loading* (summary) → skeleton on the hub. *Error* (summary failed) → hub still
  exists with the raw member list and the heuristic blurb; never a dead hub.

## 🧪 Test plan

- Detection: a synthetic dense cluster crosses threshold → candidate; a sparse one does not.
- Dedup: a candidate overlapping an existing MOC is suppressed.
- Promotion: creates exactly one `moc` node + N `summarizes` edges, **space-scoped** (never crosses
  brains), idempotent on re-confirm.
- Summary offline path: no key → heuristic blurb, no throw.
- Gate green.

## Risks

- **Over-proposing (noise)** → conservative threshold + easy dismiss + cooldown per cluster.
- **Summary cost** → fuel-gated, heuristic fallback, cache on the node.
- **Double-promotion** → member-overlap dedup.
- **Metaphor clutter** → cap concurrent MOC labels at macro zoom (LOD), like existing sector titles.

## ✅ Acceptance criteria

1. A dense theme yields a proposal; naming it creates a navigable, named constellation hub.
2. The hub shows a curated summary + member list; clicking a member flies to it; isolate works.
3. Detection/promotion are space-scoped and offline-safe; gate green.
4. Zoomed out, major constellations are labeled.

## Open questions for review

1. `moc` as a node **kind** (recommended — reuses everything) vs a separate table?
2. Curated blurb in `nodes.content`, or an additive `nodes.subtitle` column?
3. Auto-propose at the squeeze point (recommended, gated) vs purely manual "make constellation from selection"?
