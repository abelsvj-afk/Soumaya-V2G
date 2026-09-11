import { describe, it, expect } from "vitest";
import { figurineOptions, hangarKeys, shipOptions, trailColorHex, trailOptions } from "./hangarOptions.js";

describe("hangarOptions (ports HangarPanel.tsx's exact gates)", () => {
  it("default ship is always unlocked; organic gates on the achievement OR the memory-count threshold", () => {
    expect(shipOptions(new Set(), 0).find((o) => o.value === "default")?.unlocked).toBe(true);
    expect(shipOptions(new Set(), 149).find((o) => o.value === "organic")?.unlocked).toBe(false);
    expect(shipOptions(new Set(), 150).find((o) => o.value === "organic")?.unlocked).toBe(true);
    expect(shipOptions(new Set(["organic_ship_skin"]), 0).find((o) => o.value === "organic")?.unlocked).toBe(true);
  });

  it("fusion_core and holographic ships gate purely on their named achievement", () => {
    expect(shipOptions(new Set(), 100000).find((o) => o.value === "fusion_core")?.unlocked).toBe(false);
    expect(shipOptions(new Set(["cosmic_voyager"]), 0).find((o) => o.value === "fusion_core")?.unlocked).toBe(true);
    expect(shipOptions(new Set(["sentinel_command"]), 0).find((o) => o.value === "holographic")?.unlocked).toBe(true);
  });

  it("trail colors gate on their exact named achievements", () => {
    const unlocked = new Set(["consistent_pilot"]);
    const opts = trailOptions(unlocked);
    expect(opts.find((o) => o.value === "blue")?.unlocked).toBe(true);
    expect(opts.find((o) => o.value === "neon")?.unlocked).toBe(true);
    expect(opts.find((o) => o.value === "gold")?.unlocked).toBe(false);
  });

  it("figurines: station/satellite are always available; star_center/dyson gate on count OR achievement", () => {
    const opts = figurineOptions(new Set(), 250);
    expect(opts.find((o) => o.value === "station")?.unlocked).toBe(true);
    expect(opts.find((o) => o.value === "star_center")?.unlocked).toBe(true); // >=100
    expect(opts.find((o) => o.value === "dyson_sphere")?.unlocked).toBe(true); // >=250
    expect(figurineOptions(new Set(), 0).find((o) => o.value === "dyson_sphere")?.unlocked).toBe(false);
  });

  it("hangarKeys namespaces every key by spaceId (never a shared/global cosmetic)", () => {
    const keys = hangarKeys("space-1");
    expect(keys.ship).toBe("brain.hangar.ship.space-1");
    expect(keys.trail).toBe("brain.hangar.trail.space-1");
  });

  it("trailColorHex gives every real trail option a distinct color, and a safe default for anything else", () => {
    const colors = ["blue", "neon", "gold", "purple"].map(trailColorHex);
    expect(new Set(colors).size).toBe(4); // all distinct
    expect(trailColorHex("blue")).toBe(trailColorHex("anything-unrecognized")); // graceful fallback
    expect(() => trailColorHex("")).not.toThrow();
  });
});
