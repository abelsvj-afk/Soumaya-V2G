import { describe, it, expect } from "vitest";
import { CELESTIAL_CLASSES } from "@brain/shared";
import { rarityFor } from "./rarity.js";

describe("rarityFor", () => {
  it("maps every real CelestialClass to a distinct tier (D7 — all 7, not the brief's 6)", () => {
    const tiers = CELESTIAL_CLASSES.map((c) => rarityFor(c).tier);
    expect(new Set(tiers).size).toBe(CELESTIAL_CLASSES.length);
  });

  it("every tier carries a non-empty badge distinct from every other tier's badge", () => {
    const badges = CELESTIAL_CLASSES.map((c) => rarityFor(c).badge);
    for (const b of badges) expect(b.length).toBeGreaterThan(0);
    expect(new Set(badges).size).toBe(badges.length);
  });

  it("supergiant is Legendary, asteroid is Common", () => {
    expect(rarityFor("supergiant").label).toBe("Legendary");
    expect(rarityFor("asteroid").label).toBe("Common");
  });
});
