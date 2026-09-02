# Spec — The Wealth System: Buckets, Goals, Allocations, and What They Mean

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> Continues the Financial OS architecture documented in [`docs/financial-os/architecture.md`](../financial-os/architecture.md).
> Supersedes the core data model of [`docs/specs/money-jobs-allocation.md`](./money-jobs-allocation.md)
> (see §17, Migration/Supersession Plan) — that spec's suggestion-engine ideas remain valid future work,
> just not part of this. Status: **proposed — not yet implemented.**
>
> **Revision 2** (post-review): elevates Deployable from an internal derived number to a named Wealth
> planning concept; adds a non-blocking point-of-action warning when an allocation would exceed it
> (closing the self-critique gap from Revision 1); keeps Buckets deliberately minimal pending real
> usage rather than adding bucket-level features speculatively; documents a future Financial
> Health/Debt/Credit reasoning layer as an extension point. Real-time reconciliation + the throttled
> proactive nudge (§7) are unchanged from Revision 1 and confirmed as-is. Everything else in this
> spec is unchanged from Revision 1.

---

## 1. Product Vision

Soumaya is not a budgeting app with a savings tracker bolted on. It's meant to become a personal
operating system for a life — where money, goals, decisions, and long-term wealth are all legible
in one place, and the Galaxy is the visual proof that they're connected, not decoration on top of
a spreadsheet.

**Money already answers "what's happening with my money right now?"** — balance, bills, safe-to-spend,
history. It's honest, deterministic, and complete for that question.

**Wealth answers a different question: "what am I intentionally building with my money?"** — not a
prediction, not a bank account, but the user's own stated intent, made visible, trackable, and
honest about the fact that it's intent and not yet reality.

The trucking journey (CDL → income → truck fund → first truck → owner-operator → fleet) is the
first real person this gets built for, and it's a genuinely good stress test — a variable-income
worker with a concrete, expensive, multi-year goal is exactly the case a fixed-salary budgeting
tool handles badly. But nothing about "trucking," "CDL," or "fleet" belongs in the architecture.
The system models buckets, goals, and allocations; a truck is just what one user typed into a
`name` field. A nurse's tuition fund, a freelancer's tax-reserve bucket, and a real-estate
investor's down-payment goal all run through the exact same tables and math.

## 2. Core Concepts and Terminology

| Term | Meaning | Is it real money? |
|---|---|---|
| **Safe-to-Spend** | Existing Money fact: `balance − reserved(bills) − buffer`. What's currently free to spend without missing an upcoming bill. | Yes — derived directly from real balance and real scheduled obligations. |
| **Bucket** | A named organizational category the user defines (Emergency, Retirement, Trucking, Real Estate, Lifestyle, …). Owns no money itself — purely a grouping. | N/A — it's a folder, not a pile of money. |
| **Goal** | A specific objective inside a Bucket, with an optional target amount and/or target date ("$15,000 First Truck Down Payment"). | N/A on its own — it's a target, not money. |
| **Allocation** | A ledger entry recording that the user has decided to direct some amount toward a Goal. Can be positive (allocate) or negative (de-allocate/withdraw). | **No.** It is a record of intent, not a transfer. This is the single most important distinction in this entire spec. |
| **Goal total** | `SUM` of a Goal's allocation ledger. What the user has *decided* belongs to that goal so far. | Intent, not reality — see above. |
| **Allocated (space-wide)** | Sum of every active Goal's total. | Intent. |
| **Deployable / Uncommitted** | `Safe-to-Spend − Allocated`. **This is Wealth's primary planning concept, not an internal implementation detail** — it's the one number the entire allocation experience is built around, always named and shown, never buried as a footnote to Safe-to-Spend. It answers "how much room do I actually have to commit to something new right now?" | Derived; a snapshot, not a reservation (see §9). |
| **Reconciliation** | Whether the user's current financial reality (Safe-to-Spend) still supports their outstanding commitments (Allocated). | A factual comparison, computed, never auto-corrected. |

**On vocabulary, deliberately:** this spec uses *allocated*, *earmarked*, *pledged*, *planned*, and
*goal progress* throughout — never *saved*, *balance*, *deposited*, *invested*, or *transferred*,
because the system does not know that any of those things actually happened. "Saved" implies the
money physically exists somewhere as savings; "allocated" accurately describes what V1 actually
knows: the user has intentionally assigned part of their available financial capacity toward this
goal. This isn't a style preference — it's the load-bearing wall of the whole feature's honesty,
and it applies everywhere this data surfaces: Wealth UI, Money UI, goal history, the Galaxy, chat
context, and any future AI reasoning. A future engineer changing a button label from "Allocate" to
"Save" without reading this section would be quietly turning Wealth into a fictional bank ledger.

## 3. Functional Requirements

