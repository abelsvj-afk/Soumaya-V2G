# Soumaya Vision 2.0 — Journeys (Personal Operating System)

> **STATUS: MANDATED NORTH STAR (user-authored, 2026-07).** This is the source-of-truth
> direction for Soumaya's next era. It is version-controlled here so it can be tracked over time
> and referenced by every future feature. **Everything built from here must be considered against
> this document** — where a feature can serve a Journey, it should. Per the repo workflow, large
> pieces of this get their own spec before code, but this file governs *what* we are building
> toward and *why*. (Companion near-term spec: `docs/financial-os/stage-4-galaxy-and-zero-based.md`
> — money-in-the-galaxy — should evolve to be Journey-aware.)

---

## The Core Idea: Journeys

Everything in Soumaya should ultimately belong to a **Journey**.

A Journey isn't just a project. It's a **meaningful chapter of your life** with a beginning,
progress, setbacks, and an ending (or it can remain ongoing).

Examples:
- Become an RN
- Build StudioSVJ
- Buy My First Home
- Lose 30 Pounds
- Raise My Children
- Recover Financially
- Learn Japanese
- Write My Novel

Each Journey automatically contains and links: **Memories · Tasks (Mission Control) · Budget items
· Goals · People · AI conversations · Research · Files · Skills gained · Identity changes ·
Milestones · Achievements · Beliefs formed.**

Now the graph isn't just storing isolated information — it's **telling the story of your life**.

## The breakthrough

Instead of asking *"Where do I save this?"*, Soumaya asks *"What Journey is this helping?"* That one
question organizes almost everything automatically:
- Pay tuition → Nursing Journey
- Upload a resume → Career Journey
- Log a workout → Health Journey
- Buy groceries → Family Journey
- Meet someone important → Relationships Journey

Suddenly, budgeting, memories, and tasks all connect naturally.

---

## Soumaya Evolution Specification (Vision 2.0)

**Vision.** Transform Soumaya from a Second Brain into a complete **Personal Operating System**
that manages not only knowledge, but also actions, finances, habits, goals, and the evolving story
of a person's life. Guiding principle: **Everything contributes to a Journey. Every Journey shapes
your life.**

**Core Philosophy.** Everything the user does should answer one question: *"What part of my life
does this move forward?"* No isolated notes. No isolated tasks. No isolated expenses. Everything
belongs somewhere meaningful.

### Primary Daily Loop — Mission Control
On opening Soumaya, the user lands in **Mission Control** (not immediately in the graph). It shows:
today's highest-priority missions · Safe-to-spend amount · Soumaya's Daily Contact question · one
memory worth revisiting · a relationship check-in suggestion · progress toward active Journeys ·
important reminders · AI observations · recent activity. This is the daily dashboard.

### Journeys (new core system)
Journeys become the **highest-level organizational object**, auto-linking Memories, Tasks, Budget
transactions, Goals, People, Files, Research, AI conversations, Skills, Milestones, Achievements,
Identity growth, and Beliefs. Examples: Nursing School, Financial Recovery, Apartment Hunt, Weight
Loss, Starting a Business, Family. Journeys replace the need for manual organization.

### Mission Control (task evolution)
Replace the hidden Action system with **Mission Control**; tasks become first-class. Each task:
Priority · Due date · Journey association · Estimated effort · Financial impact (optional) ·
Related memories · Related people · Related goals. Completed missions **permanently strengthen the
associated Journey**.

### Living Galaxy
The galaxy evolves based on activity: completed tasks become satellites before merging into
planets; Journey hubs grow brighter as progress increases; cold Journeys visually dim; major
milestones create visible stellar events; identity changes create entirely new constellations. The
galaxy reflects the user's life in motion.

### Financial Integration
Money is no longer isolated. Every transaction asks *"What Journey does this support?"* — Gym →
Health, Rent → Home, Gas → Career, Books → Learning. **Every dollar becomes connected to purpose.**

### Life Seasons
Automatically detect major life periods — Recovery Era, College Era, New Parent Era, Entrepreneur
Era, Career Transition Era. The Timeline becomes a **story of evolving identities**, not just dates.

### Progressive Discovery
Reduce hidden functionality. Instead of dozens of menus, features **unlock naturally when they
become relevant**. Users discover systems through use, not searching.

### Daily Intelligence Loop
Every day Soumaya should: ask one meaningful question · recommend one important mission · surface
one forgotten memory · highlight one financial insight · suggest one relationship check-in · show
one long-term Journey gaining momentum. **Five interactions. Five minutes. Every day.**

### Long-Term Vision
After years of use, Soumaya should answer: What have I become? What patterns define my life? What
goals actually mattered? Where did my money truly go? Which relationships shaped me most? Which
beliefs changed over time? What chapters have I lived? What should I focus on next? Instead of
simply remembering your past, Soumaya becomes a system that helps **guide your future**.

### One final recommendation (from the author)
After implementing these systems, declare a **feature freeze** and focus on making every existing
feature feel seamlessly connected rather than adding more. The next leap in quality comes from
**cohesion, discoverability, and making every interaction reinforce the same core idea**: your life
is made of interconnected Journeys, and Soumaya helps you understand, navigate, and shape them.

---

## How this maps onto the current codebase (Claude's integration notes)

This is the bridge from vision → implementation. It will get a full spec, but the load-bearing
decisions:

- **`journeys` as a first-class entity** (new `journeys` table, space-scoped, additive migration).
  A lightweight **`journey_link`** join (like `fin_goal_link`) connects a Journey to any existing
  object by (kind, ref-id): `node` (memory/goal/person/…), `task`/action, `fin_income`/`fin_expense`
  /`fin_bill`, `insight`/belief, `knowledge_doc`, chat thread, achievement. **No denormalization** —
  we link, we don't copy (consistent with the graph's enrich-on-read convention + decision D6).
- **"What Journey does this support?"** becomes a gentle, optional prompt at capture/ingest time
  (memory dump, a transaction confirm, a task create), with a smart suggested Journey (from
  embeddings/keywords). Never blocking; a thing can belong to no Journey.
- **Mission Control** evolves the existing Agenda/Actions surface into the daily dashboard
  (missions + safe-to-spend + Daily Contact + one memory + Journey momentum). Reuses the Daily
  Intelligence pieces already built (Daily Contact, review nudge, bill-risk, proactive inquiry).
- **Living Galaxy**: Journey hubs render as bright hubs that brighten with progress + dim when
  cold (reuse the mass/entropy + `moc` hub machinery); milestones fire the existing `celebrate()`;
  the Financial OS money-sky stars (Stage 4) become Journey-tinted.
- **Life Seasons** extends the existing Timeline/Chronicle with detected identity eras.
- **Financial integration**: every `fin_*` row gains an optional `journey_id` (additive), so
  "where did my money truly go" is answerable per Journey.

**Sequencing (each its own spec + shippable, gate-green, offline-safe, additive):**
1. Journeys core (table + link + create/list + a Journey object) and the capture-time "what
   Journey?" suggestion.
2. Mission Control home (compose existing daily-intelligence pieces into one dashboard).
3. Living Galaxy Journey hubs (progress brightness / cold dimming / milestone events).
4. Financial + task + timeline Journey linkage (money-per-Journey, missions strengthen Journeys,
   Life Seasons).
5. Progressive discovery pass + the cohesion/feature-freeze phase the author calls for.
