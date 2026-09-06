import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as THREE from "three";
import { makeNodeObject, nodeVisualCacheKey, releaseNodeTextures } from "./nodeObject.js";
import type { GraphNode } from "@brain/shared";

/**
 * Pins the Performance Program Stage 4 geometry diet: a flat SphereGeometry(size,48,48)
 * for every star/planet regardless of tier or how many screen pixels it covers was real
 * waste (~4600 tris for something often 40px on screen). Segment counts now follow the
 * same star/planet/rocky role split as the shader material choice.
 *
 * happy-dom (this project's test environment) has no real 2D canvas context, and
 * makeNodeObject's label/glow/surface-texture helpers need one — a stub covering the
 * handful of methods they actually call (scoped to this file, restored after) is enough
 * to exercise the real object-construction code instead of skipping it.
 */
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as any).getContext = function () {
    const grad = { addColorStop: () => {} };
    return {
      font: "",
      textBaseline: "",
      shadowColor: "",
      shadowBlur: 0,
      globalAlpha: 1,
      set fillStyle(_v: unknown) {},
      measureText: () => ({ width: 10 }),
      fillText: () => {},
      fillRect: () => {},
      createRadialGradient: () => grad,
      beginPath: () => {},
      ellipse: () => {},
      arc: () => {},
      fill: () => {},
    };
  };
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

function node(celestial: GraphNode["celestial"], extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 1,
    label: "test",
    type: "memory" as any,
    content: "",
    createdAt: new Date().toISOString(),
    celestial,
    ...extra,
  } as GraphNode;
}

// Every body carries TWO spheres — the full-detail mesh and the low-poly "macro" LOD
// body (always 14x14, added alongside it, swapped in by distance in Graph3D's tick loop)
// — so this must target the full-detail one specifically via its isFidelity tag rather
// than grabbing whichever SphereGeometry traverse() happens to visit last.
function findFullDetailSphere(obj: THREE.Object3D): THREE.SphereGeometry {
  let found: THREE.SphereGeometry | undefined;
  obj.traverse((o: any) => {
    if (o.isMesh && o.userData?.isFidelity && o.geometry?.type === "SphereGeometry") found = o.geometry;
  });
  if (!found) throw new Error("no full-detail SphereGeometry found");
  return found;
}

describe("nodeObject — Stage 4 geometry segment diet", () => {
  it("stars get 32x24 (their granule shader reads at a glance, usually the biggest/closest body)", () => {
    const geom = findFullDetailSphere(makeNodeObject(node("star")));
    expect(geom.parameters.widthSegments).toBe(32);
    expect(geom.parameters.heightSegments).toBe(24);
  });

  it("planets/giants get 24x16 (terrain rarely needs more detail than that)", () => {
    for (const cls of ["planet", "gas_giant", "giant"] as const) {
      const geom = findFullDetailSphere(makeNodeObject(node(cls)));
      expect(geom.parameters.widthSegments).toBe(24);
      expect(geom.parameters.heightSegments).toBe(16);
    }
  });

  it("moons stay at the pre-existing conservative 24x24", () => {
    const geom = findFullDetailSphere(makeNodeObject(node("moon")));
    expect(geom.parameters.widthSegments).toBe(24);
    expect(geom.parameters.heightSegments).toBe(24);
  });

  it("asteroids' full-detail body is still an icosahedron, not a sphere", () => {
    let isIco = false;
    // Every body also carries the low-poly macro LOD sphere (see findFullDetailSphere's
    // comment) — checking every isFidelity mesh, not just the last one traverse() visits.
    makeNodeObject(node("asteroid")).traverse((o: any) => {
      if (o.isMesh && o.userData?.isFidelity) isIco = o.geometry?.type === "IcosahedronGeometry";
    });
    expect(isIco).toBe(true);
  });
});

/**
 * Performance Program Stage 7: labelTexCache/glowTexCache never evicted anything —
 * one canvas texture per unique label string (or glow color+size) forever, real VRAM
 * that only ever grew. Fixed with reference counting rather than a blind size-capped
 * LRU (which risks disposing a texture a still-live sprite's material.map is actively
 * pointing at) — these tests pin that a shared texture is reused across sprites with
 * the same cache key, and only actually disposed once EVERY referencing sprite has
 * been released, never before.
 */
function findLabelSprite(obj: THREE.Object3D): THREE.Sprite {
  let found: THREE.Sprite | undefined;
  obj.traverse((o: any) => {
    if (o.isSprite && o.userData?.labelCacheKey != null && !found) found = o;
  });
  if (!found) throw new Error("no label sprite found");
  return found;
}

