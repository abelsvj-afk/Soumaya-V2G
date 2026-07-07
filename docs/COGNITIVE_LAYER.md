# The Cognitive Layer — from a memory galaxy to a living mind

> Design spec (Rule #1). The galaxy currently models what the brain has REMEMBERED
> (memories, beliefs, knowledge, relationships, emotion). It does not model what the
> brain is THINKING. This adds cognitive object classes + a working-memory layer so
> Soumaya stops being a memory manager and becomes a simulation of a mind.
>
> Built in phases; each ships gate-green and is independently valuable.

## The core idea

A memory is a fact the brain stored. A COGNITIVE OBJECT is a live element of
cognition — a goal you're pursuing, an idea evolving, a skill growing, a person you
orbit, an identity you hold. These get their own celestial classes with their own
DYNAMICS (gravity, growth, fading), and memories relate to them (`supports`,
`about`, `expresses`). The galaxy becomes: memories orbit the goals/people/identity
they serve; ideas grow or die; skills brighten; and a working-memory "mind space"
holds what you're thinking right now, promoting survivors into the permanent galaxy.

## The object model

All cognitive objects are `nodes` rows with a cognitive `kind` (the proven pattern
already used by `moc` and `belief`). One shared `COGNITIVE_META` map (in
`@brain/shared`) drives colour/label/icon/durability everywhere (render + Legend +
panels), so the visual language can't drift. A new nullable `nodes.progress` column
(0..1, additive migration) holds goal completion and skill level.

| Kind | Icon | Colour | Celestial feel | Durability | Signature dynamic |
|------|------|--------|----------------|-----------|-------------------|
| `goal` | 🎯 | amber-orange | heavy anchor (star+) | durable, entropy-exempt | supporting memories drift into its orbit; `progress` bar |
| `idea` | 💡 | unstable cyan-white | flickering star | fades if unreinforced | grows / splits / merges / dies |
| `skill` | 🧬 | lime-green | brightens over years | durable | `progress` = level; brightens as practiced |
| `person_entity` | ❤️ | warm rose | a star others orbit | durable | interactions orbit the person |
| `identity` | 🏛 | white-gold | massive core star | durable | brightens/dims as evidence accrues |
| `mental_model` | 🧠 | violet | steady lens | durable | a reasoning tool, links to where it's applied |
| `concept` (existing `type`) | ✸ | magenta | — | — | abstract idea, distinct from `knowledge` facts |
| `intention` | 🌠 | pale gold | a comet | ephemeral (hours/days) | short-lived; expires or becomes a memory |
| `future_event` | ⏳ | pale blue | a scheduled marker | time-bound | appointments/deadlines/predictions |
| `motivation` | 🔥 | ember | a gravity well | durable, ambient | emits pull on related bodies |

New relationship types: `supports` (memory/idea → goal/identity/skill),
kept structural (excluded from the LLM `RELATIONSHIP_TYPES` list like `summarizes`).

## Gravity — the elegant part (no orbit rewrite)

The orbit system already parents each body to its **heaviest connected neighbor**.
So we get "memories drift toward the goal they support" for FREE: make a goal HEAVY
(high importance → large mass) and create `supports` edges from its memories → the
goal becomes their orbital parent and they visibly cluster around it. An autonomy
step ("cognitive gravity") periodically knn's each goal/identity/skill embedding and
adds `supports` edges to strongly-similar unlinked memories — so the pull grows over
time. Zero changes to `orbits.ts` (Red Zone) are required.

## Working Memory (the flagship, Phase 2)

The biggest omission: a glowing "mind space" sphere around the camera holding what
you're thinking NOW — current conversation, active goals, today's priorities, live
emotion, temporary calculations. Modeled as EPHEMERAL "thought" objects (photons)
that decay unless reinforced; when one survives long enough Soumaya carries it into
the permanent galaxy (mimicking short-term → long-term consolidation). This is a
dedicated client render layer + a small ephemeral in-memory/short-TTL store; it does
NOT persist as normal nodes until promoted.

## Staged plan

- **Phase 1 (this change): the cognitive foundation + Goals.** Shared kind taxonomy +
  COGNITIVE_META; `progress` column; `supports` relationship; create/list/progress API
  (`/api/cognitive`); the cognitive-gravity autonomy step; entropy exemption for durable
  kinds; a **Mind** dock tab to create/see cognitive objects; distinct render (via the
  shared colour); Legend + Help. Goals fully wired (gravity + progress). The other kinds
  are creatable + visible now; their advanced dynamics land in later phases.
- **Phase 2: Working Memory** — the mind-space render layer + ephemeral thought objects
  + promotion into long-term.
- **Phase 3: Ideas lifecycle** — grow/split/merge/fade; idea → project promotion.
- **Phase 4: Skills leveling** — practice detection raises `progress`/brightness over time.
- **Phase 5: Identity core + evidence** — identity stars brighten/dim as memories that
  express or contradict them accrue; an Identity view.
- **Phase 6: People as entities** — dedupe person mentions into one person node; every
  interaction `about` it; a lightweight CRM view.
- **Phase 7: Personas / Motivations / Mental models / Imagination region / Future events** —
  persona activation (which memories light up per role), motivation gravity wells, an
  imagination sector for not-yet-real systems, a future-events timeline.

## Non-goals / guardrails

- No `orbits.ts` rewrite (gravity via edges + mass). Additive migrations only.
- Offline-safe: creation + gravity are deterministic (no LLM required); an optional LLM
  pass can name/classify cognitive objects when a key is present.
- Every kind is space-scoped; durable cognitive kinds are entropy-exempt (they don't
  "cool"); ephemeral kinds (intention/future_event, and Phase-2 thoughts) get lifecycles.
