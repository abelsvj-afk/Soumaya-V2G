import { describe, it, expect } from "vitest";
import { allBuildingSprites, buildingSpriteForPlace } from "./buildingSprites.js";
import { allPlaces } from "./regionLayout.js";

describe("buildingSprites", () => {
  it("gives every door-building a real sprite (never undefined/empty)", () => {
    for (const place of allPlaces()) {
      if (place.kind !== "door") continue;
      const sprite = buildingSpriteForPlace(place.id);
      expect(sprite.key.length).toBeGreaterThan(0);
      expect(sprite.url.length).toBeGreaterThan(0);
    }
  });

  it("falls back to a real sprite for a place with no dedicated mapping", () => {
    const sprite = buildingSpriteForPlace("bulletinBoard");
    expect(sprite.key.length).toBeGreaterThan(0);
  });

  it("allBuildingSprites lists every distinct sprite actually in use, deduplicated", () => {
    const used = new Set(
      allPlaces()
        .filter((p) => p.kind === "door")
        .map((p) => buildingSpriteForPlace(p.id).key),
    );
    const preloaded = new Set(allBuildingSprites().map((s) => s.key));
    for (const key of used) expect(preloaded.has(key)).toBe(true);
  });

  it("every preloaded sprite has a unique key (no accidental duplicate registration)", () => {
    const keys = allBuildingSprites().map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
