/**
 * Population growth (docs/overworld/population-growth.md, task #118) — a Resident is a real,
 * hand-authored addition to the town's population that grows real housing headcount without
 * touching the attendant/dialogue/relationship/schedule system at all: no job, no attendant
 * post, no in-world sprite, no dialogue. Investigated first, not assumed: `attendantPosts()`
 * already has zero unfilled slack (measured directly — 24 posts, 24 hand-authored profiles,
 * confirmed no gaps), so the standing plan's "assign new NPCs as second attendants" mechanism
 * had nothing real to attach to. A Resident is the honest alternative — real growth where the
 * existing data model actually has room for it (housing capacity), not invented capacity
 * elsewhere.
 */

import { asSocietyNpcId, npcProfile } from "./npcDialogue.js";

export interface ResidentProfile {
  id: string;
  name: string;
}

/** A modest, real batch — "a small wave reads as real growth," not doubling the town's
 *  population in one round (population-growth.md's own resolved reasoning). */
const RESIDENT_LIST: readonly ResidentProfile[] = [
  { id: "resident-0", name: "Della" },
  { id: "resident-1", name: "Fenwick" },
  { id: "resident-2", name: "Noor" },
  { id: "resident-3", name: "Salvo" },
];

const RESIDENTS: Record<string, ResidentProfile> = {};
for (const r of RESIDENT_LIST) RESIDENTS[r.id] = r;

/** The town's fixed Resident roster, in one stable declaration order — `housing.ts`'s own
 *  deterministic pack-to-capacity walk appends this after the society NPCs, so a Resident only
 *  gets a real home once every society NPC already has one and real capacity remains. */
export function allResidentNpcIds(): readonly string[] {
  return RESIDENT_LIST.map((r) => r.id);
}

/** The real name for a Resident id, or `null` for anything else — the guard every caller uses
 *  before treating an id as a Resident (mirrors `npcDialogue.ts`'s own `asSocietyNpcId`). */
export function residentName(id: string): string | null {
  return RESIDENTS[id]?.name ?? null;
}

/** The real display name for ANY id `housing.ts`'s combined roster can produce — a real society
 *  NPC's own profile name, or a real Resident's own name. Never throws (unlike `npcProfile`
 *  alone, which is attendant-only): the one shared lookup a caller like
 *  `MayorsHallOverlay.tsx`'s resident list needs so it never crashes on a Resident id. */
export function npcDisplayName(id: string): string {
  const societyId = asSocietyNpcId(id);
  if (societyId) return npcProfile(societyId).name;
  return residentName(id) ?? id;
}
