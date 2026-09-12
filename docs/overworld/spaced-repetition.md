# Spaced repetition — surfacing the existing SM-2 review engine (Tier 2, priority 1)

> Per Rule #1: researched before writing a line of code. The scheduling engine, its API route,
> and its client fetch functions **all already exist and are fully real** — this doc specs how
> the *already-shipped* system finally gets a place in the Overworld, not a new backend.

## What's already real (confirmed by reading the code, not assumed)

- `packages/server/src/analysis/review.ts` — a genuine SM-2-ish scheduler: `dueForReview()`,
  `gradeReview()`, `memoryStrength()`, `snoozeReview()`. Columns (`review_ease`,
  `review_interval_days`, `next_review_at`, `last_reviewed_at`, `review_count`) already exist on
  `nodes` and are exercised by `review.test.ts`.
- `packages/server/src/api/routes/review.ts` — `GET /api/review/due` (top 20, most-important +
  weakest first) and `POST /api/review/:id { remembered }` (grades + reschedules + **already**
  credits Fuel via `EARN_REVIEW` and advances the daily streak via `StreakRepo` — NEURO_ALIGNMENT's
  own note that logging isn't the only thing that should feed the streak/Fuel loop).
- `packages/server/src/agent/tools/reviewNudge.ts` — a once-a-day proactive nudge, already wired
  into the tool router and (per `reviewNudgeCommunicationPilot.test.ts`) the Telegram bot. Soumaya
  already nudges recall "in her own voice" **outside the Overworld** — this doc's job is to bring
  that same nudge, and the ability to act on it, *inside* the Overworld too, not invent a second one.
- `packages/web/src/api/features.ts` — `getDueReviews()` / `gradeReview()` (typed, error-safe,
  identical shape to the server) are written and exported, but **zero call sites** reference them
  anywhere in `packages/web/src`. This is the actual gap.

## The one thing to get right: two decay signals that must not be conflated

`shared/celestial.ts`'s `entropyFrom`/`COOLING_ENTROPY` (the "?" dim marker, `CreatureEntity.isDue`)
and `analysis/review.ts`'s SM-2 schedule are **both real, both about neglect, and completely
independent mechanisms**:

| | Entropy (`isDue`) | SM-2 (`dueForRecall`, new) |
|---|---|---|
| Drives | Ambient dimming, existed pre-Overworld | A specific "come recall this" moment |
| Input | `daysSinceTended`, `degree` | `review_interval_days`, `last_reviewed_at`, ease |
| Reset by | `tendNode` (any greet) | `gradeReview` (an actual recall attempt) |
| Scope | Every memory, continuously | Server-side top-20 due list only |

A node can be entropy-fresh but SM-2-due (reviewed once, interval elapsed, but still well-connected
so entropy hasn't caught up) or entropy-dim but never SM-2-scheduled (new, unreviewed, just old). They
need **two independent, co-existing markers** — never merged into one boolean, per the "never invent
data" and "non-color-only" rules already governing `isDue`.

## Design

1. **New `CreatureEntity.dueForRecall: boolean`** (`overworld/types.ts`), set by `nodeToCreature`
   from a `dueNodeIds: Set<number>` option — sourced once per refresh from `getDueReviews()`, not
   recomputed client-side (same "trust the server's math" rule `isDue`/entropy already follows).
   `loadWorldSnapshot()` fetches `getDueReviews()` alongside its existing `Promise.all` and passes
   the resulting id set into `buildWorldSnapshot`.
2. **A second, distinct in-world marker.** `ExteriorScene.ts`'s `renderCreatures` already draws a
   "?" text marker for `isDue` at `(0, -TILE_SIZE * 0.45)`. `dueForRecall` gets its own glyph ("💭",
   a thought bubble — visually and semantically distinct from "?") at a different anchor point
   (`(TILE_SIZE * 0.4, -TILE_SIZE * 0.45)`, offset right) so both can render at once without
   overlapping when a creature happens to carry both signals.
3. **Where you actually review: `CreatureSummaryOverlay`.** Walking up to a due creature already
   opens this screen. When `creature.dueForRecall`, it grows a "Recall check" section: the
   memory's content stays hidden behind a "Try to recall it first" reveal (the only way to make
   "recall, not storage" real in a UI — showing the answer immediately would make every check a
   no-op), then two buttons — "I remembered" / "Let's refresh it" — call the (now finally used)
   `gradeReview(nodeId, remembered)`, then refresh the world snapshot and close, exactly matching
   the existing `handleGreetConfirm` pattern (`OverworldRoot.tsx`) rather than inventing a new flow.
4. **Soumaya nudges it, once, in her own voice — never an Anki deck.** `SoumayaChatOverlay` already
   greets with a static line when `turns.length === 0`. When `getDueReviews()` came back non-empty
   this session, that greeting is replaced with one line naming the count and, if the strongest
   candidate is a placed creature this region, a "📍 Go there" button reusing the exact same
   citation-button affordance the chat already has for cited memories — not a new UI pattern.
   This is presentation only: the actual nudge *logic* (once-a-day, which memory) stays owned by
   `reviewNudge.ts` server-side; the Overworld chat greeting is just allowed to read the same due
   list the creature markers already fetch, so it doesn't nag every single time you talk to her.

## Deliberately deferred (not this round)

- A dedicated "review deck" screen that lists all 20 due memories at once — rejected on purpose:
  it's the literal Anki-deck shape NEURO_ALIGNMENT explicitly says to avoid. Recall stays anchored
  to walking up to the actual creature, or to Soumaya naming one by name.
- Any change to the SM-2 math itself, or to `reviewNudge.ts`'s cadence/selection — both already
  real and out of scope; this round is presentation only.
