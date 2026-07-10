# Neuroscience report ⇄ Soumaya — what we already have, what to bring in, what to skip

> Cross-reference of the external report *"From Brain to Second Brain: A Neuroscience-Grounded
> Design Report for a Spatial Galaxy Knowledge Graph"* (uploaded 2026-07-10) against Soumaya's
> actual code. The report had **no context on our project** — so this separates its recommendations
> into: ✅ already built (validation, don't rebuild), ➕ real gaps worth bringing in, and ⏭️ skip
> (contradicts our product or low value). Companion to [`SECOND_BRAIN_ALIGNMENT.md`](./SECOND_BRAIN_ALIGNMENT.md).

## Headline

The report's scientific charter is **the galaxy metaphor itself** (method-of-loci, d = 0.88 recall
effect; spatial memory is the brain's strongest channel). That's our whole product — validated, not
a gap. Most of its "code-buildable mechanics" we already have in some form. The **one big genuine
gap** is the one it ranks #1: **memory is made by *retrieval*, not storage** — we have decay and
resurfacing but no real **spaced-repetition + active-recall** layer. That's the standout thing to bring in.

## ✅ Already built — the report validates our choices (do NOT rebuild)

| Report recommendation | Where it lives in Soumaya |
|---|---|
| Spatial "memory palace" galaxy (its core charter) | the entire 3D galaxy; kinematic orbits, stable positions |
| Procedural star appearance from metadata (age/links/emotion → color/size/glow) | `shared/celestial.ts` `deriveMass`/`classify`, `graph/theme.ts`, bloom — *missing only review-frequency→glow (needs SRS)* |
| Constellation detection + naming + celebration | `moc` hubs, `celestialTitle`, `constellations/promote`, Codex discovery, rank-ups |
| Associative / "connect distant notes" insight-making | auto-linking (`knn`), candidate-connections queue, the inquiry engine ("Soumaya noticed…"), manual linking |
| Emotional salience → distinctive visuals (amygdala/distinctiveness) | `emotionalWeight` → mass/color, the emotion palette |
| Habit: one daily cue + short routine | Daily Contact (one question/day), streak + `StreakEmber`, Night Replay |
| Variable/surprise rewards (RPE-driven) | Flashback ☄️ serendipity, random idle fly-by, achievements, rank-up moments |
| Micro-interactions + sound + particles | `graph/sfx.ts` kit, particle FX, toasts |
| Progress-over-points, goal-gradient-ish | goals with `progress`, achievements, the Chronicle |
| Mobile GPU budget (cap particles, LOD, pause hidden tab) | `graph/graphicsConfig.ts`, lite mode, adaptive graphics |
| Slow ambient galaxy evolution | entropy/cooling, beacons seeking cold memories, the Chronicle timeline |

## ➕ Genuine gaps worth bringing in (ranked by leverage)

1. **★ Spaced-repetition "stellar decay & review" engine + active recall — the report's #1.**
   We have entropy/decay + resurfacing (Night Replay, Daily Contact on a cooling memory, dormant
   surfacing) but **no SM-2-style memory-strength scheduler** (ease/interval/next-review) and **no
   retrieval practice** (self-testing). This is "the feature that converts a pretty visualization
   into a genuine learning tool." It fits Soumaya perfectly and *gently* (no Anki decks): a
   memory-strength score per node, dimming = the review cue, and **Soumaya prompts active recall in
   her own voice** ("what do you remember about…?") — a review *nudge*, not a flashcard drill.
   Covers the whole graph over time (avoids retrieval-induced forgetting). **Biggest single win.**
2. **`prefers-reduced-motion` — extend it to the galaxy.** We honor it for sound (`sfx.ts`), HUD
   counters (`useCountUp`), and two CSS animations — but the heavy motion (orbits, bloom, ship
   flight, mind-space drift/shimmer) is **not** gated. The report calls this non-negotiable (WCAG
   2.3.3). A "calm galaxy" reduced-motion mode + an in-app motion toggle.
3. **Forgiving streak freeze ("nebula shield").** We have streaks + at-risk flicker but no
   forgiveness. The report's clearest humane-gamification lever (Duolingo's biggest retention win,
   done gently): a shield that forgives one missed day so a broken streak is *data, not punishment*.
4. **Orphan-star surfacing.** Explicitly surface unlinked memories as a gentle "integrate me" nudge.
   We have cooling/dormant but nothing orphan-specific. **Natural fit as a tool-router tool.**
5. **Endowed / seeded progress.** Partly done (Chronicle backfill). Seed "your first star already
   glows" for a brand-new brain/region so nobody starts at a stark zero.
6. **Deep-space focus mode.** Dim the UI to the current note/cluster, hide counts/notifications
   during a session (we have isolate-system, not a distraction-free mode).
7. **Colorblind-safe palette toggle.** We pair colour with body class/shape/label (the Legend),
   which is decent; add an explicit colorblind-safe palette option to fully satisfy "never colour-only."

## ⏭️ Skip — contradicts our product or low value

- **Full Anki-style flashcard decks** — too study-app. Adapt to gentle whole-note resurfacing +
  conversational recall (the report offers this as its own fallback for burden).
- **Leaderboards / competition** — single-user/family; the report says competition skews young and
  alienates older users.
- **"Points/badges off by default"** — our product *intentionally* leans playful (Fuel, the ship,
  ranks) and the user loves it. Keep it; just keep it non-punishing (which we mostly do — the streak
  freeze above closes the one punishing edge).
- **Heavy academic SRS dashboard** — keep review in Soumaya's voice, not a stats panel.

## What this changes in the plan

- **New north-star principle** (added to CLAUDE.md): *memory is made by retrieval, not storage* —
  the SRS/active-recall layer (#1 above) becomes a first-class staged feature.
- **Accessibility house rule** (added to CLAUDE.md): honor `prefers-reduced-motion` across the
  galaxy, never encode meaning in colour alone.
- **Two of these are new Soumaya *tools*** for the tool-router already in flight
  (`docs/SOUMAYA_TOOLS.md`): a **review-nudge tool** (#1's delivery arm) and an **orphan-surfacing
  tool** (#4). They slot in beside the reminder/task/check-in/web-lookup tools.
