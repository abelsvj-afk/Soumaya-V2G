import { describe, it, expect } from "vitest";
import type { GraphNode } from "@brain/shared";
import { groupIntoFolders } from "./libraryFolders.js";

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return { id: 1, label: "n", type: "concept", content: "", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

describe("groupIntoFolders", () => {
  it("groups by NodeType", () => {
    const folders = groupIntoFolders([makeNode({ id: 1, type: "person" }), makeNode({ id: 2, type: "person" }), makeNode({ id: 3, type: "concept" })]);
    expect(folders.find((f) => f.key === "person")?.nodes).toHaveLength(2);
    expect(folders.find((f) => f.key === "concept")?.nodes).toHaveLength(1);
  });

  it("a moc-kind node goes to Constellations regardless of its NodeType", () => {
    const folders = groupIntoFolders([makeNode({ id: 1, type: "concept", kind: "moc" })]);
    expect(folders.find((f) => f.key === "moc")?.nodes).toHaveLength(1);
    expect(folders.find((f) => f.key === "concept")).toBeUndefined();
  });

  it("never errors on an unrecognized type — falls back to Other, tolerating unsorted data", () => {
    const folders = groupIntoFolders([makeNode({ id: 1, type: "totally_new_type" as never })]);
    expect(folders.find((f) => f.key === "other")?.nodes).toHaveLength(1);
  });

  it("omits empty folders entirely", () => {
    const folders = groupIntoFolders([makeNode({ id: 1, type: "person" })]);
    expect(folders).toHaveLength(1);
  });

  it("returns nothing for an empty node list, never an error", () => {
    expect(groupIntoFolders([])).toEqual([]);
  });
});
