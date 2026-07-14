# Consolidation, Redundancy & "Is It Working?" — backlog + plan

> Captures the user's directives (2026-07) for the pass to run **after** the current build queue.
> Source of truth for that pass. Guiding themes: **cohesion over more features** (echoes the Vision
> 2.0 closing note) and **the user/user's users must always be able to tell what's working**.

## Theme 1 — Redundancy & consolidation (Claude is the judge)
Audit the whole project for overlapping tools / functions / tabs / pages and **merge or consolidate**
where it genuinely helps. Known suspects to evaluate first:
- **Timeline vs. Chronicle vs. Life Seasons vs. Journeys.** The user built a Timeline but dislikes its
  UI/design, and it may overlap with the Chronicle (river timeline), the planned **Life Seasons**, and
  **Journeys** (which is the deeper life-chapter org layer). Decide: one timeline surface, redesigned,
  that Journeys/Seasons feed — not three competing views. **The user believes Journeys is effectively
  the to-do/organization layer; Mission Control is the task surface.**
- **Tabs/pages** — re-check the dock after Journeys + Money were added; fold anything redundant.
- **Tools/functions** — the fleet + tool-router + panels have grown; look for duplicate capability.

Deliverable: a short findings doc (what overlaps, recommended merge/keep/kill, order), then execute
the safe ones. Judge case-by-case; don't merge things that only look similar.

## Theme 2 — "Know when it's working" (cross-cutting)
The user's central frustration: **you can't tell when a feature is actually doing something.** Every
feature should make its state legible. Concrete instances:
- **The "Soumaya noticed…" chat bubble / proactive inquiry** — the little cloud that pops up to ask a
  question. User hasn't seen it in a while and can't tell if it still fires. **If it works, leave it;**
  the real fix is a way to SEE that it's alive (a status/heartbeat, or a log of recent proactive
  moments). Applies to all background intelligence (daily contact, nudges, tender fleet, upkeep).
- **Dream cycles / beliefs are invisible.** User: "no clue where the dream cycle is or what it does."
  It runs once/day in the autonomy loop (`analysis/dreamCycle.ts`), consolidating the densest memory
  cluster into a **belief** star — but there's no home for it and no notice when it happens. Fix in the
  clarity pass: (a) surface each new belief when it's formed (a gentle "Soumaya consolidated a belief:
  …" moment / in the away digest), (b) a place to see recent beliefs + what a dream cycle is, (c)
  explain it in Help/Legend. Emblematic of the whole theme: **background intelligence must announce
  itself.** A single "What Soumaya's been up to" activity feed (over `agent_logs`) likely covers dreams
  + nudges + tending + links formed in one legible place.
- General principle: prefer visible confirmations, "last run" timestamps, and honest empty/error
  states over silent success/failure.

## Theme 3 — The Mind / Recall panel (DONE — first fix of this pass)
User report: click it → ~20 old memories to see if you remember → **no explanation of what it does or
what happens after**, it **never finishes** (do 20, reopen, 20 more instantly), and the red dot is
always full. **Fixed (this commit):** the panel now (a) **explains itself** ("What's this?" → why
retrieval helps, what "I remembered"/"Forgot" actually do, what the red dot means), and (b) is
**finite** — a 7-per-session sitting with a ~15/day cap that ends with "you've done your reviews for
today, come back tomorrow." Still TODO: make the badge/entry point label its purpose at a glance.

## Theme 4 — Financial stars need a state icon (folds into Stage 4 money-sky)
When focusing a financial star, an **icon should pop up on top** showing good / bad / in-between at a
glance (funded ✓, approaching ◐, at-risk/cooling ❄ blue, overdue !, paid ✓, goal filling ◔◑◕). This
is exactly the state→glyph model already in `docs/financial-os/stage-4-galaxy-and-zero-based.md` §A2 —
implement the on-focus glyph badge as part of the money-sky.

## Theme 5 — Budgeting & to-do depth
- Budgeting hasn't gone deep yet beyond Stage 1–3 — the **zero-based "give every dollar a job"** +
  **Audit** (Stage 4 B/C) are where the depth lands.
- The **to-do list** is Journeys/Mission Control (user's read): Journeys = organization, Mission Control
  = first-class tasks. Build Mission Control as the task surface, not a separate ad-hoc to-do.

## Ordering (Claude to finalize when the pass starts)
Proposed: (1) redundancy findings doc + the Timeline/Chronicle/Seasons/Journeys decision (highest
leverage — avoids building on duplication), (2) "is it working?" visibility pass on background
intelligence, (3) remaining money-sky state glyphs, (4) execute the safe merges. Revisit against the
live app before committing to merges.
