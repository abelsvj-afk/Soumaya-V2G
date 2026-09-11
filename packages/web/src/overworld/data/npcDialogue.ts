/**
 * NPC Society v1 (docs/overworld/npc-society.md) — hand-authored dialogue for the two Town Hall
 * NPCs (Mira the Mayor, Dez the Clerk). Per the "Hybrid" decision: static now, but shaped so a
 * later stage can route a line through the LLM adapter (`llm/adapter.ts`) for extra flavor
 * without reworking this data — `NpcProfile` is plain data, not tied to any rendering.
 *
 * "Grows and changes" (idea.md's own "reasons for all of it" rule) = personal lines unlock only
 * once the player has actually earned the matching real achievement id
 * (`components/achievements.ts`), and the friend line only unlocks once the relationship tier
 * with the other NPC (`npcRelationships.ts`) actually reaches "friends" — never on a timer, never
 * invented.
 */

import type { RelationshipTier } from "./npcRelationships.js";

export type SocietyNpcId = "townHall-0" | "townHall-1";

export interface NpcProfile {
  id: SocietyNpcId;
  name: string;
  /** Always available — what they'd say about their actual job. */
  jobLines: readonly string[];
  /** Each unlocks only once the player holds the named real achievement id. */
  personalLines: ReadonlyArray<{ achievementId: string; line: string }>;
  /** Only available once the relationship with the other Town Hall NPC reaches "friends". */
  friendLine: (otherName: string) => string;
}

const PROFILES: Record<SocietyNpcId, NpcProfile> = {
  "townHall-0": {
    id: "townHall-0",
    name: "Mira",
    jobLines: [
      "Town Hall's quiet today — good, means everyone's out actually living their Journeys.",
      "I keep half an eye on the digest board. Word travels fast once something real connects.",
    ],
    personalLines: [
      { achievementId: "cartographer", line: "Five constellations charted now — I've been meaning to put one up on the town map." },
      { achievementId: "streak_week", line: "A full week of showing up every day. That's exactly the kind of thing worth a meeting." },
    ],
    friendLine: (other) => `Good to see ${other} out here — we go back a while now.`,
  },
  "townHall-1": {
    id: "townHall-1",
    name: "Dez",
    jobLines: [
      "Filing the day's business. Nothing official yet, but ask again after the next digest.",
      "Town Hall doesn't run itself — someone's got to keep the ledger straight.",
    ],
    personalLines: [
      { achievementId: "weaver_100", line: "A hundred connections woven through your galaxy. I keep a tally of milestones like that." },
      { achievementId: "goal_achiever", line: "Heard a goal got carried all the way to done. That's worth writing down properly." },
    ],
    friendLine: (other) => `${other} stopped by earlier — always good company on a break.`,
  },
};

export function npcProfile(id: SocietyNpcId): NpcProfile {
  return PROFILES[id];
}

/** Any string down to just the two Town Hall ids, or null for anything else — the guard every
 *  caller uses before treating an AttendantPost as a society NPC. */
export function asSocietyNpcId(id: string): SocietyNpcId | null {
  return id === "townHall-0" || id === "townHall-1" ? id : null;
}

/**
 * Picks one line from whatever's currently unlocked for this NPC — job lines always included,
 * personal lines gated on real achievements, the friend line gated on relationship tier.
 * Deterministic given the same seed (this repo's convention — no Math.random), so repeated
 * interactions vary without ever being random.
 */
export function dialogueFor(
  id: SocietyNpcId,
  unlockedAchievementIds: ReadonlySet<string>,
  tier: RelationshipTier,
  otherName: string,
  seed: number,
): string {
  const profile = PROFILES[id];
  const pool: string[] = [...profile.jobLines];
  for (const personal of profile.personalLines) {
    if (unlockedAchievementIds.has(personal.achievementId)) pool.push(personal.line);
  }
  if (tier === "friends") pool.push(profile.friendLine(otherName));
  if (pool.length === 0) return "";
  const index = ((seed % pool.length) + pool.length) % pool.length;
  return pool[index] ?? "";
}
