# Spec — Stage 3: Provenance & metadata hygiene

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md). Parent:
> [SECOND_BRAIN_ALIGNMENT.md](../SECOND_BRAIN_ALIGNMENT.md) (alignment axis 5 + 8).
> Status: **DRAFT → implementing.** (This is the Stage 3 that was listed in the
> alignment plan but missed in the first spec batch.)

## 🎯 Objective

Two briefing-named hygiene gaps: **provenance** ("is this *my* memory or something
Soumaya wrote?") and **lint** (surface orphan / drifting memories — the top failure
mode is "context decay" where dropped threads pile up invisibly). We already have
decay (entropy/cooling); this adds *who-wrote-it* and *what's-drifting*.

## 📐 Architecture / blast radius

| Layer | Change | Zone |
|-------|--------|------|
| `db` | additive `nodes.origin TEXT` (bootstrap + idempotent migration). | 🔴 |
| `shared` | `GraphNode.origin?: "user" \| "agent"`. | 🔴 |
| `repositories/nodes` | `NewNode.origin`; `create` writes it; `toGraphNode` reads it. | 🔴 |
| constellations route | MOC hubs are created with `origin: "agent"` (Soumaya-authored summaries). | 🟢 |
| `web` NodeInspector | a small "✦ Charted by Soumaya" badge when `origin === "agent"`. | 🟢 |
| `web` NodeList | a "🪐 drifting" quick-filter = memories with 0 links (orphan lint). | 🟢 |

No migration risk: `origin` is nullable; a null/missing value reads as user-authored.

## Logic

- **Provenance:** default null → treated as `user`. Genuinely AI-authored nodes are
  set `agent` (MOC hubs now; future synthesis-created nodes later). Research that
  *expands an existing* memory keeps it `user` — it's still your memory, just deeper.
- **Orphan lint:** a memory with enriched `degree === 0` (and `kind` memory) is
  "drifting" — no connections yet. The List tab gets a toggle to show only those, so
  dropped threads are findable instead of invisible. (Cooling is already surfaced.)

## UX

- Inspector badge: subtle, only on agent-authored nodes ("✦ Charted by Soumaya").
- "🪐 drifting" chip in the List filter row, beside "❄️ cooling". Empty result →
  "Nothing drifting — every memory is connected."

## 🧪 Test plan

- A promoted MOC hub round-trips with `origin: "agent"`; a normal ingest is `user`/null.
- Migration test: a DB without the column upgrades and reads null origin safely.
- Gate green.

## ✅ Acceptance criteria

1. MOC hubs show as Soumaya-authored; your memories don't.
2. The List tab can isolate drifting (link-less) memories.
3. No migration crash on existing volumes; gate green.

## Deferred

- `status: active | archived` (a softer hide than delete) — note for a later pass;
  entropy/cooling + soft-delete already cover most of the need.
- Contradiction detection (lint for conflicting memories) — needs LLM, fuel-gated.
