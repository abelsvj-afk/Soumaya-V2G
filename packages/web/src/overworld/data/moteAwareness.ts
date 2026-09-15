/**
 * NPC mote awareness (backlog #82) — extends the Break-time dialogue system with a real,
 * low-frequency line noticing that the player has several active MindSpace thoughts, never
 * inventing anything about a specific thought's substance (thoughts are private; an NPC may
 * notice THAT you're thinking, never WHAT). Deterministic given the same npcId/seed (this
 * repo's convention — no Math.random), so it stays rare and repeatable rather than a coin flip.
 */

const MOTE_AWARENESS_LINES: readonly string[] = [
  "You've got a few things on your mind lately.",
  "Plenty on your mind today, from the look of it.",
  "Something's clearly been sitting with you — I won't pry.",
];

/** Real trigger only (2+ active thoughts, `getThoughts()`'s own real count) — never fires on
 *  an empty or single-thought MindSpace. Roughly 1-in-8 eligible interactions, so it reads as a
 *  genuine notice, not a constant refrain. */
export function moteAwarenessLine(npcId: string, seed: number, thoughtCount: number): string | null {
  if (thoughtCount < 2) return null;
  let h = 0;
  for (let i = 0; i < npcId.length; i++) h = (h * 31 + npcId.charCodeAt(i)) | 0;
  h = (h + seed) | 0;
  const frequencyRoll = ((h % 8) + 8) % 8;
  if (frequencyRoll !== 0) return null;
  const lineIndex = (((h >> 3) % MOTE_AWARENESS_LINES.length) + MOTE_AWARENESS_LINES.length) % MOTE_AWARENESS_LINES.length;
  return MOTE_AWARENESS_LINES[lineIndex] ?? null;
}
