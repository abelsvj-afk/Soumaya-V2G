import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { shouldHideNodeBodyChild, DEFAULT_NODE_BODY_DIAG, type NodeBodyDiagConfig } from "./nodeBodyDiag.js";

/**
 * Node-body sub-isolation (forensic trace follow-up, 2026-09-10). Classifies node-body
 * children WITHOUT relying on any new tags in nodeObject.ts — only tags/geometry types
 * that already exist there for other reasons — so these tests build minimal stand-ins
 * carrying exactly those, matching perfDiag.test.ts's own established convention.
 */

const ON: NodeBodyDiagConfig = { ...DEFAULT_NODE_BODY_DIAG, enabled: true };

describe("nodeBodyDiag — shouldHideNodeBodyChild", () => {
  it("never hides anything when disabled, regardless of category flags", () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry());
    mesh.userData.isFidelity = true;
    expect(shouldHideNodeBodyChild(mesh, { ...ON, enabled: false, coreMesh: false })).toBe(false);
  });

  it("classifies the macro-LOD sphere via its isMacro tag", () => {
    const macro = new THREE.Mesh(new THREE.SphereGeometry());
    macro.userData.isMacro = true;
    expect(shouldHideNodeBodyChild(macro, { ...ON, macro: false })).toBe(true);
    expect(shouldHideNodeBodyChild(macro, { ...ON, macro: true })).toBe(false);
    // isMacro wins even if the other flags disagree — an isMacro child is never the core mesh.
    expect(shouldHideNodeBodyChild(macro, { ...ON, macro: true, coreMesh: false })).toBe(false);
  });

  it("classifies a glow/corona sprite via its glowCacheKey tag — the same object serves both roles", () => {
    const glow = new THREE.Sprite();
    glow.userData.glowCacheKey = "x-1";
    glow.userData.isFidelity = true; // real glow sprites carry both tags — glowCacheKey must win
    glow.userData.corona = { base: 1, baseOpacity: 0.4, speed: 1, phase: 0 };
    expect(shouldHideNodeBodyChild(glow, { ...ON, glowSprites: false, coreMesh: true })).toBe(true);
    expect(shouldHideNodeBodyChild(glow, { ...ON, glowSprites: true, coreMesh: false })).toBe(false);
  });

  it("classifies the asteroid belt via Points + isFidelity", () => {
    const belt = new THREE.Points(new THREE.BufferGeometry());
    belt.userData.isFidelity = true;
    expect(shouldHideNodeBodyChild(belt, { ...ON, asteroidBelt: false })).toBe(true);
    expect(shouldHideNodeBodyChild(belt, { ...ON, asteroidBelt: true })).toBe(false);
  });

  it("classifies a ring via its RingGeometry type, regardless of isFidelity", () => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1, 2));
    ring.userData.isFidelity = true;
    expect(shouldHideNodeBodyChild(ring, { ...ON, rings: false, coreMesh: true })).toBe(true);
    expect(shouldHideNodeBodyChild(ring, { ...ON, rings: true, coreMesh: false })).toBe(false);
  });

  it("classifies the core body mesh (isFidelity + Mesh, not a ring/macro/glow) as coreMesh", () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry());
    mesh.userData.isFidelity = true;
    expect(shouldHideNodeBodyChild(mesh, { ...ON, coreMesh: false })).toBe(true);
    expect(shouldHideNodeBodyChild(mesh, { ...ON, coreMesh: true })).toBe(false);
  });

  it("leaves an untagged/unrelated child alone (e.g. a label sprite — perfDiag.ts's job, not this)", () => {
    const label = new THREE.Sprite();
    label.userData.isLabel = true;
    expect(
      shouldHideNodeBodyChild(label, { ...ON, coreMesh: false, rings: false, glowSprites: false, asteroidBelt: false, macro: false }),
    ).toBe(false);
  });

  it("leaves a plain, untagged Object3D alone", () => {
    const group = new THREE.Group();
    expect(shouldHideNodeBodyChild(group, { ...ON, coreMesh: false })).toBe(false);
  });
});
