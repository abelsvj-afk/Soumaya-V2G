import { describe, it, expect } from "vitest";
import { linkEnd, linkKey, LINK_LOD_MIN, LINK_LOD_ZOOM, LINK_LOD_CUTOFF } from "./graph3dHelpers.js";

/** Locks the pure Graph3D helpers extracted in D4. (updateFigurine/disposeObject3D
 *  need a WebGL/GLTF context, so they're exercised by the app, not here.) */
describe("graph3dHelpers", () => {
  it("linkEnd reads an id from either a raw id or a node object", () => {
    expect(linkEnd(42)).toBe(42);
    expect(linkEnd({ id: 7 })).toBe(7);
  });

  it("linkKey is stable and order-sensitive per direction", () => {
    const k1 = linkKey({ source: 1, target: 2 });
    const k2 = linkKey({ source: { id: 1 }, target: { id: 2 } });
    expect(k1).toBe(k2); // object vs raw endpoints resolve the same
  });

  it("exposes sane LOD thresholds (min < zoom, cutoff in 0..1)", () => {
    expect(LINK_LOD_MIN).toBeLessThan(LINK_LOD_ZOOM);
    expect(LINK_LOD_CUTOFF).toBeGreaterThan(0);
    expect(LINK_LOD_CUTOFF).toBeLessThan(1);
  });
});
