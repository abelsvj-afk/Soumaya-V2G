# Spec — Mission Control: finish what Observatory already started

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> Parent: [VISION_2_JOURNEYS.md](../VISION_2_JOURNEYS.md) (Mission Control, Stage 2) and
> [OPTIMIZATION_ROADMAP.md](../OPTIMIZATION_ROADMAP.md) Problem 1 (no single coherent entry point
> across 11 tabs). Status: **approved, ready for implementation** (see Decisions below — resolved
> without a review round-trip per this session's standing delegation).

## 🎯 Objective

`VISION_2_JOURNEYS.md` asks for a "Mission Control" landing view showing: today's highest-priority
missions · Safe-to-spend · the Daily Contact question · one memory worth revisiting · a
relationship check-in suggestion · progress toward active Journeys · important reminders · AI
observations · recent activity.

**The investigation for this spec found something worth stating plainly: this is mostly already
built.** `packages/web/src/components/Observatory.tsx` already composes 5 of these 8 pieces (Daily
Contact, Safe-to-Spend, Journey progress, a resurfaced dormant memory, a "jump back in" recent-
activity list) from real, working API calls. This is NOT a "build Mission Control from scratch"
spec — it's "add the 3 missing pieces, fix how unreliably it's shown, and stop under-selling what's
already there by only calling it an away-digest." Exactly the kind of fix `OPTIMIZATION_ROADMAP.md`
asks for: consolidate and surface, don't rebuild.

## What's already there (verified, reuse verbatim)

| Vision bullet | Already in Observatory? | Source |
|---|---|---|
| Daily Contact question | ✅ | `getDailyContact()`/`answerDailyContact()` (`api/client.ts`), `Observatory.tsx:209-279` |
| Safe-to-spend | ✅ | `getFinanceSummary()` (`api/finance.ts:40`), `Observatory.tsx:281-294` |
| Progress toward active Journeys | ✅ | `getJourneys()` (`api/journeys.ts:23`), filtered `status==="active"`, top 3, `Observatory.tsx:296-309` |
| One memory worth revisiting | ✅ (partial) | `away.resurfaced` from `buildAwayDigest`/`buildDormantList` (`analysis/dormant.ts:43`), `Observatory.tsx:162-207` |
| Recent activity | ✅ (partial) | "Jump back in" — locally sorted from the `memories` prop, `Observatory.tsx:381-395` |
| Today's highest-priority missions | ❌ | Agenda/Actions isn't surfaced in Observatory at all today |
| A relationship check-in suggestion | ❌ | Nothing computes this yet |
| Important reminders (as a first-class item) | ⚠️ partial | Only inside the away-digest's due-list; the due-reminder PREDICATE is independently duplicated in `ActionsPanel.tsx:49-59` and `NotificationsBar.tsx:83-87` |
| AI observations | ⚠️ partial | Only one insight shown, shared with "discovery of the day" via `getDigest()` |

## 📐 Architecture / blast radius

| Layer | Change | Zone |
|-------|--------|------|
| `web/utils/dueReminders.ts` (NEW, small) | Extract the due-reminder predicate duplicated in `ActionsPanel.tsx` and `NotificationsBar.tsx` into one shared function; both call sites switch to it. Fixes the duplication flagged in this spec's own research, independent of everything else below. | 🟢 |
| `web/components/Observatory.tsx` | Add an "Today's agenda" card: due reminders (via the new shared helper, over the existing `memories` prop — no new fetch) + a count of open action items, tap-through to the Agenda tab. Add a "Worth a moment" card using `getDueReviews()` (`api/features.ts:52` — already exists, currently unused by Observatory) alongside the existing dormant-memory resurfacing, so "one memory worth revisiting" draws from BOTH the spaced-repetition system and the dormant-list, not just one. | 🟢 |
| `server/api/routes/digest.ts` | `GET /api/digest` currently returns everything via `InsightsRepo.recent()`, but Observatory only ever renders the first one (shared with "discovery of the day"). Show up to 3 as a real "AI observations" list instead of 1 — no server change needed if `recent()` already returns more than one row (verify during implementation; likely just a web-side rendering change). | 🟢 |
| `web/App.tsx` | Change the landing gate (`App.tsx:842-853`): today Observatory only shows if no panel raced it open during the 3.4s cinematic delay — a silent miss. Per "the daily loop lands in Mission Control," it should reliably be what a user returning to a loaded session sees, not something a panel can silently pre-empt. | 🟡 (touches app startup sequencing — the one genuinely delicate part of this spec) |

**Deliberately NOT in this spec:** the "relationship check-in suggestion" bullet. It needs a real
new computation (something like "a tracked person you haven't logged an interaction with in N
days"), which doesn't reuse existing wiring the way everything else here does — worth its own small
follow-up once this lands, not bundled in.

No DB migration. No new backend aggregation endpoint — Observatory already composes multiple
existing API calls client-side; this spec adds 1-2 more calls to that same composition rather than
introducing a monolithic "mission control" backend route, matching the file's own established
pattern.

## Logic

- The due-reminder de-duplication (`web/utils/dueReminders.ts`) is worth doing regardless of the
  rest of this spec — two independent implementations of the same predicate is exactly the
  "computed but never consumed... or computed twice and drifting" risk `OPTIMIZATION_ROADMAP.md`
  Problem 2 is about.
- `getDueReviews()` and the dormant-list resurfacing are BOTH legitimate "one memory worth
  revisiting" sources with different intents (spaced-repetition science vs. "you used to care about
  this and stopped") — show one of each rather than picking a winner, since they answer different
  questions.
- The landing-gate change (`App.tsx`) is the one piece with real risk: the current 3.4s delay exists
  specifically to follow the cinematic fly-in, and the "a panel racing it open wins" behavior may be
  intentional (someone who tapped into a tab during the swoop probably wants that tab, not to be
  interrupted by Observatory). Resolve this via the open question below before changing it — don't
  assume the current behavior is a bug.

## UX

- New Observatory cards match the file's own established card language (a header line + a tap-
  through action, same as the existing Safe-to-Spend/Journeys/away-digest cards) — no new visual
  pattern introduced.
- "Today's agenda" card: due-reminder count + first 1-2 labels, "See Agenda →" tap-through
  (`onOpenTab("actions")`, matching the existing pattern other cards already use for Money/
  Journeys).
- "Worth a moment" card: one item from `getDueReviews()` (if any), styled the same as the existing
  dormant-memory resurfacing card, clearly labeled so it doesn't read as a duplicate of it.

## 🧪 Test plan

- `web/utils/dueReminders.ts`: unit tests for the extracted predicate (due-now vs. future vs.
  already-acked), migrated from whatever inline coverage `ActionsPanel`/`NotificationsBar` currently
  have for this logic (check first — this may already be tested inline and just need relocating).
- Observatory: verify the new cards render from mocked `getDueReviews()`/reminder data and are
  absent (not broken) when those sources return empty — matching the file's existing "cards
  degrade to nothing on missing data" contract.
- Full gate: `npm run typecheck && npm test && npm run build -w @brain/web`.

## Risks

- Low overall, given Decision #1 (below) removes the one item that touched existing behavior —
  everything remaining is additive rendering of already-fetched or already-existing data.
- `InsightsRepo.recent()` returning more than one row needs verifying before assuming the "AI
  observations" list is a zero-backend-change item — flagged, not assumed.

## ✅ Acceptance criteria

1. Observatory shows: Daily Contact, Safe-to-Spend, Journey progress, a resurfaced dormant memory,
   recent activity (all already true today) **plus** today's due reminders/agenda count and a
   spaced-repetition "worth a moment" item (new).
2. The due-reminder predicate exists in exactly one place, used by Observatory, `ActionsPanel`, and
   `NotificationsBar` alike.
3. Landing behavior is unchanged (Decision #1) — a deliberate choice, not an accidental race
   condition left unexamined.
4. Gate green; no schema migration; no new backend aggregate endpoint.

## Decisions (resolved — proceeding without a review round-trip, per this session's standing
## "go with your recommendation" delegation)

1. **Leave the landing gate in `App.tsx` untouched.** On reflection, "a panel opened during the
   3.4s swoop still wins" is a deliberate courtesy, not a bug — forcibly interrupting a user's own
   navigation choice to show them a dashboard would be worse UX than the "problem" it fixes. This
   removes the one 🟡-zone item from this spec entirely; every remaining change is pure additive
   rendering of already-fetched or already-existing data. Acceptance criterion #3 is satisfied by
   *not* changing this, not by changing it.
2. **Mission Control = evolving Observatory in place**, not a new component or a rename — confirmed
   by the standing "no tab removal, no rebuild" mandate.
3. **Relationship check-in suggestion stays deferred** to its own follow-up spec — it's the one
   bullet here that needs genuinely new computation rather than reuse.

## Next step after approval

Implement directly — with decision #1 above, this is now ENTIRELY additive rendering of already-
fetched/already-existing data plus one small extraction (the due-reminder helper). No remaining
🟡/🔴-zone changes.
