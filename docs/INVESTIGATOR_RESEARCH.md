# Spec: Investigator Mode + Typed Research (research overhaul)

> **Design only (spec-first).** User-reported problem + requested redesign. No code until sign-off.
> Ties into Vision 2.0 (`docs/VISION_2_JOURNEYS.md`) — an investigation naturally spans a Journey.

## The problem (user)
Today there is **one** research behavior (`RESEARCH_SYSTEM` + `buildResearchPrompt` in
`llm/prompts.ts`, called by every provider's `research()`), so Soumaya does the *same kind* of
research for everything. But you don't research a **traumatic life event** the way you research a
**business model**. The research **type** — and its **templates** — must match the subject. And a
new **Investigator Mode** should take precedence over Research Mode.

## The two modes, and their order

### 1) Investigator Mode (runs FIRST, takes precedence)
An **internal** deep-dive. Before any outward research, Soumaya investigates the user's *own*
world to understand the subject: where it comes from, what connects to it, what pattern it's part
of. Investigator can **reach into everything**:
- **Memories + thoughts** (nodes, content, aliases) — semantic (`knn`) + keyword (FTS) + graph
  neighbourhood (edges, hubs).
- **Cognitive layer** — goals, identities, beliefs, people, skills, intentions.
- **Chat conversations** (history), **daily logs**, **insights/dream-cycle beliefs**.
- **Any tab / backend surface** — tasks, timeline/seasons, financial context (aggregated), lore.
Output = an **Investigation Report**: the origin(s) it found, the linked memories/people/events,
the recurring pattern, contradictions, and open questions — all **cited** to real ids (the same
grounded, falsifiable, non-diagnosing discipline as grounded-insight mode; **notices, never
diagnoses** — no clinical labels).

### 2) Research Mode (runs AFTER, applied to the findings, TYPED)
Once the investigation has findings, Research Mode does the *outward/expansive* work — but **typed
to the subject** and using **templates that fit that type**. It operates on the investigation's
findings, not on a bare node.

## Research types (each with its own template/prompt + tone)
Detected from the node/cluster: `type`/`kind`, `tags`, cognitive kind, emotional weight, and the
investigation's own classification. Initial set (extensible):

| type | when | research stance + template focus |
|---|---|---|
| `emotional` (trauma/grief/relationship pain) | heavy emotional weight, personal harm | **gentle, non-clinical.** Trace origins + triggers from the user's memories; reflect patterns; offer coping *frames* + reputable supportive resources (never medical advice/diagnosis); if risk language appears, surface help resources. Templates = compassionate reflection, if-then coping plan. |
| `business` | ventures, StudioSVJ, monetization | market/competitor/model analysis, pricing, risks, next validation step. Templates = lean-canvas-ish, opportunity + risk. |
| `health` | fitness, medical, nutrition | evidence-graded general info + reputable sources, **not** medical advice; habit/if-then framing. |
| `learning` | a skill/subject (Japanese, a craft) | curriculum/next-lesson, spaced-practice tie-in, resources. |
| `relationship` | a specific person/dynamic | history from People CRM + memories; communication framing (kind, non-manipulative). |
| `financial` | money decisions | uses the aggregated finance snapshot + goals; scenario framing (Stage 2/3). |
| `decision` | a choice being weighed | options, trade-offs, what-would-make-each-right, a recommendation. |
| `general` | none of the above | today's default behavior, kept as the fallback. |

Each type = a distinct system prompt + prompt-builder (peers of `RESEARCH_SYSTEM`/
`buildResearchPrompt`), selectable via a `researchType` the investigation assigns.

## Flow
```
subject (node / cluster / question)
  → Investigator: internal cross-reference (memories, cognitive, chat, tabs, finance)
      → Investigation Report (cited origins + links + pattern + open questions) + researchType
  → Research (TYPED): expand the findings with the matching template/tone (+ web lookup when useful)
      → Research Result attached to the subject; may spawn follow-up questions / a gentle nudge
```

## Architecture (maps to real seams)
- **LLM adapter:** add `investigate?(subject, evidence): Promise<InvestigationReport>` (optional;
  heuristic provides a deterministic template fallback so it's offline-safe) and generalize
  `research()` to take a `researchType` + the investigation findings. Both degrade gracefully.
- **Prompts:** split `RESEARCH_SYSTEM` into a registry keyed by `researchType`; add
  `INVESTIGATOR_SYSTEM` + `buildInvestigationPrompt(subject, evidence)`.
- **Evidence gathering (deterministic, offline):** a server module assembles the investigation's
  evidence pack — `knn` + FTS + graph neighbours + cognitive links + recent chat/daily logs +
  aggregated finance — all **space-scoped**, capped for token budget, cited by id. This is the
  "reach into everything" and it needs **no** LLM (the LLM only *interprets* the pack).
- **Type detection:** deterministic first pass (type/kind/tags/emotion) → the investigation can
  refine it. Never hard-fails; defaults to `general`.
- **Guardrails:** the emotional type is the sensitive one — **notices, never diagnoses**, no
  clinical labels, falsifiable ("does that land?"), surfaces support resources on risk language,
  and stays within the app's grounded-insight discipline. All types honor the offline heuristic
  fallback + Research-Mode token/Fuel gating that already exists.

## UX
- Investigator precedence is the default: "Investigate" a memory/topic → shows the Investigation
  Report (cited), then a "Research this" step runs the typed research on the findings. The current
  Research button becomes the second stage.
- Reports + typed research attach to the node (and, in Vision 2.0, to its Journey).

## Sequencing (each specced-in-place, shippable, offline-safe, gate-green)
1. Deterministic **evidence pack** builder + `researchType` detection (no LLM) + tests.
2. **Typed research** prompt registry (emotional/business/health/learning/relationship/financial/
   decision/general) replacing the single template; keep `general` as the exact current behavior.
3. **Investigator Mode**: `investigate()` + report, running before research and feeding it.
4. UX: Investigate → Report → typed Research; attach to node/Journey.

## Open questions for sign-off
1. Should Investigator run **automatically** before every Research, or be its own explicit action
   that then offers Research? (Proposed: Investigator is the default entry; Research is stage 2.)
2. How much chat history / how many memories in the evidence pack by default (token budget vs.
   depth)? Proposed: top-K by relevance, capped, always cited.
3. Any research types to add/rename beyond the initial set?
