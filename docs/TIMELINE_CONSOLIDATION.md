# Findings + Decision: Timeline vs Chronicle vs Journeys vs Life Seasons

> The redundancy call the consolidation pass asked for (docs/CONSOLIDATION_AND_CLARITY.md Theme 1).
> Claude is the judge. Executed the safe parts; the UI redesign is flagged for the user's eyes.

## What each thing actually is (verified in code)
| Thing | What it is | Backed by | Verdict |
|---|---|---|---|
| **TimelineView** (`components/TimelineView.tsx`) | A full-screen "chapters of your life" timeline (auto-detected + manual chapters). **The one the user built and dislikes the UI of.** | `timeline_chapters` table, `analysis/timeline.ts`, `/api/timeline` | **Redundant with Journeys** — a "chapter" ≈ a Journey/Season. Redesign as a *view*, don't keep as a competing panel. |
| **Journeys** (Vision 2.0) | User-authored life chapters that *everything links to* (memories, money, tasks…). The richer, intentional org layer. | `journeys` + `journey_link` | **The keeper** — the primary life-chapter surface. |
| **Life Seasons** (planned) | Auto-detected eras (Recovery Era, College Era…) over time. | not built yet | Feeds the same timeline; complements Journeys (auto vs. authored). |
| **Chronicle** (`components/Chronicle.tsx`) | A per-OBJECT evolving-history/lore view (used inside NodeInspector + TimelineView). NOT a life timeline. | lore/versions | **Keep, distinct.** Only the *name* collides. |

Naming confusion found: the ToolsMenu entry labeled **"Chronicle"** actually opens **TimelineView**, while the real Chronicle is an embedded per-node view. Two different things wearing one name.

## Decision
1. **Journeys is the canonical life-chapter organizer.** The chapters-Timeline is not a peer; it
   becomes a **redesigned timeline VIEW** that plots **Journeys** (their spans/progress) and, later,
   **auto-detected Life Seasons** — one timeline surface fed by Journeys/Seasons, not a separate,
   badly-styled chapters panel. `timeline_chapters` can back the auto-detected Seasons layer
   (its backfill/auto-detection is the reusable part); manual chapters migrate to Journeys.
2. **Keep Chronicle** (the per-object history) — genuinely separate; only rename to end the clash.
3. **Do NOT rip out the Timeline blind.** The user dislikes its *design*, which needs their eyes;
   deleting it would lose the auto-detection + data. So: mark it secondary now, redesign it as the
   Journeys/Seasons timeline in a session where the user can look.

## Executed now (safe)
- Renamed the ToolsMenu entry that opens the chapters timeline from "Chronicle" → **"Timeline"**
  so it stops colliding with the per-object Chronicle. (Behaviour unchanged; label only.)

## Next (needs the user's eyes — flagged, not done blind)
- Redesign `TimelineView` into the **Journeys + Life Seasons timeline** (plot journey spans +
  progress; auto-detected seasons as bands). Migrate manual `timeline_chapters` into Journeys;
  keep the auto-detection to seed Seasons.
- Then remove the standalone chapters concept once Journeys/Seasons cover it.
