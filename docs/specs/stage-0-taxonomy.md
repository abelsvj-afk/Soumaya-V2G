# Spec — Stage 0: Node Taxonomy Expansion ("Wire the Brain" kinds)

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md).
> Parent plan: [SECOND_BRAIN_ALIGNMENT.md](../SECOND_BRAIN_ALIGNMENT.md). Status: **✅ IMPLEMENTED &
> SHIPPED** (verified by Claude 2026-06-30) — live in `packages/shared/src/types.ts` (`NodeType`,
> `NODE_TYPE_LABEL`, `NODE_TYPE_GUIDE`, `LEGACY_NODE_TYPE_ALIASES`, `normalizeNodeType`), used through
> ingestion + the Sectors view. Retained as the design record.

## 🎯 Objective

Type dumped thoughts into the user's target taxonomy so the galaxy is navigable by *kind*, not
just by cluster. Today every memory is one of 6 generic types; the user wants the briefing's
AI-native / CRM-flavored set: **People · Projects · Decisions · Companies · Meetings · Daily ·
Knowledge** (plus `concept`/`other` as catch-alls). This is the prerequisite for MOCs (Stage 1)
and the Observatory (Stage 2), and unlocks later relationship/CRM views.

## 📐 Architecture / blast radius (🔴 Red Zone — Claude only)

| Layer | Change |
|-------|--------|
| `packages/shared/src/types.ts` | Expand `NodeType` union + `NODE_TYPES` list to the new canonical set. |
| `packages/shared/src/schema.ts` | The zod `responseSchema` enum the LLM extraction is bound to — **keep flat** (deep schemas are fragile with Gemini). |
| `packages/shared/src/celestial.ts` (or `nodeObject.ts`) | A `TYPE_COLOR` / aura map: one distinct hue per kind so kinds read at a glance. |
| LLM extraction prompt (`ingestion/pipeline.ts` / `llm/*`) | Definitions for each kind so the model classifies correctly. |
| `packages/server/src/llm/heuristic.ts` | Offline keyword classifier per kind (never break the no-key path). |
| `packages/web` List + Sectors | Filter-by-kind chips + a small legend. |

**No DB migration** — `nodes.type` is already free `TEXT`. Legacy rows keep their old values and
are handled by an alias map (below), so nothing breaks.

## Data model

Proposed canonical `NodeType`:

```
person | project | decision | company | meeting | daily | knowledge | concept | other
```

Legacy → canonical alias map (display/color only; stored values untouched):

```
business_idea          -> project
relationship_reflection -> person   (or a dedicated `reflection` — decide in review)
random_thought         -> daily
```

`person` already exists (keep). The extractor emits canonical values going forward; the alias map
keeps old galaxies coherent.

## Logic — classification

- **Cloud LLM:** extraction prompt gains one-line definitions ("*meeting* = a discussion with one
  or more people at a point in time; *decision* = a choice made + its rationale; *company* = an
  organization; *project* = an initiative with an outcome; …") and is bound to the flat enum.
- **Heuristic (offline):** keyword/shape rules — e.g. "met with / call with / synced" → `meeting`;
  "decided / chose / going with" → `decision`; capitalized org-like proper nouns / "Inc/LLC/Corp" →
  `company`; a known person name → `person`; "today / this morning" + journal shape → `daily`;
  reference/definition shape → `knowledge`; fallback `other`.
- One raw dump can yield several typed nodes (the extractor already splits): "Met Sarah from Acme
  about the Q3 launch — we decided to delay" → `person`(Sarah) + `company`(Acme) + `meeting` +
  `decision`.

## UX

- Each kind gets a distinct, contrast-checked color/aura (define the palette in the spec review —
  Phase 4.5 requires explicit semantic colors before build).
- List + Sectors gain filter chips (toggle kinds) and a legend mapping color → kind.
- **Empty state:** no nodes of a filtered kind → "No {kind}s yet." **Loading:** existing galaxy
  loader. **Error:** unknown/legacy type renders with the `other` color, never blank.

## 🧪 Test plan

- `shared`: `NODE_TYPES` covers the new set; alias map resolves every legacy value.
- Heuristic classifier unit tests: representative phrases → expected kind (incl. `other` fallback).
- Schema test: the flat enum still validates an LLM extraction sample (no deep-schema regression).
- Web: filter chips include/exclude by kind; legend renders.
- Whole gate green: `typecheck && test && build`.

## Risks

- **Deep-schema fragility with Gemini** → keep the enum flat; reuse the existing responseSchema shape.
- **Misclassification** → always allow `other`; never hard-fail ingestion on a bad type.
- **Legacy color/continuity** → alias map; no destructive retype of existing data.

## ✅ Acceptance criteria

1. A multi-entity dump produces correctly-typed Person/Company/Meeting/Decision nodes.
2. Offline (no key) classification still assigns sensible kinds via the heuristic.
3. List/Sectors filter by kind; each kind has a distinct, legible color + legend.
4. No existing memory changes type or color regressed; gate green.

## Open questions for review

1. `relationship_reflection` → fold into `person`, or keep a dedicated `reflection` kind?
2. Keep `daily`/`knowledge` ALSO as their existing tables (`daily_logs`, `knowledge_docs`) and add
   the node kinds as a *view*, or migrate toward node-kind as the source of truth?
3. Exact 9-color palette (needs contrast check before build).
