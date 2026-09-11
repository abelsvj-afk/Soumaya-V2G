import { describe, it, expect } from "vitest";
import type { GraphData, GraphNode, MoneyStar } from "@brain/shared";
import { buildWorldSnapshot } from "./loadWorldSnapshot.js";
import type { FinanceSummary } from "../../api/finance.js";

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 1,
    label: "n",
    type: "concept",
    content: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildWorldSnapshot", () => {
  it("turns every non-archived, non-action node into a creature", () => {
    const graph: GraphData = {
      nodes: [
        makeNode({ id: 1 }),
        makeNode({ id: 2, status: "archived" }),
        makeNode({ id: 3, kind: "action" }),
      ],
      links: [],
    };
    const snapshot = buildWorldSnapshot(graph, [], null);
    expect(snapshot.creatures.map((c) => c.nodeId)).toEqual([1]);
  });

  it("degrades to an empty Bank (never an error) when finance data is unavailable", () => {
    const graph: GraphData = { nodes: [], links: [] };
    const snapshot = buildWorldSnapshot(graph, [], null);
    expect(snapshot.bank.rows).toEqual([]);
    expect(snapshot.bank.safeToSpendCents).toBe(0);
  });

  it("passes real finance data through the adapter unchanged", () => {
    const star: MoneyStar = {
      kind: "bill",
      id: 9,
      label: "Rent",
      amountCents: 100,
      state: "overdue",
      glyph: "x",
      intensity: 1,
    };
    const summary = { budget: { safeToSpendCents: 4200 } } as FinanceSummary;
    const snapshot = buildWorldSnapshot({ nodes: [], links: [] }, [star], summary);
    expect(snapshot.bank.rows).toHaveLength(1);
    expect(snapshot.bank.rows[0]?.isUrgent).toBe(true);
    expect(snapshot.bank.safeToSpendCents).toBe(4200);
  });

  it("carries the full graph + fuel/streak through for Gym/Library to use without a second fetch", () => {
    const graph: GraphData = { nodes: [makeNode()], links: [] };
    const fuel = { fuel: 5, capacity: 10, jobCost: 1 };
    const streak = { current: 3, best: 7, today: true };
    const snapshot = buildWorldSnapshot(graph, [], null, fuel, streak);
    expect(snapshot.graph).toBe(graph);
    expect(snapshot.fuel).toEqual(fuel);
    expect(snapshot.streak).toEqual(streak);
  });
});
