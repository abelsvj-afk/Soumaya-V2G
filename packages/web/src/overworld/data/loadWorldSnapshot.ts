import type { Fuel, GraphData, MoneyStar, Streak } from "@brain/shared";
import { getFuel, getGraph, getStreak, tendNode } from "../../api/client.js";
import { getFinanceSummary, getMoneySky, type FinanceSummary } from "../../api/finance.js";
import { getDueReviews, type DueReview } from "../../api/features.js";
import { getThoughts, type Thought } from "../../api/mind.js";
import { getSpaceId } from "../../api/http.js";
import { nodeToCreature } from "../adapter/nodeToCreature.js";
import { moneyStarsToBankRows } from "../adapter/financeAdapter.js";
import { placeCreaturesOnGrid } from "../adapter/placement.js";
import { isPlacementBlocked, REGION_HEIGHT, REGION_WIDTH } from "../scenes/regionLayout.js";
import { syncAchievements } from "./achievements.js";
import { recordBuildingWork } from "./npcJobs.js";
import { isTileOccupiedByPlacedItem } from "./townBuilder.js";
import { isInsideAnyFootprint, placedBusinessFootprints, placedHomeFootprints } from "./placedStructures.js";
import { collectPassiveIncome } from "./passiveIncome.js";
import { collectPassiveNpcIncome } from "./passiveNpcIncome.js";
import { collectPassiveResidentIncome } from "./passiveResidentIncome.js";
import type { BankLedgerRow, CreatureEntity } from "../types.js";

export interface WorldSnapshot {
  creatures: CreatureEntity[];
  bank: { rows: BankLedgerRow[]; safeToSpendCents: number };
  /** The full graph response — kept around so buildings that need more than creatures
   *  (Gym's achievements, Library's full browse) don't need a second fetch. */
  graph: GraphData;
  fuel: Fuel | null;
  streak: Streak | null;
  /** spaced-repetition.md — the server's current SM-2 due list, kept around so Soumaya's chat
   *  can nudge by name without a second fetch. Never re-derived client-side. */
  dueReviews: DueReview[];
  /** mindspace.md — the server's live working-memory list, kept around so the ambient
   *  floating-thought overlay doesn't need its own separate fetch (same convention as
   *  dueReviews above). Never re-derived client-side. */
  thoughts: Thought[];
}

/**
 * Matches getGraph()'s own default (App.tsx fetches the same way) — achievements and
 * Library browsing need the REAL total, not a small sample, so this isn't independently
 * capped. The exterior's own tile grid still naturally caps how many get a visible
 * creature (placeCreaturesOnGrid drops whatever doesn't fit, never an error); everything
 * else (archived nodes, transient "action" items) skips creature rendering entirely but
 * still counts for achievements/Library, tolerating any node with no Journey per idea.md's
 * "unsorted" non-negotiable.
 */
export const GRAPH_FETCH_LIMIT = 300;

/** Pure: turns already-fetched API responses into the overworld's render-ready snapshot. */
export function buildWorldSnapshot(
  graph: GraphData,
  moneySky: MoneyStar[],
  financeSummary: FinanceSummary | null,
  fuel: Fuel | null = null,
  streak: Streak | null = null,
  dueReviews: DueReview[] = [],
  spaceId: string | null = null,
  thoughts: Thought[] = [],
): WorldSnapshot {
  const dueIds = new Set(dueReviews.map((d) => d.id));
  const unplaced = graph.nodes
    .filter((n) => n.status !== "archived" && n.kind !== "action")
    .map((n) => nodeToCreature(n, { dueForRecall: dueIds.has(n.id) }));
  const homeFootprints = spaceId != null ? placedHomeFootprints(spaceId) : [];
  const businessFootprints = spaceId != null ? placedBusinessFootprints(spaceId) : [];
  const creatures = placeCreaturesOnGrid(unplaced, {
    width: REGION_WIDTH,
    height: REGION_HEIGHT,
    // town-builder.md — a creature can never spawn on top of something the player already
    // built, the one integration point the new placement system needs outside its own module.
    // 2026-09-15 audit fix: this only ever checked town-builder decor, never real placed homes/
    // businesses — a creature could be freshly, deterministically placed directly onto a tile
    // inside an already-built structure on every graph reconciliation (after every greet/
    // capture), rendering invisible behind the building while staying hit-testable there.
    isBlocked: (x, y) =>
      isPlacementBlocked(x, y) ||
      (spaceId != null && isTileOccupiedByPlacedItem(spaceId, x, y)) ||
      isInsideAnyFootprint(homeFootprints, x, y) ||
      isInsideAnyFootprint(businessFootprints, x, y),
  });
  return {
    creatures,
    bank: {
      rows: moneyStarsToBankRows(moneySky),
      safeToSpendCents: financeSummary?.budget.safeToSpendCents ?? 0,
    },
    graph,
    fuel,
    streak,
    dueReviews,
    thoughts,
  };
}

/**
 * Fetches everything the region needs and assembles it. `getGraph` throws on a real
 * failure (callers should show the ux-design.md error state); the finance/fuel/streak
 * calls are already null-safe, so missing data degrades gracefully rather than blocking
 * the whole world from loading. Also runs the achievement-unlock sync (see achievements.ts)
 * on every real refresh, since that side effect only lives in App.tsx today and App.tsx
 * never mounts while the Overworld is active.
 *
 * Town Economy round (docs/overworld/npc-economy.md) — a freshly-unlocked achievement here IS
 * the Gym's own real work event (it has no button of its own to hook, same situation as the
 * Bank; unlike the Bank, the diff it needs is already computed right here by syncAchievements,
 * so crediting it stays local to this function rather than needing OverworldRoot.tsx to diff
 * anything itself).
 */
export async function loadWorldSnapshot(): Promise<WorldSnapshot> {
  const [graph, moneySky, financeSummary, fuel, streak, dueReviews, thoughts] = await Promise.all([
    getGraph(GRAPH_FETCH_LIMIT),
    getMoneySky(),
    getFinanceSummary(),
    getFuel(),
    getStreak(),
    getDueReviews(),
    getThoughts(),
  ]);
  const freshAchievements = syncAchievements(graph, fuel, streak);
  const spaceId = getSpaceId();
  if (spaceId && freshAchievements.length > 0) recordBuildingWork(spaceId, "gym");
  // wave3-economy-depth.md decision #1 — real passive income from built homes/businesses,
  // accrued fresh on every real refresh (never a running timer, same convention as the
  // achievement sync above).
  if (spaceId) collectPassiveIncome(spaceId);
  // simcity-realism-pass.md — the OTHER real passive income stream: the town's own population,
  // taxed for real time genuinely spent working, independent of the structure rent above.
  if (spaceId) collectPassiveNpcIncome(spaceId);
  // interior-camera-and-income-fixes.md, task #125 — a THIRD, independent stream: real Residents
  // (task #118's population-growth batch) have no job/schedule to tax, so their genuine presence
  // in a real built home is what earns instead — "people coming into the town" now has a real
  // economic effect, not just a headcount.
  if (spaceId) collectPassiveResidentIncome(spaceId);
  return buildWorldSnapshot(graph, moneySky ?? [], financeSummary, fuel, streak, dueReviews, spaceId, thoughts);
}

/** FR11 — the greet action. Fire-and-forget by design (matches tendNode itself); callers
 *  reconcile the creature's visible state from the next `loadWorldSnapshot()`, never by
 *  guessing the server's new entropy value client-side. */
export async function greetCreature(nodeId: number): Promise<void> {
  await tendNode(nodeId);
}