**Must have (V1):**
- Create/rename/archive a Bucket.
- Create/edit/archive a Goal inside a Bucket, with optional target amount and/or target date.
- Allocate an amount to a Goal, drawing conceptually from Deployable. **When an allocation would
  take Deployable negative, show a plain, non-blocking warning before it's confirmed** — "this would
  put you $X past what's currently deployable" — the user can still proceed; see §9 for why this is
  a warning, not a hard block.
- De-allocate (withdraw) an amount from a Goal, symmetric to allocating, never destructive to history.
- View a Goal's running total, progress toward target (if any), and full allocation/de-allocation
  history with dates.
- View Deployable (space-wide) and a Reconciliation state (§7).
- See a small, clearly-labeled "earmarked" figure from Money's existing hero, without Money
  recomputing anything itself.
- Expand the Wealth surface into a full-screen presentation (§13).

**Explicitly not required for V1** (see §16 for the full boundary): AI-suggested allocations, bank
or brokerage connections, automatic transfers, forecasting beyond a simple derived rate, profession-
specific fields, a Bucket-level visual hierarchy in the Galaxy.

## 4. Financial Model

The model is a strict, one-directional waterfall from fact to intent:

```
1. Bills due before next income        → reserved            (existing, unchanged, real schedule data)
2. Buffer (always-protected cushion)   → buffer_cents         (existing, unchanged)
3. Safe-to-Spend = balance − 1 − 2     → safeToSpendCents      (existing, unchanged — Money's authoritative fact)
4. Allocated to goals (soft-committed) → Σ goal totals         (NEW — Wealth's own ledger, intent, not a claim on 3)
5. Deployable = 3 − 4                  → deployableCents       (NEW — the number Wealth calls "room to allocate")
```

Steps 1–3 are **untouched by this spec.** `computeBudget()`, `getBudgetSummary()`, and every value
inside `BudgetSummary` keep their exact current meaning and computation. Wealth is purely additive
*downstream* math — it reads `safeToSpendCents` as an input and never redefines it, per the
project's own explicit instruction and because doing otherwise would make "safe to spend" mean two
different things depending on whether Wealth happens to be installed.