describe("nodeObject — Stage 7 label/glow texture refcounting", () => {
  it("two sprites built with the same label text share ONE texture instance", () => {
    const label = `shared-label-${Math.random()}`;
    const a = findLabelSprite(makeNodeObject(node("star", { label, id: 301 })));
    const b = findLabelSprite(makeNodeObject(node("star", { label, id: 302 })));
    expect((a.material as THREE.SpriteMaterial).map).toBe((b.material as THREE.SpriteMaterial).map);
  });

  it("a shared label texture is only disposed once every referencing sprite is released", () => {
    const label = `release-label-${Math.random()}`;
    const a = makeNodeObject(node("star", { label, id: 401 }));
    const b = makeNodeObject(node("star", { label, id: 402 }));
    const map = (findLabelSprite(a).material as THREE.SpriteMaterial).map as THREE.Texture;
    const disposeSpy = vi.spyOn(map, "dispose");

    releaseNodeTextures(a);
    expect(disposeSpy).not.toHaveBeenCalled(); // b's sprite still references the same cache entry

    releaseNodeTextures(b);
    expect(disposeSpy).toHaveBeenCalledTimes(1); // nothing left referencing it
  });

  it("releasing a node whose label text is unique to it disposes immediately", () => {
    const label = `solo-label-${Math.random()}`;
    const obj = makeNodeObject(node("star", { label, id: 501 }));
    const map = (findLabelSprite(obj).material as THREE.SpriteMaterial).map as THREE.Texture;
    const disposeSpy = vi.spyOn(map, "dispose");

    releaseNodeTextures(obj);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it("releasing a node with no tagged children (or twice) is a safe no-op", () => {
    const g = new THREE.Group(); // nothing tagged
    expect(() => releaseNodeTextures(g)).not.toThrow();

    const label = `double-release-${Math.random()}`;
    const obj = makeNodeObject(node("planet", { label, id: 601 }));
    releaseNodeTextures(obj);
    expect(() => releaseNodeTextures(obj)).not.toThrow(); // refcount floor, no negative underflow
  });
});

/**
 * Performance Program Round 3 (memory scaling audit): nodeThreeObjCacheRef's cache key
 * used to include raw `entropy` — a continuously-drifting float — so it invalidated on
 * almost every `refresh()` even when nothing visually meaningful changed. Fixed by
 * bucketing entropy (see `bucketEntropy`/`nodeVisualCacheKey` in nodeObject.ts) instead of
 * dropping it outright, since entropy DOES affect the constructed object's color tint and
 * pulse vitality. These tests pin the two halves of that trade-off directly against the
 * exported key function, with no THREE/canvas machinery involved.
 */
describe("nodeObject — Round 3 node-object cache key (entropy bucketing)", () => {
  function baseNode(over: Partial<GraphNode> = {}): GraphNode {
    return {
      id: 1,
      label: "Ping the dentist",
      type: "memory" as any,
      content: "",
      createdAt: new Date().toISOString(),
      celestial: "planet",
      importance: 0.5,
      degree: 2,
      kind: undefined,
      color: "#88aaff",
      entropy: 0,
      ...over,
    } as GraphNode;
  }

  it("Test A — a small, insignificant entropy drift (same bucket) reuses cache identity", () => {
    const a = nodeVisualCacheKey(baseNode({ entropy: 0.4 }));
    const b = nodeVisualCacheKey(baseNode({ entropy: 0.42 })); // a typical refresh-to-refresh drift is ~0.002; this is generous and still same-bucket
    expect(a).toBe(b);
  });

  it("Test A — undefined/null entropy and exact-zero entropy also collapse together", () => {
    const a = nodeVisualCacheKey(baseNode({ entropy: undefined }));
    const b = nodeVisualCacheKey(baseNode({ entropy: 0 }));
    expect(a).toBe(b);
  });

  it("Test B — a materially different entropy (crossing several buckets) still invalidates the cache", () => {
    const cold = nodeVisualCacheKey(baseNode({ entropy: 0.9 }));
    const warm = nodeVisualCacheKey(baseNode({ entropy: 0.1 }));
    expect(cold).not.toBe(warm);
  });

  it("Test B — a memory being 'tended' (entropy resets to 0) is a real, distinct event", () => {
    const stale = nodeVisualCacheKey(baseNode({ entropy: 0.6 }));
    const tended = nodeVisualCacheKey(baseNode({ entropy: 0 }));
    expect(stale).not.toBe(tended);
  });

  it("Test B — every other construction-relevant field still fully distinguishes identity", () => {
    const base = baseNode();
    const key = nodeVisualCacheKey(base);
    expect(nodeVisualCacheKey(baseNode({ label: "Something else" }))).not.toBe(key);
    expect(nodeVisualCacheKey(baseNode({ importance: 0.9 }))).not.toBe(key);
    expect(nodeVisualCacheKey(baseNode({ degree: 7 }))).not.toBe(key);
    expect(nodeVisualCacheKey(baseNode({ color: "#ff0000" }))).not.toBe(key);
    expect(nodeVisualCacheKey(baseNode({ kind: "action" as any }))).not.toBe(key);
  });

  it("Test B — entropy is clamped to [0,1] before bucketing (out-of-range input can't collapse into the wrong bucket)", () => {
    expect(nodeVisualCacheKey(baseNode({ entropy: -5 }))).toBe(nodeVisualCacheKey(baseNode({ entropy: 0 })));
    expect(nodeVisualCacheKey(baseNode({ entropy: 5 }))).toBe(nodeVisualCacheKey(baseNode({ entropy: 1 })));
  });
});
