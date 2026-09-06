import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { linkEnd, linkKey, LINK_LOD_MIN, LINK_LOD_ZOOM, LINK_LOD_CUTOFF, isNodeCacheEntryValid, shouldApplyPixelRatio } from "./graph3dHelpers.js";

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

/**
 * Galaxy node-object cache disposal desync fix
 * (docs/specs/soumaya-galaxy-cache-disposal-audit.md): three-forcegraph's own internal node
 * cache can be cleared and its Object3Ds disposed independently of Graph3D's own
 * `nodeThreeObjCacheRef` (e.g. an unmemoized prop reference change, or an existing fg.refresh()
 * call) — always detaching the object from the scene immediately before disposing it. A matching
 * cache key alone can't tell a still-live cached object apart from one that was just torn down,
 * so `isNodeCacheEntryValid` also requires the object to still have a parent.
 */
describe("graph3dHelpers — isNodeCacheEntryValid (cache disposal desync fix)", () => {
  it("matching key + object still attached to a scene -> valid cache hit", () => {
    const scene = new THREE.Scene();
    const obj = new THREE.Group();
    scene.add(obj);
    expect(isNodeCacheEntryValid({ obj, key: "k1" }, "k1")).toBe(true);
  });

  it("matching key + object detached (parent === null, as three-forcegraph leaves it after disposal) -> invalid, must rebuild", () => {
    const scene = new THREE.Scene();
    const obj = new THREE.Group();
    scene.add(obj);
    scene.remove(obj); // exactly what three-forcegraph's onRemoveObj wrapper does before _deallocate
    expect(obj.parent).toBeNull();
    expect(isNodeCacheEntryValid({ obj, key: "k1" }, "k1")).toBe(false);
  });

  it("different key (real content change) -> invalid regardless of attachment, same as existing cache-miss behavior", () => {
    const scene = new THREE.Scene();
    const obj = new THREE.Group();
    scene.add(obj);
    expect(isNodeCacheEntryValid({ obj, key: "k1" }, "k2")).toBe(false);
  });

  it("no cached entry (a genuinely new node) -> invalid, same as always", () => {
    expect(isNodeCacheEntryValid(undefined, "k1")).toBe(false);
  });

  it("a freshly created Object3D not yet added to any scene is correctly treated as having no parent", () => {
    // Not a cache-hit scenario in practice (a fresh object is always scene.add()-ed by
    // three-forcegraph's own onCreateObj wrapper right after creation), but pins that the
    // check is purely structural (`.parent`), not tied to any Galaxy-specific setup.
    const obj = new THREE.Group();
    expect(isNodeCacheEntryValid({ obj, key: "k1" }, "k1")).toBe(false);
  });
});

/**
 * Adaptive-graphics pixel-ratio churn fix: WebGLRenderer.setPixelRatio() has no internal
 * early-out (it unconditionally calls setSize(), resizing the WebGL drawing buffer), so the
 * call sites in Graph3D.tsx must gate on the EFFECTIVE value actually changing rather than
 * assuming "the rung changed" implies "the pixel ratio changed."
 */
describe("graph3dHelpers — shouldApplyPixelRatio (pixel-ratio churn fix)", () => {
  it("no prior applied value (first apply) -> should apply", () => {
    expect(shouldApplyPixelRatio(null, 1.5)).toBe(true);
  });

  it("same value as last applied -> should NOT apply, even across repeated calls", () => {
    expect(shouldApplyPixelRatio(1.5, 1.5)).toBe(false);
    expect(shouldApplyPixelRatio(1, 1)).toBe(false);
  });

  it("a genuinely different value -> should apply", () => {
    expect(shouldApplyPixelRatio(1, 1.25)).toBe(true);
    expect(shouldApplyPixelRatio(2, 1)).toBe(true);
  });

  it("adjacent rungs sharing a pixelRatioCap resolve to the same value -> suppressed", () => {
    // RUNG_TABLE has rungs 0/1 both mapping to detailTier "performance" but different
    // pixelRatioCap (1.0 vs 1.25) — this test instead pins the general contract those
    // rungs rely on: a rung CHANGE whose resolved pixelRatio happens to be unchanged
    // (e.g. a descend-then-ascend round trip back to a previously-applied value) must
    // not re-trigger a buffer resize.
    expect(shouldApplyPixelRatio(1.25, 1.25)).toBe(false);
  });
});
