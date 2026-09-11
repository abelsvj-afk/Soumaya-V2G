import { describe, it, expect } from "vitest";
import { nextAutonomyBatch } from "./autonomyBatch.js";

describe("nextAutonomyBatch", () => {
  it("returns every space and cursor 0 when the whole list fits under the cap", () => {
    const ids = ["a", "b", "c"];
    const { batch, nextCursor } = nextAutonomyBatch(ids, 0, 20);
    expect(batch).toEqual(["a", "b", "c"]);
    expect(nextCursor).toBe(0);
  });

  it("returns an empty batch for an empty space list", () => {
    expect(nextAutonomyBatch([], 0, 20)).toEqual({ batch: [], nextCursor: 0 });
  });

  it("caps the batch size and advances the cursor by exactly the batch size", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const { batch, nextCursor } = nextAutonomyBatch(ids, 0, 2);
    expect(batch).toEqual(["a", "b"]);
    expect(nextCursor).toBe(2);
  });

  it("continues from the previous cursor on the next tick", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const first = nextAutonomyBatch(ids, 0, 2);
    const second = nextAutonomyBatch(ids, first.nextCursor, 2);
    expect(second.batch).toEqual(["c", "d"]);
    expect(second.nextCursor).toBe(4);
  });

  it("wraps around the end of the list back to the start", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const { batch, nextCursor } = nextAutonomyBatch(ids, 4, 2);
    expect(batch).toEqual(["e", "a"]);
    expect(nextCursor).toBe(1);
  });

  it("visits every space exactly once over enough ticks (fairness), never starving the tail", () => {
    const ids = Array.from({ length: 23 }, (_, i) => `space-${i}`);
    const seen = new Set<string>();
    let cursor = 0;
    for (let tick = 0; tick < 5; tick++) {
      const { batch, nextCursor } = nextAutonomyBatch(ids, cursor, 5);
      for (const id of batch) seen.add(id);
      cursor = nextCursor;
    }
    expect(seen.size).toBe(ids.length);
  });

  it("with a batch size evenly dividing the list, the cursor returns to 0 after a full cycle", () => {
    const ids = ["a", "b", "c", "d"];
    let cursor = 0;
    for (let i = 0; i < 4; i++) {
      cursor = nextAutonomyBatch(ids, cursor, 1).nextCursor;
    }
    expect(cursor).toBe(0);
  });

  it("normalizes a negative cursor instead of throwing or producing a negative index", () => {
    const ids = ["a", "b", "c"];
    const { batch } = nextAutonomyBatch(ids, -1, 1);
    expect(batch).toEqual(["c"]);
  });

  it("normalizes a stale cursor after the space list shrank, instead of throwing", () => {
    const ids = ["a", "b"];
    const { batch } = nextAutonomyBatch(ids, 10, 1);
    expect(batch.length).toBe(1);
    expect(ids).toContain(batch[0]);
  });

  it("falls back to processing every space when maxPerTick is non-finite or non-positive (bogus config never wedges the cursor)", () => {
    const ids = ["a", "b", "c"];
    expect(nextAutonomyBatch(ids, 0, NaN).batch).toEqual(ids);
    expect(nextAutonomyBatch(ids, 0, 0).batch).toEqual(ids);
    expect(nextAutonomyBatch(ids, 0, -5).batch).toEqual(ids);
    expect(nextAutonomyBatch(ids, 0, Infinity).batch).toEqual(ids);
  });

  it("recovers from a NaN cursor instead of propagating it forever", () => {
    const ids = ["a", "b", "c"];
    const { batch, nextCursor } = nextAutonomyBatch(ids, NaN, 1);
    expect(batch).toEqual(["a"]);
    expect(Number.isFinite(nextCursor)).toBe(true);
  });
});
