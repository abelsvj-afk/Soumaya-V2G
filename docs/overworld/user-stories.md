# Overworld — User Stories (Phase 4)

Scoped to Stage 1 (the vertical slice). Each maps to functional requirements in
[requirements.md](./requirements.md).

1. As a user, I want to walk my avatar around the Money region so that opening my finances feels
   like visiting a place, not opening a tab. *(FR1–FR3)*
   - **Acceptance**: arrow keys/D-pad move the avatar one tile at a time; walking into the Bank's
     door tile opens the Bank interior; walking out returns me to the same exterior spot.

2. As a user, I want to see my bills and goals inside the Bank exactly as they really are, so I
   can trust the game world isn't showing me stale or fake numbers. *(FR5–FR7)*
   - **Acceptance**: the Bank interior's bill/goal list matches `GET /api/finance/sky` /
     `GET /api/finance/summary` for my real space; an overdue bill shows a distinct icon+label,
     not just a red tint.

3. As a user, I want to dump a raw thought by walking into a patch of tall grass, so capturing an
   idea feels like part of exploring, not a form. *(FR8–FR9)*
   - **Acceptance**: entering the zone opens a text capture menu; submitting shows an
     "identifying..." beat, then reveals a creature with a name/type/rarity derived from the real
     extraction result (heuristic fallback if no LLM key is configured).

4. As a user, I want a memory I haven't thought about in a while to visibly look different in the
   world — dimmer, a little sad — so I notice it without being nagged. *(FR10)*
   - **Acceptance**: a node whose live `entropy` is above `COOLING_ENTROPY` (0.45) renders visibly
     dimmer than a fresh one, plus a non-color marker; a node just below the threshold does not.

5. As a user, I want walking up to a dimmed creature and greeting it to actually count as
   revisiting that memory, so the game isn't just decorative. *(FR11–FR12)*
   - **Acceptance**: the greet interaction calls the real tend endpoint; after it resolves and the
     graph is refreshed, the same creature renders brighter, using the server's real entropy
     recomputation — not a client-side fake "instant reset" that would desync from reality.
   - **Acceptance (tone)**: the greet prompt reads as an invitation ("hey, remember this?"), never
     a guilt message ("you forgot about me"), and there's no penalty, streak break, or score loss
     for not greeting a dimmed creature.

6. As a user on my phone, I want touch controls that work without a keyboard, so the game is
   actually usable where I actually use Soumaya. *(FR2)*
   - **Acceptance**: on a touch-only viewport, an on-screen D-pad + A/B control set appears and
     produces the same movement/interact events as keyboard input.

7. As a user with motion sensitivity, I want the game to calm down when my OS says to reduce
   motion, so the app stays usable for me. *(NFR — Accessibility)*
   - **Acceptance**: with `prefers-reduced-motion: reduce` set, camera pans on warp are instant
     (no smoothed pan/zoom), idle sprite animations stop or reduce amplitude, no screen shake ever
     fires.

8. As a user with no internet connection, I want the world to still render and let me walk around
   and capture thoughts, so the app's offline promise still holds in the new UI. *(FR13)*
   - **Acceptance**: with the LLM provider unset/unreachable, the world still loads with cached/
     last-known graph data, movement works, and the capture flow completes via the heuristic
     extractor rather than erroring.
