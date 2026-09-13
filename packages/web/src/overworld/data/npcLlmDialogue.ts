/**
 * NPC Society — real hybrid LLM + hand-authored dialogue (docs/overworld/npc-llm-dialogue.md,
 * task #61). The server call itself is stateless (no persisted lines) — this module's whole
 * job is the client-side cooldown/cache that turns "a batched call is possible" into "a batched
 * call actually only happens rarely," which is the real cost control here, not the server route.
 *
 * `ExteriorScene`'s existing break-time interaction timing is untouched — it just looks up
 * whatever this cache currently holds instead of always calling `dialogueFor()`.
 */

import { afetch, API } from "../../api/http.js";
import { allSocietyNpcIds, npcProfile } from "./npcDialogue.js";
import { relationshipCount, relationshipTier } from "./npcRelationships.js";
import { partnerNpcId } from "./npcDialogue.js";
import { treasuryBalanceCents } from "./townLedger.js";
import { buildingNeglect, isNeglected } from "./buildingNeglect.js";
import { allPlaces } from "../scenes/regionLayout.js";

/** A fresh batch is requested at most this often — a real cost control, not a UX nicety
 *  (npc-llm-dialogue.md decision #2). */
export const NPC_LLM_COOLDOWN_MS = 10 * 60_000;

interface CachedBatch {
  lines: Record<string, string>;
  fetchedAt: number;
}

function cacheKey(spaceId: string): string {
  return `brain.npcLlm.cache.${spaceId}`;
}

function readCache(spaceId: string): CachedBatch | null {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey(spaceId)) || "null");
    return raw && typeof raw.fetchedAt === "number" && raw.lines && typeof raw.lines === "object" ? raw : null;
  } catch {
    return null;
  }
}

function writeCache(spaceId: string, lines: Record<string, string>): void {
  try {
    localStorage.setItem(cacheKey(spaceId), JSON.stringify({ lines, fetchedAt: Date.now() }));
  } catch {
    /* worst case the batch just isn't remembered — the next interaction falls back normally */
  }
}

/** Whatever flavor line the last batch produced for this NPC, or null if there is none / the
 *  cache has never been populated. Freshness is enforced by `refreshNpcLinesIfStale` alone —
 *  once written, a cached line stays usable until the next successful refresh replaces it. */
export function getCachedNpcLine(spaceId: string, npcId: string): string | null {
  return readCache(spaceId)?.lines[npcId] ?? null;
}

export type DialogueOutcome = "llm" | "pool" | "gesture";

/** Deterministic (no Math.random) pick between the three real interaction outcomes
 *  (npc-llm-dialogue.md decision #4) — an LLM-flavored line when one's cached and fresh, the
 *  existing hand-authored pool (the default), or a gesture-only beat with no dialogue bubble
 *  at all (the cheapest possible interaction, explicitly named as valid). Same npcId + seed
 *  always picks the same outcome — repeated interactions still vary because `seed` (the
 *  society tick count) keeps advancing. */
export function pickDialogueOutcome(npcId: string, seed: number): DialogueOutcome {
  let h = 0;
  for (let i = 0; i < npcId.length; i++) h = (h * 31 + npcId.charCodeAt(i)) | 0;
  h = (h + seed) | 0;
  const m = ((h % 3) + 3) % 3;
  return m === 0 ? "llm" : m === 1 ? "pool" : "gesture";
}

/** Real, already-computed town state (never invented) for the whole town, in one place — the
 *  same treasury/neglect data other overlays (Mayor's Office, Park) already read. */
function buildTownState(spaceId: string, nodeCount: number): { treasuryCents: number; neglectedBuildings: string[]; nodeCount: number; npcCount: number } {
  const neglectedBuildings = allPlaces()
    .filter((p) => p.kind === "door")
    .filter((p) => isNeglected(buildingNeglect(spaceId, p.id)))
    .map((p) => p.label);
  return {
    treasuryCents: treasuryBalanceCents(spaceId),
    neglectedBuildings,
    nodeCount,
    npcCount: allSocietyNpcIds().length,
  };
}

/** Requests a fresh batch for every real Society NPC, but only if the cooldown has actually
 *  elapsed — otherwise this is a no-op (the existing cache is left exactly as it is). A network
 *  failure never throws into the caller's render path; the existing cache (however old) just
 *  stays in place. */
export async function refreshNpcLinesIfStale(spaceId: string, nodeCount: number): Promise<void> {
  const cache = readCache(spaceId);
  if (cache && Date.now() - cache.fetchedAt < NPC_LLM_COOLDOWN_MS) return;

  const ids = allSocietyNpcIds();
  const npcs = ids.map((id) => {
    const profile = npcProfile(id);
    const partner = partnerNpcId(id);
    const tier = partner ? relationshipTier(relationshipCount(spaceId, id, partner)) : "strangers";
    return {
      npcId: id,
      name: profile.name,
      jobFlavor: profile.jobLines[0] ?? profile.name,
      relationshipHint: tier === "friends" && partner ? `friends with ${npcProfile(partner).name}` : undefined,
    };
  });

  try {
    const res = await afetch(`${API}/npc-dialogue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ npcs, townState: buildTownState(spaceId, nodeCount) }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { lines?: string[] };
    if (!Array.isArray(data.lines) || data.lines.length !== ids.length) return;
    const lines: Record<string, string> = {};
    ids.forEach((id, i) => {
      const line = data.lines![i];
      if (line) lines[id] = line;
    });
    writeCache(spaceId, lines);
  } catch {
    /* keep whatever cache exists — offline-safe, same convention as every other client fetch */
  }
}
