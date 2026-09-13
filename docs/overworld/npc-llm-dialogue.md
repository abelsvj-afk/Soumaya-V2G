# Real hybrid LLM + hand-authored NPC dialogue (Stage 2.39, task #61)

> Per Rule #1. Direct user correction: *"The LLM dialogue was supposed to have already been tied
> into the regular dialogue because it was supposed to be hybrid between... already prewritten
> dialogue points mixed in with... the LLM as well."* Checked against the real decision that
> shipped it: `npc-society.md`'s "Hybrid" choice explicitly deferred the LLM half — *"the data
> shape is built so a LATER stage can route a line through the LLM adapter... not built now, just
> not architected shut."* `soumaya-governance.md` (Stage 2.17) later re-confirmed this gap and
> folded three concrete requirements into this same task (#9/#10 in that doc): batching many
> NPCs' generation into fewer LLM calls, staggering DISPLAY per NPC rather than firing on every
> API response, not every interaction needing full text, and grounding dialogue in real, evolving
> town state (economy/health/growth) rather than invented flavor.

## Scope decision: dialogue only, this round — the Mall is split out

The task's own name bundles "LLM dialogue + a proper Mall," but the user's actual frustrated
message only described the dialogue gap in detail — the Mall was never mentioned in that
message. `npc-economy.md` already describes a Mall as *"a real widening of [Market] later, not
this round"* — a distinct, unrelated building/shop feature. Bundling it into this dialogue spec
would blur two independent pieces of work. This spec covers dialogue only; the Mall becomes its
own explicitly tracked follow-up task (already split in the task list).

## What already exists that this must reuse, not reinvent

- **Provider seams** (`llm/adapter.ts`) — every LLM capability is a method on `LlmProvider`,
  implemented by `openai.ts`/`gemini.ts` (real calls) and `heuristic.ts` (offline, deterministic,
  free) alike, wrapped by `ResilientLlmProvider` (`resilient.ts`) which transparently falls back
  to heuristic on any error/cooldown/budget block. A new NPC-dialogue capability follows this
  exact shape — never a special-cased client-side-only LLM path (there is no such thing anywhere
  in this codebase, and it would violate "cloud key never touches the browser").
- **`npcDialogue.ts`'s `dialogueFor()`** — the hand-authored pool selection stays the REAL
  fallback, not just an offline stand-in: per soumaya-governance.md's own requirement, not every
  interaction should carry LLM-generated text at all. The hand-authored pool remains the default;
  an LLM-flavored line is an occasional substitution when one is fresh, never a replacement of
  the whole system.
- **Real, already-computed town-state data**: `townLedger.ts` (treasury cents — economy),
  `buildingNeglect.ts` (per-building neglect — health), `graph.nodes.length` and
  `allSocietyNpcIds().length` (growth). No new signal is invented; "food" (raised in the
  reconciliation round) has no real backing data anywhere and stays explicitly excluded.

## Resolved decisions

**1. One batched server call for the whole town, not one per NPC.** A new `LlmProvider` method,
`generateNpcLines(npcs, townState): Promise<string[]>`, takes the full list of NPCs currently
eligible for a line (not just one) and returns one line per NPC in the same order — satisfying
"batching many NPCs' generation into fewer LLM calls" directly, since it's structurally
impossible to call it any other way.

**2. Client-side cooldown, not per-refresh generation.** A fresh batch is requested at most once
every 10 minutes real time (`NPC_LLM_COOLDOWN_MS`), cached client-side
(`data/npcLlmDialogue.ts`, localStorage-backed like every other Overworld data module). Every
other snapshot refresh reuses the cached batch. This is a genuine cost control, not just a UX
nicety — an LLM call costs real money per the app's own Fuel/budget framing.

**3. Display stays staggered per NPC on its own existing timer.** The batch response is cached
data, not a display trigger — `ExteriorScene`'s existing per-building Break-time interaction
check (already independently timed per building) is what decides WHEN a line shows; it just
looks up this NPC's cached LLM line (if fresh) instead of always calling `dialogueFor()`. No new
"show all NPCs' new lines at once" behavior is introduced.

**4. Three interaction outcomes, deterministically chosen (never `Math.random`), matching
soumaya-governance.md's own explicit requirement that not every interaction needs full text**:
   - An LLM-flavored line (if the cache has a fresh one for this NPC) — real town-state-aware
     flavor.
   - The existing hand-authored pool line (`dialogueFor()`) — the default, always-available
     fallback.
   - A **gesture-only** outcome: the two NPCs still step toward each other and the relationship
     counter still bumps, but no dialogue bubble shows at all — the cheapest possible
     interaction, and explicitly named as valid in soumaya-governance.md.
   All three are selected by a deterministic hash of `(npcId, interaction tick)` — same
   determinism convention as everything else in this file, not a coin flip.

**5. Grounded, never invented, town-state context.** The request sent to the LLM includes: real
treasury balance (`townLedger.ts`), the names of any currently-neglected buildings
(`buildingNeglect.ts`), and real node/NPC counts. The prompt explicitly instructs the model to
reference AT MOST one of these per line and never invent a concept (a business type, an event,
"food") that isn't in the supplied data — mirrors this codebase's existing "never hallucinate
data the schema doesn't have" convention for every other LLM-touching feature.

**6. Heuristic fallback is real generated variety, not a static string.** `HeuristicProvider`'s
implementation deterministically combines each NPC's own job flavor with ONE real fact from the
supplied town state (by index, not random) — so even with no API key, lines vary meaningfully
run to run as town state actually changes, never a single hardcoded sentence.

## Data model / API surface

**Server** (`llm/adapter.ts`): new types `NpcLineRequest { npcId, name, jobFlavor,
relationshipHint? }` and `NpcTownState { treasuryCents, neglectedBuildings, nodeCount, npcCount }`;
new `LlmProvider` method `generateNpcLines(npcs: NpcLineRequest[], townState: NpcTownState):
Promise<string[]>`, implemented in `heuristic.ts` (deterministic template), `openai.ts`/
`gemini.ts` (real prompt, flat `{ lines: string[] }` JSON schema — one string per input npc, same
order, matching this codebase's own "keep schemas flat" rule), and `resilient.ts` (same
blocked/timeout/fallback wrapper every other method already uses).

**Route**: `POST /api/npc-dialogue` (new `api/routes/npcDialogue.ts`, mounted behind the existing
`guard` + a `llmLimiter` same as `/api/digest/run`), zod-validated body matching the two types
above, returns `{ lines: string[] }`.

**Client** (`overworld/data/npcLlmDialogue.ts`, new): `getCachedNpcLines(spaceId): Record<string,
string> | null` (reads the cache, or null if stale/absent) and `refreshNpcLines(spaceId, npcs,
townState): Promise<void>` (calls the route if the cooldown has elapsed, writes the result +
timestamp to localStorage; a network failure just leaves the existing cache in place — never
throws into the render path).

**`ExteriorScene`'s existing break-time interaction** picks the interaction outcome per decision
4 above, using the cached lines when the deterministic pick calls for one.

## Deferred, explicitly

The Mall (split into its own follow-up task, see "Scope decision" above); any interaction beyond
the existing Break-time pairwise check getting LLM flavor (e.g. Soumaya's own dialogue is a
separate system, untouched here); a live rectangle-style "preview" of upcoming dialogue; per-NPC
individually-tunable cooldowns (one town-wide cooldown is enough for this slice).
