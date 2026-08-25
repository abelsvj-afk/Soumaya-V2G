import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as THREE from "three";
import { makeNodeObject } from "./nodeObject.js";
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
