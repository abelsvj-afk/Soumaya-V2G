/**
 * NPC Society v1 (docs/overworld/npc-society.md) — a minimal, real relationship construct
 * between two NPCs: not the anonymous/interchangeable encounters the original draft proposed,
 * per the user's explicit priority to seed this in for v1. One pairwise counter, persisted per
 * space, same localStorage convention as achievements.ts (`achvKey`/`loadUnlocked`).
 */

export type RelationshipTier = "strangers" | "acquaintances" | "friends";

const ACQUAINTANCE_THRESHOLD = 1;
const FRIEND_THRESHOLD = 4;

function storageKey(spaceId: string): string {
  return `brain.npcRel.${spaceId}`;
}

/** Order-independent pair key — the relationship between A and B is the same relationship as
 *  between B and A. */
function pairKey(npcIdA: string, npcIdB: string): string {
  return [npcIdA, npcIdB].sort().join("|");
}

function loadAll(spaceId: string): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(spaceId)) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/** How many times this pair has actually interacted (a real count, not a guess). */
export function relationshipCount(spaceId: string, npcIdA: string, npcIdB: string): number {
  return loadAll(spaceId)[pairKey(npcIdA, npcIdB)] ?? 0;
}

/** Records one real interaction between the pair; returns the new count. Callers should call
 *  this once per interaction event (e.g. once per overlapping break window), never per tick. */
export function bumpRelationship(spaceId: string, npcIdA: string, npcIdB: string): number {
  const all = loadAll(spaceId);
  const key = pairKey(npcIdA, npcIdB);
  const next = (all[key] ?? 0) + 1;
  all[key] = next;
  try {
    localStorage.setItem(storageKey(spaceId), JSON.stringify(all));
  } catch {
    /* storage unavailable — the interaction still happened, it just won't be remembered */
  }
  return next;
}

export function relationshipTier(count: number): RelationshipTier {
  if (count >= FRIEND_THRESHOLD) return "friends";
  if (count >= ACQUAINTANCE_THRESHOLD) return "acquaintances";
  return "strangers";
}
