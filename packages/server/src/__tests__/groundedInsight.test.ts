import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { getGroundedInsight, setGroundedInsight } from "../identity.js";

let handle: DbHandle;
beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

describe("grounded-insight chat toggle (#5b sibling)", () => {
  it("defaults ON, flips OFF/ON, and is space-scoped", () => {
    expect(getGroundedInsight(handle.sqlite, "legacy")).toBe(true); // default

    setGroundedInsight(handle.sqlite, "legacy", false);
    expect(getGroundedInsight(handle.sqlite, "legacy")).toBe(false);

    setGroundedInsight(handle.sqlite, "legacy", true);
    expect(getGroundedInsight(handle.sqlite, "legacy")).toBe(true);

    // A different brain keeps its own default (unaffected).
    setGroundedInsight(handle.sqlite, "legacy", false);
    expect(getGroundedInsight(handle.sqlite, "other")).toBe(true);
    expect(getGroundedInsight(handle.sqlite, "legacy")).toBe(false);
  });
});
