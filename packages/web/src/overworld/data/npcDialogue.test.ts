import { describe, it, expect } from "vitest";
import { asSocietyNpcId, dialogueFor, npcProfile, partnerNpcId } from "./npcDialogue.js";

const DOOR_BUILDING_IDS = ["bank", "library", "sanctuary", "postOffice", "observatory", "gym", "market", "townHall", "park", "hangar"];

describe("npcDialogue", () => {
  describe("asSocietyNpcId", () => {
    it("recognizes every door-building's two attendant ids", () => {
      for (const placeId of DOOR_BUILDING_IDS) {
        expect(asSocietyNpcId(`${placeId}-0`)).toBe(`${placeId}-0`);
        expect(asSocietyNpcId(`${placeId}-1`)).toBe(`${placeId}-1`);
      }
    });

    it("tolerates a place with no NPC Society profiles (e.g. the Bulletin Board object) gracefully — never throws, always null", () => {
      expect(asSocietyNpcId("bulletinBoard-0")).toBeNull();
      expect(asSocietyNpcId("soumaya-0")).toBeNull();
      expect(asSocietyNpcId("nonsense")).toBeNull();
    });
  });

  describe("npcProfile", () => {
    it("gives every one of the 20 attendants its own name and at least one job line", () => {
      const names = new Set<string>();
      for (const placeId of DOOR_BUILDING_IDS) {
        for (const index of [0, 1] as const) {
          const p = npcProfile(`${placeId}-${index}`);
          expect(p.jobLines.length).toBeGreaterThan(0);
          expect(p.name.length).toBeGreaterThan(0);
          names.add(p.name);
        }
      }
      expect(names.size).toBe(20); // every one of the 20 attendants has a distinct name
    });

    it("throws on an unknown npc id rather than silently returning garbage", () => {
      expect(() => npcProfile("not-a-real-npc")).toThrow();
    });
  });

  describe("partnerNpcId", () => {
    it("resolves to the OTHER attendant at the same building", () => {
      expect(partnerNpcId("bank-0")).toBe("bank-1");
      expect(partnerNpcId("bank-1")).toBe("bank-0");
      expect(partnerNpcId("market-0")).toBe("market-1");
    });

    it("returns null for an unknown npc id", () => {
      expect(partnerNpcId("not-a-real-npc")).toBeNull();
    });
  });

  describe("dialogueFor", () => {
    it("only draws from job lines when nothing is unlocked and they're strangers", () => {
      const line = dialogueFor("townHall-0", new Set(), "strangers", "Dez", 0);
      expect(npcProfile("townHall-0").jobLines).toContain(line);
    });

    it("is deterministic — same inputs always yield the same line", () => {
      const a = dialogueFor("bank-0", new Set(), "strangers", "Otis", 3);
      const b = dialogueFor("bank-0", new Set(), "strangers", "Otis", 3);
      expect(a).toBe(b);
    });

    it("unlocks a personal line once the matching real achievement is earned", () => {
      const unlocked = new Set(["goal_achiever"]);
      const pool: string[] = [];
      for (let seed = 0; seed < 20; seed++) {
        pool.push(dialogueFor("bank-0", unlocked, "strangers", "Otis", seed));
      }
      expect(pool).toContain("A goal carried all the way to done. That's the kind of news that makes a teller's whole week.");
    });

    it("never surfaces a personal line whose achievement isn't earned yet", () => {
      for (let seed = 0; seed < 20; seed++) {
        const line = dialogueFor("bank-0", new Set(), "strangers", "Otis", seed);
        expect(line).not.toContain("teller's whole week");
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

    it("works for a newly-added building's NPCs (Market, Park), not just the original Town Hall pair", () => {
      expect(dialogueFor("market-0", new Set(), "strangers", "Hale", 0).length).toBeGreaterThan(0);
      expect(dialogueFor("park-1", new Set(), "strangers", "Marisol", 0).length).toBeGreaterThan(0);
    });
  });
});
