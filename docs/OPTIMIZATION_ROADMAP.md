# OPTIMIZATION_ROADMAP.md

> Companion to **[HONEST_ASSESSMENT.md](../HONEST_ASSESSMENT.md)** — read that first, this is the
> answer to "okay, so how do we actually fix it?"

## The ground rule

**We are NOT removing tabs, ripping out features, or rebuilding.** The user's explicit call: the
tabs are already there, they're liked, and at this scale a rebuild would be its own disaster. Every
item below is a *fix, consolidate, surface, or reuse-what's-already-built* move — never a deletion.
If a future idea on this list ever starts to look like "remove tab X," that idea is wrong for this
document and needs a separate, explicit conversation first.

The good news, and this is the load-bearing fact of this whole plan: **the fixes for problems #1
and #2 are already designed and approved** in this repo's own mandated north star,
[VISION_2_JOURNEYS.md](./VISION_2_JOURNEYS.md) — they were never built. This isn't a new plan
invented from scratch; it's picking up work the project already committed to.

---

## Problem 1 — The taxonomy tax is too high

**Root cause:** 9 cognitive kinds, 11 tabs, a Financial OS, Journeys, achievements, and a Hangar,
all presented at once with no ordering — a new (or returning) user has to learn the whole worldview
before getting value.

**The fix already exists on paper, unbuilt:** `VISION_2_JOURNEYS.md`'s **Progressive Discovery**
principle — *"reduce hidden functionality... features unlock naturally when they become relevant."*
And its **Mission Control** daily-loop concept — *"on opening Soumaya, the user lands in Mission
Control... today's highest-priority missions, Safe-to-spend, the Daily Contact question, one memory
worth revisiting, progress toward active Journeys"* — is the single front door that makes 11 tabs
feel like one coherent app instead of 11 separate destinations.

**Non-destructive path:**
1. **Mission Control as the landing view** (not a new tab — a composition of things that already
   exist: Daily Contact, bill-risk, one dormant/due memory, active-Journey progress). The 11 tabs
   stay exactly where they are for anyone who wants to go straight to one; Mission Control just
   gives everyone else a "start here" that doesn't require knowing the taxonomy first.
2. **Progressive unlock, not tab removal.** A brand-new brain can start with Details/Browse/Mind/
   Agenda/Money visible and the rest (Journeys, Insights, Progress, Hangar) appear once there's
   real data to justify them (a first Journey created, a first Insight synthesized, a first
   achievement earned) — same tabs, same code, just not all thrown at a day-1 user simultaneously.
3. **Simplify capture, not the taxonomy.** The Mind tab's 9 kinds don't need to shrink — but the
   ingest box shouldn't require picking one up front. Suggest a kind after auto-extraction (already
   heuristic-classified today) and let the user confirm/change it, rather than making the decision
   a precondition of dumping a thought.

*Needs its own spec before building* (per this repo's mandatory workflow) — Mission Control
composes several existing subsystems and deserves a proper design pass, not an ad-hoc build.

## Problem 2 — The automatic "magic" doesn't consistently earn trust

**Root cause:** the "computed but never consumed" bug shape has now been found and fixed at least
six separate times in one audit pass (dead `suggestedTags`, dead `heavyScenery` knob, dead `onRecall`
prop, a dormant Forecast Engine, a Telegram-only bill-risk warning, an over-linking skill bug that
had been live for weeks). Each instance is small; the *pattern repeating* is what erodes trust in
everything automatic, including the parts that work fine.

**Non-destructive path:**
1. **One systematic sweep, once**, specifically hunting this exact bug shape across the whole
   codebase — not waiting to trip over each instance individually the way this session did. A
   dedicated audit pass (grep every exported analysis/service function for real call sites,
   flagging anything with zero non-test consumers) closes this out as a known category instead of
   an ongoing surprise.
2. **A real "systems check" surface**, extending the diagnostics box already added to the Soumaya
   tab this session (cloud-AI connection status) into a fuller internal health readout: last time
   each autonomous tool actually fired, whether the tool-router ran in the last hour, whether
   auto-linking is actively forming edges. Turns a silent dormant feature into a visible "this
   hasn't run in 3 days" fact the owner can act on, instead of a mystery a user reports later.
3. **Make "does this actually get called" a checklist item for new automatic features going
   forward** — every snapshot-injection function built this session (finance, people, cognitive)
   shipped with an end-to-end test proving it lands in `systemExtra`, not just a unit test of the
   function in isolation. Keep doing that; it's cheap insurance against exactly this bug shape.

*Mostly small, contained, "lighter day-to-day loop" work* — the sweep and the health-check surface
can be scoped and built without a heavyweight spec, similar to the billRisk/skills fixes already
shipped this session.

## Problem 3 — Even the owner doesn't have a full mental model anymore

**Root cause:** the Help menu had gone stale (still describing a removed 3D timeline mechanic,
missing the Money and Journeys tabs entirely — both now fixed), and there's no single place that
answers "what does this app actually do, end to end" at a glance.

**Non-destructive path:**
1. **Keep the Help menu current going forward** — it's now accurate as of this pass (Money,
   Journeys, and the Views/Lens distinction were added; the Chronicle entry was corrected). Update
   it in the SAME commit as any user-facing feature change from now on, the way it apparently used
   to be maintained.
