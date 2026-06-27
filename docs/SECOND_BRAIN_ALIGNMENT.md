# Second-Brain Alignment — Soumaya vs. the Obsidian briefing

> **Design document. No code yet (Rule #1 of [AI_ENGINEERING_WORKFLOW.md](./AI_ENGINEERING_WORKFLOW.md)).**
> This is the cross-reference between the north-star [SECOND_BRAIN_BRIEFING.md](./SECOND_BRAIN_BRIEFING.md)
> and what Soumaya actually has today, plus the staged growth plan it implies. The
> briefing's research calls the product "Sarmiah" — that's a phonetic guess for
> **Soumaya**. Treat them as the same product.
>
> Last updated: 2026-06-27.

## The headline

Soumaya is **already much closer to the briefing's ideal than the briefing assumes.**
The research couldn't see our code, so it guessed our biggest gap was the AI-context
layer and the maintenance loop. In fact those are two of our **strongest** areas: the
autonomous Soumaya agent is a working implementation of Karpathy's "human curates, AI
maintains" pattern (synthesis, dedup, entropy/decay, link repair), and we already have
a DB-backed persona/companion system. The genuine gaps are **structural navigation**
(MOC/hub nodes, a calm home/observatory) and **provenance metadata** — not identity or
maintenance.

## Scorecard — the briefing's 8 axes

| # | Axis | Today | Where it lives | Verdict |
|---|------|-------|----------------|---------|
| 1 | **Atomicity** (one node = one idea) | LLM extraction splits raw text into typed nodes | `ingestion/pipeline.ts`, `shared` `NodeType` | 🟢 Strong |
| 2 | **Link density & typing** | Edges are typed (`RelationshipType`) + weighted; associative auto-linking by embedding similarity | `repositories/edges`, `vec.ts` `knn` | 🟢 Strong (tune threshold) |
| 3 | **Hub / MOC layer** | Clusters are *detected* (`findConstellations`) and hubs get a `celestial_title`, but there is **no persistent, named, annotated hub node** you navigate from | `ml/cluster.ts`, `nodeObject.ts` | 🔴 **Gap** |
| 4 | **Entry point** (calm home/observatory) | Recenter framing exists; no single "home constellation" node that orients a newcomer | `Graph3D.tsx` | 🟠 Partial |
| 5 | **Metadata schema** | Nodes carry `type`, `tags`, `importance`, `created_at`, `occurred_at`, `kind`, `last_tended_at` | `db/schema.ts` | 🟠 Partial — missing `status` + provenance (`agent_written`/`source`) |
| 6 | **AI-context layer** (soul/user/identity/agents/memory) | DB-backed: `user_persona`, `instruction_profiles`, `knowledge_docs`, auto-derive (`persona/derive.ts`). No editable `soul.md`/`identity.md` for the agent itself | Companion system | 🟠 Partial — capability exists, not as the briefing's file family |
| 7 | **Capture friction** | Drop-a-thought `IngestPanel`, `daily_logs`, Telegram ingestion | `IngestPanel.tsx`, `telegram/bot.ts` | 🟢 Strong |
| 8 | **Curation / maintenance loop** | Autonomous agent: synthesis, duplicate dedup, entropy/decay (memories cool), link decay + repair, research | `maintenance/agent.ts`, `synthesis/*`, entropy in `celestial.ts` | 🟢 Strong (the Karpathy maintainer pattern, already built) |

**Net:** 4 strong, 3 partial, **1 real gap (MOC/hub layer)** — which happens to map onto
our galaxy metaphor more naturally than onto Obsidian itself (notes = stars, **MOCs =
constellations**, home = observatory; the briefing says this almost verbatim).

## Where the metaphor does the work for us

The briefing repeatedly lands on the exact picture we already render:
> notes = stars, MOCs = constellations, folders/areas = galaxies, the home note = the observatory.

So the highest-value features are the ones that make the **substance** match the visual we
already have — turning detected clusters into real, named **constellation hub nodes**, and
giving the galaxy a calm **observatory** to enter from.

## The user's target taxonomy — "Wire the Brain" (handwritten note, 2026-06-27)

The user sketched the concrete vault structure to build toward. It mirrors the briefing's
AI-native layout (`/people (CRM) /projects /daily /synthesis …`):

| # | Desired category | Today in Soumaya | Action |
|---|------------------|------------------|--------|
| 1 | **People** | `person` node type ✓ | keep |
| 2 | **Projects** | — (closest: `business_idea`) | **add node kind** |
| 3 | **Decisions** | — | **add node kind** |
| 4 | **Companies** | — | **add node kind** |
| 5 | **Meetings** | — | **add node kind** |
| 6 | **Daily** | `daily_logs` table + `random_thought` | surface as a kind/view |
| 7 | **Knowledge** | `knowledge_docs` (Companion) + `concept` | unify under a kind |
| 8 | **MOCs** (Maps of Content — summaries of bodies of work, consolidations) | detected clusters only, no hub node | **= Stage 1 below** |
| 16 | **Self-Healing** | autonomous maintenance agent ✓ (synthesis, dedup, entropy/decay, link repair) | keep / extend |

**Implication — a Stage 0 the briefing didn't surface:** expand `NodeType` from the current
6 to a taxonomy that covers People · Projects · Decisions · Companies · Meetings · Daily ·
Knowledge (+ keep `concept`/`other`). This is **Red Zone**: it touches `shared` `NodeType` +
the zod `responseSchema`, the LLM extraction prompt + heuristic classifier (so raw thoughts get
typed into these kinds), the celestial color map, and the List/Sector filters. No DB migration
needed (node `type` is already free `TEXT`), but it is a core-model reshape and gets its own spec.

Folders in Obsidian → **node kinds + MOC hubs** here (we stay link-first per the briefing; we do
NOT add a filesystem folder tree). "Daily" and "Knowledge" partly exist as their own tables today;
the design question is whether to fold them into the node taxonomy or keep them as adjacent stores.

## Staged growth plan (design-only — each stage gets its own spec before code)

### Stage 0 — Taxonomy expansion (the "Wire the Brain" kinds) 🔴 prerequisite for the rest
Expand `NodeType` to People · Project · Decision · Company · Meeting · Daily · Knowledge ·
Concept · Other; teach the extractor + heuristic to classify into them; give each a distinct
celestial color/aura; expose them as filters in List/Sectors. CRM-flavored kinds (People,
Companies) also unlock relationship views later.
- *Benchmark:* a dumped thought about a meeting with a person at a company yields correctly-typed
  Meeting / Person / Company nodes, filterable in the UI.


Ordered by ROI × alignment with what already exists. Each stage is gated by the workflow:
spec → approval → implement → test → review. **Specs drafted (awaiting approval):**
[Stage 0 — Taxonomy](./specs/stage-0-taxonomy.md) · [Stage 1 — MOCs](./specs/stage-1-mocs.md) ·
[Stage 2 — Observatory](./specs/stage-2-observatory.md).

### Stage 1 — Constellation hubs (MOC layer) 🔴 closes the one real gap
Promote a dense detected cluster into a **persistent, named, annotated "constellation"
node** that acts as a launchpad: it links its members, carries a short curated blurb, and
renders as a labeled super-structure in the galaxy. Emergence trigger = the briefing's
"mental squeeze point" (a cluster crosses a density threshold → Soumaya proposes a hub).
- *Touches:* `shared` (a `constellation`/`moc` node kind or a `hub` flag — RED), `ml/cluster.ts`,
  graph service enrichment, `nodeObject.ts` rendering, a Sectors/UI affordance to name/curate.
- *Benchmark:* every major cluster has a hub node you can open, read, and navigate from.

### Stage 2 — The Observatory (calm home entry) 🟠
A single glanceable entry constellation: a few starting points (active threads, today's
capture, Soumaya's newest insight, your top constellations) instead of dropping the user
into the full sea. Maps to the briefing's "home/observatory" + progressive disclosure.
- *Touches:* `Graph3D` initial framing, a small home overlay/panel, reuse digest + streak.
- *Benchmark:* a newcomer can orient in one screen without searching.

### Stage 3 — Provenance & metadata hygiene 🟡
Add `status` (active/archived) and a provenance flag (`agent_written` / `source`:
extracted vs inferred vs ambiguous) to nodes; surface "AI-written vs you-written" and lint
for orphans / contradictions / stale ("context decay") — the briefing's top failure mode.
We already have entropy (decay) and dedup; this extends them into an explicit hygiene pass.
- *Touches:* `db/schema.ts` + additive `migrateSchema` (RED), enrichment, a maintenance job,
  a subtle node badge.
- *Benchmark:* you can tell at a glance what Soumaya wrote vs you, and orphans are surfaced.

### Stage 4 — The soul/identity file layer (AI-context) 🟡
Give Soumaya an explicit, editable identity surfaced from the existing persona system —
a `soul.md`-equivalent (voice/values/boundaries, the briefing's Lineage B 8-layer shape
since Soumaya is an operational assistant), `identity.md` (name/role/vibe), and a `user.md`
(who the human is + authority levels). Could remain DB-backed but exposed as editable docs.
- *Caveat from the briefing:* soul files are **context, not security** — enforce real limits
  at the harness/tool level, keep secrets out, and budget for persona drift (re-anchoring).
- *Benchmark:* the agent can answer "who am I, who do I serve, how do I behave?" from these.

## What to explicitly SKIP (per the briefing)

- Rigid filesystem taxonomies (full PARA trees, classic folder Johnny Decimal) — they fight
  a node/link system; we're correctly on the bottom-up/linking side already.
- Plugin maximalism — import the *patterns* (self-updating view, whiteboard, timeline), not
  a pile of features.
- Treating any `soul.md` as a security boundary.
- Auto-generating context files and walking away — un-curated context files measurably *hurt*
  agent success (ETH Zürich AGENTS.md study). Hand-curate; write only what can't be inferred.

## Open questions for the user (resolve before Stage 1 spec)

1. Constellation hubs: should Soumaya **auto-propose** them at the squeeze point, or only
   create on your command? (Briefing favors human-curated.)
2. Are constellations a **new node kind** (cleaner model, more RED surface) or a **flag on an
   existing node** (lighter)?
3. Stage 4: keep identity DB-backed (current) or move to real editable `.md` files in the repo?