**Why step 4 can't be folded into step 3, structurally:** `safeToSpendCents` is recomputed fresh
from real balance and real bill schedules every time it's read. An allocation never touches the
balance. So subtracting allocations from `safeToSpendCents` produces a *second, independently
drifting number* — not a refinement of the first. The two numbers answer different questions
("what can I spend today without missing a bill" vs. "of that, how much have I already decided is
for something else") and must be presented as such, never merged into one line that implies they're
the same kind of fact.

## 5. Data Model

Three new tables. Nothing existing is modified, migrated, or repurposed.

### `fin_bucket`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `space_id` | TEXT NOT NULL DEFAULT 'legacy' | Multi-tenancy, same as every other `fin_*` table |
| `name` | TEXT NOT NULL | User-defined, free text — "Emergency," "Trucking," anything |
| `category` | TEXT NOT NULL DEFAULT 'other' | A loose, free-text hint for icon/grouping (e.g. `emergency`, `retirement`, `business`, `real_estate`, `lifestyle`) — **not a fixed enum**, so a profession or life situation this spec never anticipated still fits |
| `archived` | INTEGER NOT NULL DEFAULT 0 | Rests it, doesn't delete it — matches `archiveNode`'s pattern |
| `created_at` | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP | |

Owns no money column. A bucket's "total" (if shown) is always a live rollup of its goals' totals,
never a stored figure — see §6.

### `fin_goal`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `space_id` | TEXT NOT NULL DEFAULT 'legacy' | |
| `bucket_id` | INTEGER NOT NULL | → `fin_bucket.id` (informal FK, matching this codebase's existing `fin_*` convention of bare references with app-level validation, not `REFERENCES` constraints) |
| `name` | TEXT NOT NULL | "$15,000 First Truck Down Payment" |
| `target_cents` | INTEGER NULL | Absent = open-ended goal, never reaches `goal_reached` |
| `target_date` | TEXT NULL | ISO date, optional |
| `archived` | INTEGER NOT NULL DEFAULT 0 | |
| `created_at` | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**Deliberately excluded from V1, even though it's cheap to add:** a `linked_node_id` (optional
Mind-tab tie-in) and a `tier` column (safety/growth/fun, from the superseded jobs spec). Both are
real, trivially-additive nullable columns with zero migration risk *whenever they're actually
needed* — but neither has a V1 consumer, and this codebase's own standing rule is not to design for
hypothetical future requirements. Adding them now would be exactly the kind of unused speculative
field that invites "wait, does the UI expose this?" confusion later for no present benefit. If §10
or §14's future-AI work materializes, add them then, additively, in one line each.

### `fin_allocation`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `space_id` | TEXT NOT NULL DEFAULT 'legacy' | |
| `goal_id` | INTEGER NOT NULL | → `fin_goal.id` |
| `amount_cents` | INTEGER NOT NULL | **Signed.** Positive = allocate, negative = de-allocate. This single signed ledger is the entire de-allocation model — see §8. |
| `note` | TEXT NULL | Optional, user-supplied ("using this for the emergency instead") |
| `created_at` | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP | |

A Goal's current total is **always `SUM(amount_cents)` over its rows, computed on read — never a
stored, separately-maintained figure.** This is a deliberate choice against the one precedent that
points the other way (`fin_account.balance_cents` *is* a maintained running total): for Goals, the
ledger-is-truth model wins because (a) it makes drift between "the number" and "the history behind
the number" structurally impossible — the exact bug class a maintained-total-plus-separate-history
design invites, and one this session has already hit and fixed elsewhere in this codebase in a
different form — (b) per-goal allocation counts are small and bounded, so `SUM` is exactly the kind
of "cheap sum over a small per-space set" this codebase's Budget Engine already relies on
everywhere, and (c) it gives contribution history for free instead of as a second feature to build
and keep in sync.

`space_id` is added to `TABLES_WITH_SPACE` (`auth/spaces.ts`) for all three tables, matching every
other Financial-OS table.

## 6. Calculation Model

All pure functions, no LLM, living in a new `finance/wealth.ts` (composition) — same tier as
`finance/budget.ts` and `finance/summary.ts`:

```
goalTotalCents(goalId)       = SUM(fin_allocation.amount_cents WHERE goal_id = goalId)
bucketTotalCents(bucketId)   = Σ goalTotalCents(g) for every active goal g in that bucket   // rollup only, never stored
fillPct(goal)                = goal.targetCents ? clamp(goalTotalCents(goal) / goal.targetCents, 0, 1) : null
goalState(goal)               = !goal.targetCents            → "goal_filling" (never reaches "reached" — no ceiling)
                                : fillPct(goal) >= 1           → "goal_reached"
                                : else                         → "goal_filling"
allocatedCents (space-wide)  = Σ goalTotalCents(g) for every active goal g in the space
deployableCents               = safeToSpendCents − allocatedCents        // may be negative — see §7
```

A negative `goalTotalCents` is prevented at write time (§8), so it's never possible to allocate a
goal into negative territory through the app itself; `deployableCents`, by contrast, is *expected*
to go negative — that's the reconciliation signal, not a bug to guard against.

## 7. Reconciliation Model

Because allocations are intent, not a reservation, the user's real financial position can move
*out from under* their commitments — they spend money they'd mentally set aside, a bill they forgot
about lands, anything. The system must notice this rather than silently let the two numbers drift
apart forever.

```
reconciliation = deployableCents >= 0 ? "ok" : "over_committed"
```

That's the entire V1 state machine — two states, computed on every read of the Wealth summary,
never cached, never auto-corrected. When `over_committed`, the copy is plain and factual, never
alarmed or judgmental: *"Your current financial position is below the amount you've earmarked
toward goals by $X."* Nothing is auto-de-allocated, deleted, or adjusted — the user decides what,
if anything, to walk back, using the same de-allocation mechanism as any other withdrawal.

**Where this appears, and how often, deliberately differ:**
- **Inline, in the Wealth UI, always.** Every time a user opens Wealth, the true current state is
  shown — never throttled, never hidden, because passively displaying a fact isn't a nag.
- **As a proactive nudge (toast/Inbox), throttled to at most once a day**, matching the exact
  discipline `agent/tools/billRisk.ts` already uses for the same class of "your numbers don't quite
  add up right now" signal. An unthrottled push notification every time the user spends a coffee
  would train them to ignore Wealth entirely — the existing bill-risk tool already solved this
  problem once; reuse its shape rather than inventing a second one.

This is the piece of the design I'd flag as **the one that must ship with V1, not after it** — a
Wealth system that can silently drift into fiction with no way to notice isn't a trustworthy
foundation, it's a liability wearing a progress bar.

## 8. De-allocation Model

De-allocation is not a special case, a delete, or a "fix history" operation — it's the exact same
write as allocating, with the sign flipped. This is the whole model:

- The UI offers two clearly-labeled actions on a Goal — **"+ Allocate"** and **"− Withdraw"** —
  both of which write one `fin_allocation` row (positive or negative respectively). Two buttons,
  one mechanism, so the user never has to think about signs, but the ledger underneath stays
  simple and singular.
- **Server-side validation**: a withdrawal that would take `goalTotalCents` below zero is rejected
  (can't withdraw more than was ever allocated) — the one guard on this table, mirroring how every
  other Financial-OS write is validated before it's committed.
- History is never edited or deleted to "correct" a mistake — a wrong allocation is reversed with an
  opposite entry, exactly like `fin_expense`/`fin_income` are edited today (a real edit changes the
  row; a correction-by-reversal is the pattern for anything ledger-shaped where the *sequence*
  itself matters, and here it does, because that sequence is the raw material for future projections).
- A de-allocation immediately and correctly reduces `goalTotalCents`, `allocatedCents`, and therefore
  *increases* `deployableCents` — no separate code path, since all three are computed fresh from the
  same signed sum.

## 9. Money ↔ Wealth Boundaries

- **Money never imports Wealth logic.** `computeBudget()`, `getBudgetSummary()`, `financialSnapshotText()`
  are unmodified. Wealth is a strict downstream consumer of `BudgetSummary`.
- **Wealth never recomputes a Money fact.** No second income model, no second safe-to-spend
  calculation, no second buffer concept. `avgWeeklyIncomeCents`'s existing variable-income handling
  (a trailing average divided by *actual* weeks of history, not a fixed pay-period assumption) is
  read as-is if/when a future projection needs a rate — never reimplemented.
- **Allocations are advisory, not enforced, on the Money side.** Nothing in `fin_account`,
  `computeBudget()`, or any existing route changes behavior because a goal exists. This is
  deliberate, not an oversight: enforcing it (e.g., blocking spending once "allocated" money is
  claimed) would require pretending the ledger has custody of real sub-accounts it doesn't have,
  which is precisely the fictional-money-movement risk this whole spec exists to avoid (§17).
- **The point-of-action warning (§3) is a UI courtesy, not a boundary change.** When an `allocate`
  request would take `deployableCents` negative, the route still succeeds — Wealth has no authority
  to refuse a user's own stated intent, and Money's numbers are still untouched either way. The
  warning exists purely so the moment of over-committing is visible *when it happens*, rather than
  only discoverable later via Reconciliation (§7). It is advisory exactly like Reconciliation itself
  — informative, never blocking, never auto-correcting.
- **The one thing that crosses the boundary into Money's own UI** is a single derived number
  (`allocatedCents`) surfaced as a small, clearly-labeled line near — not inside — Money's existing
  Safe-to-Spend hero (§12). Money displays it; Money does not compute it.

## 10. Wealth ↔ Journeys Relationship

Existing `journey_link` already validates `income`, `expense`, and `bill` as linkable kinds via
`JourneysRepo.REF_TABLE`. Adding `"goal"` follows the identical, already-proven pattern: one new
literal on the `JourneyLinkKind` union, one new `REF_TABLE` entry pointing at `fin_goal`. No other
change to `link()`/`unlink()`/`links()` is needed — they're already generic over `kind`.

This is genuinely optional and cheap enough that I'd recommend including it in V1 rather than
deferring it (unlike the Mind-node link or tier column above, which have no consumer yet) — a
"Truck Fund" goal linking to a "Become an Owner-Operator" Journey is exactly the cross-cutting
"life OS" connection described in §1 and §14, and the cost is two lines of already-proven,
zero-risk plumbing plus one `JourneyChips kind="goal"` call site. **Goals, Buckets, and Allocations
must never depend on this to function** — it's pure garnish, not a load-bearing part of the model.

## 11. Wealth ↔ Galaxy Relationship

**Confirmed from re-checking `journeyHubs.ts` directly (not assumed):** Journey hubs are individual
bright sprites placed around a ring — there is no existing "hub with orbiting children" render
pattern anywhere in this codebase to reuse for a Bucket-owning-Goals hierarchy. Building that
hierarchy visually would be new, unproven render work, not a reuse of something that already works.
Given the standing instruction not to overbuild the visual hierarchy, V1 deliberately does not
attempt it.

**V1 Galaxy scope — deliberately flat, finishing dormant work rather than inventing new work:**
- Every **active** Goal becomes exactly one `MoneyStar` with `kind: "goal"` — using the type's
  already-declared, currently-unused `goal_filling`/`goal_reached`/`fillPct` fields. This activates
  designed-but-dormant architecture; it does not invent a new visual language.
- A Goal **with** a `target_cents` shows `fillPct` and can reach `goal_reached`.
- A Goal **without** one (open-ended, e.g. general "Investing") always renders `goal_filling` with
  no `fillPct` — a steady, ceiling-less presence, matching exactly how the superseded jobs spec
  described an open-ended bucket, because that reasoning was correct independent of which spec it
  came from.
- **Archived** goals are excluded from `moneySky()`'s output entirely — same as how `FinBillRepo.list()`
  already excludes inactive bills by default.
- **Buckets do not get their own star or hub in V1.** This is the explicit "don't overbuild" call.
  A Bucket-as-hub-with-orbiting-goal-stars is a natural, self-contained V2 extension once the flat
  version is validated and looks right in the actual galaxy — not a V1 requirement, and not free.
- `moneySky()` gains a second, independent branch (bill logic and goal logic never share state) —
  it already only ever produced bill stars, so this is new code inside an existing, tested function,
  not a rewrite.
- **Money Sky remains persistent** exactly as it is today — the always-on scenery group in
  `Graph3D.tsx`, rebuilt on the existing `brain-finance-changed` event. **Confirmed during
  implementation-readiness review: this requires zero new event-wiring code.** `packages/web/src/api/finance.ts`'s
  shared `send()` helper already dispatches `brain-finance-changed` automatically on every successful
  mutating call — every existing bill/income/expense write goes through it today. As long as the new
  Wealth client wrappers (allocate, de-allocate, bucket/goal CRUD) are added to that same file and go
  through that same `send()` helper, the event fires for free; there is no separate dispatch call to
  add anywhere. `moneySky()` reading both bills and goals in one function means this one existing
  event already covers both, exactly as intended — Wealth simply joins a pipeline that already exists.
- **The "💵 Money sky" View filter in `GalaxyViews.tsx` needs no changes.** It isolates the same
  persistent `moneysky` scene group regardless of what's inside it — confirmed by how it's wired
  today. Goal stars appear inside that same View automatically, for free, the moment `moneySky()`
  starts emitting them.

## 12. UI Architecture

**Money surface — unchanged, plus one line.** Safe-to-Spend, Reserved, Bills, capture flows,
History all stay exactly as they are. One new, clearly-labeled line sits near (not inside) the
existing hero: *"🧭 $X earmarked toward goals"* — tapping it navigates into Wealth. It must never
visually compete with or be styled to look like part of the Safe-to-Spend figure itself, per §4's
"these are two different questions" principle.

**Wealth surface — the richer experience**, embedded as a new collapsible section within the
existing Money tab (no new dock tab — matches the standing "no tab removal, no rebuild" rule and
the existing precedent that Journeys/Insights/etc. all live as sections or tabs that compose within
what's already there):
- Bucket list (name, category icon, archived toggle), each expandable to its Goals. Kept
  deliberately minimal — see the note at the end of §15 on why Buckets stay this lightweight in V1.
- Goal cards: name, progress bar (only when `target_cents` is set — an open-ended goal shows a
  running total with no bar, never a fake 100%), target date if set, "+ Allocate" / "− Withdraw."
  Confirming an allocation that would take Deployable negative shows the point-of-action warning
  (§3/§9) inline in the same confirm step — never a separate blocking dialog, never preventing the
  action, just visible at the moment it matters.
- Allocation/de-allocation history per goal — a simple dated list, signed amounts, optional note.
- **Deployable, named as such**, and the current Reconciliation state, always visible at the top of
  the Wealth section — the one number/state that ties the whole surface together (§2).

## 13. Embedded vs. Full-Screen Experience

Two presentation modes of the **same** `WealthPanel` component, not two components:

- **Embedded mode** (default): renders inline inside the Money tab's existing dock body, compact,
  space-efficient, reachable without leaving normal navigation — matches how the rest of `FinancePanel`
  already behaves.
- **Full-screen mode**: the identical `WealthPanel` component, rendered instead inside a dedicated
  full-viewport overlay (the same architectural shape `HelpPanel`/`ChatDock` already use — a
  `role="dialog"` overlay wired through the existing `useDialogA11y` hook for Escape/focus-trap),
  triggered by an explicit "⛶ Expand" affordance. More room for larger goal cards, fuller allocation
  history, and room to grow into richer charts/visual storytelling later — none of which needs to be
  built now.

**The architectural discipline that makes this safe to build small**: `WealthPanel`'s internal
layout uses relative/responsive sizing so it's correct at both a compact embedded width and a full
viewport, and the component itself has zero knowledge of which mode it's in beyond CSS — the
*parent* (a boolean `expanded` state, the same shape as `showChat`/`panel` elsewhere in `App.tsx`)
decides whether to wrap it in the compact container or the full-screen overlay. This is intended as
a documented **convention**, not a new generic framework — no `FullscreenProvider`, no abstraction
layer, nothing built for surfaces that don't exist yet. If Mind or Journeys want the same treatment
later, the convention (one component, two wrapper contexts, a boolean toggle) is simply repeated,
not inherited from shared machinery this spec would otherwise be inventing speculatively.

## 14. Deterministic vs. AI Responsibilities

Deterministic, permanently, matching the rest of Money's own discipline exactly: balance, income/
expense/bill history, reserved, buffer, safe-to-spend, average weekly income, goal totals,
allocation totals, deployable/uncommitted, goal progress/fill percentage, reconciliation state, and
any straightforward projection (a trailing contribution rate × time-to-target is arithmetic, not
judgment).

Soumaya's reasoning layer, later, always LLM-optional and degrade-safe to a deterministic template
(same fallback discipline the rest of Money already holds itself to): narrating the numbers in her
voice, noticing a goal gone quiet despite steady income (same shape as `billRisk.ts`'s proactive-tool
pattern), and — explicitly not in V1 — suggesting how to split deployable surplus across competing
goals (the superseded jobs spec's `allocationSuggest.ts` idea remains valid future work once V1's
foundation is trusted). Longer-term, that same prioritization/reasoning thread is the natural home
for weighing a Goal against a future Debt or Credit concern once that layer exists — see §16's
Financial Health note; nothing in V1 builds toward that beyond leaving it a clear extension point.

**The AI must reason from these deterministic facts, never recompute them itself** — the same rule
that already governs `financialSnapshotText`: an LLM is handed the aggregated, authoritative numbers
and explains them; it never does the arithmetic.

## 15. V1 Scope

**In:** Buckets, Goals, Allocations, de-allocation, goal progress/fill percentage, Deployable as a
named planning concept with a point-of-action warning when an allocation would exceed it,
reconciliation (inline always, throttled proactive nudge), the real-vs-planned vocabulary discipline
enforced everywhere this data surfaces, the Wealth UI section inside Money, the one-line
Money→Wealth connection, Goal→Galaxy stars (flat, no bucket hierarchy), the optional Goal→Journey
link, and the embedded/full-screen presentation capability.

**Out:** automatic transfers, bank/brokerage connections, investment execution, AI allocation
recommendations, automatic goal funding, complex forecasting, profession-specific logic, a Bucket-
level Galaxy hierarchy, a `linked_node_id`/`tier` column with no V1 consumer, and — the one
non-negotiable exclusion — anything that creates the impression of a real financial transaction that
didn't happen.

**Buckets stay deliberately lightweight in V1, on purpose, not as an oversight to fix later.** A
Bucket is name + category + archived, full stop — no bucket-level target, no bucket-level money, no
color/settings beyond that. Whether Buckets earn richer treatment (their own target, their own
Galaxy presence, reordering, custom icons) should be decided from watching how they're actually used
once real goals live inside real buckets, not designed speculatively now. If they end up feeling
like pure decoration once there's real usage to look at, that itself is a legitimate, useful finding
— not a failure of this spec.

## 16. Future Extension Points

Explicitly deferred, not forgotten, each additive whenever it's actually wanted: a Bucket-as-hub
Galaxy visual once the flat version is validated; an optional `linked_node_id` on `fin_goal` for
deep Mind-tab tie-in; a `tier` column plus `allocationSuggest.ts`'s deterministic AI-reasoned split
engine from the superseded jobs spec; simple linear projections narrated by Soumaya ("at this pace,
you'll reach $40k by March"); and a reconciliation history/audit trail (the jobs spec's deferred
"Part C") once the basic reconciliation signal above has been lived with for a while.

**Financial prioritization/reasoning, generalized beyond Goals — the eventual Financial Health
layer.** The superseded jobs spec's `tier`/`allocationSuggest.ts` sketch was scoped narrowly to
"which Goal gets the next dollar." The longer-term shape of that same idea is bigger: Soumaya
eventually reasoning across *all* of a person's financial priorities at once — a Goal competing
against a Debt payoff, a Credit-utilization concern, or a general Financial-Health signal this
codebase doesn't model yet (no `fin_debt`/`fin_credit` table exists today). This spec deliberately
does not design that layer — no debt/credit schema, no cross-category prioritization engine — but
it's named here explicitly as the direction the "prioritization/reasoning" thread eventually grows
into, so a future Debt/Credit/Financial-Health spec has a clear, intentional slot to extend into
rather than needing to retrofit itself around Wealth's Goal-only assumptions. Whatever that engine
looks like, it inherits the same non-negotiable rule as everything else in this document: it reasons
from deterministic, authoritative facts (§14) and proposes, never silently acts.

## 17. Migration / Supersession Plan for Dormant Prior Art

| Artifact | Disposition |
|---|---|
| `fin_goal_link` | **Stays exactly as-is, untouched, still dormant.** Not repurposed for the new Goal model — its `node_id NOT NULL` shape doesn't fit "optional," and forcing the new model into an old table designed for a different requirement would be adopting a constraint for no reason other than the table already existing. If deep Mind-node linking is ever wanted, it's a new nullable column on `fin_goal` (§5), not a resurrection of this table. |
| `MoneyStar.kind: "goal"`, `goal_filling`, `goal_reached`, `fillPct` | **Activated, not superseded.** This spec is the first real producer of these already-declared fields (§11). Nothing about the type needs to change. |
| `docs/specs/money-jobs-allocation.md` | **Its core data model (a flat "job" = bucket + goal fused together) is superseded** by this spec's richer Bucket→Goal→Allocation hierarchy, which is a strict superset. **Its `tier` concept and `allocationSuggest.ts` suggestion engine are not superseded** — they remain valid, well-reasoned future work once V1 ships and is trusted (§16). Recommend marking that doc's header as "superseded for its core model by `wealth-goals-allocation.md`; suggestion-engine section remains live future work" rather than deleting it. |
| `docs/financial-os/stage-4-galaxy-and-zero-based.md` | Unchanged status — it's the original source both this spec and the superseded jobs spec trace back to; nothing here contradicts it, this spec just finishes Part A (the goal star) and reshapes Part B (the allocation model) into something richer than "jobs." |

## 18. User Stories

1. As a variable-income trucker, I want to create a "Trucking" bucket and a "$15,000 First Truck
   Down Payment" goal inside it, so my irregular weekly income has somewhere concrete to go.
2. As that same user, I want to allocate $200 from this week's surplus toward that goal and see its
   progress bar move, without the app pretending $200 physically left my bank account.
3. As a user who just had a real emergency, I want to withdraw $500 I'd earlier allocated to a goal,
   see the goal's total drop and my Deployable figure rise, and see that withdrawal recorded in the
   goal's history — not silently erased from it.
4. As a user whose spending outpaced their allocations, I want Wealth to tell me, plainly, that my
   current financial position is below what I've earmarked — not hide it, not fix it for me.
5. As a user browsing Money, I want a one-line hint of how much is earmarked toward goals without
   the Safe-to-Spend number itself changing meaning.
6. As a user who wants to see the full picture, I want to expand Wealth to full-screen for a richer
   view of my buckets, goals, and history.
7. As a user building a life around trucking, I want my "Become an Owner-Operator" Journey to
   optionally show its linked Truck Fund goal, without that link being required for either to work.
8. As a user flying through my galaxy, I want to see a goal I'm actively funding as a distinct,
   filling star, the same visual language as a bill star but reading a completely different signal.

## 19. Acceptance Criteria

1. A user can create, rename, and archive a Bucket; create, edit, and archive a Goal inside it with
   an optional target amount/date.
2. Allocating and withdrawing both write to the same signed `fin_allocation` ledger; a withdrawal
   that would take a goal below zero is rejected server-side.
3. `Safe-to-Spend` (`BudgetSummary`) is byte-for-byte unchanged by this feature's existence —
   verified by a regression test asserting `computeBudget()`'s output is identical with and without
   Wealth data present.
4. `Deployable` and `Reconciliation` are computed fresh on every read, never stored, and correctly
   go negative/`"over_committed"` when allocations exceed current Safe-to-Spend. Deployable is
   surfaced by name (not folded silently into Safe-to-Spend) everywhere Wealth shows it.
4a. Attempting to allocate an amount that would take Deployable negative shows the point-of-action
    warning before the write is confirmed, and still allows the user to proceed — the request is
    never rejected server-side for this reason (only a withdrawal past a goal's own total is
    rejected, per AC#2).
5. Every goal/allocation/bucket surface (Wealth UI, Money's one-line hint, goal history, Galaxy star
   tooltip, and — whenever chat context is eventually extended — Soumaya's own language) uses
   "allocated/earmarked/pledged/planned" vocabulary, never "saved/balance/deposited/invested/
   transferred," unless the system has independently verified that a real transaction happened.
6. An active Goal with a target renders as a `MoneyStar` with `kind: "goal"`, correct `fillPct`, and
   flips to `goal_reached` exactly once fill reaches 100%; an open-ended goal never reaches
   `goal_reached`; an archived goal never appears in `moneySky()`'s output.
7. The Money Sky View filter requires no code changes to include goal stars.
8. `WealthPanel` renders correctly in both embedded and full-screen presentation without divergent
   component logic — the same component, two wrapper contexts.
9. Full gate green (`npm run typecheck && npm test && npm run build -w @brain/web`); no schema
   migration risk (three new additive tables only); fully offline-safe (zero LLM dependency for any
   V1 behavior).

## 20. Risks and Architectural Safeguards

- **The fictional-money-movement risk (the big one).** A progress bar that fills, backed by a dated
  contribution ledger, structurally resembles a real transaction history closely enough that a user
  can reasonably misread "allocated" as "moved," especially with a $40,000 real goal riding on the
  distinction actually holding up. Safeguard: the vocabulary discipline in §2/§17/AC#5 is treated as
  load-bearing, not cosmetic — enforced consistently across every surface, not just first-run copy.
- **Reconciliation drift becoming alarm fatigue.** An unthrottled "you're over-committed" nudge
  every time a small purchase dips Deployable negative would train the user to ignore Wealth.
  Safeguard: throttle the *proactive nudge* to once/day (reusing `billRisk.ts`'s exact pattern)
  while keeping the *inline* state always honest and unthrottled when the user actually opens Wealth.
- **Deployable being over-committed with no signal until the next visit to Wealth.** Safeguard:
  the point-of-action warning (§3/§9) surfaces the moment it happens, not just retroactively via
  Reconciliation — without ever turning into a hard block that would falsely claim Wealth has
  custody of money it doesn't.
- **Buffer vs. a future Emergency Fund goal double-counting the same protection.** Both `buffer_cents`
  and an Emergency Fund goal describe "money kept safe," and nothing here unifies them. Deliberately
  left unresolved rather than merged prematurely (per explicit instruction) — flagged here so a
  future pass makes this decision on purpose, with Soumaya eventually able to explain the
  relationship rather than the UI implying two separate piles of physical money.
- **A Bucket's rollup total becoming a second source of truth.** Safeguard: a Bucket never stores
  its own total — it is always, structurally, the live sum of its Goals' computed totals, so there
  is nothing to keep in sync and nothing that can drift.
- **Building out Bucket features before knowing they're wanted.** Safeguard: §15 makes staying
  minimal an explicit, on-purpose V1 decision rather than a gap — richer Bucket behavior is
  something to earn from observed usage, not something to guess at now.
- **Cost of computing two Financial-OS surfaces (bills + goals) inside one `moneySky()` call.**
  Negligible — matches the same "cheap sums over small per-space sets" characteristic the rest of
  the Budget Engine already relies on; no new performance concern introduced.

## 21. Recommended Implementation Sequence

1. **Schema + repos**: `fin_bucket`, `fin_goal`, `fin_allocation` as three more
   `CREATE TABLE IF NOT EXISTS` blocks added to `BOOTSTRAP_SQL` in `packages/server/src/db/schemaSql.ts`
   (right alongside the other `fin_*` tables) — **not** `migrateSchema()` in `db/client.ts`, which is
   reserved for adding columns to already-existing tables. Table creation lives only in
   `bootstrapSchema()`, confirmed at `client.ts:220`, and `CREATE TABLE IF NOT EXISTS` is already the
   idempotent pattern every other Financial-OS table uses, so this is safe on an existing Fly volume
   with no separate migration step. Also update `TABLES_WITH_SPACE` in
   `packages/server/src/auth/spaces.ts`. `FinBucketRepo`/`FinGoalRepo`/`FinAllocationRepo` follow the
   existing per-table repo convention. No routes yet — get the data model and its unit tests solid
   first.
2. **Calculation model**: `finance/wealth.ts` — `goalTotalCents`, `bucketTotalCents`, `fillPct`,
   `goalState`, `allocatedCents`, `deployableCents`, `reconciliation`. Pure functions, hit hard with
   tests before anything reads them over HTTP — this is the trust-critical layer.
3. **Routes + shared types**: `GET/POST/PATCH/DELETE` for buckets/goals, `POST` for allocate/
   withdraw, `GET /wealth/summary`. `FinBucket`/`FinGoal`/`FinAllocation`/`WealthSummary` in shared
   types. A regression test proving `BudgetSummary` is unaffected (AC#3) belongs right here, not
   deferred to the end.
4. **Web client + Wealth UI (embedded only first)**: buckets/goals/allocate/withdraw/history, the
   Deployable + Reconciliation banner, the one-line Money hero hint. Full-screen wrapper comes after
   the embedded UI is right, since it's the same component wrapped differently, not new logic.
5. **Galaxy**: `moneySky()`'s new goal branch, `brain-finance-changed` fired on Wealth mutations.
   Verify (per this codebase's own "prove it by measurement" discipline) that a filling/reached goal
   star and an untouched bill star coexist correctly, and that the existing Money Sky View isolates
   both without any changes to `GalaxyViews.tsx`.
6. **Full-screen presentation**: wrap the now-proven `WealthPanel` in the overlay context, wire
   `useDialogA11y`, add the "⛶ Expand" affordance.
7. **Optional, last**: `"goal"` as a `JourneyLinkKind` + `REF_TABLE` entry + one `JourneyChips`
   call site on the Goal card.

Each stage gets the full gate (`typecheck && test && build`) before moving to the next, same
discipline as every other multi-stage feature this session.

---

## Self-Critique: Where This Could Still Be Wrong

Asked to pressure-test this before calling it final, not just validate it. Items 1–2 below were
raised in Revision 1 and are now resolved in Revision 2; item 3 remains genuinely open.

1. ~~"Deployable" as a UI hint, not a hard limit, is a real tension I haven't fully resolved.~~
   **Resolved in Revision 2** via the point-of-action warning (§3/§9/AC#4a): the user can still
   proceed past Deployable (a hard block would falsely claim authority Wealth doesn't have over
   money it can't see spent elsewhere), but the moment is no longer silent — the warning fires
   *when the decision is made*, not only discoverable later via Reconciliation. I think this is the
   right balance: honest about what Wealth can't enforce, while no longer letting an over-commitment
   happen without the user ever having been told.
2. ~~A Bucket owning no money is clean in the data model but may read as an empty gesture in the UI.~~
   **Addressed, not by adding Bucket features, but by making the wait-and-see itself the decision**
   (§15): Buckets stay name + category + archived, deliberately, and their value gets judged from
   real usage rather than argued from the data model alone. If they read as decoration once real
   goals live in them, that's the intended signal to revisit — not a gap this revision needed to
   pre-solve.
3. **I'm not fully certain "at most once a day" is the right cadence for the reconciliation nudge**
   specifically (as opposed to bill-risk, where it was tuned for that exact signal). It's the right
   *pattern* to reuse rather than invent a new one, but the exact cadence is a guess carried over
   from a different feature, not something I've derived from Wealth's own usage shape — worth
   revisiting once it's live rather than treating "once a day" as sacred.

Nothing above changes the core model — Money stays untouched, Wealth stays additive and honest, and
the ledger-of-intent framing holds up under the pressure-testing. These are refinements worth a
decision during implementation, not reasons to redesign.
