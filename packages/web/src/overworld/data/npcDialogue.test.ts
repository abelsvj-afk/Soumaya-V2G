import { describe, it, expect } from "vitest";
import { asSocietyNpcId, dialogueFor, npcProfile } from "./npcDialogue.js";

describe("npcDialogue", () => {
  describe("asSocietyNpcId", () => {
    it("recognizes the two Town Hall NPC ids", () => {
      expect(asSocietyNpcId("townHall-0")).toBe("townHall-0");
      expect(asSocietyNpcId("townHall-1")).toBe("townHall-1");
    });

    it("tolerates every other attendant id gracefully (never throws, always null)", () => {
      expect(asSocietyNpcId("bank-0")).toBeNull();
      expect(asSocietyNpcId("library-1")).toBeNull();
    });
  });

  it("gives each Town Hall NPC its own name and at least one job line", () => {
    expect(npcProfile("townHall-0").name).not.toBe(npcProfile("townHall-1").name);
    expect(npcProfile("townHall-0").jobLines.length).toBeGreaterThan(0);
    expect(npcProfile("townHall-1").jobLines.length).toBeGreaterThan(0);
  });

  describe("dialogueFor", () => {
    it("only draws from job lines when nothing is unlocked and they're strangers", () => {
      const line = dialogueFor("townHall-0", new Set(), "strangers", "Dez", 0);
      expect(npcProfile("townHall-0").jobLines).toContain(line);
    });

    it("is deterministic — same inputs always yield the same line", () => {
      const a = dialogueFor("townHall-0", new Set(), "strangers", "Dez", 3);
      const b = dialogueFor("townHall-0", new Set(), "strangers", "Dez", 3);
      expect(a).toBe(b);
    });

    it("unlocks a personal line once the matching real achievement is earned", () => {
      const unlocked = new Set(["cartographer"]);
      const pool: string[] = [];
      for (let seed = 0; seed < 20; seed++) {
        pool.push(dialogueFor("townHall-0", unlocked, "strangers", "Dez", seed));
      }
      expect(pool).toContain("Five constellations charted now — I've been meaning to put one up on the town map.");
    });

    it("never surfaces a personal line whose achievement isn't earned yet", () => {
      for (let seed = 0; seed < 20; seed++) {
        const line = dialogueFor("townHall-0", new Set(), "strangers", "Dez", seed);
        expect(line).not.toBe("Five constellations charted now — I've been meaning to put one up on the town map.");
      }
    });

    it("only surfaces the friend line once the relationship tier is actually 'friends'", () => {
      for (let seed = 0; seed < 20; seed++) {
        const line = dialogueFor("townHall-0", new Set(), "acquaintances", "Dez", seed);
        expect(line).not.toContain("we go back a while now");
      }
      const pool: string[] = [];
      for (let seed = 0; seed < 20; seed++) {
        pool.push(dialogueFor("townHall-0", new Set(), "friends", "Dez", seed));
      }
      expect(pool.some((l) => l.includes("we go back a while now"))).toBe(true);
    });

    it("threads the other NPC's real name into the friend line", () => {
      const pool: string[] = [];
      for (let seed = 0; seed < 20; seed++) {
        pool.push(dialogueFor("townHall-1", new Set(), "friends", "Mira", seed));
      }
      expect(pool.some((l) => l.includes("Mira"))).toBe(true);
    });
  });
});
