# Spec — Timeline Redesign: Journeys + Life Seasons

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> Parent decision: [TIMELINE_CONSOLIDATION.md](../TIMELINE_CONSOLIDATION.md), which already found the
> current `TimelineView` redundant with Journeys and specced this exact redesign — flagged there as
> needing "a session where the user can look" before building. Also grounded in
> [VISION_2_JOURNEYS.md](../VISION_2_JOURNEYS.md)'s Life Seasons concept and Stage 4 sequencing
> ("Financial + task + timeline Journey linkage... Life Seasons"). Status: **proposed — not yet
> implemented.** This is a write-only deliverable: several real design decisions below are left as
> open questions for the user rather than decided unilaterally, because the underlying complaint
> ("wasn't what I intended... function like [a timeline]") is about visual/UX taste, which the
> consolidation doc itself says needs the user's eyes, not just correctness.

## 🎯 Objective

The current `TimelineView` places chapters by **array index + fixed trig wobble**
(`(i - (N-1)/2) * SPACING`, plus `sin`/`cos` jitter), not by `periodStart`/`periodEnd` — so two
chapters a day apart and two chapters six months apart render with identical spacing. There is no
real time axis, which is very likely the concrete root of "doesn't function like a timeline."
Separately, `docs/TIMELINE_CONSOLIDATION.md` already judged the whole "chapters" concept redundant
with Journeys — a chapter is essentially an auto-detected or manually-marked life period, which is
what a Journey already is, just without a time axis. This spec replaces the standalone chapters
timeline with a single surface that plots **Journeys** (user-authored life chapters, spans over
real time) and, layered behind them, **auto-detected Life Seasons** (identity eras — "Recovery Era",
"College Era" — the thing `timeline_chapters`' existing detection heuristic already approximates).

## The architectural gap this spec must resolve first

`journeys` (`db/schemaSql.ts:407-418`) has **no start/end date columns** — only `created_at`,
`updated_at`, `status` ('active'/'done', possibly more), and `progress`. A timeline needs a *span*
to plot. Three ways to derive one, each with a real tradeoff (see Open Questions — this is the
single biggest design decision in this spec, deliberately not decided here):

1. **Infer from links.** A Journey's span = earliest-linked-item date → latest-linked-item date (or
   "now" while `status="active"`). Zero schema change, but a brand-new Journey with no links yet has
   no visible span, and the "start" retroactively moves earlier every time an old memory gets linked
   to it.
2. **Add explicit `started_at`/`ended_at` columns.** Most correct for a literal timeline, but is a
   real schema change (additive, safe) and needs UI for the user to set/edit them — more scope.
3. **Hybrid**: default the inferred range from links (option 1), but let `started_at`/`ended_at`
   override it when explicitly set (option 2) — most flexible, most work.

## Logic

- **`timeline_chapters` becomes the Life Seasons detection input, not a competing data model.**
  Its existing heuristic (`analysis/timeline.ts`'s `assessChange`, momentum/emotion-delta/milestone
  gated by `MIN_GAP_DAYS`/`MONTHLY_CAP`) is the reusable part per the consolidation doc — reuse it to
  seed auto-detected Season bands behind the Journey spans, rather than rendering chapters as their
  own competing timeline entries.
