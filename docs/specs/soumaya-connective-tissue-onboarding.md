# Phase AC.1 — Connective Tissue & Onboarding Completion

> Implements the phase Phase AC's product/roadmap audit recommended: connect existing
> capabilities and complete onboarding coverage, with zero new intelligence, architecture,
> state, or LLM behavior. Baseline: Phase AB's commit `a8d2b9f`. Status: **implemented,
> tested, gated green.**

## 1. Scope — five small, independently-scoped fixes

1. **Journey → Chat**: wire the web client to the server's existing `journeyId`-scoped Chat
   contract (Phase Q), via an "Ask Soumaya about this" button in `JourneysPanel`.
2. **First-launch framing**: `WelcomeIntro` now names Money/Wealth, Life Vision, and Journeys
   as real product surfaces, plus a link to the existing Help manual.
3. **Help discoverability**: that link opens Help in one tap from the very first screen.
4. **Galaxy Bill click**: closes the one remaining Goal/Journey/Bill inconsistency — a Bill
   clicked in the Money Sky now opens/focuses `BillManager`, matching the existing pattern.
5. **Views/Lens discoverability**: the Views panel opens itself once, automatically, the very
   first time a space ever renders it.

## 2. Step 1 audit — verifying the repository state before touching code

Confirmed directly, before writing any code:
- `askChat()` (`api/client.ts`) had no `journeyId` parameter; `chat.ts`'s zod schema and
  `chat()`'s signature already supported it (Phase Q) — **the entire gap was client-only**.
  `grep` confirmed `askChat` has exactly one real call site (`ChatDock.tsx`), so reordering
  its positional parameters was safe.
