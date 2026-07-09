# 3D Interactive Life Timeline ("The Chronicle") — Design Spec

Status: **spec locked (v1)** · Owner: Claude · Feature branch: `claude/soumaya-second-brain-v1-m4z4hc`

A 3D **flowing-river timeline** you open from a button. Soumaya writes a new **chapter** of your
life whenever there's *real change* (~1–3× / month), and you can add one yourself anytime. Each
chapter is a narrative summary + the memories that drove it; photo-bearing memories appear as
**whitish glowing bubbles** with a random color-lighting glow that **cycles when you click it**.
Chapters are strung along a curving glowing ribbon, joined by **flowing colored lines** in the
existing emotion palette (gold `#ffcd46` · indigo `#9686ff` · synapse-green `#46f58c`).

Decisions locked via interview (2026-07-09):
- **Change signal:** *blended* — emotional-tone trend + momentum (volume of new life logged) + new
  milestones (goals/people/skills/identities). Produces a signed magnitude read as
  **growth / decline / neutral / mixed**.
- **Shape:** flowing **river / ribbon**.
- **Scope:** **hybrid** — each chapter is a whole-arc summary *plus* a highlighted dominant theme,
  and carries `threads` (a few named strands with their own trend) so the ribbon can show parallel
  sub-currents.
- **Control:** **auto + manual** — Soumaya writes chapters on real change; you can mark one anytime.

## Data model (server, additive + space-scoped)

`timeline_chapters` (new table; additive, idempotent — safe on existing Fly volumes):

| col | type | notes |
|---|---|---|
| id | INTEGER PK | |
| space_id | TEXT | multi-tenant scope (`DEFAULT_SPACE` fallback) |
| title | TEXT | short chapter title ("A season of growth") |
| summary | TEXT | the narrative (deterministic heuristic; offline-safe) |
| theme | TEXT | dominant theme label |
| trend | TEXT | `growth` \| `decline` \| `neutral` \| `mixed` |
| score | REAL | blended change magnitude 0..1 |
| period_start | TEXT | ISO — window covered |
| period_end | TEXT | ISO |
| memory_ids | TEXT | JSON array of driving node ids (photo-bearing preferred) |
| threads | TEXT | JSON `[{name, trend}]` (hybrid parallel strands) |
| origin | TEXT | `auto` \| `user` |
| created_at | TEXT | |

Reuses the existing `attachments` table (image mimes) to decide which driving memories glow as
photo bubbles.

## Change detection (deterministic, offline, testable)

`assessChange(ctx, spaceId, nowISO)` over the window since the last chapter's `period_end`
(or the earliest memory for the first chapter):

- `windowMems` = memories (`kind` null/`memory`) created after `since`.
- Guard: fewer than `MIN_MEMS` (4) new memories → **no chapter** (not enough new material).
- `emotionDelta` = mean(emotional_weight of window) − mean(prior baseline, default 0).
- `momentum` = count of window memories (normalized).
- `milestones` = cognitive nodes (goal/person_entity/skill/identity/idea) created in window (norm).
- `magnitude = clamp(0.4·momentumN + 0.4·|emotionDelta| + 0.2·milestonesN)`.
- `trend`: `growth` if `emotionDelta > +0.12`; `decline` if `< −0.12`; `mixed` if strong ± both
  present; else `neutral`.

`maybeGenerateChapter(ctx, spaceId, nowISO?)` creates a chapter iff:
`magnitude ≥ THRESHOLD (0.25)` **and** `daysSinceLast ≥ MIN_GAP_DAYS (8)` **and**
`chaptersThisMonth < 3`. The gap + monthly cap yield the "1–3× a month, only on real change"
cadence without any RNG (life's own irregular pace supplies the "randomness"). Wired into the
per-space autonomy tick in `index.ts` (free/offline; deterministic).

Manual: `POST /api/timeline` summarizes the current window and creates a chapter with
`origin='user'` regardless of threshold (still respects nothing — you asked for it).

Narrative (`summary`) is a deterministic heuristic referencing the trend, theme, people involved,
memory count and photo count — meaningful with **no API key**. (LLM polish is a later enhancement;
never a hard dependency.)

## API

- `GET  /api/timeline` → `TimelineChapter[]` (oldest→newest).
- `POST /api/timeline` `{ title?, note? }` → create a manual chapter now.
- `DELETE /api/timeline/:id` → remove a chapter.

## Frontend — the 3D ribbon

New button (header/left rail) → `TimelineView` overlay (its own `<canvas>` + THREE scene, same
dependency set as the galaxy; no new deps):

- **Ribbon:** a `CatmullRomCurve3` through the chapter positions (time → arc length). A `TubeGeometry`
  ribbon with a scrolling emissive texture makes the color **flow** along it (uniform `time`).
- **Chapter nodes:** glowing spheres sized by `score`, tinted by `trend` (growth=green, decline=indigo,
  mixed=gold, neutral=pale). Click → a side card with the title, summary, threads, and the driving
  memories.
- **Photo bubbles:** driving memories that have an image attachment render as a **whitish translucent
  sphere** with an inner **random emissive color** (Fresnel/additive glow). The color is seeded per
  memory but **cycles through the palette on click** (never the same twice in a row).
- **Flowing connector lines** between consecutive chapters use the emotion palette and animate their
  color offset (same feel as the galaxy links / packet particles).
- Offline/empty state: "Your chronicle begins as you live. Soumaya will write your first chapter
  when enough changes." + a "✍️ Add a chapter now" button.

## Verification

- Gate: `typecheck && test && build` green. New `timeline.test.ts` covers: no chapter under the
  MIN_MEMS floor; growth vs decline trend from emotion delta; MIN_GAP + monthly cap gating; manual
  create; photo-bearing memories preferred into `memory_ids`.
- Offline path proven (heuristic narrative, no key).
- Additive migration proven (existing volume upgrades in place).
