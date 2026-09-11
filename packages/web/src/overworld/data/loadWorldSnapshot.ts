import type { GraphData, MoneyStar } from "@brain/shared";
import { getGraph, tendNode } from "../../api/client.js";
import { getFinanceSummary, getMoneySky, type FinanceSummary } from "../../api/finance.js";
import { nodeToCreature } from "../adapter/nodeToCreature.js";
import { moneyStarsToBankRows } from "../adapter/financeAdapter.js";
import { placeCreaturesOnGrid } from "../adapter/placement.js";
import { isPlacementBlocked, REGION_HEIGHT, REGION_WIDTH } from "../scenes/regionLayout.js";
import type { BankLedgerRow, CreatureEntity } from "../types.js";

export interface WorldSnapshot {
  creatures: CreatureEntity[];
  bank: { rows: BankLedgerRow[]; safeToSpendCents: number };
}

/**
 * Stage 1 caps the sample to keep the single demo region's grid legible (see
 * scenes/ExteriorScene.ts's fixed grid size) — full browsing arrives with the Library
 * stage (roadmap.md Stage 2). Archived nodes and transient "action" items don't get a
 * creature (they aren't memories to revisit); everything else renders, tolerating any
 * node with no Journey per idea.md's "unsorted" non-negotiable.
 */
export const EXTERIOR_NODE_LIMIT = 60;

/** Pure: turns already-fetched API responses into the overworld's render-ready snapshot. */
export function buildWorldSnapshot(
  graph: GraphData,
  moneySky: MoneyStar[],
  financeSummary: FinanceSummary | null,
): WorldSnapshot {
  const unplaced = graph.nodes
    .filter((n) => n.status !== "archived" && n.kind !== "action")
    .map((n) => nodeToCreature(n));
  const creatures = placeCreaturesOnGrid(unplaced, {
    width: REGION_WIDTH,
    height: REGION_HEIGHT,
    isBlocked: isPlacementBlocked,
  });
  return {
    creatures,
    bank: {
      rows: moneyStarsToBankRows(moneySky),
      safeToSpendCents: financeSummary?.budget.safeToSpendCents ?? 0,
    },
  };
}

/**
 * Fetches everything the Stage-1 region needs and assembles it. `getGraph` throws on a
 * real failure (callers should show the ux-design.md error state); the finance calls are
 * already null-safe (api/finance.ts swallows failures), so missing money data degrades to
 * an empty Bank rather than blocking the whole world from loading.
 */
export async function loadWorldSnapshot(): Promise<WorldSnapshot> {
  const [graph, moneySky, financeSummary] = await Promise.all([
    getGraph(EXTERIOR_NODE_LIMIT),
    getMoneySky(),
    getFinanceSummary(),
  ]);
  return buildWorldSnapshot(graph, moneySky ?? [], financeSummary);
}

/** FR11 — the greet action. Fire-and-forget by design (matches tendNode itself); callers
 *  reconcile the creature's visible state from the next `loadWorldSnapshot()`, never by
 *  guessing the server's new entropy value client-side. */
export async function greetCreature(nodeId: number): Promise<void> {
  await tendNode(nodeId);
}
