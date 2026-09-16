/**
 * NPC Society v1 (docs/overworld/npc-society.md) — a shared, deterministic in-game clock so
 * Mira and Dez (the two Town Hall attendants) each cycle through a real daily rhythm instead of
 * pacing forever. Pure/no-Phaser, no Date/Math.random (this repo's convention — same tick always
 * yields the same state), driven by a tick counter ExteriorScene.ts advances on a timer.
 */

export type ScheduleState = "working" | "break" | "home";

/** The shared clock's real tick length, in real ms — moved here (from `ExteriorScene.ts`, which
 *  now imports it) so `passiveNpcIncome.ts` can independently derive the same real tick from
 *  `Date.now()` without dragging Phaser into a pure, unit-testable data module. */
export const SOCIETY_TICK_MS = 1500;

/** One full cycle, in ticks. Working is the bulk of it (attendants are mostly at their post),
 *  Break is short (the interaction window), Home is a brief "left the screen" stretch. */
export const CYCLE_TICKS = 40;
export const WORKING_TICKS = 28;
const BREAK_TICKS = 8;
// Remaining CYCLE_TICKS - WORKING_TICKS - BREAK_TICKS ticks are "home".

/** Deterministic pure hash (same convention as tileAtlas.ts's hash32) so each NPC id always
 *  gets the same desync offset — never in lockstep with another NPC by coincidence alone. */
function hashOffset(npcId: string): number {
  let h = 0;
  for (let i = 0; i < npcId.length; i++) {
    h = (h * 31 + npcId.charCodeAt(i)) | 0;
  }
  return ((h % CYCLE_TICKS) + CYCLE_TICKS) % CYCLE_TICKS;
}

/** This NPC's schedule state at a given shared clock tick. */
export function scheduleStateAt(npcId: string, tick: number): ScheduleState {
  const phase = (((tick + hashOffset(npcId)) % CYCLE_TICKS) + CYCLE_TICKS) % CYCLE_TICKS;
  if (phase < WORKING_TICKS) return "working";
  if (phase < WORKING_TICKS + BREAK_TICKS) return "break";
  return "home";
}

/** How many of the real ticks in `(fromTickExclusive, toTickInclusive]` this NPC actually spent
 *  "working" — the real basis for population-driven passive income (simcity-realism-pass.md):
 *  an NPC only generates real tax revenue for real time genuinely spent working, not idle. O(1)
 *  full-cycle math plus at most one partial cycle's worth of real per-tick checks, so this stays
 *  fast even across a real multi-day gap (never a per-tick loop over the whole gap). A no-op
 *  range (`toTickInclusive <= fromTickExclusive`) returns 0. */
export function countWorkingTicks(npcId: string, fromTickExclusive: number, toTickInclusive: number): number {
  const total = toTickInclusive - fromTickExclusive;
  if (total <= 0) return 0;
  const fullCycles = Math.floor(total / CYCLE_TICKS);
  let count = fullCycles * WORKING_TICKS;
  const remainder = total - fullCycles * CYCLE_TICKS;
  for (let i = 0; i < remainder; i++) {
    const tick = toTickInclusive - remainder + 1 + i;
    if (scheduleStateAt(npcId, tick) === "working") count++;
  }
  return count;
}
