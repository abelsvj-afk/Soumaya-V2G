import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { CurvedLinkGeometryCache } from "./linkTube.js";

/**
 * Curved-link tube geometry reuse (Round 4 regression: three-forcegraph's own
 * layoutTick() otherwise constructs a brand-new TubeGeometry, every frame, for
 * every curved link — see linkTube.ts's doc comment). These tests exercise the
 * real THREE.BufferGeometry/Curve math (no mocks — same pattern as
 * graph3dHelpers.test.ts), not a WebGL render, which this environment can't do.
 */
describe("linkTube — CurvedLinkGeometryCache", () => {
  const A = { x: 0, y: 0, z: 0 };
  const B = { x: 100, y: 20, z: -30 };

  it("defers to three-forcegraph's own handling for zero width, zero curvature, or coincident endpoints", () => {
    const cache = new CurvedLinkGeometryCache();
    const mesh = new THREE.Mesh();
    const link = {};
    expect(cache.update(mesh, { start: A, end: B }, link, 0, 0.2)).toBe(false);
    expect(cache.update(mesh, { start: A, end: B }, link, 1.2, 0)).toBe(false);
    expect(cache.update(mesh, { start: A, end: A }, link, 1.2, 0.2)).toBe(false);
  });

  it("declines a non-Mesh object (e.g. a thin Line, for a culled/zero-width link)", () => {
    const cache = new CurvedLinkGeometryCache();
    const line = new THREE.Line(new THREE.BufferGeometry());
    expect(cache.update(line, { start: A, end: B }, {}, 1.2, 0.2)).toBe(false);
  });

  it("handles a normal curved link: returns true and builds a real, populated geometry", () => {
    const cache = new CurvedLinkGeometryCache();
    const mesh = new THREE.Mesh();
    const link = {};
    const handled = cache.update(mesh, { start: A, end: B }, link, 1.2, 0.2);
    expect(handled).toBe(true);
    expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry);
    const pos = mesh.geometry.getAttribute("position");
    expect(pos.count).toBeGreaterThan(0);
    // Not a degenerate all-zero buffer — real vertex data was written.
    let hasNonZero = false;
    for (let i = 0; i < pos.array.length; i++) {
      if ((pos.array as Float32Array)[i] !== 0) { hasNonZero = true; break; }
    }
    expect(hasNonZero).toBe(true);
    expect(mesh.geometry.index).not.toBeNull();
    expect(mesh.geometry.getAttribute("uv")).toBeDefined();
  });

  it("reuses the SAME geometry object across frames for the same link (the whole point of the fix)", () => {
    const cache = new CurvedLinkGeometryCache();
    const mesh = new THREE.Mesh();
    const link = {};
    cache.update(mesh, { start: A, end: B }, link, 1.2, 0.2);
    const geomAfterFrame1 = mesh.geometry;
    // Endpoints moved (simulating an orbiting node) — a real subsequent frame.
    cache.update(mesh, { start: { x: 5, y: 1, z: 0 }, end: { x: 90, y: 25, z: -20 } }, link, 1.2, 0.2);
    expect(mesh.geometry).toBe(geomAfterFrame1); // no new BufferGeometry constructed
  });

  it("updates vertex positions to reflect moved endpoints (no link-position freeze)", () => {
    const cache = new CurvedLinkGeometryCache();
    const mesh = new THREE.Mesh();
    const link = {};
    cache.update(mesh, { start: A, end: B }, link, 1.2, 0.2);
    const snapshot1 = (mesh.geometry.getAttribute("position").array as Float32Array).slice();
    cache.update(mesh, { start: { x: 400, y: 300, z: 200 }, end: { x: 500, y: -50, z: 10 } }, link, 1.2, 0.2);
    const snapshot2 = mesh.geometry.getAttribute("position").array as Float32Array;
    let differs = false;
    for (let i = 0; i < snapshot1.length; i++) {
      if (Math.abs(snapshot1[i]! - snapshot2[i]!) > 1e-6) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });

  it("gives two distinct links two independent geometries (no cross-link data corruption)", () => {
    const cache = new CurvedLinkGeometryCache();
    const meshA = new THREE.Mesh();
    const meshB = new THREE.Mesh();
    const linkA = {};
    const linkB = {};
    cache.update(meshA, { start: A, end: B }, linkA, 1.2, 0.2);
    cache.update(meshB, { start: { x: 999, y: 0, z: 0 }, end: { x: 1000, y: 5, z: 5 } }, linkB, 0.8, 0.3);
    expect(meshA.geometry).not.toBe(meshB.geometry);
    const posA = meshA.geometry.getAttribute("position").array as Float32Array;
    const posB = meshB.geometry.getAttribute("position").array as Float32Array;
    expect(Array.from(posA)).not.toEqual(Array.from(posB));
  });

  it("self-heals if something else reassigns mesh.geometry between frames (three-forcegraph's own onUpdateObj can, transiently — see module doc)", () => {
    const cache = new CurvedLinkGeometryCache();
    const mesh = new THREE.Mesh();
    const link = {};
    cache.update(mesh, { start: A, end: B }, link, 1.2, 0.2);
    const ours = mesh.geometry;
    mesh.geometry = new THREE.BufferGeometry(); // simulate the library's own transient reassignment
    const handled = cache.update(mesh, { start: A, end: B }, link, 1.2, 0.2);
    expect(handled).toBe(true);
    expect(mesh.geometry).toBe(ours); // reasserted back to the cached tube geometry
  });

  it("shares index/uv buffers across links (matches three-forcegraph's own cylinderGeometries sharing precedent)", () => {
    const cache = new CurvedLinkGeometryCache();
    const meshA = new THREE.Mesh();
    const meshB = new THREE.Mesh();
    cache.update(meshA, { start: A, end: B }, {}, 1.2, 0.2);
    cache.update(meshB, { start: A, end: B }, {}, 1.2, 0.2);
    expect(meshA.geometry.index).toBe(meshB.geometry.index);
    expect(meshA.geometry.getAttribute("uv")).toBe(meshB.geometry.getAttribute("uv"));
  });
});
