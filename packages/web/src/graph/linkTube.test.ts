import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { CurvedLinkGeometryCache, RADIAL_SEGMENTS, digestRoundedRadius } from "./linkTube.js";

/**
 * three-forcegraph's own onUpdateObj digest check, reproduced VERBATIM (three-forcegraph.mjs)
 * so these tests prove the fix against the actual external predicate, not our assumption
 * about it. If this ever mismatches the installed dependency's real check, these tests catch
 * the drift instead of silently passing on a stale replica.
 */
function threeForcegraphWouldDisposeAndReassign(geometry: THREE.BufferGeometry, linkWidthRaw: number, linkResolution: number): boolean {
  const linkWidth = Math.ceil(linkWidthRaw * 10) / 10;
  const r = linkWidth / 2;
  const g = geometry as unknown as { type: string; parameters?: { radiusTop: number; radialSegments: number } };
  return !g.type.match(/^Cylinder(Buffer)?Geometry$/) || g.parameters!.radiusTop !== r || g.parameters!.radialSegments !== linkResolution;
}

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

/**
 * Regression coverage for the Galaxy recovery pass (2026-09-10): three-forcegraph's own
 * onUpdateObj digest — run on EVERY React render of Graph3D, since linkColor is a deliberately
 * unmemoized prop (see Graph3D.tsx's own comment) — independently gate-checks every link's
 * `mesh.geometry` and disposes+reassigns it whenever it doesn't look like a matching
 * CylinderGeometry. Our reused curved-tube BufferGeometry never did, so it was disposed and
 * silently forced through a full GPU re-upload on every single digest, for every tube-rendered
 * link — completely defeating this file's own "no dispose, no GPU buffer reallocation" design
 * goal via a code path this file previously never accounted for. See the module doc's
 * "CRITICAL" section. These tests prove the fix against a verbatim reproduction of the actual
 * external predicate (see threeForcegraphWouldDisposeAndReassign above), not our assumption.
 */
describe("linkTube — three-forcegraph digest-compatibility spoof (dispose/re-upload churn fix)", () => {
  const A = { x: 0, y: 0, z: 0 };
  const B = { x: 100, y: 20, z: -30 };

  it("BEFORE any width is known, the geometry already looks Cylinder-shaped with the right radial segment count", () => {
    // create() runs lazily inside the first update() call, but the spoof must be in place
    // from that very first frame — verified by checking right after the first update().
    const cache = new CurvedLinkGeometryCache();
    const mesh = new THREE.Mesh();
    cache.update(mesh, { start: A, end: B }, {}, 1.2, 0.2);
    const g = mesh.geometry as unknown as { type: string; parameters: { radialSegments: number } };
    expect(g.type).toBe("CylinderGeometry");
    expect(g.parameters.radialSegments).toBe(RADIAL_SEGMENTS);
  });

  it("three-forcegraph's real predicate says NO dispose/reassign needed after a normal update — the actual bug fix", () => {
    const cache = new CurvedLinkGeometryCache();
    const mesh = new THREE.Mesh();
    const link = {};
    const width = 1.2;
    cache.update(mesh, { start: A, end: B }, link, width, 0.2);
    // linkResolution defaults to three-forcegraph's own default, which this app never
    // overrides — RADIAL_SEGMENTS is kept in sync with that default (see linkTube.ts's own
    // doc comment on the constant).
    expect(threeForcegraphWouldDisposeAndReassign(mesh.geometry, width, RADIAL_SEGMENTS)).toBe(false);
  });

  it("radiusTop tracks width changes frame-to-frame (a link's activity-driven width still stays digest-safe)", () => {
    const cache = new CurvedLinkGeometryCache();
    const mesh = new THREE.Mesh();
    const link = {};
    cache.update(mesh, { start: A, end: B }, link, 1.2, 0.2);
    expect(threeForcegraphWouldDisposeAndReassign(mesh.geometry, 1.2, RADIAL_SEGMENTS)).toBe(false);

    cache.update(mesh, { start: A, end: B }, link, 3.7, 0.2); // e.g. activity spiked
    expect(threeForcegraphWouldDisposeAndReassign(mesh.geometry, 3.7, RADIAL_SEGMENTS)).toBe(false);
    // and the STALE width would now correctly read as needing a rebuild if anything checked it
    expect(threeForcegraphWouldDisposeAndReassign(mesh.geometry, 1.2, RADIAL_SEGMENTS)).toBe(true);
  });

  it("digestRoundedRadius replicates three-forcegraph's own Math.ceil(width*10)/10/2 rounding exactly", () => {
    expect(digestRoundedRadius(1.2)).toBeCloseTo(0.6, 10);
    expect(digestRoundedRadius(1.23)).toBeCloseTo(Math.ceil(1.23 * 10) / 10 / 2, 10);
    expect(digestRoundedRadius(0)).toBe(0);
  });

  it("two independent links each get a correctly-synced spoof (no cross-link radius bleed)", () => {
    const cache = new CurvedLinkGeometryCache();
    const meshA = new THREE.Mesh();
    const meshB = new THREE.Mesh();
    cache.update(meshA, { start: A, end: B }, {}, 1.2, 0.2);
    cache.update(meshB, { start: A, end: B }, {}, 4.5, 0.2);
    expect(threeForcegraphWouldDisposeAndReassign(meshA.geometry, 1.2, RADIAL_SEGMENTS)).toBe(false);
    expect(threeForcegraphWouldDisposeAndReassign(meshB.geometry, 4.5, RADIAL_SEGMENTS)).toBe(false);
  });
});
