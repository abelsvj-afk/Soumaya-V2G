/**
 * NPC Society v1 (docs/overworld/npc-society.md) — a shared, deterministic in-game clock so
 * Mira and Dez (the two Town Hall attendants) each cycle through a real daily rhythm instead of
 * pacing forever. Pure/no-Phaser, no Date/Math.random (this repo's convention — same tick always
 * yields the same state), driven by a tick counter ExteriorScene.ts advances on a timer.
 */

export type ScheduleState = "working" | "break" | "home";

/** One full cycle, in ticks. Working is the bulk of it (attendants are mostly at their post),
 *  Break is short (the interaction window), Home is a brief "left the screen" stretch. */
export const CYCLE_TICKS = 40;
const WORKING_TICKS = 28;
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
