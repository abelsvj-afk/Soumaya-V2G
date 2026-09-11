import { describe, it, expect, beforeEach } from "vitest";
import { bumpRelationship, relationshipCount, relationshipTier } from "./npcRelationships.js";

describe("npcRelationships", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts every pair at strangers with a zero count", () => {
    expect(relationshipCount("space-1", "townHall-0", "townHall-1")).toBe(0);
    expect(relationshipTier(0)).toBe("strangers");
  });

  it("is order-independent — A,B and B,A are the same relationship", () => {
    bumpRelationship("space-1", "townHall-0", "townHall-1");
    expect(relationshipCount("space-1", "townHall-1", "townHall-0")).toBe(1);
  });

  it("accumulates across real interactions and only that many", () => {
    bumpRelationship("space-1", "townHall-0", "townHall-1");
    bumpRelationship("space-1", "townHall-0", "townHall-1");
    bumpRelationship("space-1", "townHall-0", "townHall-1");
    expect(relationshipCount("space-1", "townHall-0", "townHall-1")).toBe(3);
  });

  it("grows from strangers to acquaintances to friends as the count rises", () => {
    expect(relationshipTier(0)).toBe("strangers");
    expect(relationshipTier(1)).toBe("acquaintances");
    expect(relationshipTier(4)).toBe("friends");
  });

  it("keeps different spaces and different pairs fully isolated", () => {
    bumpRelationship("space-1", "townHall-0", "townHall-1");
    expect(relationshipCount("space-2", "townHall-0", "townHall-1")).toBe(0);
    expect(relationshipCount("space-1", "bank-0", "bank-1")).toBe(0);
  });
});
