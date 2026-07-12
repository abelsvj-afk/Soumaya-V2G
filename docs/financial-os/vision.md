# Financial OS — Vision (Phase 2)

> How the Financial OS fits into Soumaya · Second Brain and the broader "AI Operating System for your
> life." Depends on [idea.md](./idea.md). Read next: [requirements.md](./requirements.md).

## The bigger picture — Soumaya as a life OS

Soumaya today solves the **knowledge side**: memories, notes, conversations, goals, and a knowledge
graph that gives the assistant long-term, personal context. The insight driving this module is that the
same context engine can host a **life-management layer** — not as separate apps, but as **modules inside
one ecosystem**, all reading from and writing to the shared memory + knowledge graph.

```
Soumaya · Second Brain
│
├── Memory System        (shipped)    conversations · documents · journal · goals · knowledge graph
├── Financial OS         (THIS)       income · expenses · budget · bills · debt · savings · forecast
├── Life OS              (future)     calendar · tasks · habits · appointments · routines · reminders
├── Health               (future)     weight · sleep · medication · workouts · nutrition
├── Career               (future)     resume · certs · applications · education · licenses
├── Business             (future)     clients · CRM · invoices · profit · taxes
└── AI Assistant         (partial)    research · planning · automation · coaching · decision support
```

The **AI Assistant** column is not a separate module — it is Soumaya herself, the orchestrator that
already exists (chat/GraphRAG + the tool-router fleet). Each new module extends what she can see and act
on. The Financial OS is deliberately **first** because it has the highest daily stakes and the cleanest
demonstration of the shared-context thesis: *she coaches your money using goals you told her months ago.*

## Why modules, not apps

- **Shared context is the moat.** A standalone budgeting app can never answer "when can I move into an
  apartment?" in the context of your actual goals, people, and priorities. Soumaya can, because the goal
  node already lives in the graph.
- **One assistant, many surfaces.** The user talks to one Soumaya, not five chatbots. She reaches across
  modules: *"you set a savings goal for the apartment; three extra shifts this week covers this month's
  gap."*
- **Reuse the platform.** Multi-tenancy (`space_id`), auth, provider seams (LLM/embeddings + a new OCR
  seam), the repository pattern, additive migrations, the rate-limited validated API, and the tool-router
  are all already built. A module is new tables + services + a tab, not a new product.

## How the Financial OS plugs into the existing engine

- **Memory Engine / Knowledge Graph** — Financial *facts* (a specific transaction) live in the module's
  own relational tables (the Budget Engine owns that SQL, per the repository convention). Financial
  *meaning* — "I'm trying to pay off the car," "rent is the priority," "saving for an apartment" — lives
  in the knowledge graph as goal/intention nodes. The two are linked so the assistant can reason across
  them without denormalizing money rows into the graph.
- **AI Orchestrator (Soumaya chat / GraphRAG)** — gains read access to a compact **financial snapshot**
  (balances, reserved, safe-to-spend, upcoming bills, week-to-date earnings) that it can cite when
  answering, exactly like it cites memories today. Money math is computed deterministically; the LLM only
  *explains* and *advises* over already-correct numbers.
- **Tool-router fleet** (`agent/tools/*`) — gains money-aware tools (e.g. a bill-risk nudge, a
  low-safe-to-spend heads-up, a "log this week's earnings?" prompt) that fire at most once/day each, in
  her voice — the same gentle, rate-limited pattern the memory tools already use.
- **Galaxy metaphor (optional, later)** — bills and goals can eventually appear as celestial bodies
  (a looming bill = an approaching body; a savings goal that brightens as it fills). Not required for the
  module to work; a candidate for the UX phase.

## Guardrails the vision must respect (inherited house rules)

- **Never hard-depend on a cloud key.** OCR and LLM advice degrade gracefully: manual entry replaces OCR;
  deterministic cash-flow math + templated summaries replace LLM Q&A. The module is fully usable offline.
- **Space-scoped + sensitive-by-default.** Every financial table carries `space_id`. Money data is the
  most sensitive data in the app and is designed as such from day one (see architecture: at-rest
  handling, redaction in logs, no third-party egress of raw statements).
- **Additive, non-breaking.** New tables via bootstrap + idempotent migrations; the module is a new tab
  that changes nothing about the existing galaxy/memory experience if a user never opens it.
- **Coach, don't nag.** Proactive nudges are gentle, rate-limited, and framed as help — consistent with
  the neuro north-star of humane, non-punishing gamification.

## The north-star scenes this vision is aiming at

1. Snap three earnings screenshots and a rent statement → a trustworthy **Safe to Spend** appears, with
   zero typing.
2. Mid-week, before you overspend, Soumaya says: *"Insurance ($250) is due Friday and you're $18 short at
   your current pace — one more shift covers it."*
3. You ask, in plain language: *"If I pick up three extra shifts, can I clear the credit card this
   month?"* and she answers from **your** numbers and **your** goals — because the Financial OS and the
   Second Brain are the same system.
