import { describe, it, expect } from "vitest";
import { CYCLE_TICKS, scheduleStateAt } from "./npcSchedule.js";

describe("npcSchedule", () => {
  it("is deterministic — same npc id and tick always yields the same state", () => {
    for (const tick of [0, 1, 7, 39, 100]) {
      expect(scheduleStateAt("townHall-0", tick)).toBe(scheduleStateAt("townHall-0", tick));
    }
  });

  it("cycles through working, break, and home within one period", () => {
    const seen = new Set<string>();
    for (let tick = 0; tick < CYCLE_TICKS; tick++) {
      seen.add(scheduleStateAt("townHall-0", tick));
    }
    expect(seen).toEqual(new Set(["working", "break", "home"]));
  });

  it("repeats identically every CYCLE_TICKS ticks", () => {
    for (let tick = 0; tick < CYCLE_TICKS; tick++) {
      expect(scheduleStateAt("townHall-0", tick)).toBe(scheduleStateAt("townHall-0", tick + CYCLE_TICKS));
    }
  });

  it("desyncs two different npc ids — they aren't always in the same state", () => {
    let sawDifference = false;
    for (let tick = 0; tick < CYCLE_TICKS; tick++) {
      if (scheduleStateAt("townHall-0", tick) !== scheduleStateAt("townHall-1", tick)) {
        sawDifference = true;
        break;
      }
    }
    expect(sawDifference).toBe(true);
  });

  it("both Town Hall NPCs land on break at the same tick at least once per cycle (the interaction window must actually occur)", () => {
    let overlap = false;
    for (let tick = 0; tick < CYCLE_TICKS; tick++) {
      if (scheduleStateAt("townHall-0", tick) === "break" && scheduleStateAt("townHall-1", tick) === "break") {
        overlap = true;
        break;
      }
    }
    expect(overlap).toBe(true);
  });

  it("never throws and always returns a valid state for an unmapped/arbitrary npc id", () => {
    expect(() => scheduleStateAt("some-future-npc", 12345)).not.toThrow();
    expect(["working", "break", "home"]).toContain(scheduleStateAt("some-future-npc", 12345));
  });
});
