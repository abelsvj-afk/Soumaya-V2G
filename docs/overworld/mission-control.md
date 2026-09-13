# Mission Control as the Overworld's front door (Stage 2.37, task #60)

> Per Rule #1. Direct user request, reversing an earlier deprioritization: *"I want you to bring
> back the mind space, mission control."* `VISION_2_JOURNEYS.md` names Mission Control as where
> "the daily loop lands": today's highest-priority missions, Safe-to-spend, the Daily Contact
> question, one memory worth revisiting, a relationship check-in suggestion, progress toward
> active Journeys, important reminders, AI observations, recent activity.

## What already exists that this must reuse, not reinvent

A pre-Overworld spec for this exact feature (`docs/specs/mission-control.md`) already did the
hard investigation once, against the old 3D galaxy's `Observatory.tsx`, and found **most of this
was already built** — 5 of 8 bullets already composed from real API calls in one component. Its
own resolved decision #2 is reused verbatim here: *"Mission Control = evolving Observatory in
place, not a new component or a rename."* The Overworld's own `ObservatoryOverlay.tsx` (the
"Insights" building, `docs/overworld/roadmap.md`'s parity table entry for the old Observatory
tab) is the exact same analog and gets the same treatment — consolidate and surface, per
`OPTIMIZATION_ROADMAP.md`'s standing "no tab removal, no rebuild" mandate.

Re-auditing against the CURRENT Overworld (not the deleted galaxy) found the picture has
changed since that old spec, because several pieces have shipped elsewhere in the meantime:

| Vision bullet | Already real in the Overworld? | Source |
|---|---|---|
| AI observations | ✅ | `getDigest()`/`resolveInsight()` — already all of `ObservatoryOverlay.tsx` today |
| Safe-to-spend | ✅ (already fetched, just not shown here) | `WorldSnapshot.bank.safeToSpendCents` (`loadWorldSnapshot.ts`) |
| One memory worth revisiting | ✅ (already fetched, just not shown here) | `WorldSnapshot.dueReviews` (spaced-repetition.md, task #58) |
| Today's highest-priority missions / important reminders | ⚠️ exists but nowhere summarized | `graph.nodes` filtered by `kind === "action"` (quests) / `remindAt` (reminders) — already real data `BulletinBoardOverlay.tsx` lists in full, but no agenda COUNT/summary exists anywhere else |
| Progress toward active Journeys | ⚠️ exists but nowhere summarized outside Town Hall | `getJourneys()` (`api/journeys.ts`) — Town Hall's region list already reads this; no digest view of it exists |
| Recent activity | ⚠️ raw data only | `graph.nodes` sorted by `createdAt` — nothing currently surfaces "recently created" as its own list |
| Daily Contact question | ❌ genuinely orphaned | `getDailyContact()`/`answerDailyContact()` (`api/client.ts`) — fully real, working, typed, and used by **nothing** in the Overworld. Same orphaned-client-wrapper pattern task #71 (Lore/Timeline/Codex) and task #72 (Lenses) already found and fixed elsewhere. |
| A relationship check-in suggestion | ❌ | Needs genuinely new computation — the pre-Overworld spec deferred this too, for the same reason |

## Resolved decisions

**1. Home: `ObservatoryOverlay.tsx`, expanded in place.** Not a new building, not a new overlay
kind, not a landing modal. Matches the reused precedent above and keeps this additive rather
than a rebuild.

**2. No auto-popup on load.** The pre-Overworld spec explicitly rejected forcing a dashboard in
front of a player's own navigation choice as worse UX than the "problem" it fixes (its own
decision #1). Nothing in the Overworld today auto-opens an overlay on world load either — same
reasoning applies unchanged. The Observatory is walked to like any other building; `TownHud`
(task #73) already keeps it one glance away.

**3. Props, not new fetches, for anything the snapshot already has.** `OverworldRoot.tsx` already
loads `graph`, `bank.safeToSpendCents`, and `dueReviews` into `WorldSnapshot` for other overlays
(same pattern `GymOverlay` already uses for `graph`/`fuel`/`streak`) — `ObservatoryOverlay` gains
those same props instead of re-fetching. Only the two genuinely new pieces (`getDailyContact()`,
`getJourneys()`) get their own `useEffect` fetch, matching the file's own existing pattern for
`getDigest()`.

**4. Relationship check-in suggestion stays deferred**, for the same reason the pre-Overworld
spec deferred it: it needs real new computation ("a tracked person you haven't logged an
interaction with in N days"), not reuse of something that already exists. Worth its own
follow-up once a "tracked person" concept has a real recency signal to check.

**5. Card order matches the vision doc's own priority**: agenda → safe-to-spend → Daily Contact
→ worth a moment → Journey progress → AI observations (existing) → recent activity. Non-color
cues throughout (this file already uses ⚡✨ for insight kinds; new cards follow the same
icon-first convention, never a bare color swatch).

## Data model / logic

No schema change, no new backend route — every source above already exists. New client-side
composition only, inside `ObservatoryOverlay.tsx`:

- **Agenda**: `graph.nodes.filter(n => n.kind === "action").length` (open quests) +
  `graph.nodes.filter(n => n.kind !== "action" && n.remindAt && new Date(n.remindAt) <= now).length`
  (due reminders) — the exact same two predicates `BulletinBoardOverlay.tsx` already uses,
  duplicated here as a plain read (not extracted into a shared helper — two call sites reading
  the same two one-line filters isn't the drift risk a duplicated multi-branch predicate would
  be; revisit only if a third consumer appears).
- **Safe-to-spend**: `bank.safeToSpendCents`, formatted the same way `BankOverlay.tsx` already
  does.
- **Daily Contact**: fetch on mount; unanswered shows the question + a text field wired to
  `answerDailyContact()` (same shape `SanctuaryOverlay.tsx`'s own thought-logging form already
  uses); answered shows the discovery/foresight text instead. Answering counts as the
  Observatory's own real work event (`recordBuildingWork`), same convention as resolving an
  insight already does.
- **Worth a moment**: first entry of `dueReviews`, if any — same wording convention
  `CreatureSummaryOverlay.tsx`'s own recall-check card already established.
- **Journey progress**: fetch `getJourneys()` on mount, filter `status === "active"`, top 3,
  each shown as a text progress readout (`"62% — Learning guitar"`), never a color-only bar.
- **Recent activity**: `graph.nodes` sorted by `createdAt` descending, top 5 labels.

## Deferred, explicitly

Relationship check-in suggestion (decision #4); any auto-popup/landing-gate behavior (decision
#2); extracting the agenda predicates into a shared helper (only worth it if a third real
consumer shows up).