2. **This document pair** (`HONEST_ASSESSMENT.md` + this roadmap) *is* the second half of the fix —
   a standing, dated record to check the product against, instead of relying on memory across a
   project this large.
3. Longer-term: consider generating parts of Help directly from single-source-of-truth data
   (`COGNITIVE_META` already drives the Mind tab's colors/labels/icons — Help's taxonomy entry
   could read from the same map instead of being hand-written prose that can drift again).

## Problem 4 — The galaxy is a great demo, a slower retrieval tool

**Root cause:** finding a specific memory by flying a 3D camera through space is slower than a
search box, especially on a phone, especially under time pressure.

**Non-destructive path — the galaxy stays exactly as ambitious as it is:**
1. **Elevate search as the fast path, not a replacement for the galaxy.** Confirm the existing
   search entry point is never more than one tap away from anywhere in the app (it already exists —
   `SearchBox`/the 🔍 tool — this is a discoverability/placement check, not new functionality).
2. **Mission Control (Problem 1's fix) doubles as a retrieval shortcut** — "one memory worth
   revisiting" and Journey/task lists surfaced there mean a user often doesn't need to fly anywhere
   to find what they came for.
3. The galaxy remains the *exploratory* view — for browsing, for the "wow," for finding what you
   didn't know to search for. Both views already coexist in the app; this is about making sure
   speed-seekers aren't forced through the slow path.

## Problem 5 — Structural/deploy fragility

**Root cause:** GitHub Actions is blocked for this account, deploys are manual (`fly deploy` via a
human/agy from Termux), and there was a Fly billing hold — meaning the live app can lag behind the
work happening in sessions like this one.

**Non-destructive path (infra/ops, not code):**
1. Reconnect **Fly's native GitHub auto-deploy** (Fly dashboard → app → GitHub) — already identified
   in `CLAUDE.md` as "the durable fix." This is the single highest-leverage action for this problem
   and doesn't touch a line of application code.
2. Until that's reconnected: treat a manual `fly deploy --remote-only` as a required step after any
   push meant to reach the live app, not an afterthought — already documented in `CLAUDE.md`, worth
   actually following consistently.

---

## Suggested order

1. **Now / already done this session:** Help menu accuracy pass; this document pair.
2. **Next, small/contained (no spec needed):** the "computed but never consumed" sweep; the
   systems-check diagnostics surface.
3. **Done:** Mission Control (`docs/specs/mission-control.md`) — Observatory already composed
   Daily Contact, Safe-to-Spend, Journey progress, a resurfaced dormant memory, and recent
   activity; this phase added the two missing pieces (a "Today's agenda" card for due reminders +
   open action count, and a "Worth a moment" spaced-repetition card), de-duplicated the
   due-reminder predicate across `ActionsPanel`/`NotificationsBar`/`Observatory` into one shared
   `web/utils/dueReminders.ts`, and surfaced up to 3 AI observations instead of 1 — the single
   highest-leverage item on this list for Problem 1.
4. **Then:** Progressive Discovery pass (unlock tabs by relevance instead of showing all 11 on
   day one) — deliberately sequenced AFTER Mission Control exists, since Mission Control is what a
   day-1 user lands on instead of an empty dock.
5. **Ops, any time, independent of the above:** reconnect Fly's GitHub auto-deploy.

## How to know it worked

Re-read `HONEST_ASSESSMENT.md`'s verdict after each phase above ships, and add a new dated entry
doing the same exercise again. The five reasons in the first entry are the actual scoreboard — this
roadmap succeeds when a repeat of that exercise finds fewer of them still true, not when more
features exist.