- `App.tsx`'s `onGalaxyEntityClick` handled `"journey"` and `"goal"` but had no `else if (kind
  === "bill")` branch — confirmed by reading the handler directly, matching Phase AC's finding.
  `galaxyEntity.ts` (server) confirmed a Galaxy `"bill"` entity's `id` is a `fin_bill.id` (the
  recurring definition), matching `BillManager`'s own list — not a `fin_bill_occurrence`.
- `WealthPanel`'s existing `focusGoal` mechanism (force-open the containing section, then
  `scrollIntoView` once the matching row is mounted) was the exact existing pattern to mirror
  for `BillManager` — verified by reading `WealthPanel.tsx` and `FinancePanel.tsx` in full.
- `GalaxyViews.tsx`'s own header comment already documents the Views/Lens distinction as
  resolved in-code; only the "collapsed by default, no first-run cue" half of the original
  complaint (confirmed still true: `open` initialized to `false` unconditionally) remained.

No file named in the mission's "likely files" list had moved or been renamed since the audit.

## 3. Existing patterns reused (no new architecture)

| New behavior | Reused mechanism |
|---|---|
| Journey-scoped Chat | The exact `journeyId`/`proactiveContext` one-shot contract Phase Y/Z already built into `ChatDock` (`journeyId` prop + `onConsumeJourneyContext` callback, consumed by exactly one `send()` call) |
| "Ask Soumaya about this" button | The existing `jn-detail-actions` button row already used for Mark complete/Pause/Delete |
| Bill Galaxy-click focus | `focusGoal`'s exact two-step effect pattern (force-open, then `scrollIntoView` once mounted) copied from `WealthPanel.tsx` into `BillManager` |
| Help discoverability | The existing `help`/`setHelp` state and `HelpPanel` component — no new Help implementation, just a new call site |
| Views/Lens first-use cue | The exact per-space `localStorage` one-time-flag pattern App.tsx already uses for `brain.introSeen.*`/`brain.legendSeen.*`, applied inside `GalaxyViews` itself as `brain.viewsSeen.*` |

No new database table, no new LLM call, no new personality/emotional system, no new
navigation architecture, no second scoping mechanism alongside `proactiveContext`.

## 4. Files changed

`packages/web/src/api/client.ts` — `askChat()` gains an optional `journeyId` 3rd parameter
(before `proactiveContext`, matching the server's own argument order).

`packages/web/src/components/ChatDock.tsx` — new `journeyId`/`onConsumeJourneyContext` props,
threaded through `send()` exactly like `proactiveContext`.

`packages/web/src/App.tsx` — new `pendingJourneyId` state (mirrors `pendingProactiveContext`);
new `focusBill` state (mirrors `focusGoal`/`focusJourney`); a `bill` branch added to
`onGalaxyEntityClick`; an `onAskJourney` handler passed into `RightDock`; `WelcomeIntro`'s new
`onSeeHelp` wired to `setHelp(true)`.

`packages/web/src/components/RightDock.tsx` — threads `focusBill` into `FinancePanel` and
`onAskJourney` into `JourneysPanel`.

`packages/web/src/components/JourneysPanel.tsx` — new `onAskJourney` prop on `JourneysPanel`
and `JourneyCard`; a "💬 Ask Soumaya" button in the existing detail-actions row.

`packages/web/src/components/FinancePanel.tsx` — new `focusBill` prop threaded into
`BillManager`, which gains the force-open + scroll-to-row effect and a ref on the matching
`<li>`.

`packages/web/src/components/WelcomeIntro.tsx` — one new bullet naming Money/Life
Vision/Journeys; an optional `onSeeHelp` prop rendering a lightweight secondary link.

`packages/web/src/index.css` — one new small style block (`.welcome-help-link`) matching the
existing `.welcome-*` visual language.

`packages/web/src/components/GalaxyViews.tsx` — `open`'s initializer now checks a per-space
`localStorage` flag and defaults to `true` (then immediately marks itself seen) the first time
ever; unchanged behavior on every render after that.

Test files updated/added: `ChatDock.smoke.test.tsx`, `FinancePanel.test.tsx`,
`JourneysPanel.smoke.test.tsx`, `WelcomeIntro.test.tsx`, `GalaxyViews.smoke.test.tsx`.

**No server-side files changed at all** — the entire Journey → Chat gap was client-only, since
Phase Q had already built the server-side contract.

## 5. Tests added

11 new web tests across 5 files:
- `ChatDock.smoke.test.tsx` (+2): `journeyId` threads into `askChat`'s 3rd argument and is
  consumed after exactly one send; ordinary chat sends `undefined` and never calls the consume
  callback.
- `JourneysPanel.smoke.test.tsx` (+2): the "Ask Soumaya" button is absent without `onAskJourney`;
  present and calls it with `{id, title}` when provided.
- `FinancePanel.test.tsx` (+2): a `focusBill` request force-opens "Manage recurring bills" and
  scrolls to the matching row; no `focusBill` behaves exactly as before (still collapsed,
  `listBills` never called).
- `WelcomeIntro.test.tsx` (+3): the new pillar bullet is present; the Help link is absent
  without `onSeeHelp`; provided, it fires `onSeeHelp` without also firing `onClose`.
- `GalaxyViews.smoke.test.tsx` (+2, plus every pre-existing test now explicitly pre-marks the
  one-time flag "seen" so they continue testing ordinary/returning-user behavior): the panel
  opens itself automatically on a space's first-ever render and writes the flag; a second mount
  stays collapsed.

## 6. Test/typecheck/build results

Typecheck clean across all 3 workspaces. Full suite: **1039 server tests** (unchanged — no
server files touched) + **354 web tests** (343 baseline + 11 new), all passing. `npm run build
-w @brain/web` succeeds.

Manually verified via the added tests exactly the 9 scenarios the mission's Validation section
named: ordinary Chat, Journey-scoped Chat, proactive Chat handoff (Phase Y/Z's own suite,
unmodified and still green — confirming the one-shot `proactiveContext` mechanism is untouched
by adding `journeyId` alongside it), Galaxy Goal/Journey/Bill clicks, first-use Welcome
experience, Help access, and Views/Lens first-use behavior.

## 7. Confirmation: no out-of-scope architecture touched

`git diff --stat` against `chat/graphrag.ts`, `communication/context.ts`, and
`packages/shared/src/types.ts` returns empty — none of these files changed. No new database
table, no new LLM call, no persona/emotional/relevance/temporal/causal code touched, no
deployment/CI file touched. Every change is additive web-side wiring using props and callbacks
that already existed as patterns elsewhere in this codebase.

## 8. Remaining limitations

- The "Ask Soumaya about this" button opens Chat with the Journey scoped for exactly the next
  message — it does not pre-fill or auto-send a message, matching the same "never fabricate
  what the user said" discipline `proactiveContext` already established. The user still has to
  type something.
- `WelcomeIntro`'s new bullet names the three surfaces but does not deep-link to any specific
  tab — it points to Help for that, deliberately keeping the first-launch card short.
- The Views/Lens first-use cue is a one-time auto-open, not a persistent tutorial — a user who
  dismisses it quickly still won't necessarily register what it does; this was the mission's
  own preferred, lightest-touch option among the ones offered.
- Bill focus opens `BillManager`'s bill-*definition* list (matching where `JourneyChips` for
  bills already lives); it does not scroll to a specific upcoming *occurrence* in the separate
  "Upcoming bills" list above it, since Galaxy's Money-Sky bill entities resolve to the
  definition, not an occurrence (confirmed server-side in `galaxyEntity.ts`).
- No real-device verification was possible in this sandbox (standing limitation across this
  entire project, unrelated to this phase).

## 9. Recommended next phase (based on the resulting repository state only)

None recommended as an immediate follow-on. This phase closed the specific, already-identified
connective-tissue gaps Phase AC's audit found; the next substantive candidates it also
identified — `journey_link`-aware Chat retrieval (Red Zone, needs its own spec), a Debt/Credit
product-strategy decision, or the standing Fly deploy/CI reconnection (ops-only) — each require
either a dedicated architectural review or a decision outside this phase's scope, not more
connective-tissue wiring of the same kind just completed.

## Final verdict: KEEP

Five small, independently-verifiable fixes, each reusing an existing pattern from elsewhere in
this exact codebase — zero new architecture, zero server-side changes, zero Red Zone files
touched. 1039+354 tests green; full gate clean.
