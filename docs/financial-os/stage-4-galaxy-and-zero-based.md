# Financial OS — Stage 4 Spec: Money in the Galaxy + Zero-Based Budget + Audit

> **Design only (spec-first).** No code until this is signed off. Builds on Stages 1–3
> (docs/financial-os/). Three linked features, inspired by zero-based budgeting (EveryDollar's
> "give every dollar a job") and honest YouTube "financial audit" reviews — but original, in
> Soumaya's voice, and rendered in the galaxy she already is.

---

## Part A — Money in the Galaxy (bills + goals as STARS)

### A0. Hard constraints (from the user)
- **Everything financial is a STAR.** Never a planet, moon, asteroid, or gas giant. A bill is a
  small star; a savings goal is a star. The *meaning* is carried by **glow, fill, color, size,
  and motion** — not by celestial class. This is *why* they stay stars: a star is the one body
  whose brightness/color we can freely drive.
- **Small stars**, procedurally made (reuse `makeStarMaterial` in `graph/shaders.ts`), so they
  read as a distinct, legible "money sky," not as memory suns.
- **Cooling = blue.** The state palette below fixes blue to the cooling/at-risk end.

### A1. Where the data lives (respects decision D6 — no denormalization)
Financial facts stay in the `fin_*` tables. These stars are a **dedicated render layer**, NOT
knowledge-graph nodes — so bills/goals never pollute the memory graph or its mass model. New
render module `graph/moneySky.ts` (peer of `graph/satellites.ts` / `graph/deepSpace.ts`), fed by
a new read endpoint:
- **`GET /api/finance/sky`** → `MoneyStar[]`: `{ kind: "bill" | "goal", id, label, amountCents,
  state, intensity, dueInDays?, fillPct? }`. Derived server-side from bills/occurrences/goals +
  the Budget Engine (deterministic). Space-scoped, offline.
- The web layer renders one small star per money-star, positioned in its own **"Money"
  constellation** (a compact cluster/ring set apart from memory bodies, like the beacons layer),
  so it's clearly *your money sky* and can be isolated/framed (reuse the focus/isolate plumbing).

### A2. The state → visual model (the heart of Part A)
Each money-star has a `state` and a 0..1 `intensity`; the renderer maps them to
**color + glow + size + motion**. Color is **never the only channel** (accessibility, house
rule) — every state also has a distinct **glyph/label + a motion signature**.

| state | meaning | color | glyph | motion / glow |
|---|---|---|---|---|
| `calm` | bill funded, not due soon | soft white-gold `#ffe9a8` | ★ | steady, gentle twinkle |
| `approaching` | bill due soon (≤ ~7d), funded | warm amber `#ffd166` | ◐ (waxing) | brightens + pulses faster as due date nears |
| `at_risk` / `cooling` | overspend pace or short — **the user's blue** | **cool blue `#4fa3ff` → deep `#1f5fff`** | ❄/↓ | **dims + cools** (loses warmth), slow shiver |
| `overdue` | past due, unpaid | red-orange `#ff5a5a` | ! | urgent slow pulse (never a harsh strobe; reduced-motion → steady) |
| `paid` | occurrence settled | calm green `#7af9c0` | ✓ | settles: a brief bright flash, then dims to rest |
| `goal_filling` | savings goal accruing | brightening white→gold, **fills** bottom-up | ◔◑◕ (by fillPct) | radiance scales with `fillPct`; a partial "filled" corona ring |
| `goal_reached` | goal hit its target | radiant gold-white `#fff3da` | ✦ | one-time celebratory bloom (reuse `celebrate()`), then a proud steady star |

Notes:
- **Cooling is the spine of the palette** (per the user): warmth = healthy/funded, blue = cooling
  = at-risk/overspending, and the transition *animates* (a star literally cools from gold toward
  blue as the pace worsens). This mirrors the memory-entropy metaphor the galaxy already uses.
- **Fill** for goals: shader/material drives a bottom-up brightness fill keyed to `fillPct`
  (0→1), plus a thin corona ring that closes as it fills — an unmistakable "filling up" read.
- **Size** encodes weight modestly (bigger bill/goal = slightly bigger star), but all stay in a
  tight "small star" band so none rival a memory sun.

### A3. Animation discipline (extends this session's "dial, don't snap")
- State changes **tween** (color/glow/size lerp over ~0.6–1s), never snap. Due-date pulses and
  the cooling shiver are continuous but calm.
- **`prefers-reduced-motion`:** pulses/shivers hold at a steady mid-state; color + glyph still
  encode the state (motion is never the sole channel).
- Cheap: sprites + the existing star shader; counts are tiny (a handful of bills + goals), so it
  runs on mid mobile alongside everything else.

### A4. Interaction
- Tapping a money-star opens its detail (bill → next due + mark paid + edit; goal → progress +
  add/allocate). Reuse the focus/fly-to + a lightweight inspector card.
