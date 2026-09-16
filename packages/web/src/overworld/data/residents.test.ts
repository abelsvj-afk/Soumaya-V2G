import { describe, it, expect } from "vitest";
import { allResidentNpcIds, npcDisplayName, residentName } from "./residents.js";
import { allSocietyNpcIds } from "./npcDialogue.js";

describe("residents — population growth (population-growth.md, task #118)", () => {
  it("has a real, fixed, modest roster of Resident ids", () => {
    const ids = allResidentNpcIds();
    expect(ids.length).toBe(4);
    expect(new Set(ids).size).toBe(4); // all distinct
  });

  it("resolves each real Resident id to a real name, and null for anything else", () => {
    for (const id of allResidentNpcIds()) {
      expect(typeof residentName(id)).toBe("string");
      expect(residentName(id)!.length).toBeGreaterThan(0);
    }
    expect(residentName("nonexistent")).toBeNull();
    expect(residentName("bank-0")).toBeNull(); // a real society NPC id, not a Resident
  });

  it("no Resident id collides with a real society NPC id", () => {
    const societyIds = new Set(allSocietyNpcIds());
    for (const id of allResidentNpcIds()) {
      expect(societyIds.has(id)).toBe(false);
    }
  });

  it("npcDisplayName resolves a real society NPC id without ever needing a Resident lookup", () => {
    const [firstSociety] = allSocietyNpcIds();
    expect(npcDisplayName(firstSociety!)).toBe("Priya"); // bank-0's real name, per npcDialogue.ts
  });

  it("npcDisplayName resolves a real Resident id", () => {
    const [firstResident] = allResidentNpcIds();
    expect(npcDisplayName(firstResident!)).toBe(residentName(firstResident!));
  });

  it("npcDisplayName never throws for an unknown id — falls back to the raw id", () => {
    expect(npcDisplayName("nonexistent")).toBe("nonexistent");
  });
});
