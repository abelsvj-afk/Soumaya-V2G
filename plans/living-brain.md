# Living Brain — design (Soumaya tends a persistent neural web)

**Status:** design agreed with user 2026-06-20. Execute in phases; keep the gate green,
offline path intact, and make every part cohere with existing systems (orbits, entropy,
fuel, Soumaya's modes, the pending-link reveal).

## The vision (user's words, synthesized)
The galaxy should read as a **living brain** that accumulates over time: a persistent,
faintly **glowing web** of connections with **ambient firing / cluster lights**, so from a
distance it looks like neurons firing — even when no new memories are added. Soumaya isn't
just decoration: she **physically tends** the brain.

## Why things looked "broken" (root causes — already understood)
- **"Connections gone on reload" (real brain):** edges DO persist (weight ≥0.6 > 0.25 prune
  floor) and the graph route returns them space-scoped. They just render too **faint** at the
  default zoomed-out distance (lit opacity ~0.27, thin curves) to see against the starfield.
  → Fixed by Phase 1 (legible glowing web), not a data fix.
- **"Demo shows no memories":** the per-frame O(links×nodes) freeze from `baec31f`, already
  fixed in `587275d`. A stale PWA/deploy can still show it → hard-refresh. Phase 1 also passes
  the missing `demo` prop to `NodeList`.
- **Fuel "stops her drawing lines":** misconception — line-drawing is NOT fuel-gated (only
  research/sector charting is). Phase 3 surfaces fuel so this is legible, + slow regen.

---

## Phase 1 — Persistent, legible, alive web 🟢 (delegate to agy; pure visual, `Graph3D.tsx`/CSS)
The biggest perceived win, lowest risk. No backend/contract changes.
1. **Legible persistent links:** raise the resting link opacity/glow so the web reads at
   distance (the "connections gone" cure). Keep activity (recent-tend) as a brightness BONUS,
   not the floor. Consider an additive/emissive line material or a subtle bloom contribution
   so clusters glow.
2. **Ambient firing / cluster lights:** the idle-pulse already exists — make it read as
   neurons: occasional soft pulses along random visible links, denser inside tight clusters,
   so the brain looks alive with zero new memories. (Cap density for huge brains — see TASKS.)
3. **Marquee dt fix:** label scroll is per-frame (`mq.t += 0.006`) → slows on slow phones.
   Make it time-based.
4. **Link flicker when close:** unrelated links drop to 0.02 opacity on hover/select → reads
   as a glitch. Raise the "unlit" floor to faint-but-present + ease the transition.
5. **`NodeList demo` prop:** pass `demo` from `RightDock` so demo doesn't hit the API.

## Phase 2 — Soumaya physically places & removes memories 🔴/🟡 (Claude leads; touches `orbits.ts` + `soumaya.ts`)
The behavioral heart. Must cohere with the kinematic orbit system (`orbits.ts` is RED).
- **Placement on arrival:** when a NEW memory (or cluster) is ingested, instead of it popping
  into its orbit, Soumaya flies to it, **ferries it from a "drop-in" point to its computed
  orbit slot**, drops it, and draws its links. She only ever moves a body **once** (its
  genesis placement); afterwards the orbit system owns it untouched.
  - Mechanism: `orbits.ts` exposes the target slot for a new id; a one-shot "placement tween"
    (owned by soumaya/Graph3D) animates the node from drop-in → slot while she escorts it,
    THEN hands control to the kinematic system (pin fx/fy/fz) as today. Needs a clean seam so
    placement never fights the pinning. **This is the careful red-zone part.**
- **Deletion as spectacle:** on delete, instead of vanishing, she **flings it into deep space
  or drags it into the Sun** and it's gone. (Ties the Sun into gameplay — the "core self"
  consuming discarded memories.) Visual in `soumaya.ts`; the actual delete stays the existing
  route.

## Phase 3 — Links live & decay; she repairs them 🟡 (Claude leads; needs an edge "health" signal)
- Over time, untended links **fade / break / go stagnant** (mirrors entropy on nodes). When a
  link degrades past a threshold, Soumaya flies out and **re-draws/repairs** it.
- Cohere with entropy: reuse the same age/`lastTendedAt` signal that cools nodes, applied to
  edges. Decide: client-only visual decay (cheap, no schema) vs a real edge `lastTendedAt`
  (RED — schema migration). Start client-only; promote to persisted only if needed.
- This gives her ongoing purpose without new memories (answers "what keeps her busy").

## Phase 4 — Fuel made legible + self-sustaining 🟡 (Claude: `economy.ts` regen = RED; HUD = 🟢)
- **Surface fuel on the main HUD** (not just buried in Help): a small gauge + a one-line "how
  it's earned" so the economy is visible.
- **Passive slow regen** in `economy.ts` so she keeps doing ambitious work without the user
  force-feeding memories. Keep the real API/USD budget as the hard ceiling. Visual growth
  (placement, web, firing, repair) stays UNGATED regardless.

## Sequencing
Phase 1 now (agy). Phase 2 next (Claude, careful orbits seam). Phase 3 + 4 after. Each phase
ships behind the gate and logs to `GEMINI_CHANGES.md`. Nothing here changes the offline path.