- A **legend entry** ("Your money sky") is added to the Living Legend, pairing each state's
  color with its glyph + meaning (satisfies "never color alone" and teaches the language).

### A5. Goals as first-class (ties to `fin_goal_link`)
A savings goal is a `fin_goal_link` (target_cents/target_date) optionally linked to a
knowledge-graph goal node. Its star's `fillPct = min(1, saved / target)`. "Saved" is tracked by
a simple allocation (Part B) or a dedicated savings balance — decided in Part B.

---

## Part B — Zero-Based Budget ("give every dollar a job")

Inspired by EveryDollar: **income − allocations = $0**. Every dollar of expected income is
assigned a job (bills, savings goals, spending categories) until nothing is unassigned.

### B1. Model (new, additive; `fin_*` tables)
- **`fin_plan`** (one active per space, per pay period): `id`, `space_id`, `period`
  (`weekly|biweekly|monthly`), `income_planned_cents`, `created_at`.
- **`fin_allocation`**: `id`, `space_id`, `plan_id`, `name`, `category`, `planned_cents`,
  `kind` (`bill|goal|spending|savings`), `linked_bill_id?`, `linked_goal_id?`.
- **Derived, deterministic:** `assigned = Σ planned_cents`; `toAssign = income_planned − assigned`.
  The zero-based invariant is met when `toAssign === 0`.

### B2. UX (mobile-first, in the Money tab)
- A **"Give every dollar a job"** view: your planned income at top, a live **"$X left to
  assign"** number (dials down as you allocate; turns to a calm "Every dollar has a job ✓" at 0;
  shows "over-assigned by $Y" if negative — with icon+label, not color alone).
- Bills auto-seed allocations (from recurring bills); the user adds goal + spending allocations.
- Progress bars per allocation (planned vs. actual spend, pulled from `fin_expense` by category).
- **Ties to the galaxy:** each allocation with a goal drives a `goal_filling` star; each bill
  allocation is its bill-star.

### B3. Relationship to Stage 1's "Safe to Spend"
Complementary, not a replacement. Safe-to-Spend answers *"what's mine to spend right now?"* (live
cash view). The zero-based plan answers *"did I give every dollar a job this pay period?"*
(intentional plan view). Both read the same `fin_*` data; the plan is opt-in.

---

## Part C — The Audit (honest review, in her voice)

Inspired by the popular "financial audit" format — direct, specific, a little blunt — but
**Soumaya's** version: caring, never cruel, grounded in the user's real numbers + goals (uses the
Stage 2 snapshot). Not a clone of any creator.

### C1. What it is
An on-demand + periodic **"Audit"** where Soumaya reviews the last N weeks and says the true
thing: where the money actually went vs. the plan, the category that quietly ballooned, the bill
that's chronically tight, the goal that stalled — then **one concrete next step** (an if-then, per
the grounded-insight discipline already in the chat).

### C2. How (reuses existing seams)
- Deterministic **audit facts** computed server-side (top categories, plan vs. actual variances,
  streak of tight/short weeks, goal progress) — no LLM needed for the numbers.
- Soumaya **phrases** the audit from those facts + the snapshot (LLM when keyed; a deterministic
  template otherwise — offline-safe). Honest + specific + falsifiable ("does that land?"),
  **never preachy, never a clinical label** — same rules as the grounded-insight mode.
- Delivered two ways: a **tool-router nudge** ("Ready for this week's money audit?" — gentle,
  rate-limited) and an **on-demand button** in the Money tab.

### C3. Tone guardrails
Blunt about the numbers, kind about the person. It audits *behavior and math*, not worth. It
always ends with a doable step and (when relevant) ties back to a galaxy goal-star the user can
watch fill.

---

## Staged build order (each shippable, gate-green, offline-safe, additive)
1. **A: Money sky (read-only)** — `GET /finance/sky` + `graph/moneySky.ts` star layer + state→
   visual model + legend entry. The most visible, self-contained win.
2. **B: Zero-based plan** — `fin_plan`/`fin_allocation` + "give every dollar a job" view; wire
   goal allocations to `goal_filling` stars.
3. **C: Audit** — deterministic audit facts + phrasing + the on-demand button + the gentle nudge.
4. **Polish** — goal-reached bloom, cooling transitions, reduced-motion pass, mobile QA on-device.

## Open questions for sign-off
1. **Money-sky placement:** a separate ringed "money constellation" set apart from memories
   (proposed, cleanest), vs. interleaved among the memory stars? (User said "in the galaxy" — I
   read that as a distinct cluster within the same scene.)
2. **Savings tracking:** a dedicated savings balance per goal vs. derived from allocations? (Part
   B B1/A5.)
3. **Audit cadence:** weekly by default? opt-in only, or gently offered?
4. **Zero-based period default:** match the user's pay cadence (from settings) or monthly?
