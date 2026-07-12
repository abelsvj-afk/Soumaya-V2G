# Financial OS — Idea (Phase 1)

> Design package for the **Financial OS** module of Soumaya · Second Brain. Per
> [`docs/AI_ENGINEERING_WORKFLOW.md`](../AI_ENGINEERING_WORKFLOW.md) **Rule #1: no code until this
> package is complete.** This is the idea/problem definition only. Read order:
> idea → [vision](./vision.md) → [requirements](./requirements.md) →
> [user-stories](./user-stories.md) → [architecture](./architecture.md).

## The problem

People who most need budgeting help are the ones least served by budgeting apps. If your income is
**irregular** — gig work (GoPuff, DoorDash, Uber, Spark), hourly shifts, a side hustle — the classic
"set a monthly budget in 30 categories" model is useless. You don't know what you'll make this week,
your bills don't line up with your paychecks, and every existing tool assumes you'll *manually type in
every transaction forever*. Nobody does. The app goes stale in a week and the anxiety comes back.

The real question a person in this situation asks is not "how did I do against my grocery budget last
month?" It is, right now, today:

- **"If I spend money today, which bill breaks?"**
- **"How much do I have to earn this week to not fall behind?"**
- **"Can I afford this?"**

That is a **coaching** problem, not a spreadsheet problem. It requires the system to (a) get the data
in with near-zero typing, and (b) hold the person's actual goals and constraints in context so its
answers are personal, not generic.

## Why this belongs in Soumaya (not a separate app)

Soumaya is already a **context engine**: it stores memories, goals, priorities, people, and intentions
in a knowledge graph and answers questions over them with citations. A budgeting feature bolted onto a
separate app is just another spreadsheet. A budgeting feature that **already knows you want to move into
an apartment by spring, that child support is non-negotiable, and that you get stressed about the car
payment** can coach instead of report. The money module is the first concrete piece of a larger
**"AI Operating System for your life"** vision (see [vision.md](./vision.md)) — but it earns its place
now on its own merits: it is the module with the highest daily-stakes payoff and the clearest way to
show the value of shared context.

## Core insight — make the AI do the data entry

The single biggest reason budgeting apps fail is **manual entry burden**. The design principle here is:
**the user should almost never type a number.** They take a screenshot or snap a photo; the system's OCR
+ extraction layer reads it and asks only to confirm. This is the make-or-break of the whole module.

Inputs we must accept with ~zero typing:
- Pay stubs (photo/PDF) → date, gross, net, taxes, hours, employer.
- Gig earnings screenshots (GoPuff / DoorDash / Uber / Spark) → date, amount, platform, hours.
- Bank-transaction screenshots → date, merchant, amount, in/out.
- Receipts, utility bills, loan/insurance statements → amount, payee, due date.
- Pasted Venmo / Cash App history → parsed line items.
- Manual entry, always available as the fallback (and the offline path).

## MVP — the smallest thing that delivers the core value

The MVP is **"Safe to Spend," kept honest automatically.** Concretely:

1. **Ingest income + expenses from screenshots** (OCR → extract → one-tap confirm), plus manual entry.
2. **Recurring bills**, entered once (amount, due date, frequency, autopay).
3. A **live budget** that computes, from current balance minus money reserved for bills due before the
   next expected income: **Reserved** and **Safe to Spend**.
4. **One proactive coaching nudge**, in Soumaya's voice, delivered through the existing tool-router:
   *"If you spend more than $42 today, your insurance payment will be short."*

Explicitly **out of MVP** (staged later — see requirements): multi-month forecasting Q&A ("can I afford
a PS6 next month?"), debt-payoff planning, savings-goal automation, tax estimation, business/CRM. The MVP
proves the ingestion loop and the live-budget-with-a-nudge loop. Everything else composes on top.

## Non-goals (for the whole module, not just MVP)

- **Not** a bank aggregator. No Plaid / direct bank API in the initial design — it adds cost, a hard
  cloud dependency, PCI-adjacent risk, and a signup wall. Screenshots + OCR keep it universal and
  offline-friendly; a bank-link integration can be added later as an optional *input adapter*.
- **Not** a full double-entry accounting system. It is a personal cash-flow coach.
- **Not** something that ever hard-depends on a cloud key. Consistent with the house rule: there is
  always a no-API-key path (manual entry replaces OCR; deterministic math replaces LLM Q&A).

## Success criteria

- A user can go from install to a trustworthy "Safe to Spend" number in **under 5 minutes**, having
  typed **zero** dollar amounts (screenshots only).
- The number stays correct as money comes in and goes out, with the user only confirming extractions.
- The proactive nudge fires **before** an overspend causes a missed bill, at least once, in a real week.
- Financial data is space-scoped and treated as **sensitive by default** (see security in architecture).
