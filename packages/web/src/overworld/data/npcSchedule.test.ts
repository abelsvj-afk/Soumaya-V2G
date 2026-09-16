import { describe, it, expect } from "vitest";
import { CYCLE_TICKS, WORKING_TICKS, countWorkingTicks, scheduleStateAt } from "./npcSchedule.js";

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

  describe("countWorkingTicks (population-driven passive income, simcity-realism-pass.md)", () => {
    it("matches a brute-force count over exactly one real cycle, for several different offsets", () => {
      for (const start of [0, 5, 37, 100]) {
        let brute = 0;
        for (let tick = start + 1; tick <= start + CYCLE_TICKS; tick++) {
          if (scheduleStateAt("bank-0", tick) === "working") brute++;
        }
        expect(countWorkingTicks("bank-0", start, start + CYCLE_TICKS)).toBe(brute);
        expect(brute).toBe(WORKING_TICKS); // a full cycle always contains exactly this many
      }
    });

    it("matches a brute-force count over several real, non-cycle-aligned ranges", () => {
      for (const [from, to] of [
        [0, 13],
        [3, 3 + CYCLE_TICKS * 2 + 17],
        [100, 100 + CYCLE_TICKS * 5 + 1],
      ] as const) {
        let brute = 0;
        for (let tick = from + 1; tick <= to; tick++) {
          if (scheduleStateAt("mayorsHall-1", tick) === "working") brute++;
        }
        expect(countWorkingTicks("mayorsHall-1", from, to)).toBe(brute);
      }
    });

    it("returns 0 for a real empty or backwards range", () => {
      expect(countWorkingTicks("bank-0", 50, 50)).toBe(0);
      expect(countWorkingTicks("bank-0", 50, 10)).toBe(0);
    });

    it("scales roughly linearly with real elapsed ticks across many full cycles — no runaway growth or truncation", () => {
      const oneCycle = countWorkingTicks("bank-0", 0, CYCLE_TICKS);
      const tenCycles = countWorkingTicks("bank-0", 0, CYCLE_TICKS * 10);
      expect(tenCycles).toBe(oneCycle * 10);
    });

    it("stays fast across a real multi-day gap — proves the O(1)-full-cycle math, never a per-tick loop over the whole gap", () => {
      const start = performance.now();
      const threeDaysOfTicks = Math.floor((3 * 86_400_000) / 1500);
      countWorkingTicks("bank-0", 0, threeDaysOfTicks);
      expect(performance.now() - start).toBeLessThan(50);
    });
  });
});
