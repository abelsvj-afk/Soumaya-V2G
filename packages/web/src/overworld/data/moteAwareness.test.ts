import { describe, it, expect } from "vitest";
import { moteAwarenessLine } from "./moteAwareness.js";

describe("moteAwareness (backlog #82)", () => {
  it("never fires with fewer than 2 active thoughts, at any seed", () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(moteAwarenessLine("bank-0", seed, 0)).toBeNull();
      expect(moteAwarenessLine("bank-0", seed, 1)).toBeNull();
    }
  });

  it("fires at least once across a real range of seeds once the real trigger is met", () => {
    let firedAny = false;
    for (let seed = 0; seed < 50; seed++) {
      if (moteAwarenessLine("bank-0", seed, 3) !== null) firedAny = true;
    }
    expect(firedAny).toBe(true);
  });

  it("is genuinely low-frequency, not constant — most rolls stay null even when eligible", () => {
    let fired = 0;
    const total = 80;
    for (let seed = 0; seed < total; seed++) {
      if (moteAwarenessLine("library-1", seed, 5) !== null) fired++;
    }
    expect(fired).toBeGreaterThan(0);
    expect(fired).toBeLessThan(total / 2);
  });

  it("is deterministic — same npcId/seed/count always yields the same result", () => {
    const a = moteAwarenessLine("gym-0", 7, 4);
    const b = moteAwarenessLine("gym-0", 7, 4);
    expect(a).toBe(b);
  });

  it("never returns an empty string — either a real line or null, nothing in between", () => {
    for (let seed = 0; seed < 50; seed++) {
      const line = moteAwarenessLine("market-1", seed, 3);
      if (line !== null) expect(line.length).toBeGreaterThan(0);
    }
  });
});