- **Manual chapters migrate into Journeys.** Per the consolidation doc's decision: a manually-marked
  chapter (`origin: "user"`) is conceptually just a Journey without the rest of Journeys' machinery
  (linking, progress, hubs). A one-time migration converts existing manual `timeline_chapters` rows
  into `journeys` rows (title from `ch.title`, description from `ch.summary`); auto-detected chapters
  (`origin: "auto"`) instead become the seed data for the Season-detection pass, not migrated as
  Journeys themselves (they're eras, not authored chapters).
- **Photos**: chapters' `photoIds` (currently attachments linked to a chapter) need a new home once
  chapters stop being the primary UI — likely re-attached to whichever Journey a chapter migrates
  into, or to the specific memory node they were originally uploaded against. Needs deciding during
  implementation, not blocking this spec's shape.

## UX — options, not a decision

`docs/TIMELINE_CONSOLIDATION.md` explicitly declined to redesign the visual on its own ("needs the
user's eyes"), so this spec lays out real options rather than picking one:

- **Option A — keep the 3D "river"**, but make body placement genuinely time-proportional (position
  = actual elapsed time between `periodStart` values, not index) and render Journey spans as
  elongated segments of the ribbon with Season bands as background color washes. Preserves the
  existing visual identity/mood; fixes the concrete "not actually a timeline" bug without a full
  rebuild.
- **Option B — a simpler 2D time-axis view** (horizontal or vertical scroll), closer to
  `NodeList.tsx`'s existing `bucket()` grouping pattern (`Today`/`Yesterday`/`This month`/month-year
  buckets) but extended with Journey spans drawn as bars/ranges over the axis, Season bands as
  colored background regions behind them. Much easier to read at a glance, especially with many
  Journeys/memories, and reuses an existing, already-liked pattern in the app rather than inventing
  a new 3D interaction.
- **Option C — both**: Option B as the default view (readable, fast, mobile-friendly), Option A kept
  as an optional "immersive" toggle for when the user wants the ambient/exploratory feel. More scope
  than A or B alone.

Whichever is chosen, it must also solve: unbounded data (no pagination today — `analysis/timeline.ts:81-86`
and `GET /api/timeline` return every chapter/Journey with no limit or windowing) and a real
loading/empty/error split (a gap patched minimally in the current view this round, but a redesign
should build it in from the start rather than retrofit it again).

## 📐 Architecture / blast radius (sketch — firms up once UX option is chosen)

| Layer | Change | Zone |
|-------|--------|------|
| `server/db/schemaSql.ts` | Only if UX/date-derivation decision needs it: additive `started_at`/`ended_at` columns on `journeys` (nullable, no migration of existing rows required). | 🔴 if added (schema change, additive/safe) |
| `server/repositories/journeys.repo.ts` | If span is link-inferred: a new read method computing min/max linked-item date per Journey. If explicit dates: extend `create`/`update`. | 🟡 |
| `server/analysis/timeline.ts` | Repurpose `assessChange`'s detection as the Season-seeding pass instead of the chapters end-product; add the manual-chapter→Journey one-time migration. | 🟡 |
| `server/api/routes/timeline.ts` | New shape returning Journeys-with-spans + Season bands instead of `TimelineChapter[]`; must be paginated/windowed (unlike today). | 🟡 |
| `web/components/TimelineView.tsx` | Rebuilt per whichever UX option is chosen; the timezone/blob-URL/error-state fixes already shipped this round should carry forward into the rebuild rather than being re-introduced as new bugs. | 🟢/🟡 depending on option |
| `shared/types.ts` | Retire `TimelineChapter` (or repurpose as the internal Season-detection shape only, no longer client-facing) in favor of a `JourneySpan`/`LifeSeason` shape. | 🟢 |

No changes to `journey_link`/existing linking logic — this spec is purely about how Journeys (and
detected Seasons) get VISUALIZED over time, not how linking works (see the separate
`journeys-connective-tissue.md` spec for that).

## 🧪 Test plan

- Server: span-derivation logic (whichever option is chosen) has deterministic unit tests — e.g. a
  Journey with three linked nodes at known dates produces the expected min/max span; a Journey with
  zero links has a defined, tested fallback (not a crash/NaN — this codebase has hit NaN-in-the-galaxy
  bugs before from similar untested edge cases). Season-detection reuses `analysis/timeline.ts`'s
  existing tested heuristic — no new detection logic to test if reused as-is. Migration script has a
  dedicated test: N manual chapters in, N journeys out, auto chapters left as detection seed data
  only (not duplicated as journeys).
- Web: whichever UX option is picked gets a `npx tsx`-style measurement harness before shipping any
  spatial/time-axis math, per this repo's own "prove it by measurement, not assertion" rule (already
  established for `orbits.ts`'s LOD work) — e.g. feed synthetic Journeys with known date spans through
  the layout function and assert relative positions are actually proportional to elapsed time, not
  just "different."
- Full gate green; pagination/windowing verified against a synthetic large dataset (hundreds of
  Journeys/nodes) so this doesn't ship the same unbounded-query gap being replaced.

## Risks

- **Biggest risk: shipping another visual the user doesn't like**, because this is fundamentally a
  taste call, not a correctness one — mitigated by presenting real options above instead of building
  blind, per the consolidation doc's own explicit caution.
- Migrating manual chapters into Journeys is a one-way data transformation — needs a dry-run/preview
  step (or at minimum a clear rollback path) before running against real data, especially since this
  app's SQLite data lives on a single Fly volume with no separate staging environment.
- Photo re-homing (chapters' `photoIds`) is unresolved in this spec and could lose attachments if not
  carried through carefully during migration.
- Scope creep: this spec's ceiling (Option C, full explicit date columns) is a meaningfully larger
  project than a bug patch — worth explicitly re-confirming scope with the user once a UX option is
  chosen, before implementation starts.

## ✅ Acceptance criteria

1. Journeys render on a genuinely time-proportional axis — verified by measurement, not eyeballing.
2. Auto-detected Life Seasons render as bands behind Journey spans, reusing the existing detection
   heuristic rather than a new one.
3. Manual `timeline_chapters` are migrated into Journeys with no data loss (title/summary/photos
   preserved); auto-detected chapters remain as Season-detection input, not duplicated as Journeys.
4. The data path is paginated/windowed — verified against a large synthetic dataset.
5. A real fetch failure shows a distinct, actionable error state (carrying forward this round's fix,
   not regressing it).
6. Gate green; whichever schema change (if any) is additive with no destructive migration.

## Open questions for review

1. **Span derivation** — infer from links (Option 1), explicit `started_at`/`ended_at` columns
   (Option 2), or hybrid (Option 3)? This is the foundational decision everything else depends on.
2. **Visual direction** — keep the 3D river with real time-proportional spacing (Option A), move to
   a simpler 2D time-axis view closer to `NodeList.tsx`'s existing bucket pattern (Option B), or both
   with a toggle (Option C)? Recommend starting with a couple of quick visual mockups/sketches before
   committing engineering time, given this is explicitly a taste call.
3. **Photo re-homing** — when a manual chapter migrates into a Journey, do its photos move with it
   (as Journey-level attachments, if that concept exists) or get re-attached to whichever memory node
   they were originally uploaded against?
4. Is this the right time to build this (a real, multi-piece redesign), or should it wait until after
   the `journeys-connective-tissue.md` spec (capture-time linking, finance/task wiring) ships first,
   since Life Seasons/spans will read more meaningfully once Journeys actually have real linked data
   flowing into them from everywhere?

## Next step after approval

Once the open questions above are answered (especially #1 and #2), write a follow-up, fully-locked
implementation spec (or amend this one) with a firm architecture table and no remaining "TBD"s, per
`WORKFLOW.md` Phase A. No implementation before that — this document is exploratory/decision-seeking,
not execution-ready.
