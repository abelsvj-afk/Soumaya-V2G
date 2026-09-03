# Life Vision

## Status

**Implemented (V1).** Architecture locked in C1.5, specified in C2, refined in C2.1,
and built across C3.1 (foundation) through C3.5 (a shared attachment-viewer fix
surfaced by Life Vision's reuse of `MemoryAttachments`). This document is the
canonical reference for the feature as it actually exists in the repository — not a
transcript of the design discussions that led here.

## 1. Purpose

A Life Vision is the user's representation of a desired future state — a house, a
lifestyle, a place to live, a family experience, a broader life direction. It answers
"what do I want my life to become?", not "where do I save this?" or "what's my
financial target?"

**Life Vision is not itself a financial account, a financial balance, or a Financial
Goal.** Its financial cost, if any, is expressed entirely through zero or more linked
Financial Goals (§6–7) — the Vision node itself never stores a dollar amount.

It differs from a **Mind Goal** (`CognitiveKind: "goal"`), which is a concrete, often
short-to-medium-term aim ("run a 5k"), and from a **Journey**, which is a life chapter
or container something belongs to over time rather than a destination.

## 2. Product Definition

Examples of a Life Vision: a house, a desired lifestyle, a place to live, a business,
a family experience, a vehicle, a long-term personal aspiration, a desired future
chapter. It can be highly detailed or a single sentence; open-ended or dated;
purely aspirational or already partly underway. Nothing about it is required beyond
a title.

## 3. Architectural Position

```
Life OS
├── Journeys
├── Mind / Cognitive Nodes   ← Life Vision lives here
├── People
└── Timeline
```

Life Vision is implemented as **`CognitiveKind: "life_vision"`** — a `nodes` row, on
the same substrate as `goal | idea | skill | person_entity | identity | mental_model |
intention | future_event | motivation`. **There is no dedicated `life_vision` table.**
It participates in every generic mechanism the `nodes` table already offers (search,
embeddings, attachments, archive, Journey links) without any Life-Vision-specific code
in those mechanisms — that reuse, not a parallel system, is the architectural point.

## 4. Data Model

No new columns were added to `nodes` for this feature. Life Vision reuses existing
fields with the semantics below:

| Field | Meaning for a Life Vision |
|---|---|
| `label` | Title |
| `content` | Freeform description (see §16 for a lightweight writing convention — not separate database fields) |
| `kind` | `"life_vision"` |
| `type` | `"concept"` (the same abstract type every cognitive kind uses) |
| `progress` | 0..1, manual (§8) |
| `remind_at` | Target date (§9) — reused field, different semantic meaning than for reminder-bearing kinds |
| `status` | `"active" | "archived"` (§13) |
| `deleted_at` | Soft-delete, unrelated to archive |
| `color`, `importance` | Baked in once at creation from `COGNITIVE_META["life_vision"]` (§5) |
| `aliases` | Available but has no particular Life Vision use case today |

`attachments` (images/files) and `journey_link` (Journey connections) are separate
tables that reference a node by id — see §10–11.

## 5. Visual Defaults

`packages/shared/src/celestial.ts`'s `COGNITIVE_META["life_vision"]`:

```
icon: 🌅
color: #ffb37a
importance: 0.85
durable: true
hasProgress: true
```

These are **V1 product defaults, not architectural invariants** — tunable later
without touching the entity model. `importance` is baked into the node at creation
time only (the same behavior every other cognitive kind already has); changing the
constant later does not retroactively re-tune existing nodes. `durable: true` exempts
a Life Vision from entropy/cooling, the same treatment `goal` and `identity` get.

## 6. Financial Goal Relationship

`fin_goal.vision_node_id` — a nullable `INTEGER` column, no SQL foreign key
(matching `fin_goal.bucket_id`'s own style in the same table, not the `nodes`-table
convention that does declare `REFERENCES`):

```
One Life Vision  →  zero or more Financial Goals
One Financial Goal  →  zero or one Life Vision
```

- **Nullable and additive**: every Financial Goal created before this feature, and
  every Goal a user never links, has `vision_node_id = NULL` and behaves exactly as
  before.
- **Validated at the application layer**, not the database: `PATCH /api/finance/wealth/
  goals/:id` and `POST /api/finance/wealth/goals` resolve the target node via
  `NodesRepo.getById()` (already space- and `deleted_at`-scoped) and reject with 400
  if it doesn't exist in the caller's space or isn't `kind === "life_vision"`.
- **`fin_goal_link` remains dormant and is not part of Life Vision.** It was
  identified in the C1 review as scaffolding shaped for a different, unrelated
  purpose; Life Vision uses a plain nullable column instead, never that table.
- No many-to-many model exists or is planned for V1.

## 7. Financial Requirement

A pure, deterministic function — `visionRequirementCents()` in
`packages/shared/src/lifeVision.ts` — shared by web (today's consumer) and available
to any future server-side consumer (e.g. Financial Health) without risk of the
formula drifting between two implementations:

```
Financial Requirement = SUM(target_cents) over active, targeted linked Financial Goals
```

| Case | Behavior |
|---|---|
| Active Goal with a target | Included |
| Active Goal, `target_cents = NULL` (open-ended) | Excluded from the dollar total; counted separately as an open-ended linked Goal, never silently dropped |
| Active Goal, `target_cents = 0` | Included as a real zero (distinct from NULL) |
| Archived Goal | Excluded entirely |
| No linked Goals | No financial requirement exists — the UI shows "No Financial Goals linked," never `$0` |

This value is **derived, read-only, and never persisted** as Life Vision state.
Language used in the UI: "financial requirement," "Goal target," "allocated,"
"Financial Goal progress" — never "saved," "balance," "cash," "invested," or
"deposited," since none of those describe what this number actually is.

## 8. Progress Semantics

Life Vision progress is **manual only**, via the same mechanism every other
`hasProgress` cognitive kind uses (`setCognitiveProgress` /
`POST /api/cognitive/:id/progress`), 0–100%, clamped, with no automatic derivation
from anything.

**Life Vision progress and Financial Goal funding are two separate, never-merged
numbers.** A Vision can be 80% personally realized and 0% financially funded, or the
reverse — both are valid, independent, simultaneously true states. Financial Goal
progress (`totalCents / targetCents`, already computed by the existing Wealth engine)
is displayed alongside, never folded into, the Vision's own progress bar.

## 9. Target Date

`nodes.remind_at` is reused, per the locked field mapping — but **a Life Vision's
target date is never a reminder.** Every consumer that would otherwise treat it as
one is explicitly excluded for `kind === "life_vision"`:

- `agent/tools/reminder.ts`'s `fire_reminder` tool — never fires a push/Telegram
  notification for a Vision.
- `synthesis/dailyDigest.ts` / `analysis/awayDigest.ts` — never narrate a Vision's
  target date as a due reminder.
- `web/utils/dueReminders.ts`'s `isReminderDue()` (the shared root predicate, mirrored
  in `NodeList.tsx`'s banner filter and `ActionsPanel.tsx`'s Agenda-list filter) —
  never treats a Vision as "due," so it never appears in the in-app toast, the
  Observatory "due reminders" section, the NodeList banner, or the Agenda's
  actionable reminder list.

What **is** shown: a plain, honest read of the date. `NodeInspector.tsx` labels it
"🌅 Target date" (not "⏰ Reminder," which is what every other kind still sees) and
`MindPanel.tsx`'s card summary shows `target: <date>` for a future date or a quiet
`target date passed · <date>` cue for a past one — never "overdue," which is
reminder language. Creation-time date entry uses a plain `<input type="date">`
(a target date has no time-of-day meaning, unlike `future_event`'s
`datetime-local` appointment field); editing an existing Vision's date after
creation is supported via a widened `PATCH /api/cognitive/:id { date }`, applied
only when the node's kind is `"life_vision"` — `future_event`'s date remains
creation-time-only, unchanged.

## 10. People

**V1 = automatic association only.** A person mentioned by name or alias in a
Vision's `content` gets a `supports` edge via the existing `linkCognitiveAnchor()`
gravity — the identical mechanism every other cognitive kind already uses — and
appears in that person's profile via the existing `personProfile()` read.

There is no manual person picker, no new relationship type, and no dedicated
Life Vision → Person table. Manual association is an explicitly deferred capability,
not an oversight: no cognitive kind has manual person-linking infrastructure today.

## 11. Journeys

Life Vision reuses the existing `journey_link` mechanism with `kind: "node"` —
validated by `JourneysRepo.REF_TABLE` exactly like every other node, with no
Life-Vision-specific carve-out. `<JourneyChips kind="node" refId={node.id} />`
already renders unconditionally for any node in `NodeInspector.tsx`, so a Life
Vision gets full Journey linking (many Visions per Journey, many Journeys per
Vision) with zero new code. No new Vision↔Journey relationship system exists, and
no other dormant `JourneyLinkKind` value was activated for this feature.

## 12. Attachments

Life Vision reuses the existing, fully generic attachment system
(`AttachmentsRepo`, the `/api/nodes/:id/attachments*` routes, the
`<MemoryAttachments>` component) — already rendered for any node whose kind isn't
`"action"` in `NodeInspector.tsx`, and additionally surfaced directly in
`MindPanel.tsx`'s Life Vision card for convenience. There is no Life-Vision-specific
attachment storage, no new image table, and image bytes are never stored on the
node itself.

Life Vision's use of this shared component surfaced a pre-existing, generic bug: the
fullscreen viewer could render a broken image if opened before that attachment's
object URL (a real per-attachment network fetch) had resolved — most noticeable on a
second or later attachment, whose fetch is statistically more likely to still be in
flight when tapped. Fixed generically in `MemoryAttachments.tsx` (a loading
affordance in the viewer, matching the one the thumbnail grid already had) — the fix
applies identically to memory and Life Vision attachments; no Life-Vision-specific
branching was added.

## 13. Archive Semantics

```
Archive Life Vision → Vision becomes inactive/archived
                     → linked Financial Goals remain fully active
                     → allocations remain intact
                     → Money remains unchanged
```

No cascade exists in either direction: archiving a Financial Goal never touches its
linked Vision (it is simply excluded from that Vision's financial requirement, §7,
while the link itself stays intact in case the Goal is later unarchived), and
archiving a Vision never touches its linked Goals. This deliberately diverges from
Wealth's own Bucket→Goal archive cascade — that cascade exists because a Bucket
*owns* its Goals; a Vision does not own its Goals, it merely references them.

Archive uses the existing, unmodified node archive mechanism
(`POST /api/nodes/:id/archive`, `archiveNode()`) — the only change made was widening
`NodeInspector.tsx`'s archive-button visibility gate to also include
`kind === "life_vision"` (it previously showed only for a plain memory). An archived
Vision is excluded from Galaxy rendering, full-text search, and vector/chat-citation
retrieval by the same kind-agnostic `status`/`deleted_at` filters every node already
uses; direct-by-id lookup (e.g. resolving a Vision's label from a linked Goal's UI)
remains unfiltered by status, consistent with existing node semantics. No
confirmation dialog was added, matching the existing (unconfirmed) archive pattern
for a plain memory.

## 14. Mind Integration

Life Vision appears as its own kind wherever `MindPanel.tsx` renders cognitive
objects — its kind-selector button, section header, and card all read directly from
`COGNITIVE_META`, so no kind-specific label/icon logic was added or needed beyond
the metadata entry itself (§5). It supports the existing create/edit form, the
existing manual progress bar, the existing attachment surface, and (via
`NodeInspector.tsx`) the existing archive control. Vocabulary is locked and enforced
in UI copy: **Mind Goal**, **Financial Goal**, and **Life Vision** are always named
explicitly — never a bare "Goal" where cross-domain ambiguity is possible.

## 15. Galaxy

Life Vision is a **graph-native qualitative entity** — a normal cognitive graph
citizen, using the exact same rendering/physics pipeline as every other cognitive
kind. It is explicitly **not** a Money Sky overlay star, not a financial ledger
object, and not a financial aggregate. No new Galaxy rendering mechanism was
created or is needed: `nodeObject.ts` and `theme.ts` have zero kind-specific
branching for Life Vision (only `kind === "action"` is special-cased in that
pipeline, for an unrelated reason), and `deriveMass()`/`classify()` never accept or
read any financial signal — mass/color/orbit derive only from `importance`,
`degree`, and `emotionalWeight`, exactly as for any other node. Financial Goal
targets, allocations, account balances, and the derived financial requirement are
shown in the Life Vision UI but never influence its Galaxy mass, color, or motion.

## 16. API / Repository Behavior

Actual routes and repositories, as implemented (not idealized names):

| Concern | Route / mechanism |
|---|---|
| Create a Life Vision | `POST /api/cognitive` `{ kind: "life_vision", label, content?, date? }` → `createCognitive()` |
| Edit label/content/aliases/target date | `PATCH /api/cognitive/:id` `{ label?, content?, aliases?, date? }` → `updateCognitive()` (the `date` field only takes effect when the node's kind is `"life_vision"`) |
| Manual progress | `POST /api/cognitive/:id/progress` `{ value }` → `setCognitiveProgress()` |
| List / filter by kind | `GET /api/cognitive?kind=life_vision` → `listCognitive()` (includes `remindAt` in its response) |
| Archive / unarchive | `POST /api/nodes/:id/archive` / `/unarchive` → `NodesRepo.setStatus()` (no kind restriction server-side) |
| Attachments | `GET/POST/DELETE /api/nodes/:id/attachments...` → `AttachmentsRepo` |
| Journey links | `journey_link` via the existing generic Journeys routes, `kind: "node"` |
| Link/unlink a Financial Goal | `POST /api/finance/wealth/goals` (create pre-linked) / `PATCH /api/finance/wealth/goals/:id` `{ visionNodeId }` → `FinGoalRepo` |
| List Goals linked to a Vision | `GET /api/finance/wealth/goals?visionNodeId=<id>` |

`visionNodeId` update semantics (`FinGoalRepo.update()` and its route):

```
visionNodeId omitted   → leave the existing relationship untouched
visionNodeId = null    → unlink
visionNodeId = <number> → link, after validating: same space, node exists,
                          node is not soft-deleted, node.kind === "life_vision"
```

Application-layer validation (route level, via `NodesRepo.getById()`, which is
already space- and `deleted_at`-scoped) rejects with 400: a Vision from another
space, a nonexistent Vision id, or a node that exists but isn't a `life_vision`.
There is no special-cased "Goal already linked to another Vision" error — the UI
(§ below) simply never offers an already-linked Goal as a pickable option, so the
ambiguity never reaches the API.

## 17. User Workflow

```
Create Life Vision (MindPanel)
        ↓
Describe the desired future (freeform content)
        ↓
Optionally attach images/files
        ↓
Optionally set a target date
        ↓
Optionally set manual progress
        ↓
Save
        ↓
View / edit / archive (Mind tab; archive via NodeInspector on Galaxy click-through)
        ↓
Link existing Financial Goals (Mind tab → Financial Goals section → picker)
        ↓
See the derived financial requirement + each linked Goal's funding progress
        ↓
Connect Journeys (existing Journey chips, via Galaxy click-through)
        ↓
Life Vision appears in the Galaxy as a normal cognitive body
```

A Life Vision is fully valid and usable with zero Financial Goals, zero
attachments, zero Journeys, and no target date — nothing beyond a title is
required at any step.

## 18. Terminology

| Use | Avoid |
|---|---|
| Mind Goal | bare "Goal" in any cross-domain context |
| Financial Goal | bare "Goal"; "savings goal" |
| Life Vision | "Vision" alone; "Life Goal" |
| Financial requirement | "cash," "savings," "balance" |
| Target date | "Reminder," "due date" |
| Life Vision progress | conflating with Financial Goal progress |
| Financial Goal progress / funding progress | implying it's the Vision's own progress |
| Allocated / earmarked | "saved," "deposited," "invested" |

"Vision" by itself is reserved for Life Vision — never used as loose shorthand for
either kind of Goal.

## 19. Architectural Boundaries

- **Lower layers never depend on higher layers.** Money and Wealth have zero
  awareness of Life Vision; `finance/budget.ts` and `finance/summary.ts` are
  untouched by this feature. The one connection (`fin_goal.vision_node_id`) is a
  read-only reference Life Vision consumes, not a dependency Wealth carries.
- **Life Vision does not own financial truth.** Financial Goals remain Financial OS
  entities; account balances remain Money's truth; allocations remain Wealth's
  truth. Life Vision only ever reads and displays already-computed Financial Goal
  data — it never writes to `fin_allocation`, `fin_account`, or any Money table.
- **Intelligence does not own facts.** No AI reasoning over Life Vision ships in
  V1; when it exists later, it narrates and explains deterministic state, and
  never becomes the source of truth for a financial fact or a Vision's progress.
- **Galaxy is downstream.** Galaxy visual state derives from already-computed node
  data and never becomes authoritative, per §15.

## 20. V1 Non-Goals / Deferred Work

Not part of the current implementation:

- Debt, Credit, Financial Health
- AI recommendations or AI-generated financial decisions
- Manual People relationship assignment (person picker, relationship types)
- Many-to-many Vision ↔ Financial Goal relationships
- A dedicated `life_vision` table
- A new reminder subsystem
- A new Galaxy rendering system
- Investment execution or bank/brokerage integration
- Automatic financial allocation
- Automatic (derived) Life Vision progress
- A Vision-aware Life Seasons/Timeline redesign
- Repurposing `fin_goal_link`
- Activating any other dormant `JourneyLinkKind` value

## 21. Validation Status

- **C3.1 Foundation:** PASS
- **C3.2 (Financial Goal ↔ Vision wiring, reminder-safety behavior):** Server 504/504,
  Web 274/274, Typecheck PASS, Build PASS, Boundary check PASS
- **C3.3 (UI + workflow):** Server 511/511, Web 291/291, Typecheck PASS, Build PASS,
  Boundary check PASS
- **C3.5 (shared `MemoryAttachments` fullscreen-viewer race, fixed generically — not
  Life-Vision-specific, but surfaced by Life Vision reusing this component):**
  Web 294/294, Typecheck PASS, Build PASS
- **Final (C3 integration):** Server 511/511, Web 294/294, Typecheck PASS, Build PASS,
  Boundary check PASS
- **Regression:** Wealth PASS, Money PASS, Journeys PASS, People PASS, Reminders
  PASS, Galaxy PASS

**Visual/on-device QA has not been performed.** This repository's standing Fly
billing hold has blocked live deploys throughout this work, and this development
environment cannot render or visually inspect the app. All of the above is
automated test/typecheck/build verification only — a real-device pass (readability
of the target-date copy, the Financial Goals picker's layout on a narrow phone
screen, the archive button's placement) remains outstanding and should not be
assumed complete.

## 22. Future Extension Rules

Any future Life Vision work must preserve:

- Life Vision remains a qualitative Life OS entity; Financial Goals remain
  Financial OS entities — never collapse the two.
- Life Vision may reference financial facts only through deterministic, read-only
  relationships (as `vision_node_id` does today) — never by fabricating a number
  from Vision content.
- Life Vision progress and Financial Goal funding remain separate, never-merged
  numbers.
- Galaxy remains strictly downstream of deterministic state.
- AI, when introduced, remains a narrator/reasoner over existing facts — never the
  source of truth for a Vision's progress, its linked Goals, or any dollar amount.
